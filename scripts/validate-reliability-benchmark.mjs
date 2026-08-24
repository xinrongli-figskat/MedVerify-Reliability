import { readFile } from "node:fs/promises";

const planUrl = new URL(
  "../tests/reliability/benchmark-plan.json",
  import.meta.url
);
const outcomes = new Set([
  "successful_records",
  "zero_results",
  "invalid_response",
  "tool_failure"
]);
const categories = new Set([
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
const forbiddenKeys = new Set([
  "userInput",
  "prompt",
  "promptText",
  "expectedAnswer",
  "requiredOutputPhrases",
  "requiredOutputGroups",
  "forbiddenOutputPhrases",
  "forbiddenOutputPatterns",
  "articleTitle",
  "pmid",
  "pmcid",
  "doi",
  "identifierFixture",
  "hiddenGoldAnswer",
  "goldAnswerProse"
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function validate(plan) {
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
    "entrySnapshot",
    "researchQuestions",
    "unitsOfAnalysis",
    "splitGovernance",
    "developmentHistoryPolicy",
    "heldOutPolicy",
    "contaminationPolicy",
    "enums",
    "evidenceStateContracts",
    "requiredCoverageCells",
    "reviewPolicy",
    "samplingPolicy",
    "futureMilestoneBoundaries"
  ])
    need(Object.hasOwn(plan, field), field, "required field is missing");
  if (errors.length) return errors;

  need(plan.milestone === "M2.11A", "milestone", "must equal M2.11A");
  need(
    plan.status?.designOnly === true && plan.status?.execution === "not-run",
    "status",
    "must be design-only/not-run"
  );
  need(
    /^[0-9a-f]{40}$/.test(plan.sourceCheckpoint),
    "sourceCheckpoint",
    "must be a 40-character lowercase Git SHA"
  );
  need(
    plan.entrySnapshot?.reliabilityCaseCount === 25,
    "entrySnapshot.reliabilityCaseCount",
    "must equal 25"
  );
  need(
    plan.entrySnapshot?.immutableRawRunCount === 76,
    "entrySnapshot.immutableRawRunCount",
    "must equal 76"
  );
  need(
    plan.entrySnapshot?.existingEvidenceUse === "development_history_only",
    "entrySnapshot.existingEvidenceUse",
    "must be development_history_only"
  );
  need(
    plan.entrySnapshot?.existingCasesHeldOut === false &&
      plan.entrySnapshot?.existingRawRunsHeldOut === false,
    "entrySnapshot",
    "existing cases/raw must not be held-out"
  );
  for (const rq of ["RQ1", "RQ2", "RQ3", "RQ4"])
    need(
      typeof plan.researchQuestions?.[rq] === "string",
      `researchQuestions.${rq}`,
      "is required"
    );
  need(
    [
      "scenario_family",
      "case_variant",
      "run",
      "trajectory",
      "manual_review"
    ].every((x) => plan.unitsOfAnalysis?.includes(x)),
    "unitsOfAnalysis",
    "must contain all defined units"
  );
  need(
    plan.splitGovernance?.splitUnit === "scenario_family",
    "splitGovernance.splitUnit",
    "must equal scenario_family"
  );
  need(
    plan.splitGovernance?.derivedVariantsInheritFamilySplit === true,
    "splitGovernance.derivedVariantsInheritFamilySplit",
    "must be true"
  );
  need(
    plan.developmentHistoryPolicy?.registryAndRawUse ===
      "development_history_only" &&
      plan.developmentHistoryPolicy?.retrospectiveHeldOutRelabelingAllowed ===
        false,
    "developmentHistoryPolicy",
    "existing registry/raw must remain development/history only"
  );
  need(
    plan.heldOutPolicy?.contentIncluded === false,
    "heldOutPolicy.contentIncluded",
    "held-out content must be absent"
  );

  const dev = plan.splitGovernance?.developmentFamilyIds ?? [];
  const held = plan.splitGovernance?.heldOutFamilyIds ?? [];
  for (const id of dev.filter((id) => held.includes(id)))
    errors.push(`splitGovernance family ${id}: development/held-out overlap`);
  if (Array.isArray(plan.caseVariants))
    for (const variant of plan.caseVariants) {
      const family = [...(plan.scenarioFamilies ?? [])].find(
        (x) => x.id === variant.scenarioFamilyId
      );
      if (family && variant.split !== family.split)
        errors.push(
          `caseVariants ${variant.id}: derived variant split mismatch with family ${family.id}`
        );
    }

  for (const [key, expected] of [
    ["evidenceStates", outcomes],
    ["failureCategories", categories],
    ["stages", stages],
    ["perturbations", perturbations],
    ["evaluationDimensions", dimensions]
  ]) {
    need(
      Array.isArray(plan.enums?.[key]) &&
        plan.enums[key].every((x) => expected.has(x)),
      `enums.${key}`,
      "contains an invalid enum value or is not an array"
    );
  }
  for (const outcome of outcomes)
    need(
      plan.enums.evidenceStates?.includes(outcome),
      `enums.evidenceStates.${outcome}`,
      "required outcome is missing"
    );
  for (const category of ["parse_error", "schema_error"])
    need(
      plan.evidenceStateContracts?.invalid_response?.categories?.includes(
        category
      ),
      `evidenceStateContracts.invalid_response.${category}`,
      "required category is missing"
    );
  for (const category of ["http_error", "network_error", "timeout"])
    need(
      plan.evidenceStateContracts?.tool_failure?.categories?.includes(category),
      `evidenceStateContracts.tool_failure.${category}`,
      "required category is missing"
    );
  for (const stage of stages)
    need(
      plan.enums.stages?.includes(stage),
      `enums.stages.${stage}`,
      "required stage is missing"
    );

  const ids = new Set();
  need(
    Array.isArray(plan.requiredCoverageCells) &&
      plan.requiredCoverageCells.length > 0,
    "requiredCoverageCells",
    "must be a non-empty array"
  );
  for (const [index, cell] of (plan.requiredCoverageCells ?? []).entries()) {
    const label = `requiredCoverageCells[${index}]${cell?.id ? ` (${cell.id})` : ""}`;
    for (const field of [
      "id",
      "outcome",
      "category",
      "stage",
      "language",
      "perturbation",
      "dimensions",
      "splitEligibility",
      "manualReview"
    ])
      need(
        Object.hasOwn(cell ?? {}, field),
        `${label}.${field}`,
        "required field is missing"
      );
    if (ids.has(cell.id))
      errors.push(`${label}.id: duplicate coverage cell ID ${cell.id}`);
    ids.add(cell.id);
    need(
      outcomes.has(cell.outcome),
      `${label}.outcome`,
      `invalid outcome ${cell.outcome}`
    );
    need(
      cell.category === null || categories.has(cell.category),
      `${label}.category`,
      `invalid category ${cell.category}`
    );
    need(
      stages.has(cell.stage),
      `${label}.stage`,
      `invalid stage ${cell.stage}`
    );
    need(
      perturbations.has(cell.perturbation),
      `${label}.perturbation`,
      `invalid perturbation ${cell.perturbation}`
    );
    need(
      Array.isArray(cell.dimensions) &&
        cell.dimensions.every((x) => dimensions.has(x)),
      `${label}.dimensions`,
      "contains an invalid evaluation dimension"
    );
  }

  need(
    plan.reviewPolicy?.automaticAssertionsSeparate === true &&
      plan.reviewPolicy?.manualReviewSeparate === true,
    "reviewPolicy",
    "automatic assertions and manual review must be separate"
  );
  need(
    plan.samplingPolicy?.sampleSizeFrozen === false &&
      plan.samplingPolicy?.repetitionCountFrozen === false,
    "samplingPolicy",
    "sample size/repetitions must remain unfrozen until the future pilot"
  );
  need(
    plan.samplingPolicy?.singleRunIsStabilityEvidence === false,
    "samplingPolicy.singleRunIsStabilityEvidence",
    "must be false"
  );

  const walk = (value, path = "plan") => {
    if (Array.isArray(value))
      return value.forEach((v, i) => walk(v, `${path}[${i}]`));
    if (!object(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key))
        errors.push(
          `${path}.${key}: prohibited held-out prompt/answer/assertion/identifier fixture field`
        );
      walk(child, `${path}.${key}`);
    }
  };
  walk(plan);
  return errors;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function selfTest(base) {
  const tests = [
    ["valid plan", (p) => p, true],
    [
      "missing outcome",
      (p) => {
        delete p.requiredCoverageCells[0].outcome;
        return p;
      },
      false
    ],
    [
      "split overlap",
      (p) => {
        p.splitGovernance.developmentFamilyIds = ["F-1"];
        p.splitGovernance.heldOutFamilyIds = ["F-1"];
        return p;
      },
      false
    ],
    [
      "derived variant mismatch",
      (p) => {
        p.scenarioFamilies = [{ id: "F-1", split: "development" }];
        p.caseVariants = [
          { id: "V-1", scenarioFamilyId: "F-1", split: "held_out" }
        ];
        return p;
      },
      false
    ],
    [
      "held-out prompt leakage",
      (p) => {
        p.heldOutPolicy.promptText = "secret";
        return p;
      },
      false
    ],
    [
      "illegal category/stage",
      (p) => {
        p.requiredCoverageCells[0].category = "bad";
        p.requiredCoverageCells[0].stage = "bad";
        return p;
      },
      false
    ],
    [
      "existing cases held-out",
      (p) => {
        p.entrySnapshot.existingCasesHeldOut = true;
        return p;
      },
      false
    ],
    [
      "duplicate coverage ID",
      (p) => {
        p.requiredCoverageCells[1].id = p.requiredCoverageCells[0].id;
        return p;
      },
      false
    ]
  ];
  for (const [name, mutate, shouldPass] of tests) {
    const errors = validate(mutate(clone(base)));
    if ((errors.length === 0) !== shouldPass)
      throw new Error(`self-test ${name} produced ${errors.length} errors`);
  }
  console.log(
    `Benchmark validator self-test passed (${tests.length} fixtures; no network or repository writes).`
  );
}

let plan;
try {
  plan = JSON.parse(await readFile(planUrl, "utf8"));
} catch (error) {
  console.error(
    `benchmark-plan.json: unable to read or parse: ${error.message}`
  );
  process.exit(1);
}

if (process.argv.includes("--self-test")) await selfTest(plan);
else {
  const errors = validate(plan);
  if (errors.length) {
    console.error(
      `Benchmark plan validation failed (${errors.length}):\n- ${errors.join("\n- ")}`
    );
    process.exit(1);
  }
  console.log(
    `Benchmark plan valid: ${plan.requiredCoverageCells.length} abstract coverage cells; status design-only/not-run.`
  );
}
