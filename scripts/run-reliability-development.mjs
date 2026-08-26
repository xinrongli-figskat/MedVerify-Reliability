import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PLAN_SCHEMA_VERSION = "1.0.0";
const EXECUTION_PLAN_VERSION = "1.0.0";
const planUrl = new URL(
  "../tests/reliability/benchmark-plan.json",
  import.meta.url
);
const datasetUrl = new URL(
  "../tests/reliability/benchmark-development.json",
  import.meta.url
);
const rawUrl = new URL("../runs_raw/", import.meta.url);

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function loadJson(url, label) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch (error) {
    throw new Error(`${label}: unable to read or parse: ${error.message}`);
  }
}

function validateInputs(protocol, dataset) {
  const errors = [];
  const need = (condition, path, message) => {
    if (!condition) errors.push(`${path}: ${message}`);
  };
  need(
    protocol.schemaVersion === "1.0.0",
    "benchmark-plan.schemaVersion",
    "must be 1.0.0"
  );
  need(
    protocol.protocolVersion === "1.0.0",
    "benchmark-plan.protocolVersion",
    "must be 1.0.0"
  );
  need(
    protocol.status?.designOnly === true &&
      protocol.status?.execution === "not-run",
    "benchmark-plan.status",
    "must remain design-only/not-run"
  );
  need(object(protocol.enums), "benchmark-plan.enums", "is required");
  need(
    Array.isArray(protocol.requiredCoverageCells),
    "benchmark-plan.requiredCoverageCells",
    "must be an array"
  );
  need(
    dataset.schemaVersion === "1.0.0",
    "development.schemaVersion",
    "must be 1.0.0"
  );
  need(
    dataset.protocolVersion === protocol.protocolVersion,
    "development.protocolVersion",
    "must match benchmark plan"
  );
  need(
    dataset.split === "development",
    "development.split",
    "must be development"
  );
  need(
    dataset.heldOutContentIncluded === false,
    "development.heldOutContentIncluded",
    "must be false"
  );
  need(
    dataset.status?.execution === "not-run" &&
      dataset.status?.resultsIncluded === false,
    "development.status",
    "must remain not-run without results"
  );
  need(
    Array.isArray(dataset.scenarioFamilies) &&
      dataset.scenarioFamilies.length === 10,
    "development.scenarioFamilies",
    "must contain 10 families"
  );
  need(
    Array.isArray(dataset.caseVariants) && dataset.caseVariants.length === 50,
    "development.caseVariants",
    "must contain 50 variants"
  );

  const enumSets = Object.fromEntries(
    Object.entries(protocol.enums ?? {}).map(([key, values]) => [
      key,
      new Set(values)
    ])
  );
  const coverage = new Map(
    (protocol.requiredCoverageCells ?? []).map((cell) => [cell.id, cell])
  );
  const families = new Map();
  for (const [index, family] of (dataset.scenarioFamilies ?? []).entries()) {
    const path = `development.scenarioFamilies[${index}]`;
    need(/^DEV-FAM-\d{3}$/.test(family?.id), `${path}.id`, "is invalid");
    need(!families.has(family?.id), `${path}.id`, "is duplicated");
    need(
      family?.split === "development",
      `${path}.split`,
      "must be development"
    );
    need(
      enumSets.evidenceStates?.has(family?.evidenceState),
      `${path}.evidenceState`,
      "is outside the frozen taxonomy"
    );
    need(
      enumSets.stages?.has(family?.stage),
      `${path}.stage`,
      "is outside the frozen taxonomy"
    );
    need(
      family?.failureCategory === null ||
        enumSets.failureCategories?.has(family?.failureCategory),
      `${path}.failureCategory`,
      "is outside the frozen taxonomy"
    );
    need(
      object(family?.fixture) && family.fixture.kind === "deterministic_stub",
      `${path}.fixture`,
      "must be a deterministic stub"
    );
    need(
      Array.isArray(family?.dimensions) &&
        family.dimensions.every((value) =>
          enumSets.evaluationDimensions?.has(value)
        ),
      `${path}.dimensions`,
      "contains a value outside the frozen taxonomy"
    );
    if (family?.coverageCellId !== null) {
      const cell = coverage.get(family.coverageCellId);
      need(
        Boolean(cell),
        `${path}.coverageCellId`,
        "is not a frozen coverage cell"
      );
      if (cell) {
        need(
          cell.outcome === family.evidenceState,
          `${path}.evidenceState`,
          "does not match its coverage cell"
        );
        need(
          cell.category === family.failureCategory,
          `${path}.failureCategory`,
          "does not match its coverage cell"
        );
        need(
          cell.stage === family.stage,
          `${path}.stage`,
          "does not match its coverage cell"
        );
      }
    }
    families.set(family?.id, family);
  }
  const ids = new Set();
  const counts = new Map();
  for (const [index, variant] of (dataset.caseVariants ?? []).entries()) {
    const path = `development.caseVariants[${index}]`;
    need(/^DEV-\d{3}-[OPNILR]$/.test(variant?.id), `${path}.id`, "is invalid");
    need(!ids.has(variant?.id), `${path}.id`, "is duplicated");
    need(
      families.has(variant?.scenarioFamilyId),
      `${path}.scenarioFamilyId`,
      "is unknown"
    );
    need(
      variant?.split === "development",
      `${path}.split`,
      "must be development"
    );
    need(
      enumSets.perturbations?.has(variant?.perturbation),
      `${path}.perturbation`,
      "is outside the frozen taxonomy"
    );
    need(
      ["en", "zh"].includes(variant?.language),
      `${path}.language`,
      "must be en or zh"
    );
    need(
      typeof variant?.userInput === "string" && variant.userInput.trim(),
      `${path}.userInput`,
      "must be non-empty"
    );
    ids.add(variant?.id);
    counts.set(
      variant?.scenarioFamilyId,
      (counts.get(variant?.scenarioFamilyId) ?? 0) + 1
    );
  }
  for (const id of families.keys())
    need(counts.get(id) === 5, `${id}.variants`, "must contain 5 variants");
  if (errors.length)
    throw new Error(
      `Development execution input validation failed (${errors.length}):\n- ${errors.join("\n- ")}`
    );
  return families;
}

function scenarioFor(family) {
  return (
    family.fixture.records ??
    family.fixture.response ??
    family.fixture.transport
  );
}

function faultScenarioFor(family) {
  if (family.fixture.records === "non_empty_schema_valid")
    return "success_exact_pmid";
  if (family.fixture.records === "empty_schema_valid") return "zero_results";
  if (family.fixture.transport === "http_error") return "http_429";
  if (family.fixture.transport) return family.fixture.transport;
  const response =
    family.fixture.response === "malformed_json"
      ? "malformed_json"
      : "invalid_schema";
  return `${family.stage}_${response}`;
}

function makePlan(protocol, dataset, family, variant) {
  return {
    planSchemaVersion: PLAN_SCHEMA_VERSION,
    executionPlanVersion: EXECUTION_PLAN_VERSION,
    benchmarkProtocolVersion: protocol.protocolVersion,
    benchmarkPlanVersion: protocol.benchmarkVersion,
    developmentDatasetVersion: dataset.benchmarkVersion,
    benchmarkSplit: "development",
    benchmarkFamilyId: family.id,
    benchmarkVariantId: variant.id,
    benchmarkCoverageCellId: family.coverageCellId,
    scenario: scenarioFor(family),
    perturbationType: variant.perturbation,
    language: variant.language,
    userInput: variant.userInput,
    requiresPubMed: true,
    expectedTool: { count: 1, name: "searchPubMed", state: "output-available" },
    faultScenario: faultScenarioFor(family),
    expectedOutcome: family.evidenceState,
    expectedFailureCategory: family.failureCategory,
    expectedFailureStage: family.stage,
    expectedHttpStatus: family.failureCategory === "http_error" ? 429 : null,
    epistemicBehaviourLabels: family.dimensions.filter((label) =>
      ["epistemic_behaviour", "uncertainty_abstention"].includes(label)
    ),
    citationGroundingRequired: family.fixture.citationProvenanceEligible,
    toolLeakageProhibited: family.automaticChecks.includes("tool_call_leakage"),
    manualReviewRequired: family.manualReview.length > 0,
    manualReviewLabels: [...family.manualReview],
    futureRawProvenance: {
      benchmarkProtocolVersion: protocol.protocolVersion,
      benchmarkPlanVersion: protocol.benchmarkVersion,
      developmentDatasetVersion: dataset.benchmarkVersion,
      benchmarkSplit: "development",
      benchmarkFamilyId: family.id,
      benchmarkVariantId: variant.id,
      benchmarkCoverageCellId: family.coverageCellId,
      perturbationType: variant.perturbation,
      language: variant.language,
      executionPlanVersion: EXECUTION_PLAN_VERSION
    },
    executionStatus: "VALIDATED"
  };
}

function parseArgs(args) {
  const parsed = {
    dryRun: false,
    list: false,
    selfTest: false,
    all: false,
    family: null,
    variant: null,
    live: false,
    baseUrl: null,
    timeoutMs: 90000
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--live") parsed.live = true;
    else if (arg === "--list") parsed.list = true;
    else if (arg === "--self-test") parsed.selfTest = true;
    else if (arg === "--all") parsed.all = true;
    else if (arg === "--base-url") {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} requires a value.`);
      parsed.baseUrl = value;
    } else if (arg === "--timeout-ms") {
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || value < 1000)
        throw new Error("--timeout-ms must be an integer >= 1000.");
      parsed.timeoutMs = value;
    } else if (arg === "--family" || arg === "--variant") {
      const value = args[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} requires an ID.`);
      parsed[arg.slice(2)] = value;
    } else throw new Error(`Unknown flag: ${arg}`);
  }
  const modes = [
    parsed.list,
    parsed.selfTest,
    parsed.all,
    parsed.family !== null,
    parsed.variant !== null
  ].filter(Boolean).length;
  if (modes === 0)
    throw new Error(
      "A selector is required: --list, --all, --family, --variant, or --self-test."
    );
  if (modes > 1)
    throw new Error("Selectors conflict; choose exactly one mode.");
  if (parsed.dryRun && (parsed.list || parsed.selfTest))
    throw new Error(
      "--dry-run is only valid with --all, --family, or --variant."
    );
  if (parsed.live && (parsed.all || parsed.family))
    throw new Error(
      "Live execution permits exactly one --variant; --all/--family are forbidden."
    );
  if (parsed.live && !parsed.variant)
    throw new Error("--live requires exactly one --variant.");
  if (parsed.live && parsed.dryRun)
    throw new Error("--live conflicts with --dry-run.");
  if (parsed.live && !parsed.baseUrl)
    throw new Error("--live requires --base-url.");
  if (!parsed.live && (parsed.baseUrl !== null || parsed.timeoutMs !== 90000))
    throw new Error("--base-url/--timeout-ms are only valid with --live.");
  if (
    !parsed.live &&
    !parsed.dryRun &&
    (parsed.all || parsed.family || parsed.variant)
  )
    throw new Error(
      "Execution requires explicit --dry-run or --live authorization."
    );
  return parsed;
}

function select(parsed, dataset, families) {
  if (parsed.all) return dataset.caseVariants;
  if (parsed.family) {
    if (!families.has(parsed.family))
      throw new Error(`Unknown family: ${parsed.family}`);
    return dataset.caseVariants.filter(
      (variant) => variant.scenarioFamilyId === parsed.family
    );
  }
  if (parsed.variant) {
    const variant = dataset.caseVariants.find(
      (item) => item.id === parsed.variant
    );
    if (!variant) throw new Error(`Unknown variant: ${parsed.variant}`);
    return [variant];
  }
  return [];
}

function assertPlan(plan, family, variant) {
  const required = [
    "planSchemaVersion",
    "benchmarkProtocolVersion",
    "benchmarkPlanVersion",
    "developmentDatasetVersion",
    "benchmarkSplit",
    "benchmarkFamilyId",
    "benchmarkVariantId",
    "benchmarkCoverageCellId",
    "scenario",
    "perturbationType",
    "language",
    "userInput",
    "requiresPubMed",
    "expectedTool",
    "faultScenario",
    "expectedOutcome",
    "expectedFailureCategory",
    "expectedFailureStage",
    "expectedHttpStatus",
    "epistemicBehaviourLabels",
    "citationGroundingRequired",
    "toolLeakageProhibited",
    "manualReviewRequired",
    "futureRawProvenance",
    "executionStatus"
  ];
  for (const field of required)
    assert(Object.hasOwn(plan, field), `missing plan field ${field}`);
  assert.equal(plan.benchmarkSplit, "development");
  assert.equal(plan.benchmarkFamilyId, family.id);
  assert.equal(plan.benchmarkVariantId, variant.id);
  assert.equal(plan.expectedOutcome, family.evidenceState);
  assert.equal(plan.expectedFailureCategory, family.failureCategory);
  assert.equal(plan.expectedFailureStage, family.stage);
  assert.equal(
    plan.expectedHttpStatus,
    family.failureCategory === "http_error" ? 429 : null
  );
  assert.equal(plan.executionStatus, "VALIDATED");
  const json = JSON.stringify(plan).toLowerCase();
  for (const forbidden of [
    "heldout",
    "held_out",
    "modeloutput",
    "verdict",
    "requestid",
    "sessionid",
    "token",
    "secret",
    "rawpath",
    "timestamp"
  ])
    assert(!json.includes(forbidden), `prohibited plan content: ${forbidden}`);
}

async function selfTest(protocol, dataset, families) {
  const rawBefore = (await readdir(rawUrl))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const plans = dataset.caseVariants.map((variant) =>
    makePlan(protocol, dataset, families.get(variant.scenarioFamilyId), variant)
  );
  assert.equal(plans.length, 50);
  assert.equal(families.size, 10);
  for (const id of families.keys())
    assert.equal(
      plans.filter((plan) => plan.benchmarkFamilyId === id).length,
      5
    );
  assert.deepEqual(
    plans.map((plan) => plan.benchmarkVariantId),
    dataset.caseVariants.map((variant) => variant.id)
  );
  assert.equal(
    select(
      parseArgs(["--variant", dataset.caseVariants[0].id, "--dry-run"]),
      dataset,
      families
    ).length,
    1
  );
  assert.equal(
    select(
      parseArgs(["--family", dataset.scenarioFamilies[0].id, "--dry-run"]),
      dataset,
      families
    ).length,
    5
  );
  assert.equal(
    select(parseArgs(["--all", "--dry-run"]), dataset, families).length,
    50
  );
  assert.throws(
    () =>
      select(
        parseArgs(["--variant", "DEV-999-O", "--dry-run"]),
        dataset,
        families
      ),
    /Unknown variant/
  );
  assert.throws(
    () =>
      parseArgs([
        "--all",
        "--variant",
        dataset.caseVariants[0].id,
        "--dry-run"
      ]),
    /conflict/
  );
  assert.throws(
    () => parseArgs(["--variant", dataset.caseVariants[0].id]),
    /explicit/
  );
  assert.throws(
    () => parseArgs(["--all", "--live", "--base-url", "http://127.0.0.1:5180"]),
    /exactly one/
  );
  plans.forEach((plan, index) =>
    assertPlan(
      plan,
      families.get(dataset.caseVariants[index].scenarioFamilyId),
      dataset.caseVariants[index]
    )
  );
  assert.equal(
    JSON.stringify(plans),
    JSON.stringify(
      dataset.caseVariants.map((variant) =>
        makePlan(
          protocol,
          dataset,
          families.get(variant.scenarioFamilyId),
          variant
        )
      )
    )
  );
  const rawAfter = (await readdir(rawUrl))
    .filter((name) => name.endsWith(".json"))
    .sort();
  assert.deepEqual(rawAfter, rawBefore);
  assert(rawAfter.length >= 76);
  const source = await readFile(new URL(import.meta.url), "utf8");
  const imports = [...source.matchAll(/^import .+ from "([^"]+)";/gm)].map(
    (match) => match[1]
  );
  assert.deepEqual(imports, [
    "node:assert/strict",
    "node:child_process",
    "node:fs/promises",
    "node:url"
  ]);
  console.log(
    `Development runner self-test passed: 10 families; 50 variants; stable deterministic plans; live execution guarded; ${rawAfter.length} raw files unchanged; no network path reachable.`
  );
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const [protocol, dataset] = await Promise.all([
    loadJson(planUrl, "benchmark-plan.json"),
    loadJson(datasetUrl, "benchmark-development.json")
  ]);
  const families = validateInputs(protocol, dataset);
  if (parsed.selfTest) return selfTest(protocol, dataset, families);
  if (parsed.list) {
    for (const variant of dataset.caseVariants) {
      const family = families.get(variant.scenarioFamilyId);
      console.log(
        [
          family.id,
          variant.id,
          scenarioFor(family),
          family.evidenceState,
          variant.perturbation,
          variant.language
        ].join("\t")
      );
    }
    return;
  }
  const plans = select(parsed, dataset, families).map((variant) =>
    makePlan(protocol, dataset, families.get(variant.scenarioFamilyId), variant)
  );
  if (parsed.live) {
    const planPath = `/tmp/medverify-development-plan-${process.pid}.json`;
    await writeFile(planPath, `${JSON.stringify(plans[0])}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx"
    });
    try {
      execFileSync(
        process.execPath,
        [
          fileURLToPath(new URL("./run-reliability.mjs", import.meta.url)),
          "--development-plan",
          planPath,
          "--base-url",
          parsed.baseUrl,
          "--timeout-ms",
          String(parsed.timeoutMs)
        ],
        { stdio: "inherit" }
      );
    } finally {
      await import("node:fs/promises").then(({ unlink }) =>
        unlink(planPath).catch(() => {})
      );
    }
    return;
  }
  console.log(JSON.stringify(plans, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
