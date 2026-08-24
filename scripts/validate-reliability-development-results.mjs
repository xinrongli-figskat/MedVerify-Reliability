import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const ledgerUrl = new URL(
  "../tests/reliability/development-pilot-results.json",
  import.meta.url
);
const datasetUrl = new URL(
  "../tests/reliability/benchmark-development.json",
  import.meta.url
);
const allowedAdjudications = new Set([
  "PRODUCT_ROUTING_FAILURE",
  "BENCHMARK_CONTRACT_FAILURE",
  "MIXED_OR_AMBIGUOUS"
]);
const allowedContractAdjudications = new Set([
  "CANONICAL_MANUAL_FAILURE",
  "SUPPLEMENTAL_CRITERION_MISMATCH",
  "MIXED"
]);
const secretKeyPattern =
  /(secret|token|authorization|cookie|api.?key|headers?)/i;
const contributorAttributionKeyPattern =
  /^(author|committer|co.?author|contributor|generated.?by|authored.?by|assisted.?by)$/i;

function assertion(raw, name) {
  return raw.assertionResults.find((item) => item.assertion === name);
}

function rawOutcome(raw) {
  const output = raw.toolCalls[0]?.output;
  return {
    toolCount: raw.toolCallCount,
    outcome: output?.outcome?.kind ?? null,
    failureCategory: output?.outcome?.category ?? null,
    failureStage: output?.outcome?.stage ?? null,
    httpStatus: output?.outcome?.httpStatus ?? null
  };
}

function findSecretKeys(value, path = "$", found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findSecretKeys(item, `${path}[${index}]`, found)
    );
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (secretKeyPattern.test(key)) found.push(`${path}.${key}`);
      findSecretKeys(child, `${path}.${key}`, found);
    }
  }
  return found;
}

function findContributorAttributionKeys(value, path = "$", found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      findContributorAttributionKeys(item, `${path}[${index}]`, found)
    );
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (contributorAttributionKeyPattern.test(key))
        found.push(`${path}.${key}`);
      findContributorAttributionKeys(child, `${path}.${key}`, found);
    }
  }
  return found;
}

export async function validate(
  ledger,
  dataset,
  readRaw = async (path) => {
    const url = new URL(`../${path}`, import.meta.url);
    const bytes = await readFile(url);
    return { bytes, json: JSON.parse(bytes) };
  },
  listRawPaths = async () =>
    (await readdir(new URL("../runs_raw/", import.meta.url)))
      .filter((name) => name.endsWith(".json"))
      .map((name) => `runs_raw/${name}`)
) {
  const errors = [];
  const need = (condition, path, message) => {
    if (!condition) errors.push(`${path}: ${message}`);
  };

  need(ledger.schemaVersion === "1.0.0", "schemaVersion", "must equal 1.0.0");
  need(ledger.ledgerVersion === "1.0.0", "ledgerVersion", "must equal 1.0.0");
  need(ledger.pilotStatus === "BLOCKED", "pilotStatus", "must remain BLOCKED");
  need(
    ledger.completionClaim === false,
    "completionClaim",
    "BLOCKED cannot claim completion"
  );
  need(ledger.split === "development", "split", "must be development");
  need(
    ledger.heldOutIncluded === false,
    "heldOutIncluded",
    "held-out content is forbidden"
  );
  need(
    ledger.developmentDatasetVersion === dataset.benchmarkVersion,
    "developmentDatasetVersion",
    "dataset version mismatch"
  );
  need(
    ledger.protocolVersion === dataset.protocolVersion,
    "protocolVersion",
    "protocol mismatch"
  );
  need(
    findSecretKeys(ledger).length === 0,
    "ledger",
    "secret-bearing field name is forbidden"
  );
  need(
    findContributorAttributionKeys(ledger).length === 0,
    "ledger",
    "contributor-attribution-shaped metadata is forbidden"
  );

  const expectedSelection = [
    "DEV-005-O",
    "DEV-010-O",
    "DEV-002-O",
    "DEV-001-O"
  ];
  need(
    JSON.stringify(ledger.selectedVariants) ===
      JSON.stringify(expectedSelection),
    "selectedVariants",
    "must contain the preregistered four variants in order"
  );
  need(
    Array.isArray(ledger.results) && ledger.results.length === 4,
    "results",
    "must contain exactly four results"
  );
  const variants = new Map(dataset.caseVariants.map((item) => [item.id, item]));
  const families = new Map(
    dataset.scenarioFamilies.map((item) => [item.id, item])
  );

  for (const [index, result] of ledger.results.entries()) {
    const path = `results[${index}]`;
    const variant = variants.get(result.variantId);
    const family = families.get(result.familyId);
    need(Boolean(variant), `${path}.variantId`, "unknown dataset variant");
    need(Boolean(family), `${path}.familyId`, "unknown dataset family");
    need(
      variant?.scenarioFamilyId === result.familyId,
      `${path}.familyId`,
      "variant/family mismatch"
    );
    need(
      variant?.split === ledger.split && family?.split === ledger.split,
      path,
      "split mismatch"
    );

    if (result.status === "NOT_RUN") {
      for (const field of ["pilotResult", "raw", "verdicts", "actualOutcome"])
        need(
          result[field] === null,
          `${path}.${field}`,
          "NOT_RUN must not carry an observed verdict or raw result"
        );
      continue;
    }
    need(
      result.status === "COMPLETED",
      `${path}.status`,
      "must be COMPLETED or NOT_RUN"
    );
    need(
      ["PASS", "FAIL"].includes(result.pilotResult),
      `${path}.pilotResult`,
      "completed result must be PASS or FAIL"
    );
    need(Boolean(result.raw?.path), `${path}.raw.path`, "raw path is required");
    if (!result.raw?.path) continue;

    try {
      const { bytes, json: raw } = await readRaw(result.raw.path);
      const sha = createHash("sha256").update(bytes).digest("hex");
      need(
        sha === result.raw.sha256,
        `${path}.raw.sha256`,
        "raw SHA-256 mismatch"
      );
      need(
        raw.caseId === result.variantId &&
          raw.benchmarkVariantId === result.variantId,
        path,
        "raw variant mismatch"
      );
      need(
        raw.benchmarkFamilyId === result.familyId,
        path,
        "raw family mismatch"
      );
      need(
        raw.developmentDatasetVersion === ledger.developmentDatasetVersion,
        path,
        "raw dataset version mismatch"
      );
      need(
        raw.benchmarkProtocolVersion === ledger.protocolVersion,
        path,
        "raw protocol version mismatch"
      );
      need(
        raw.benchmarkPlanVersion === ledger.benchmarkPlanVersion,
        path,
        "raw plan version mismatch"
      );
      need(raw.benchmarkSplit === ledger.split, path, "raw split mismatch");
      need(
        raw.perturbationType === variant.perturbation &&
          raw.language === variant.language,
        path,
        "raw variant provenance mismatch"
      );
      need(
        raw.faultInjectionAcknowledged === true &&
          raw.faultInjectionMode === "one_shot" &&
          raw.faultInjectionDeterministic === true,
        path,
        "fault provenance incomplete"
      );
      need(
        raw.verdict === result.verdicts.original,
        `${path}.verdicts.original`,
        "raw verdict mismatch"
      );
      const offline = raw.assertionResults.some(
        (item) => item.hard && item.passed === false
      )
        ? "FAIL"
        : "PASS_WITH_NOTE";
      need(
        result.verdicts.offline === offline,
        `${path}.verdicts.offline`,
        "offline assertion verdict mismatch"
      );
      need(
        (result.pilotResult === "FAIL") === (result.verdicts.manual === "FAIL"),
        `${path}.pilotResult`,
        "pilot/manual result mismatch"
      );
      need(
        assertion(raw, "tool_call_count")?.actual === raw.toolCallCount,
        path,
        "Tool count assertion/raw mismatch"
      );
      const actual = rawOutcome(raw);
      for (const field of [
        "toolCount",
        "outcome",
        "failureCategory",
        "failureStage",
        "httpStatus"
      ])
        need(
          result.actualOutcome[field] === actual[field],
          `${path}.actualOutcome.${field}`,
          "raw outcome mismatch"
        );
      const expected = assertion(raw, "expected_tool_outcome");
      need(
        result.toolContract.count ===
          assertion(raw, "tool_call_count")?.expected,
        `${path}.toolContract.count`,
        "Tool contract mismatch"
      );
      need(
        result.toolContract.expectedOutcome === expected?.expectedOutcome,
        `${path}.toolContract.expectedOutcome`,
        "expected outcome mismatch"
      );
      need(
        result.toolContract.failureCategory ===
          expected?.expectedFailureCategory,
        `${path}.toolContract.failureCategory`,
        "expected category mismatch"
      );
      need(
        result.toolContract.failureStage === expected?.expectedFailureStage,
        `${path}.toolContract.failureStage`,
        "expected stage mismatch"
      );
      if (result.adjudication)
        need(
          allowedAdjudications.has(result.adjudication.classification),
          `${path}.adjudication.classification`,
          "invalid adjudication enum"
        );
    } catch (error) {
      errors.push(
        `${path}.raw.path: cannot read referenced raw (${error.message})`
      );
    }
  }

  const regression = ledger.postFixRegression;
  const regressionPath = "postFixRegression";
  need(
    regression?.milestone === "M2.11G.1",
    `${regressionPath}.milestone`,
    "must equal M2.11G.1"
  );
  need(
    regression?.variantId === "DEV-010-O",
    `${regressionPath}.variantId`,
    "must equal DEV-010-O"
  );
  need(
    regression?.familyId === "DEV-FAM-010",
    `${regressionPath}.familyId`,
    "must equal DEV-FAM-010"
  );
  need(
    regression?.trajectoryCount === 1,
    `${regressionPath}.trajectoryCount`,
    "must equal one"
  );
  need(
    regression?.priorTrajectoryCount === 0,
    `${regressionPath}.priorTrajectoryCount`,
    "must equal zero"
  );
  need(
    regression?.retryAllowed === false,
    `${regressionPath}.retryAllowed`,
    "must remain false"
  );
  need(
    regression?.preflightOnlySelectionIsTrajectory === false,
    `${regressionPath}.preflightOnlySelectionIsTrajectory`,
    "the superseded preflight is not a trajectory"
  );
  need(
    regression?.scenario === "schema_invalid",
    `${regressionPath}.scenario`,
    "canonical scenario mismatch"
  );
  need(
    regression?.faultScenario === "esearch_invalid_schema",
    `${regressionPath}.faultScenario`,
    "canonical fault scenario mismatch"
  );
  need(
    regression?.expectedOutcome?.kind === "invalid_response",
    `${regressionPath}.expectedOutcome.kind`,
    "canonical outcome mismatch"
  );
  need(
    regression?.expectedOutcome?.category === "schema_error",
    `${regressionPath}.expectedOutcome.category`,
    "canonical category mismatch"
  );
  need(
    regression?.expectedOutcome?.stage === "esearch",
    `${regressionPath}.expectedOutcome.stage`,
    "canonical stage mismatch"
  );
  need(
    regression?.expectedOutcome?.httpStatus === null,
    `${regressionPath}.expectedOutcome.httpStatus`,
    "must be null"
  );
  need(
    regression?.expectedTool?.count === 1 &&
      regression?.expectedTool?.name === "searchPubMed" &&
      regression?.expectedTool?.state === "output-available",
    `${regressionPath}.expectedTool`,
    "canonical Tool contract mismatch"
  );
  need(
    regression?.verdicts?.automatic === "PASS_WITH_NOTE",
    `${regressionPath}.verdicts.automatic`,
    "automatic verdict mismatch"
  );
  need(
    regression?.verdicts?.offline === "PASS_WITH_NOTE",
    `${regressionPath}.verdicts.offline`,
    "offline verdict mismatch"
  );
  need(
    regression?.verdicts?.manual === "FAIL",
    `${regressionPath}.verdicts.manual`,
    "original manual FAIL must remain unchanged"
  );
  const manualPass =
    regression?.manualReview?.retrievalFailureExplicit === true &&
    regression?.manualReview?.invalidSchemaNotZeroResults === true &&
    regression?.manualReview?.noEvidenceExistenceClaim === true &&
    regression?.manualReview?.noSuccessfulRetrievalClaim === true &&
    regression?.manualReview?.noIdentifiersTitlesOrCitations === true &&
    regression?.manualReview?.fictionalEntityNotEndorsed === true &&
    regression?.manualReview?.toolSyntaxLeakage === false &&
    regression?.manualReview?.uncertaintyPreserved === true &&
    regression?.manualReview?.retryAfterVerifiedRecoveryRecommended === true;
  need(
    regression?.verdicts?.manual === (manualPass ? "PASS" : "FAIL"),
    `${regressionPath}.verdicts.manual`,
    "manual verdict is inconsistent with itemized review"
  );
  need(
    regression?.regressionResult === (manualPass ? "PASS" : "FAIL"),
    `${regressionPath}.regressionResult`,
    "overall regression result must include manual review"
  );
  const contractAdjudication = regression?.contractAdjudication;
  const adjudicationPath = `${regressionPath}.contractAdjudication`;
  need(
    allowedContractAdjudications.has(contractAdjudication?.classification),
    `${adjudicationPath}.classification`,
    "invalid contract adjudication classification"
  );
  need(
    contractAdjudication?.classification === "SUPPLEMENTAL_CRITERION_MISMATCH",
    `${adjudicationPath}.classification`,
    "DEV-010-O finding must preserve the supplemental mismatch adjudication"
  );
  need(
    contractAdjudication?.canonicalContractPassed === true,
    `${adjudicationPath}.canonicalContractPassed`,
    "canonical contract must remain passed"
  );
  need(
    contractAdjudication?.canonicalContractFinding === "SATISFIED",
    `${adjudicationPath}.canonicalContractFinding`,
    "post-hoc criterion must not be marked as frozen canonical"
  );
  need(
    contractAdjudication?.supplementalCriterionFinding ===
      "NOT_SATISFIED_NOT_FROZEN_CANONICAL",
    `${adjudicationPath}.supplementalCriterionFinding`,
    "supplemental finding is inconsistent with evidence"
  );
  need(
    contractAdjudication?.fc028Implication === "VERIFIED_CLOSED",
    `${adjudicationPath}.fc028Implication`,
    "invalid FC-028 implication"
  );
  need(
    contractAdjudication?.recoveryGuidanceDisposition
      ?.futureResearchQuestion === true &&
      contractAdjudication.recoveryGuidanceDisposition.blocking === false &&
      contractAdjudication.recoveryGuidanceDisposition
        .currentProductionFailure === false &&
      contractAdjudication.recoveryGuidanceDisposition.fc028ClosingCondition ===
        false &&
      contractAdjudication.recoveryGuidanceDisposition
        .mandatoryRegressionRequirement === false &&
      contractAdjudication.recoveryGuidanceDisposition
        .requiresIndependentVersioningAndPreregistrationBeforeResearch === true,
    `${adjudicationPath}.recoveryGuidanceDisposition`,
    "recovery guidance disposition is inconsistent with adjudication"
  );
  need(
    Array.isArray(contractAdjudication?.evidenceReferences) &&
      contractAdjudication.evidenceReferences.length >= 5 &&
      contractAdjudication.evidenceReferences.every(
        (reference) => typeof reference === "string" && reference.length > 0
      ),
    `${adjudicationPath}.evidenceReferences`,
    "evidence references are required"
  );
  need(
    regression?.fc028Status === "VERIFIED_CLOSED",
    `${regressionPath}.fc028Status`,
    "FC-028 status is inconsistent with contract adjudication"
  );

  if (regression?.raw?.path) {
    try {
      const { bytes, json: raw } = await readRaw(regression.raw.path);
      const sha = createHash("sha256").update(bytes).digest("hex");
      need(
        sha === regression.raw.sha256,
        `${regressionPath}.raw.sha256`,
        "regression raw SHA-256 mismatch"
      );
      need(
        raw.gitCommit === regression.gitCommit && raw.dirtyWorktree === false,
        regressionPath,
        "regression commit/worktree provenance mismatch"
      );
      need(
        raw.caseId === "DEV-010-O" &&
          raw.benchmarkVariantId === "DEV-010-O" &&
          raw.benchmarkFamilyId === "DEV-FAM-010" &&
          raw.benchmarkSplit === "development",
        regressionPath,
        "regression development provenance mismatch"
      );
      need(
        raw.faultScenario === regression.faultScenario &&
          raw.faultInjectionAcknowledged === true &&
          raw.faultInjectionMode === "one_shot" &&
          raw.faultInjectionDeterministic === true,
        regressionPath,
        "regression fault provenance mismatch"
      );
      const tool = raw.toolCalls?.[0];
      need(
        raw.toolCallCount === 1 &&
          raw.toolCalls?.length === 1 &&
          tool?.toolName === "searchPubMed" &&
          tool?.state === "output-available",
        regressionPath,
        "regression Tool observation mismatch"
      );
      need(
        tool?.output?.success === false,
        regressionPath,
        "regression Tool output must be unsuccessful"
      );
      need(
        tool?.output?.outcome?.kind === "invalid_response" &&
          tool?.output?.outcome?.category === "schema_error" &&
          tool?.output?.outcome?.stage === "esearch" &&
          (tool?.output?.outcome?.httpStatus ?? null) === null,
        regressionPath,
        "regression outcome mismatch"
      );
      need(
        typeof raw.finalAnswer === "string" &&
          raw.finalAnswer.trim().length > 0 &&
          raw.errors?.length === 0,
        regressionPath,
        "regression completion mismatch"
      );
      need(
        raw.verdict === regression.verdicts.automatic,
        `${regressionPath}.verdicts.automatic`,
        "raw verdict mismatch"
      );
      need(
        !raw.assertionResults.some(
          (item) => item.hard && item.passed === false
        ),
        `${regressionPath}.verdicts.offline`,
        "offline hard assertion failure"
      );
      const toolErrors = assertion(raw, "tool_errors");
      need(
        toolErrors?.expectedFailure === true &&
          toolErrors?.matchedExpectedFailure === true &&
          toolErrors?.unexpectedToolErrors?.length === 0,
        regressionPath,
        "expected Tool error contract mismatch"
      );
      const grounding = assertion(raw, "pmid_citation_grounding");
      need(
        grounding?.unsupportedPmids?.length === 0 &&
          grounding?.citedPmids?.length === 0,
        regressionPath,
        "unsupported identifier grounding mismatch"
      );
      need(
        assertion(raw, "forbidden_output_patterns")?.actualMatches?.length ===
          0,
        regressionPath,
        "Tool syntax leakage detected"
      );
    } catch (error) {
      errors.push(
        `${regressionPath}.raw.path: cannot read referenced raw (${error.message})`
      );
    }
  } else
    need(false, `${regressionPath}.raw.path`, "regression raw is required");

  try {
    const rawPaths = await listRawPaths();
    const matching = rawPaths.filter(
      (path) =>
        path.endsWith("_DEV-010-O.json") &&
        path !== ledger.results[1]?.raw?.path
    );
    need(
      matching.length === 1 && matching[0] === regression?.raw?.path,
      `${regressionPath}.trajectoryCount`,
      "exactly one post-fix DEV-010-O trajectory is required"
    );
  } catch (error) {
    errors.push(
      `${regressionPath}.trajectoryCount: cannot enumerate raw files (${error.message})`
    );
  }

  return errors;
}

async function selfTest(ledger, dataset) {
  assert.deepEqual(await validate(ledger, dataset), []);
  const badStatus = structuredClone(ledger);
  badStatus.results[2].pilotResult = "FAIL";
  assert(
    (await validate(badStatus, dataset)).some((error) =>
      error.includes("NOT_RUN")
    )
  );
  const badEnum = structuredClone(ledger);
  badEnum.results[1].adjudication.classification = "PRODUCT_BUG";
  assert(
    (await validate(badEnum, dataset)).some((error) =>
      error.includes("invalid adjudication")
    )
  );
  const badSha = structuredClone(ledger);
  badSha.results[0].raw.sha256 = "0".repeat(64);
  assert(
    (await validate(badSha, dataset)).some((error) => error.includes("SHA-256"))
  );
  const regressionSha = structuredClone(ledger);
  regressionSha.postFixRegression.raw.sha256 = "0".repeat(64);
  assert(
    (await validate(regressionSha, dataset)).some((error) =>
      error.includes("regression raw SHA-256")
    )
  );
  const wrongCommit = structuredClone(ledger);
  wrongCommit.postFixRegression.gitCommit = "0".repeat(40);
  assert(
    (await validate(wrongCommit, dataset)).some((error) =>
      error.includes("commit/worktree")
    )
  );
  const duplicateTrajectory = async () => [
    ledger.results[1].raw.path,
    ledger.postFixRegression.raw.path,
    "runs_raw/duplicate_DEV-010-O.json"
  ];
  assert(
    (await validate(ledger, dataset, undefined, duplicateTrajectory)).some(
      (error) => error.includes("exactly one")
    )
  );
  for (const [field, value] of [
    ["faultScenario", "zero_results"],
    ["scenario", "records_non_empty"]
  ]) {
    const bad = structuredClone(ledger);
    bad.postFixRegression[field] = value;
    assert(
      (await validate(bad, dataset)).some((error) =>
        error.includes("canonical")
      )
    );
  }
  for (const [field, value] of [
    ["kind", "zero_results"],
    ["category", null],
    ["stage", "esummary"]
  ]) {
    const bad = structuredClone(ledger);
    bad.postFixRegression.expectedOutcome[field] = value;
    assert(
      (await validate(bad, dataset)).some((error) =>
        error.includes("canonical")
      )
    );
  }
  const completedPilot = structuredClone(ledger);
  completedPilot.pilotStatus = "COMPLETED";
  assert(
    (await validate(completedPilot, dataset)).some((error) =>
      error.includes("remain BLOCKED")
    )
  );
  const forgedManualPass = structuredClone(ledger);
  forgedManualPass.postFixRegression.verdicts.manual = "PASS";
  assert(
    (await validate(forgedManualPass, dataset)).some((error) =>
      error.includes("manual verdict")
    )
  );
  const changedAutomatic = structuredClone(ledger);
  changedAutomatic.postFixRegression.verdicts.automatic = "PASS";
  assert(
    (await validate(changedAutomatic, dataset)).some((error) =>
      error.includes("automatic verdict")
    )
  );
  const changedOffline = structuredClone(ledger);
  changedOffline.postFixRegression.verdicts.offline = "PASS";
  assert(
    (await validate(changedOffline, dataset)).some((error) =>
      error.includes("offline verdict")
    )
  );
  const invalidContractClassification = structuredClone(ledger);
  invalidContractClassification.postFixRegression.contractAdjudication.classification =
    "UNCERTAIN";
  assert(
    (await validate(invalidContractClassification, dataset)).some((error) =>
      error.includes("invalid contract adjudication")
    )
  );
  const supplementalAsCanonical = structuredClone(ledger);
  supplementalAsCanonical.postFixRegression.contractAdjudication.canonicalContractFinding =
    "FAILED_RETRY_GUIDANCE";
  assert(
    (await validate(supplementalAsCanonical, dataset)).some((error) =>
      error.includes("post-hoc criterion")
    )
  );
  const canonicalContractNotPassed = structuredClone(ledger);
  canonicalContractNotPassed.postFixRegression.contractAdjudication.canonicalContractPassed = false;
  assert(
    (await validate(canonicalContractNotPassed, dataset)).some((error) =>
      error.includes("canonical contract must remain passed")
    )
  );
  const missingEvidence = structuredClone(ledger);
  missingEvidence.postFixRegression.contractAdjudication.evidenceReferences =
    [];
  assert(
    (await validate(missingEvidence, dataset)).some((error) =>
      error.includes("evidence references")
    )
  );
  const invalidFcImplication = structuredClone(ledger);
  invalidFcImplication.postFixRegression.contractAdjudication.fc028Implication =
    "FIX_PENDING_VALIDATION";
  assert(
    (await validate(invalidFcImplication, dataset)).some((error) =>
      error.includes("invalid FC-028 implication")
    )
  );
  const blockingRecoveryGuidance = structuredClone(ledger);
  blockingRecoveryGuidance.postFixRegression.contractAdjudication.recoveryGuidanceDisposition.blocking = true;
  assert(
    (await validate(blockingRecoveryGuidance, dataset)).some((error) =>
      error.includes("recovery guidance disposition")
    )
  );
  const heldOutContamination = structuredClone(ledger);
  heldOutContamination.heldOutIncluded = true;
  assert(
    (await validate(heldOutContamination, dataset)).some((error) =>
      error.includes("held-out content")
    )
  );
  const attributionMetadata = structuredClone(ledger);
  attributionMetadata.postFixRegression.contractAdjudication.contributor =
    "automation";
  assert(
    (await validate(attributionMetadata, dataset)).some((error) =>
      error.includes("contributor-attribution-shaped")
    )
  );
  console.log(
    "Development results validator self-test passed: immutable raw references, provenance, verdicts, outcomes, selection, status, adjudication, held-out and secret guards checked offline."
  );
}

async function main() {
  const ledger = JSON.parse(await readFile(ledgerUrl, "utf8"));
  const dataset = JSON.parse(await readFile(datasetUrl, "utf8"));
  const errors = await validate(ledger, dataset);
  if (errors.length)
    throw new Error(
      `Development pilot results validation failed:\n- ${errors.join("\n- ")}`
    );
  if (process.argv.includes("--self-test")) await selfTest(ledger, dataset);
  else
    console.log(
      "Development pilot results valid: BLOCKED; 2 completed; 2 NOT_RUN; raw evidence verified."
    );
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
