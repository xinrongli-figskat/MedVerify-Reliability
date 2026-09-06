import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const templatePath = "tests/reliability/manual-review-template.json";
const rubricPath = "docs/research/r1_manual_review_rubric.md";
export const FROZEN_RUBRIC_VERSION = "1.0.0";
const rubricSha =
  "6c856af9c928cc85758d302396929b109d926a3876e588e6fd183084ed197148";
const keys = [
  "schemaVersion",
  "reviewRecordVersion",
  "template",
  "runId",
  "caseId",
  "variantId",
  "sourceRawPath",
  "sourceRawSha256",
  "reviewerId",
  "rubricVersion",
  "reviewType",
  "decision",
  "rationale",
  "reviewedAt"
];
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const nonempty = (x) => typeof x === "string" && x.trim().length > 0;
const digest = (x) => createHash("sha256").update(x).digest("hex");
const rawPattern = /^runs_raw\/[A-Za-z0-9_-]+\.json$/;
const variantPattern = /^DEV-\d{3}-[OPNILR]$/;
function validTime(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
async function repoBytes(path) {
  const url = new URL(path, root);
  // Reject symlink substitution as well as lexical traversal for raw evidence.
  if (path.startsWith("runs_raw/")) {
    const actual = await realpath(url);
    const expected = join(
      await realpath(new URL("runs_raw/", root)),
      path.slice(9)
    );
    if (actual !== expected)
      throw new Error("raw symlink substitution prohibited");
  }
  return readFile(url);
}

function shapeErrors(record) {
  if (!object(record)) return ["review: must be an object"];
  const errors = [];
  for (const key of keys)
    if (!Object.hasOwn(record, key))
      errors.push(`${key}: required field missing`);
  for (const key of Object.keys(record))
    if (!keys.includes(key)) errors.push(`${key}: unknown field`);
  return errors;
}

// Dependency injection is restricted to offline fixtures in callers. The CLI
// always uses repository evidence. This module neither calls an Agent nor writes
// review results; only its explicit self-test writes disposable /tmp fixtures.
export async function validateManualReview(
  record,
  { readBytes = repoBytes, now = Date.now() } = {}
) {
  const errors = shapeErrors(record);
  if (!object(record)) return errors;
  const need = (condition, key, message) => {
    if (!condition) errors.push(`${key}: ${message}`);
  };
  need(
    record.schemaVersion === "1.0.0",
    "schemaVersion",
    "unsupported version"
  );
  need(
    record.reviewRecordVersion === "1.0.0",
    "reviewRecordVersion",
    "unsupported version"
  );
  need(
    record.template === false,
    "template",
    "template is not a real review result"
  );
  need(
    record.rubricVersion === FROZEN_RUBRIC_VERSION,
    "rubricVersion",
    "unknown or unfrozen rubric"
  );
  need(
    /^REV-[A-F0-9]{8,32}$/.test(record.reviewerId ?? ""),
    "reviewerId",
    "pseudonymous REV-hex identifier required"
  );
  need(nonempty(record.rationale), "rationale", "must be nonempty");
  need(
    ["epistemic", "medical_content"].includes(record.reviewType),
    "reviewType",
    "invalid type"
  );
  need(
    ["PASS", "FAIL", "UNCERTAIN"].includes(record.decision),
    "decision",
    "invalid decision"
  );
  need(nonempty(record.runId), "runId", "must be nonempty");
  need(
    variantPattern.test(record.caseId ?? ""),
    "caseId",
    "development case ID required"
  );
  need(
    variantPattern.test(record.variantId ?? ""),
    "variantId",
    "development variant ID required"
  );
  need(
    validTime(record.reviewedAt),
    "reviewedAt",
    "canonical UTC ISO timestamp required"
  );
  need(
    validTime(record.reviewedAt) && Date.parse(record.reviewedAt) <= now,
    "reviewedAt",
    "must not be in the future"
  );
  need(
    /^[a-f0-9]{64}$/.test(record.sourceRawSha256 ?? ""),
    "sourceRawSha256",
    "invalid SHA-256"
  );
  try {
    need(
      digest(await readBytes(rubricPath)) === rubricSha,
      "rubricVersion",
      "frozen rubric bytes changed"
    );
  } catch (error) {
    need(
      false,
      "rubricVersion",
      `cannot read frozen rubric (${error.message})`
    );
  }
  const safe =
    typeof record.sourceRawPath === "string" &&
    rawPattern.test(record.sourceRawPath);
  need(safe, "sourceRawPath", "scoped runs_raw JSON path required");
  if (safe) {
    try {
      const bytes = await readBytes(record.sourceRawPath);
      need(
        digest(bytes) === record.sourceRawSha256,
        "sourceRawSha256",
        "raw SHA mismatch"
      );
      const raw = JSON.parse(bytes);
      need(object(raw), "sourceRawPath", "raw must be an object");
      if (object(raw)) {
        for (const [key, rawKey] of [
          ["runId", "runId"],
          ["caseId", "caseId"],
          ["variantId", "benchmarkVariantId"]
        ])
          need(
            nonempty(raw[rawKey]) && record[key] === raw[rawKey],
            key,
            "raw provenance mismatch"
          );
        need(
          raw.benchmarkSplit === "development",
          "sourceRawPath",
          "development raw required"
        );
        need(
          raw.caseId === raw.benchmarkVariantId,
          "variantId",
          "raw case/variant inconsistent"
        );
        need(
          validTime(raw.timestamp),
          "sourceRawPath",
          "valid raw timestamp required"
        );
        need(
          validTime(raw.timestamp) &&
            validTime(record.reviewedAt) &&
            Date.parse(record.reviewedAt) >= Date.parse(raw.timestamp),
          "reviewedAt",
          "review cannot predate raw"
        );
      }
    } catch (error) {
      need(false, "sourceRawPath", `cannot read raw (${error.message})`);
    }
  }
  return errors;
}

// Call with the errors from validating this very record, not an automatic verdict.
export function manualReviewAllowsReadiness(record, errors) {
  return (
    Array.isArray(errors) &&
    errors.length === 0 &&
    record?.template === false &&
    record?.decision === "PASS"
  );
}

export function validateTemplate(record) {
  const errors = shapeErrors(record);
  if (!object(record)) return errors;
  for (const key of keys) {
    const expected =
      key === "template"
        ? true
        : ["schemaVersion", "reviewRecordVersion", "rubricVersion"].includes(
              key
            )
          ? "1.0.0"
          : null;
    if (record[key] !== expected)
      errors.push(`${key}: invalid template placeholder`);
  }
  return errors;
}

async function selfTest() {
  const directory = await mkdtemp(
    join(tmpdir(), "medverify-manual-review-self-test-")
  );
  try {
    const raw = {
      runId: "synthetic-review-only",
      caseId: "DEV-002-O",
      benchmarkVariantId: "DEV-002-O",
      benchmarkSplit: "development",
      timestamp: "2000-01-01T00:00:00.000Z"
    };
    const bytes = Buffer.from(JSON.stringify(raw));
    await writeFile(join(directory, "synthetic-raw.json"), bytes, {
      flag: "wx"
    });
    const record = {
      schemaVersion: "1.0.0",
      reviewRecordVersion: "1.0.0",
      template: false,
      runId: raw.runId,
      caseId: raw.caseId,
      variantId: raw.benchmarkVariantId,
      sourceRawPath: "runs_raw/synthetic-review-only.json",
      sourceRawSha256: digest(bytes),
      reviewerId: "REV-00000000",
      rubricVersion: "1.0.0",
      reviewType: "epistemic",
      decision: "PASS",
      rationale:
        "Synthetic schema fixture only; not a human judgment or research evidence.",
      reviewedAt: "2000-01-01T00:01:00.000Z"
    };
    await writeFile(
      join(directory, "synthetic-review.json"),
      JSON.stringify(record),
      { flag: "wx" }
    );
    const readBytes = (path) =>
      path === record.sourceRawPath
        ? readFile(join(directory, "synthetic-raw.json"))
        : path === rubricPath
          ? repoBytes(path)
          : Promise.reject(new Error("synthetic raw missing"));
    const validate = (x) => validateManualReview(x, { readBytes });
    assert.deepEqual(
      await validate(
        JSON.parse(await readFile(join(directory, "synthetic-review.json")))
      ),
      []
    );
    assert(manualReviewAllowsReadiness(record, await validate(record)));
    console.log(
      "PASS: valid synthetic review accepted (test-only, not evidence)"
    );
    const fixtures = [
      [
        "missing reviewerId",
        (x) => {
          delete x.reviewerId;
        },
        "reviewerId"
      ],
      [
        "empty rationale",
        (x) => {
          x.rationale = "  ";
        },
        "rationale"
      ],
      [
        "unknown rubricVersion",
        (x) => {
          x.rubricVersion = "0.1.0-draft";
        },
        "rubricVersion"
      ],
      [
        "invalid decision",
        (x) => {
          x.decision = "READY";
        },
        "decision"
      ],
      [
        "invalid reviewType",
        (x) => {
          x.reviewType = "clinical_expert";
        },
        "reviewType"
      ],
      [
        "invalid reviewedAt",
        (x) => {
          x.reviewedAt = "2000-02-30T00:00:00.000Z";
        },
        "reviewedAt"
      ],
      [
        "missing raw",
        (x) => {
          x.sourceRawPath = "runs_raw/missing.json";
        },
        "sourceRawPath"
      ],
      [
        "raw SHA mismatch",
        (x) => {
          x.sourceRawSha256 = "0".repeat(64);
        },
        "sourceRawSha256"
      ],
      [
        "runId mismatch",
        (x) => {
          x.runId = "other";
        },
        "runId"
      ],
      [
        "caseId mismatch",
        (x) => {
          x.caseId = "DEV-001-O";
        },
        "caseId"
      ],
      [
        "variantId mismatch",
        (x) => {
          x.variantId = "DEV-001-O";
        },
        "variantId"
      ],
      [
        "template as result",
        (x) => {
          x.template = true;
        },
        "template"
      ],
      [
        "review before raw",
        (x) => {
          x.reviewedAt = "1999-01-01T00:00:00.000Z";
        },
        "reviewedAt"
      ],
      [
        "future review",
        (x) => {
          x.reviewedAt = "9999-01-01T00:00:00.000Z";
        },
        "reviewedAt"
      ],
      [
        "path traversal",
        (x) => {
          x.sourceRawPath = "runs_raw/../package.json";
        },
        "sourceRawPath"
      ],
      [
        "unknown field",
        (x) => {
          x.automaticVerdict = "PASS";
        },
        "automaticVerdict"
      ],
      [
        "wrong schema",
        (x) => {
          x.schemaVersion = "2.0.0";
        },
        "schemaVersion"
      ],
      [
        "wrong record version",
        (x) => {
          x.reviewRecordVersion = "2.0.0";
        },
        "reviewRecordVersion"
      ],
      [
        "non-pseudonymous reviewer",
        (x) => {
          x.reviewerId = "personal name";
        },
        "reviewerId"
      ]
    ];
    for (const [name, mutate, expected] of fixtures) {
      const candidate = structuredClone(record);
      mutate(candidate);
      const errors = await validate(candidate);
      assert(
        errors.some((error) => error.startsWith(`${expected}:`)),
        name
      );
      assert.equal(manualReviewAllowsReadiness(candidate, errors), false);
      console.log(`PASS negative: ${name}`);
    }
    for (const decision of ["FAIL", "UNCERTAIN"]) {
      const candidate = { ...record, decision };
      const errors = await validate(candidate);
      assert.deepEqual(errors, []);
      assert.equal(manualReviewAllowsReadiness(candidate, errors), false);
      console.log(`PASS: ${decision} is a valid review, never readiness PASS`);
    }
    const medical = { ...record, reviewType: "medical_content" };
    assert.deepEqual(await validate(medical), []);
    const changedRubric = await validateManualReview(record, {
      readBytes: (path) =>
        path === rubricPath ? Buffer.from("changed") : readBytes(path)
    });
    assert(
      changedRubric.some((error) =>
        error.includes("frozen rubric bytes changed")
      )
    );
    assert.deepEqual(
      await readFile(join(directory, "synthetic-raw.json")),
      bytes
    );
    console.log(
      `Manual review self-test passed: ${fixtures.length + 1} negative fixtures, both review types, FAIL/UNCERTAIN handling; only temporary synthetic files used.`
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    const template = JSON.parse(await repoBytes(templatePath));
    const errors = validateTemplate(template);
    if (digest(await repoBytes(rubricPath)) !== rubricSha)
      errors.push("frozen rubric bytes changed");
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
      "Manual review template valid; template=true; no real review validated or created."
    );
  } else if (args.length === 1 && args[0] === "--self-test") await selfTest();
  else if (args.length === 2 && args[0] === "--review") {
    const record = JSON.parse(await readFile(args[1]));
    const errors = await validateManualReview(record);
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
      `Manual review record valid: ${record.decision}; this is not a readiness verdict or clinical certification.`
    );
  } else
    throw new Error(
      "Usage: validator [--review <record.json> | --self-test]; no live mode."
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
