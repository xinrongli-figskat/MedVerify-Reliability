import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validate as validateHistorical } from "./validate-reliability-development-results.mjs";
import {
  validateManualReview,
  manualReviewAllowsReadiness
} from "./validate-reliability-manual-review.mjs";

// Manual-review integration 1.1.0: preserve legacy NOT_READY summaries, but
// require the complete independently validated 1.0.0 record contract for READY.

const root = new URL("../", import.meta.url);
const ledgerPath = "tests/reliability/r1-readiness-results.json";
const historicalPath = "tests/reliability/development-pilot-results.json";
const historicalSha =
  "73d22bfdd7f3bec2a3106c557c046da243e47606314a8975a0d41424ed7fe6df";
const datasetPath = "tests/reliability/benchmark-development.json";
const datasetSha =
  "4cf76ed355a4a89fecc0a74f0736f81a6f6b8c170acdf7abd396ac0c11a26bc9";
const decisionPath = "docs/research/r1_continuation_decision.md";
const adjudicationPath = "docs/research/development_pilot_adjudication.md";
const originalRaw = "runs_raw/2026-08-24T05-07-13-424Z_DEV-010-O.json";
const closureRaw = "runs_raw/2026-08-24T06-50-27-951Z_DEV-010-O.json";
const closureSha =
  "6b8e33fe36e74b16d8861b9b6c53ecd61067619d0ea934199fb4d4dce22d2a6a";
const closureCommit = "74549c81e267539392aa5f4111eee7a1a80f5f0d";
const caseIds = ["DEV-002-O", "DEV-001-O"];
const shaPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const rawPathPattern = /^runs_raw\/[A-Za-z0-9_-]+\.json$/;
const docPathPattern = /^docs\/research\/[A-Za-z0-9_-]+\.md$/;
const bytesFromRepo = (path) => readFile(new URL(path, root));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.trim().length > 0;

// Dependency injection is for offline negative fixtures only. The CLI always
// reads the actual repository and never writes evidence or invokes a runner.
export async function validate(ledger, { readBytes = bytesFromRepo } = {}) {
  const errors = [];
  const need = (condition, path, message) => {
    if (!condition) errors.push(`${path}: ${message}`);
  };
  const shape = (value, keys, path) => {
    if (!object(value)) {
      need(false, path, "must be an object");
      return false;
    }
    for (const key of keys)
      need(
        Object.hasOwn(value, key),
        `${path}.${key}`,
        "required field missing"
      );
    for (const key of Object.keys(value))
      need(keys.includes(key), `${path}.${key}`, "unknown field");
    return true;
  };
  const equal = (actual, expected, path) =>
    need(
      JSON.stringify(actual) === JSON.stringify(expected),
      path,
      "value mismatch"
    );
  async function load(path, label, expectedSha = null) {
    try {
      const bytes = await readBytes(path);
      if (expectedSha !== null)
        need(digest(bytes) === expectedSha, label, "SHA-256 mismatch");
      return { bytes, json: path.endsWith(".json") ? JSON.parse(bytes) : null };
    } catch (error) {
      need(false, label, `cannot read evidence (${error.message})`);
      return null;
    }
  }
  async function reference(ref, path, pattern) {
    if (!shape(ref, ["path", "sha256", "sourceCommit"], path)) return null;
    const safe = typeof ref.path === "string" && pattern.test(ref.path);
    need(safe, `${path}.path`, "must be a scoped repository-relative path");
    need(
      shaPattern.test(ref.sha256 ?? ""),
      `${path}.sha256`,
      "invalid SHA-256"
    );
    need(
      commitPattern.test(ref.sourceCommit ?? ""),
      `${path}.sourceCommit`,
      "invalid commit"
    );
    return safe ? load(ref.path, path, ref.sha256) : null;
  }

  if (
    !shape(
      ledger,
      [
        "schemaVersion",
        "ledgerVersion",
        "continuationId",
        "milestone",
        "sourceCheckpoint",
        "protocolVersion",
        "benchmarkPlanVersion",
        "developmentDatasetVersion",
        "split",
        "heldOutIncluded",
        "decisionDocument",
        "historicalPilot",
        "closureEvidence",
        "prerequisites",
        "liveExecutionRequiresSeparateAuthorization",
        "formalExperimentsAuthorized",
        "readinessVerdict",
        "cases"
      ],
      "ledger"
    )
  )
    return errors;
  for (const [key, value] of Object.entries({
    schemaVersion: "1.0.0",
    ledgerVersion: "1.0.0",
    continuationId: "R1-READINESS-001",
    milestone: "R1-B1",
    sourceCheckpoint: "feea8e33e0c83ce348933bdfacb01b7176e88a9c",
    protocolVersion: "1.0.0",
    benchmarkPlanVersion: "0.1.0-design",
    developmentDatasetVersion: "0.1.0-development",
    split: "development",
    heldOutIncluded: false,
    decisionDocument: decisionPath,
    liveExecutionRequiresSeparateAuthorization: true,
    formalExperimentsAuthorized: false
  }))
    equal(ledger[key], value, key);
  need(
    ["NOT_READY", "READY"].includes(ledger.readinessVerdict),
    "readinessVerdict",
    "invalid state"
  );
  const ready = ledger.readinessVerdict === "READY";

  const historicalRef = ledger.historicalPilot;
  if (
    shape(
      historicalRef,
      [
        "id",
        "ledgerVersion",
        "path",
        "sha256",
        "status",
        "preserveHistoricalState",
        "stoppingRuleDisposition",
        "followUpDisposition"
      ],
      "historicalPilot"
    )
  ) {
    for (const [key, value] of Object.entries({
      id: "M2.11D",
      ledgerVersion: "1.0.0",
      path: historicalPath,
      sha256: historicalSha,
      status: "BLOCKED",
      preserveHistoricalState: true,
      stoppingRuleDisposition: "PRESERVED_NOT_RESUMED",
      followUpDisposition: "PRESERVED_NOT_DISCHARGED"
    }))
      equal(historicalRef[key], value, `historicalPilot.${key}`);
  }
  // Pins are independent of the candidate ledger: changing both a historical
  // file and its advertised hash must still fail this checkpoint's validation.
  const historyFile = await load(
    historicalPath,
    "historicalSnapshot",
    historicalSha
  );
  const datasetFile = await load(datasetPath, "developmentDataset", datasetSha);
  await load(decisionPath, "decisionDocument");
  await load(
    adjudicationPath,
    "adjudicationDocument",
    "05215d3e0f1a1f8c2a3400e9fb2dbcfe992e3dc1818e3efe60fe6c4edc0a4cf6"
  );
  const history = historyFile?.json;
  const dataset = datasetFile?.json;
  if (!object(history) || !object(dataset)) return errors;
  equal(history.pilotStatus, "BLOCKED", "historicalSnapshot.pilotStatus");
  equal(history.completionClaim, false, "historicalSnapshot.completionClaim");
  equal(
    history.remainingRunProhibition?.active,
    true,
    "historicalSnapshot.remainingRunProhibition"
  );
  equal(
    history.remainingRunProhibition?.variants,
    caseIds,
    "historicalSnapshot.prohibitedVariants"
  );
  equal(
    history.followUpRequirement,
    {
      required: true,
      action:
        "Version and preregister a minimal paired routing/construct experiment before product or dataset changes and before resuming the pilot."
    },
    "historicalSnapshot.followUpRequirement"
  );
  const original = history.results?.find(
    (item) => item.variantId === "DEV-010-O"
  );
  equal(
    original?.pilotResult,
    "FAIL",
    "historicalSnapshot.originalDEV010.pilotResult"
  );
  equal(
    original?.verdicts,
    { original: "FAIL", offline: "FAIL", manual: "FAIL" },
    "historicalSnapshot.originalDEV010.verdicts"
  );
  equal(
    original?.raw?.path,
    originalRaw,
    "historicalSnapshot.originalDEV010.raw"
  );
  for (const id of caseIds)
    equal(
      history.results?.find((item) => item.variantId === id)?.status,
      "NOT_RUN",
      `historicalSnapshot.${id}.status`
    );
  try {
    const historyErrors = await validateHistorical(
      history,
      dataset,
      async (path) => {
        if (!rawPathPattern.test(path))
          throw new Error("unsafe historical raw path");
        const bytes = await readBytes(path);
        return { bytes, json: JSON.parse(bytes) };
      }
    );
    for (const error of historyErrors)
      errors.push(`historicalValidator: ${error}`);
  } catch (error) {
    need(false, "historicalValidator", `invalid snapshot (${error.message})`);
  }

  const closure = ledger.closureEvidence;
  if (
    shape(
      closure,
      [
        "failureId",
        "status",
        "role",
        "historicalLedgerPointer",
        "replacesOriginalPilot",
        "raw",
        "sourceCommit",
        "adjudicationDocument",
        "classification",
        "canonicalContractFinding"
      ],
      "closureEvidence"
    )
  ) {
    for (const [key, value] of Object.entries({
      failureId: "FC-028",
      status: "VERIFIED_CLOSED",
      role: "INDEPENDENT_POST_FIX_BASIS",
      historicalLedgerPointer: "/postFixRegression",
      replacesOriginalPilot: false,
      sourceCommit: closureCommit,
      adjudicationDocument: adjudicationPath,
      classification: "SUPPLEMENTAL_CRITERION_MISMATCH",
      canonicalContractFinding: "SATISFIED"
    }))
      equal(closure[key], value, `closureEvidence.${key}`);
    if (shape(closure.raw, ["path", "sha256"], "closureEvidence.raw")) {
      equal(closure.raw.path, closureRaw, "closureEvidence.raw.path");
      equal(closure.raw.sha256, closureSha, "closureEvidence.raw.sha256");
    }
  }
  equal(
    history.postFixRegression?.raw,
    { path: closureRaw, sha256: closureSha },
    "historicalSnapshot.postFixRegression.raw"
  );
  equal(
    history.postFixRegression?.gitCommit,
    closureCommit,
    "historicalSnapshot.postFixRegression.gitCommit"
  );
  equal(
    history.postFixRegression?.verdicts?.manual,
    "FAIL",
    "historicalSnapshot.postFixRegression.manual"
  );
  // The unchanged historical validator verifies the actual post-fix raw's hash,
  // commit, Tool/outcome, automatic verdict and independent contract finding.

  const prerequisites = ledger.prerequisites;
  const prerequisiteKeys = [
    "measurementFidelityDecision",
    "liveAuthorizationDecision"
  ];
  if (shape(prerequisites, prerequisiteKeys, "prerequisites")) {
    for (const key of prerequisiteKeys) {
      if (prerequisites[key] !== null) {
        const ref = prerequisites[key];
        const file = await reference(
          ref,
          `prerequisites.${key}`,
          docPathPattern
        );
        need(
          ![
            decisionPath,
            adjudicationPath,
            "docs/research/benchmark_protocol.md",
            "docs/research/RESEARCH_ROADMAP.md",
            "docs/research/development_benchmark.md"
          ].includes(ref?.path),
          `prerequisites.${key}`,
          "requires a separate subsequent decision"
        );
        if (file)
          need(
            file.bytes.toString().trim().length > 0,
            `prerequisites.${key}`,
            "empty decision"
          );
      }
    }
    if (
      prerequisites.measurementFidelityDecision &&
      prerequisites.liveAuthorizationDecision
    )
      need(
        prerequisites.measurementFidelityDecision.path !==
          prerequisites.liveAuthorizationDecision.path,
        "prerequisites",
        "measurement and live authorization decisions must be distinct"
      );
  }

  if (!Array.isArray(ledger.cases)) {
    need(false, "cases", "must be an array");
    return errors;
  }
  equal(
    ledger.cases.map((item) => item?.variantId),
    caseIds,
    "cases.selection"
  );
  const usedRawPaths = new Set();
  const historicalRawPaths = new Set([
    ...(history.results ?? []).map((item) => item.raw?.path).filter(Boolean),
    closureRaw
  ]);
  for (const [index, result] of ledger.cases.entries()) {
    const path = `cases[${index}]`;
    if (
      !shape(
        result,
        [
          "variantId",
          "familyId",
          "status",
          "raw",
          "automaticVerdict",
          "manualReview"
        ],
        path
      )
    )
      continue;
    const variant = dataset.caseVariants?.find(
      (item) => item.id === result.variantId
    );
    const family = dataset.scenarioFamilies?.find(
      (item) => item.id === result.familyId
    );
    need(
      Boolean(variant && family && variant.scenarioFamilyId === family.id),
      `${path}.familyId`,
      "variant/family mismatch"
    );
    need(
      variant?.split === "development" && family?.split === "development",
      path,
      "must inherit development split"
    );
    need(
      ["NOT_RUN", "COMPLETED"].includes(result.status),
      `${path}.status`,
      "invalid state"
    );
    if (result.status === "NOT_RUN") {
      for (const key of ["raw", "automaticVerdict", "manualReview"])
        equal(result[key], null, `${path}.${key}`);
    }
    if (result.status === "COMPLETED" || ready) {
      need(
        object(result.raw),
        `${path}.raw`,
        "completed/readiness evidence requires raw"
      );
      need(
        ["PASS", "PASS_WITH_NOTE", "FAIL"].includes(result.automaticVerdict),
        `${path}.automaticVerdict`,
        "observed verdict required"
      );
      for (const key of prerequisiteKeys)
        need(
          object(prerequisites?.[key]),
          `prerequisites.${key}`,
          "recorded decision required before completion/readiness"
        );
    }
    if (result.raw !== null) {
      const file = await reference(result.raw, `${path}.raw`, rawPathPattern);
      need(
        !historicalRawPaths.has(result.raw?.path),
        `${path}.raw`,
        "historical/post-fix raw cannot become continuation evidence"
      );
      need(
        !usedRawPaths.has(result.raw?.path),
        `${path}.raw`,
        "duplicate raw reference"
      );
      usedRawPaths.add(result.raw?.path);
      const raw = file?.json;
      if (file) need(object(raw), `${path}.raw`, "raw must be a JSON object");
      if (object(raw) && variant && family) {
        for (const [key, value] of Object.entries({
          caseId: result.variantId,
          benchmarkVariantId: result.variantId,
          benchmarkFamilyId: result.familyId,
          benchmarkSplit: "development",
          benchmarkProtocolVersion: ledger.protocolVersion,
          benchmarkPlanVersion: ledger.benchmarkPlanVersion,
          developmentDatasetVersion: ledger.developmentDatasetVersion,
          benchmarkCoverageCellId: family.coverageCellId,
          perturbationType: variant.perturbation,
          language: variant.language,
          executionPlanVersion: "1.0.0",
          userInput: variant.userInput,
          gitCommit: result.raw.sourceCommit,
          verdict: result.automaticVerdict
        }))
          equal(raw[key], value, `${path}.raw.${key}`);
        const assertions = Array.isArray(raw.assertionResults)
          ? raw.assertionResults
          : [];
        const requiredAssertions = [
          "final_answer_non_empty",
          "runner_completed_without_error",
          "tool_call_count",
          "pubmed_routing",
          "tool_state",
          "tool_output_required",
          "tool_errors",
          "forbidden_output_patterns",
          "pmid_citation_grounding",
          "expected_tool_outcome",
          "tool_name"
        ];
        if (family.fixture.citationProvenanceEligible)
          requiredAssertions.push(
            "citation_identifier_grounding",
            "expected_record_pmid"
          );
        for (const name of requiredAssertions) {
          const matches = assertions.filter((item) => item.assertion === name);
          need(
            matches.length === 1 &&
              matches[0].hard === true &&
              typeof matches[0].passed === "boolean",
            `${path}.raw.assertions.${name}`,
            "required hard assertion missing or malformed"
          );
        }
        const derived = assertions.some(
          (item) => item.hard === true && item.passed === false
        )
          ? "FAIL"
          : "PASS_WITH_NOTE";
        equal(
          result.automaticVerdict,
          derived,
          `${path}.automaticVerdict.integrity`
        );
        if (ready) {
          need(
            raw.dirtyWorktree === false &&
              raw.sessionIsolated === true &&
              raw.initialMessageCount === 0,
            `${path}.raw`,
            "READY requires clean, isolated execution"
          );
          need(
            text(raw.timestamp) && Number.isFinite(Date.parse(raw.timestamp)),
            `${path}.raw.timestamp`,
            "run timestamp required"
          );
          need(
            raw.errors?.length === 0 && text(raw.finalAnswer),
            `${path}.raw`,
            "READY requires completed nonempty response"
          );
          need(
            raw.toolCallCount === 1 &&
              raw.toolCalls?.length === 1 &&
              raw.toolCalls[0].toolName === "searchPubMed" &&
              raw.toolCalls[0].state === "output-available",
            `${path}.raw`,
            "READY requires one completed searchPubMed call"
          );
          const output = raw.toolCalls?.[0]?.output;
          need(
            output?.success === true &&
              output?.outcome?.kind === family.evidenceState &&
              output?.outcome?.stage === family.stage &&
              (output?.outcome?.category ?? null) === null &&
              Array.isArray(output?.records) &&
              (family.evidenceState === "zero_results"
                ? output.records.length === 0
                : output.records.length > 0),
            `${path}.raw.outcome`,
            "READY outcome must match frozen family contract"
          );
          need(
            raw.faultInjectionAcknowledged === true &&
              raw.faultInjectionMode === "one_shot" &&
              raw.faultInjectionDeterministic === true &&
              raw.faultScenario ===
                (family.evidenceState === "zero_results"
                  ? "zero_results"
                  : "success_exact_pmid"),
            `${path}.raw.fault`,
            "deterministic fixture provenance required"
          );
        }
      }
    }
    if (result.manualReview !== null) {
      need(
        Array.isArray(result.manualReview),
        `${path}.manualReview`,
        "must be an array or null"
      );
      if (Array.isArray(result.manualReview)) {
        equal(
          result.manualReview
            .map((review) => review?.reviewType ?? review?.type)
            .sort(),
          [...(family?.manualReview ?? [])].sort(),
          `${path}.manualReview.types`
        );
        for (const [reviewIndex, review] of result.manualReview.entries()) {
          const reviewPath = `${path}.manualReview[${reviewIndex}]`;
          if (object(review) && Object.hasOwn(review, "schemaVersion")) {
            const reviewErrors = await validateManualReview(review, {
              readBytes
            });
            errors.push(
              ...reviewErrors.map((error) => `${reviewPath}.${error}`)
            );
            equal(
              review.sourceRawPath,
              result.raw?.path,
              `${reviewPath}.sourceRawPath`
            );
            equal(
              review.sourceRawSha256,
              result.raw?.sha256,
              `${reviewPath}.sourceRawSha256`
            );
            equal(review.caseId, result.variantId, `${reviewPath}.caseId`);
            equal(
              review.variantId,
              result.variantId,
              `${reviewPath}.variantId`
            );
            if (ready)
              need(
                manualReviewAllowsReadiness(review, reviewErrors),
                `${reviewPath}.decision`,
                "READY requires validated manual PASS"
              );
            continue;
          }
          need(
            !ready,
            reviewPath,
            "READY requires full manual-review record contract; legacy summary is insufficient"
          );
          if (
            !shape(
              review,
              ["type", "reviewer", "rubricVersion", "decision", "rationale"],
              reviewPath
            )
          )
            continue;
          for (const key of ["reviewer", "rubricVersion", "rationale"])
            need(text(review[key]), `${reviewPath}.${key}`, "must be nonempty");
          need(
            ["PASS", "FAIL", "UNCERTAIN"].includes(review.decision),
            `${reviewPath}.decision`,
            "invalid manual decision"
          );
          if (ready) equal(review.decision, "PASS", `${reviewPath}.decision`);
        }
      }
    }
    if (ready) {
      equal(result.status, "COMPLETED", `${path}.status`);
      need(
        ["PASS", "PASS_WITH_NOTE"].includes(result.automaticVerdict),
        `${path}.automaticVerdict`,
        "READY requires automatic acceptance"
      );
      need(
        Array.isArray(result.manualReview) && result.manualReview.length > 0,
        `${path}.manualReview`,
        "READY requires complete independent manual review"
      );
    }
  }
  return errors;
}

async function manualIntegrationSelfTest(ledger) {
  // Entirely synthetic in-memory evidence: never persist this READY candidate.
  // These fake decisions are parser fixtures, not execution authorization.
  const candidate = structuredClone(ledger);
  candidate.readinessVerdict = "READY";
  const overlay = new Map();
  const dataset = JSON.parse(await bytesFromRepo(datasetPath));
  for (const key of [
    "measurementFidelityDecision",
    "liveAuthorizationDecision"
  ]) {
    const path = `docs/research/synthetic_${key}.md`;
    const bytes = Buffer.from(
      "Synthetic prerequisite for validator testing only."
    );
    overlay.set(path, bytes);
    candidate.prerequisites[key] = {
      path,
      sha256: digest(bytes),
      sourceCommit: closureCommit
    };
  }
  for (const result of candidate.cases) {
    const variant = dataset.caseVariants.find((x) => x.id === result.variantId);
    const family = dataset.scenarioFamilies.find(
      (x) => x.id === result.familyId
    );
    const raw = {
      runId: `synthetic-${variant.id}`,
      caseId: variant.id,
      timestamp: "2000-01-01T00:00:00.000Z",
      benchmarkVariantId: variant.id,
      benchmarkFamilyId: family.id,
      benchmarkSplit: "development",
      benchmarkProtocolVersion: candidate.protocolVersion,
      benchmarkPlanVersion: candidate.benchmarkPlanVersion,
      developmentDatasetVersion: candidate.developmentDatasetVersion,
      benchmarkCoverageCellId: family.coverageCellId,
      perturbationType: variant.perturbation,
      language: variant.language,
      executionPlanVersion: "1.0.0",
      userInput: variant.userInput,
      gitCommit: closureCommit,
      verdict: "PASS_WITH_NOTE",
      dirtyWorktree: false,
      sessionIsolated: true,
      initialMessageCount: 0,
      errors: [],
      finalAnswer: "Synthetic validator fixture; not an Agent response.",
      toolCallCount: 1,
      toolCalls: [
        {
          toolName: "searchPubMed",
          state: "output-available",
          output: {
            success: true,
            outcome: { kind: family.evidenceState, stage: family.stage },
            records:
              family.evidenceState === "zero_results"
                ? []
                : [{ pmid: "12345678" }]
          }
        }
      ],
      faultInjectionAcknowledged: true,
      faultInjectionMode: "one_shot",
      faultInjectionDeterministic: true,
      faultScenario:
        family.evidenceState === "zero_results"
          ? "zero_results"
          : "success_exact_pmid",
      assertionResults: [
        "final_answer_non_empty",
        "runner_completed_without_error",
        "tool_call_count",
        "pubmed_routing",
        "tool_state",
        "tool_output_required",
        "tool_errors",
        "forbidden_output_patterns",
        "pmid_citation_grounding",
        "expected_tool_outcome",
        "tool_name",
        "citation_identifier_grounding",
        "expected_record_pmid"
      ].map((assertion) => ({ assertion, hard: true, passed: true }))
    };
    const path = `runs_raw/synthetic-${variant.id}.json`;
    const bytes = Buffer.from(JSON.stringify(raw));
    overlay.set(path, bytes);
    result.status = "COMPLETED";
    result.raw = { path, sha256: digest(bytes), sourceCommit: closureCommit };
    result.automaticVerdict = "PASS_WITH_NOTE";
    result.manualReview = family.manualReview.map((reviewType) => ({
      schemaVersion: "1.0.0",
      reviewRecordVersion: "1.0.0",
      template: false,
      runId: raw.runId,
      caseId: variant.id,
      variantId: variant.id,
      sourceRawPath: path,
      sourceRawSha256: digest(bytes),
      reviewerId: "REV-00000000",
      rubricVersion: "1.0.0",
      reviewType,
      decision: "PASS",
      rationale: "Synthetic integration test only, not a real review.",
      reviewedAt: "2000-01-01T00:01:00.000Z"
    }));
  }
  const readBytes = (path) => overlay.get(path) ?? bytesFromRepo(path);
  assert.deepEqual(await validate(candidate, { readBytes }), []);
  console.log(
    "PASS: synthetic full-record READY integration; no readiness evidence created"
  );
  const legacyNotReady = structuredClone(candidate);
  legacyNotReady.readinessVerdict = "NOT_READY";
  for (const result of legacyNotReady.cases)
    result.manualReview = result.manualReview.map((review) => ({
      type: review.reviewType,
      reviewer: "synthetic-legacy",
      rubricVersion: "legacy-version",
      decision: "UNCERTAIN",
      rationale: "Synthetic backward compatibility test only."
    }));
  assert.deepEqual(await validate(legacyNotReady, { readBytes }), []);
  const uncertainNotReady = structuredClone(candidate);
  uncertainNotReady.readinessVerdict = "NOT_READY";
  uncertainNotReady.cases[0].manualReview[0].decision = "UNCERTAIN";
  assert.deepEqual(await validate(uncertainNotReady, { readBytes }), []);
  console.log(
    "PASS: legacy summaries and full UNCERTAIN reviews remain valid NOT_READY evidence formats"
  );
  const fixtures = [
    [
      "manual FAIL blocks READY",
      (x) => {
        x.cases[0].manualReview[0].decision = "FAIL";
      },
      ".decision"
    ],
    [
      "manual UNCERTAIN blocks READY",
      (x) => {
        x.cases[0].manualReview[0].decision = "UNCERTAIN";
      },
      ".decision"
    ],
    [
      "missing required medical review",
      (x) => {
        x.cases[1].manualReview.pop();
      },
      "manualReview.types"
    ],
    [
      "unfrozen rubric blocks READY",
      (x) => {
        x.cases[0].manualReview[0].rubricVersion = "0.1.0-draft";
      },
      ".rubricVersion"
    ],
    [
      "review raw SHA mismatch",
      (x) => {
        x.cases[0].manualReview[0].sourceRawSha256 = "0".repeat(64);
      },
      ".sourceRawSha256"
    ],
    [
      "review run mismatch",
      (x) => {
        x.cases[0].manualReview[0].runId = "other";
      },
      ".runId"
    ],
    [
      "cross-case review",
      (x) => {
        x.cases[0].manualReview = structuredClone(x.cases[1].manualReview);
      },
      ".sourceRawPath"
    ],
    [
      "template cannot grant READY",
      (x) => {
        x.cases[0].manualReview[0].template = true;
      },
      ".template"
    ],
    [
      "missing reviewer blocks READY",
      (x) => {
        delete x.cases[0].manualReview[0].reviewerId;
      },
      ".reviewerId"
    ],
    [
      "legacy summary cannot grant READY",
      (x) => {
        x.cases[0].manualReview = [
          {
            type: "epistemic",
            reviewer: "legacy-test",
            rubricVersion: "1.0.0",
            decision: "PASS",
            rationale: "Synthetic legacy summary."
          }
        ];
      },
      "legacy summary is insufficient"
    ]
  ];
  for (const [name, mutate, expected] of fixtures) {
    const x = structuredClone(candidate);
    mutate(x);
    const errors = await validate(x, { readBytes });
    assert(
      errors.some((error) => error.includes(expected)),
      `${name}: missing diagnostic`
    );
    console.log(`PASS negative integration: ${name}`);
  }
  const automaticFailure = structuredClone(candidate);
  const failedCase = automaticFailure.cases[0];
  const failedRaw = JSON.parse(overlay.get(failedCase.raw.path));
  failedRaw.assertionResults[0].passed = false;
  failedRaw.verdict = "FAIL";
  const failedBytes = Buffer.from(JSON.stringify(failedRaw));
  failedCase.raw.sha256 = digest(failedBytes);
  failedCase.automaticVerdict = "FAIL";
  for (const review of failedCase.manualReview)
    review.sourceRawSha256 = digest(failedBytes);
  const errors = await validate(automaticFailure, {
    readBytes: (path) =>
      path === failedCase.raw.path ? failedBytes : readBytes(path)
  });
  assert(
    errors.some((error) =>
      error.includes("READY requires automatic acceptance")
    )
  );
  console.log(
    "PASS negative integration: manual PASS cannot override automatic hard FAIL"
  );
}

async function selfTest(ledger) {
  assert.deepEqual(await validate(ledger), []);
  const snapshot = JSON.parse(await bytesFromRepo(historicalPath));
  const fixtures = [
    [
      "historical status COMPLETED",
      (x) => {
        x.historicalPilot.status = "COMPLETED";
      },
      "historicalPilot.status"
    ],
    [
      "preserveHistoricalState false",
      (x) => {
        x.historicalPilot.preserveHistoricalState = false;
      },
      "historicalPilot.preserveHistoricalState"
    ],
    [
      "post-fix replaces original",
      (x) => {
        x.closureEvidence.replacesOriginalPilot = true;
      },
      "closureEvidence.replacesOriginalPilot"
    ],
    [
      "closure path substitution",
      (x) => {
        x.closureEvidence.raw.path = originalRaw;
      },
      "closureEvidence.raw.path"
    ],
    [
      "closure hash mismatch",
      (x) => {
        x.closureEvidence.raw.sha256 = "0".repeat(64);
      },
      "closureEvidence.raw.sha256"
    ],
    [
      "closure commit mismatch",
      (x) => {
        x.closureEvidence.sourceCommit = "0".repeat(40);
      },
      "closureEvidence.sourceCommit"
    ],
    [
      "wrong continuation selection",
      (x) => {
        x.cases[0].variantId = "DEV-010-O";
      },
      "cases.selection"
    ],
    [
      "duplicate continuation selection",
      (x) => {
        x.cases[1] = structuredClone(x.cases[0]);
      },
      "cases.selection"
    ],
    [
      "READY missing manual review",
      (x) => {
        x.readinessVerdict = "READY";
      },
      "manualReview: READY requires"
    ],
    [
      "READY missing required raw",
      (x) => {
        x.readinessVerdict = "READY";
      },
      "raw: completed/readiness evidence requires raw"
    ],
    [
      "READY nonexistent raw",
      (x) => {
        x.readinessVerdict = "READY";
        x.cases[0].raw = {
          path: "runs_raw/r1_self_test_missing_DEV-002-O.json",
          sha256: "0".repeat(64),
          sourceCommit: closureCommit
        };
      },
      "cases[0].raw: cannot read evidence"
    ],
    [
      "historical raw reused as continuation",
      (x) => {
        x.cases[0].raw = {
          path: closureRaw,
          sha256: closureSha,
          sourceCommit: closureCommit
        };
      },
      "historical/post-fix raw cannot become continuation evidence"
    ],
    [
      "path traversal",
      (x) => {
        x.cases[0].raw = {
          path: "runs_raw/../package.json",
          sha256: "0".repeat(64),
          sourceCommit: closureCommit
        };
      },
      "scoped repository-relative path"
    ],
    [
      "wrong schema version",
      (x) => {
        x.schemaVersion = "2.0.0";
      },
      "schemaVersion"
    ],
    [
      "held-out contamination",
      (x) => {
        x.heldOutIncluded = true;
      },
      "heldOutIncluded"
    ],
    [
      "formal experiments authorized",
      (x) => {
        x.formalExperimentsAuthorized = true;
      },
      "formalExperimentsAuthorized"
    ],
    [
      "unknown attribution field",
      (x) => {
        x.contributor = "self-test-only";
      },
      "unknown field"
    ],
    [
      "malformed cases",
      (x) => {
        x.cases = null;
      },
      "cases: must be an array"
    ],
    [
      "NOT_RUN fabricated verdict",
      (x) => {
        x.cases[0].automaticVerdict = "PASS";
      },
      "cases[0].automaticVerdict"
    ],
    [
      "governance document masquerades as live authorization",
      (x) => {
        x.prerequisites.liveAuthorizationDecision = {
          path: decisionPath,
          sha256: "0".repeat(64),
          sourceCommit: closureCommit
        };
      },
      "requires a separate subsequent decision"
    ]
  ];
  for (const index of [0, 1])
    fixtures.push([
      `${caseIds[index]} COMPLETED without raw`,
      (x) => {
        x.cases[index].status = "COMPLETED";
      },
      `cases[${index}].raw: completed/readiness evidence requires raw`
    ]);
  for (const [name, mutate, expected] of fixtures) {
    const candidate = structuredClone(ledger);
    mutate(candidate);
    const errors = await validate(candidate);
    assert(
      errors.some((error) => error.includes(expected)),
      `${name}: missing diagnostic ${expected}`
    );
    console.log(`PASS negative: ${name}`);
  }
  const historicalFixtures = [
    [
      "historical file COMPLETED",
      (x) => {
        x.pilotStatus = "COMPLETED";
      },
      "historicalSnapshot.pilotStatus"
    ],
    [
      "original DEV-010-O FAIL overwritten",
      (x) => {
        x.results[1].pilotResult = "PASS";
        x.results[1].verdicts = {
          original: "PASS",
          offline: "PASS",
          manual: "PASS"
        };
      },
      "historicalSnapshot.originalDEV010"
    ],
    [
      "post-fix raw used as original raw",
      (x) => {
        x.results[1].raw = structuredClone(x.postFixRegression.raw);
      },
      "historicalSnapshot.originalDEV010.raw"
    ],
    [
      "historical stopping rule removed",
      (x) => {
        delete x.remainingRunProhibition;
      },
      "historicalSnapshot.remainingRunProhibition"
    ],
    [
      "historical follow-up removed",
      (x) => {
        delete x.followUpRequirement;
      },
      "historicalSnapshot.followUpRequirement"
    ],
    [
      "post-fix manual FAIL overwritten",
      (x) => {
        x.postFixRegression.verdicts.manual = "PASS";
      },
      "historicalSnapshot.postFixRegression.manual"
    ]
  ];
  for (const [name, mutate, expected] of historicalFixtures) {
    const candidate = structuredClone(snapshot);
    mutate(candidate);
    const bytes = Buffer.from(JSON.stringify(candidate));
    const errors = await validate(ledger, {
      readBytes: (path) =>
        path === historicalPath ? bytes : bytesFromRepo(path)
    });
    assert(
      errors.some((error) => error.includes(expected)),
      `${name}: missing specific diagnostic`
    );
    assert(
      errors.some((error) =>
        error.includes("historicalSnapshot: SHA-256 mismatch")
      ),
      `${name}: historical pin bypassed`
    );
    console.log(`PASS negative: ${name}`);
  }
  const nullRaw = structuredClone(ledger);
  nullRaw.readinessVerdict = "READY";
  nullRaw.cases[0].raw = {
    path: "runs_raw/r1_self_test_null_DEV-002-O.json",
    sha256: digest(Buffer.from("null")),
    sourceCommit: closureCommit
  };
  const nullRawErrors = await validate(nullRaw, {
    readBytes: (path) =>
      path === nullRaw.cases[0].raw.path
        ? Buffer.from("null")
        : bytesFromRepo(path)
  });
  assert(
    nullRawErrors.some((error) => error.includes("raw must be a JSON object"))
  );
  console.log(
    "PASS negative: READY references JSON null instead of a trajectory"
  );
  console.log(
    `R1 readiness self-test passed: valid NOT_READY checkpoint; ${fixtures.length + historicalFixtures.length + 1} negative fixtures; no files written, no live execution.`
  );
  await manualIntegrationSelfTest(ledger);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--self-test"))
    throw new Error(
      "Only normal validation or --self-test is supported; no live mode."
    );
  const ledger = JSON.parse(await bytesFromRepo(ledgerPath));
  const errors = await validate(ledger);
  if (errors.length)
    throw new Error(
      `R1 readiness validation failed:\n- ${errors.join("\n- ")}`
    );
  if (args[0] === "--self-test") {
    const before = (await readdir(new URL("runs_raw/", root))).sort();
    await selfTest(ledger);
    assert.deepEqual(
      (await readdir(new URL("runs_raw/", root))).sort(),
      before
    );
  } else {
    console.log(
      `R1 readiness ledger valid: ${ledger.continuationId}; ${ledger.readinessVerdict}; historical M2.11D BLOCKED preserved; ${ledger.cases.filter((item) => item.status === "NOT_RUN").length} NOT_RUN; no live execution.`
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
