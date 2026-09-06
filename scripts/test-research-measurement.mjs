import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makePlan, validateInputs } from "./run-reliability-development.mjs";
import { writeImmutableRun } from "./reliability-raw-writer.mjs";
import {
  authorizePubMedFault,
  createPubMedFaultFetch
} from "../src/pubmed-fault-injection.ts";
import {
  classifyPubMedRequestError,
  validatePubMedSearchPayload,
  validatePubMedSummaryPayload
} from "../src/pubmed-outcomes.ts";

if (process.argv.length > 2)
  throw new Error(
    "Offline measurement self-test accepts no live or case selectors."
  );

const repo = new URL("../", import.meta.url);
const json = async (path) => JSON.parse(await readFile(new URL(path, repo)));
async function rawInventory() {
  const names = (await readdir(new URL("runs_raw/", repo)))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const hash = createHash("sha256");
  for (const name of names) {
    hash.update(name);
    hash.update(await readFile(new URL(`runs_raw/${name}`, repo)));
  }
  return { count: names.length, sha256: hash.digest("hex") };
}

// This exercises only deterministic fetch doubles and production payload
// validators, not the Agent, a model, a chat lifecycle or a research trajectory.
async function observeFixture(scenario) {
  const fixtureFetch = createPubMedFaultFetch(scenario);
  const stages = [];
  let ids = [];
  for (const stage of ["esearch", "esummary"]) {
    stages.push(stage);
    let response;
    try {
      response = await fixtureFetch(`https://offline.invalid/${stage}.fcgi`);
    } catch (error) {
      return {
        kind: "tool_failure",
        category: classifyPubMedRequestError(error),
        stage,
        stages
      };
    }
    if (!response.ok)
      return {
        kind: "tool_failure",
        category: "http_error",
        stage,
        httpStatus: response.status,
        stages
      };
    let payload;
    try {
      payload = await response.json();
    } catch {
      return {
        kind: "invalid_response",
        category: "parse_error",
        stage,
        stages
      };
    }
    const checked =
      stage === "esearch"
        ? validatePubMedSearchPayload(payload)
        : validatePubMedSummaryPayload(payload, ids);
    if (!checked.valid)
      return {
        kind: "invalid_response",
        category: "schema_error",
        stage,
        stages
      };
    if (stage === "esearch") {
      ids = checked.data.esearchresult.idlist;
      if (ids.length === 0)
        return { kind: "zero_results", category: null, stage, stages };
    } else {
      assert(Object.keys(checked.data.recordsByPmid).length > 0);
      return { kind: "successful_records", category: null, stage, stages };
    }
  }
  throw new Error("Fixture did not produce an outcome");
}

const before = await rawInventory();
const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("Network forbidden in measurement self-test");
};
let directory;
try {
  const [protocol, dataset] = await Promise.all([
    json("tests/reliability/benchmark-plan.json"),
    json("tests/reliability/benchmark-development.json")
  ]);
  const families = validateInputs(protocol, dataset);
  for (const family of families.values()) {
    const variant = dataset.caseVariants.find(
      (item) => item.scenarioFamilyId === family.id
    );
    const plan = makePlan(protocol, dataset, family, variant);
    const observed = await observeFixture(plan.faultScenario);
    assert.deepEqual(
      [
        observed.kind,
        observed.category,
        observed.stage,
        observed.httpStatus ?? null
      ],
      [
        family.evidenceState,
        family.failureCategory,
        family.stage,
        plan.expectedHttpStatus
      ],
      `${family.id}: fixture must preserve frozen outcome/category/stage`
    );
    assert.equal(plan.expectedFailureStage, family.stage);
    assert.equal(
      plan.futureRawProvenance.executionPlanVersion,
      plan.executionPlanVersion
    );
    assert.equal(
      plan.executionPlanVersion,
      family.id === "DEV-FAM-007" ? "1.1.0" : "1.0.0"
    );
    if (family.id === "DEV-FAM-007") {
      assert.equal(plan.faultScenario, "esummary_timeout");
      assert.deepEqual(observed.stages, ["esearch", "esummary"]);
    }
  }
  console.log(
    "PASS: all 10 family fixture mappings preserve frozen outcomes and stages; no Agent executions."
  );

  const oldTimeout = await observeFixture("timeout");
  assert.equal(oldTimeout.stage, "esearch");
  assert.equal(oldTimeout.category, "timeout");
  assert.deepEqual(oldTimeout.stages, ["esearch"]);
  assert.notEqual(oldTimeout.stage, families.get("DEV-FAM-007").stage);
  console.log(
    "PASS: legacy ESearch timeout retained; original summary-timeout mismatch detected."
  );

  // Test-only credential for the pure authorization function, never an actual
  // server credential and never persisted in a file or research raw.
  const testToken = "measurement-self-test-only-token-value";
  const environment = {
    MEDVERIFY_RELIABILITY_FAULTS_ENABLED: "true",
    MEDVERIFY_RELIABILITY_FAULT_TOKEN: testToken
  };
  assert.equal(
    authorizePubMedFault(environment, "esummary_timeout", testToken),
    "esummary_timeout"
  );
  assert.equal(authorizePubMedFault({}, "esummary_timeout", testToken), null);
  assert.equal(
    authorizePubMedFault(environment, "esummary_timeout", "wrong"),
    null
  );
  assert.equal(authorizePubMedFault(environment, "unknown", testToken), null);
  console.log(
    "PASS: new scenario preserves the existing authorization double gate."
  );

  // Temporary sentinel JSON tests the writer; it is deliberately not a run or
  // benchmark result and is never written under runs_raw/.
  directory = await mkdtemp(join(tmpdir(), "medverify-measurement-self-test-"));
  const target = join(directory, "writer-sentinel.json");
  await writeImmutableRun(target, { sentinel: "original" });
  const originalBytes = await readFile(target);
  await assert.rejects(writeImmutableRun(target, { sentinel: "replacement" }), {
    code: "EEXIST"
  });
  assert.deepEqual(await readFile(target), originalBytes);
  const linkedTarget = join(directory, "writer-symlink.json");
  await symlink(target, linkedTarget);
  await assert.rejects(
    writeImmutableRun(linkedTarget, { sentinel: "replacement" }),
    { code: "EEXIST" }
  );
  assert.deepEqual(await readFile(target), originalBytes);
  const raceTarget = join(directory, "writer-race.json");
  const race = await Promise.allSettled([
    writeImmutableRun(raceTarget, { sentinel: "first" }),
    writeImmutableRun(raceTarget, { sentinel: "second" })
  ]);
  assert.equal(
    race.filter((result) => result.status === "fulfilled").length,
    1
  );
  assert.equal(
    race.find((result) => result.status === "rejected").reason.code,
    "EEXIST"
  );
  assert(
    ["first", "second"].includes(
      JSON.parse(await readFile(raceTarget)).sentinel
    )
  );
  console.log(
    "PASS: immutable writer rejects overwrite, symlink overwrite and concurrent destination collision."
  );
} finally {
  globalThis.fetch = originalFetch;
  if (directory) await rm(directory, { recursive: true, force: true });
  assert.deepEqual(
    await rawInventory(),
    before,
    "historical raw bytes or file inventory changed"
  );
}
console.log(
  `Offline measurement checks passed; ${before.count} historical raws unchanged. This is not a readiness PASS or a live result.`
);
