import { readFile } from "node:fs/promises";

const datasetUrl = new URL(
  "../tests/reliability/benchmark-development.json",
  import.meta.url
);

const evidenceStates = new Set([
  "successful_records",
  "zero_results",
  "invalid_response",
  "tool_failure"
]);
const failureCategories = new Set([
  "parse_error",
  "schema_error",
  "http_error",
  "network_error",
  "timeout"
]);
const stages = new Set(["esearch", "esummary"]);
const perturbations = new Set([
  "original",
  "paraphrase",
  "negation",
  "irrelevant_context",
  "language_variant",
  "repeated_run"
]);
const dimensions = new Set([
  "infrastructure_failure",
  "response_integrity",
  "retrieval_outcomes",
  "agent_tool_control",
  "epistemic_behaviour",
  "citation_grounding",
  "query_fidelity",
  "uncertainty_abstention",
  "tool_call_leakage",
  "semantic_perturbation",
  "language_variation",
  "repeated_execution",
  "cross_model_evaluation"
]);
const requiredCoverageCells = new Set([
  "COV-SUCCESS",
  "COV-ZERO",
  "COV-PARSE-ESEARCH",
  "COV-SCHEMA-ESUMMARY",
  "COV-HTTP",
  "COV-NETWORK",
  "COV-TIMEOUT"
]);
const manualReviewTypes = new Set(["epistemic", "medical_content"]);
const forbiddenKeys = new Set([
  "heldOut",
  "heldOutFamilyIds",
  "heldOutPrompt",
  "heldOutAnswer",
  "expectedAnswer",
  "hiddenGoldAnswer",
  "goldAnswerProse",
  "articleTitle",
  "pmid",
  "pmcid",
  "doi",
  "identifierFixture",
  "modelOutput",
  "observedResult",
  "verdict",
  "score"
]);

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validate(dataset) {
  const errors = [];
  const need = (condition, path, message) => {
    if (!condition) errors.push(`${path}: ${message}`);
  };

  for (const field of [
    "schemaVersion",
    "benchmarkVersion",
    "protocolVersion",
    "milestone",
    "status",
    "sourceCheckpoint",
    "split",
    "heldOutContentIncluded",
    "sampling",
    "fixturePolicy",
    "scenarioFamilies",
    "caseVariants"
  ])
    need(Object.hasOwn(dataset, field), field, "required field is missing");
  if (errors.length) return errors;

  need(dataset.schemaVersion === "1.0.0", "schemaVersion", "must equal 1.0.0");
  need(
    dataset.benchmarkVersion === "0.1.0-development",
    "benchmarkVersion",
    "must equal 0.1.0-development"
  );
  need(
    dataset.protocolVersion === "1.0.0",
    "protocolVersion",
    "must equal frozen protocol 1.0.0"
  );
  need(dataset.milestone === "M2.11B", "milestone", "must equal M2.11B");
  need(dataset.split === "development", "split", "must equal development");
  need(
    dataset.heldOutContentIncluded === false,
    "heldOutContentIncluded",
    "must be false"
  );
  need(
    /^[0-9a-f]{40}$/.test(dataset.sourceCheckpoint),
    "sourceCheckpoint",
    "must be a lowercase 40-character Git SHA"
  );
  need(
    dataset.status?.construction === "complete" &&
      dataset.status?.execution === "not-run" &&
      dataset.status?.resultsIncluded === false,
    "status",
    "must be complete/not-run with no results"
  );
  need(
    dataset.sampling?.sampleSizeFrozen === false &&
      dataset.sampling?.repetitionCountFrozen === false &&
      dataset.sampling?.statisticalMethodsFrozen === false,
    "sampling",
    "pilot/power-analysis choices must remain unfrozen"
  );
  need(
    dataset.fixturePolicy?.offlineDeterministic === true &&
      dataset.fixturePolicy?.liveEndpointIncluded === false &&
      dataset.fixturePolicy?.observedRunsIncluded === false &&
      dataset.fixturePolicy?.medicalGoldAnswersIncluded === false &&
      dataset.fixturePolicy?.publicationIdentifiersIncluded === false &&
      dataset.fixturePolicy?.automaticAssertionsSeparateFromManualReview ===
        true,
    "fixturePolicy",
    "must enforce offline fixtures, no observed/held-out evidence, and review separation"
  );

  need(
    Array.isArray(dataset.scenarioFamilies),
    "scenarioFamilies",
    "must be an array"
  );
  need(
    dataset.scenarioFamilies.length === 10,
    "scenarioFamilies",
    "must contain exactly 10 families"
  );
  need(Array.isArray(dataset.caseVariants), "caseVariants", "must be an array");
  need(
    dataset.caseVariants.length === 50,
    "caseVariants",
    "must contain exactly 50 variants"
  );

  const familyIds = new Set();
  const coverage = new Set();
  const coveredStates = new Set();
  const coveredCategories = new Set();
  const coveredStages = new Set();
  const coveredDimensions = new Set();
  for (const [index, family] of dataset.scenarioFamilies.entries()) {
    const path = `scenarioFamilies[${index}]`;
    for (const field of [
      "id",
      "split",
      "coverageCellId",
      "evidenceState",
      "failureCategory",
      "stage",
      "dimensions",
      "fixture",
      "automaticChecks",
      "manualReview"
    ])
      need(
        Object.hasOwn(family ?? {}, field),
        `${path}.${field}`,
        "required field is missing"
      );
    need(
      /^DEV-FAM-\d{3}$/.test(family.id),
      `${path}.id`,
      "must match DEV-FAM-NNN"
    );
    need(
      !familyIds.has(family.id),
      `${path}.id`,
      `duplicate family ID ${family.id}`
    );
    familyIds.add(family.id);
    need(
      family.split === "development",
      `${path}.split`,
      "must equal development"
    );
    need(
      evidenceStates.has(family.evidenceState),
      `${path}.evidenceState`,
      `invalid value ${family.evidenceState}`
    );
    need(
      stages.has(family.stage),
      `${path}.stage`,
      `invalid value ${family.stage}`
    );
    need(
      Array.isArray(family.dimensions) &&
        family.dimensions.length > 0 &&
        family.dimensions.every((x) => dimensions.has(x)),
      `${path}.dimensions`,
      "must be a non-empty array of frozen dimensions"
    );
    need(
      object(family.fixture) && family.fixture.kind === "deterministic_stub",
      `${path}.fixture`,
      "must be a deterministic_stub object"
    );
    need(
      Array.isArray(family.automaticChecks) &&
        family.automaticChecks.length > 0,
      `${path}.automaticChecks`,
      "must be a non-empty array"
    );
    need(
      Array.isArray(family.manualReview) &&
        family.manualReview.length > 0 &&
        family.manualReview.every((x) => manualReviewTypes.has(x)),
      `${path}.manualReview`,
      "must use separate frozen manual-review types"
    );

    if (family.coverageCellId !== null) {
      need(
        requiredCoverageCells.has(family.coverageCellId),
        `${path}.coverageCellId`,
        `invalid frozen coverage cell ${family.coverageCellId}`
      );
      need(
        !coverage.has(family.coverageCellId),
        `${path}.coverageCellId`,
        `duplicate frozen coverage cell ${family.coverageCellId}`
      );
      coverage.add(family.coverageCellId);
    }
    if (family.evidenceState === "invalid_response")
      need(
        ["parse_error", "schema_error"].includes(family.failureCategory),
        `${path}.failureCategory`,
        "invalid_response requires parse_error or schema_error"
      );
    else if (family.evidenceState === "tool_failure")
      need(
        ["http_error", "network_error", "timeout"].includes(
          family.failureCategory
        ),
        `${path}.failureCategory`,
        "tool_failure requires an infrastructure failure category"
      );
    else
      need(
        family.failureCategory === null,
        `${path}.failureCategory`,
        "successful_records and zero_results require null"
      );
    const eligible = family.fixture?.citationProvenanceEligible;
    need(
      eligible === (family.evidenceState === "successful_records"),
      `${path}.fixture.citationProvenanceEligible`,
      "must be true only for successful_records"
    );
    coveredStates.add(family.evidenceState);
    if (family.failureCategory !== null)
      coveredCategories.add(family.failureCategory);
    coveredStages.add(family.stage);
    for (const dimension of family.dimensions ?? [])
      coveredDimensions.add(dimension);
  }
  for (const cell of requiredCoverageCells)
    need(
      coverage.has(cell),
      `coverage.${cell}`,
      "frozen coverage cell is missing"
    );
  for (const state of evidenceStates)
    need(
      coveredStates.has(state),
      `coverage.evidenceState.${state}`,
      "evidence state is missing"
    );
  for (const category of failureCategories)
    need(
      coveredCategories.has(category),
      `coverage.failureCategory.${category}`,
      "failure category is missing"
    );
  for (const stage of stages)
    need(
      coveredStages.has(stage),
      `coverage.stage.${stage}`,
      "stage is missing"
    );
  for (const dimension of dimensions)
    need(
      coveredDimensions.has(dimension),
      `coverage.dimension.${dimension}`,
      "evaluation dimension is missing"
    );

  const variantIds = new Set();
  const variantCounts = new Map();
  const coveredPerturbations = new Set();
  for (const [index, variant] of dataset.caseVariants.entries()) {
    const path = `caseVariants[${index}]`;
    for (const field of [
      "id",
      "scenarioFamilyId",
      "split",
      "perturbation",
      "language",
      "userInput"
    ])
      need(
        Object.hasOwn(variant ?? {}, field),
        `${path}.${field}`,
        "required field is missing"
      );
    need(
      /^DEV-\d{3}-[OPNILR]$/.test(variant.id),
      `${path}.id`,
      "must match the development variant ID format"
    );
    need(
      !variantIds.has(variant.id),
      `${path}.id`,
      `duplicate variant ID ${variant.id}`
    );
    variantIds.add(variant.id);
    need(
      familyIds.has(variant.scenarioFamilyId),
      `${path}.scenarioFamilyId`,
      `unknown family ${variant.scenarioFamilyId}`
    );
    need(
      variant.split === "development",
      `${path}.split`,
      "must inherit development split"
    );
    need(
      perturbations.has(variant.perturbation),
      `${path}.perturbation`,
      `invalid value ${variant.perturbation}`
    );
    need(
      ["en", "zh"].includes(variant.language),
      `${path}.language`,
      "must be en or zh"
    );
    need(
      variant.perturbation === "language_variant"
        ? variant.language === "zh"
        : variant.language === "en",
      `${path}.language`,
      "language_variant must be zh and all other variants en"
    );
    need(
      typeof variant.userInput === "string" &&
        variant.userInput.trim().length > 0,
      `${path}.userInput`,
      "must be a non-empty development input"
    );
    variantCounts.set(
      variant.scenarioFamilyId,
      (variantCounts.get(variant.scenarioFamilyId) ?? 0) + 1
    );
    coveredPerturbations.add(variant.perturbation);
  }
  for (const id of familyIds)
    need(
      variantCounts.get(id) === 5,
      `scenarioFamilies.${id}.variants`,
      "must contain exactly five variants"
    );
  for (const perturbation of perturbations)
    need(
      coveredPerturbations.has(perturbation),
      `coverage.perturbation.${perturbation}`,
      "perturbation is missing"
    );

  const walk = (value, path = "dataset") => {
    if (Array.isArray(value))
      return value.forEach((item, index) => walk(item, `${path}[${index}]`));
    if (!object(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key))
        errors.push(
          `${path}.${key}: prohibited held-out, observed-result, scoring, or publication fixture field`
        );
      walk(child, `${path}.${key}`);
    }
  };
  walk(dataset);
  return errors;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function selfTest(base) {
  const fixtures = [
    ["valid dataset", (x) => x, true],
    [
      "wrong family count",
      (x) => {
        x.scenarioFamilies.pop();
        return x;
      },
      false
    ],
    [
      "wrong variant count",
      (x) => {
        x.caseVariants.pop();
        return x;
      },
      false
    ],
    [
      "held-out family",
      (x) => {
        x.scenarioFamilies[0].split = "held_out";
        return x;
      },
      false
    ],
    [
      "variant split mismatch",
      (x) => {
        x.caseVariants[0].split = "held_out";
        return x;
      },
      false
    ],
    [
      "duplicate family",
      (x) => {
        x.scenarioFamilies[1].id = x.scenarioFamilies[0].id;
        return x;
      },
      false
    ],
    [
      "duplicate variant",
      (x) => {
        x.caseVariants[1].id = x.caseVariants[0].id;
        return x;
      },
      false
    ],
    [
      "missing coverage cell",
      (x) => {
        x.scenarioFamilies[0].coverageCellId = null;
        return x;
      },
      false
    ],
    [
      "invalid evidence contract",
      (x) => {
        x.scenarioFamilies[2].failureCategory = "timeout";
        return x;
      },
      false
    ],
    [
      "invalid citation eligibility",
      (x) => {
        x.scenarioFamilies[1].fixture.citationProvenanceEligible = true;
        return x;
      },
      false
    ],
    [
      "held-out content flag",
      (x) => {
        x.heldOutContentIncluded = true;
        return x;
      },
      false
    ],
    [
      "observed result leakage",
      (x) => {
        x.scenarioFamilies[0].observedResult = "pass";
        return x;
      },
      false
    ],
    [
      "publication fixture leakage",
      (x) => {
        x.scenarioFamilies[0].fixture.pmid = "12345678";
        return x;
      },
      false
    ],
    [
      "unfrozen sampling violation",
      (x) => {
        x.sampling.sampleSizeFrozen = true;
        return x;
      },
      false
    ],
    [
      "language mismatch",
      (x) => {
        x.caseVariants[3].language = "en";
        return x;
      },
      false
    ]
  ];
  for (const [name, mutate, shouldPass] of fixtures) {
    const errors = validate(mutate(clone(base)));
    if ((errors.length === 0) !== shouldPass)
      throw new Error(
        `self-test ${name} produced ${errors.length} validation errors`
      );
  }
  console.log(
    `Development benchmark validator self-test passed (${fixtures.length} fixtures; no network or repository writes).`
  );
}

let dataset;
try {
  dataset = JSON.parse(await readFile(datasetUrl, "utf8"));
} catch (error) {
  console.error(
    `benchmark-development.json: unable to read or parse: ${error.message}`
  );
  process.exit(1);
}

if (process.argv.includes("--self-test")) await selfTest(dataset);
else {
  const errors = validate(dataset);
  if (errors.length) {
    console.error(
      `Development benchmark validation failed (${errors.length}):\n- ${errors.join("\n- ")}`
    );
    process.exit(1);
  }
  console.log(
    `Development benchmark valid: ${dataset.scenarioFamilies.length} development scenario families; ${dataset.caseVariants.length} development variants; 0 held-out; status not-run.`
  );
}
