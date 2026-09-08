import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  EXPERIMENT,
  IDS,
  MANIFEST_PATH,
  RESULT_TEMPLATE_PATH,
  REVIEW_TEMPLATE_PATH,
  FROZEN,
  canonicalManifest,
  validateManifest,
  readRepoBytes,
  digest,
  same,
  resultTemplate,
  reviewTemplate,
  resultSchema,
  trajectorySchema,
  reviewSchema,
  provenanceSchema,
  referenceSchema,
  parseRecord,
  evaluateTrajectory
} from "./r1-paired-contract.mjs";
import { manualReviewAllowsReadiness } from "./validate-reliability-manual-review.mjs";

const fields = [
  "routeObservation",
  "toolObservation",
  "faultObservation",
  "finalAnswerObservation",
  "automaticVerdict"
];
const kinds = {
  trajectories:
    /^research_evidence\/r1-paired\/trajectories\/[A-Za-z0-9_-]+\.json$/,
  reviews: /^research_evidence\/r1-paired\/reviews\/[A-Za-z0-9_-]+\.json$/,
  environment:
    /^research_evidence\/r1-paired\/environment\/[A-Za-z0-9_-]+\.json$/,
  authorization: /^docs\/research\/r1_paired_live_[A-Za-z0-9_-]+\.md$/
};

async function reference(ref, kind, readBytes) {
  parseRecord(referenceSchema, ref, "reference");
  if (!kinds[kind].test(ref.path))
    throw new Error(`${kind}: unscoped reference`);
  const bytes = await readBytes(ref.path);
  if (digest(bytes) !== ref.sha256) throw new Error(`${kind}: SHA mismatch`);
  if (!bytes.toString().trim()) throw new Error(`${kind}: empty evidence`);
  return kind === "authorization" ? bytes.toString() : JSON.parse(bytes);
}

// Separate paired subject contract; no fake DEV IDs and no alteration of the
// development validator or medical rubric. This validates provenance, not truth.
export async function validatePairedReview(
  record,
  raw,
  trajectoryRef,
  { readBytes = readRepoBytes, now = Date.now() } = {}
) {
  const errors = [];
  try {
    const review = parseRecord(reviewSchema, record, "paired review");
    if (digest(await readBytes(FROZEN.rubric.path)) !== FROZEN.rubric.sha256)
      throw new Error("rubric: frozen bytes changed");
    for (const key of ["experimentId", "sessionId", "phaseId"])
      if (review[key] !== raw[key])
        errors.push(`review ${key}: wrong phase subject`);
    if (!same(review.trajectoryReference, trajectoryRef))
      errors.push("review trajectoryReference: wrong phase linkage");
    if (
      review.reviewType === "epistemic"
        ? typeof review.medicalContentReviewRequired !== "boolean"
        : review.medicalContentReviewRequired !== null
    )
      errors.push(
        "review medicalContentReviewRequired: epistemic triage required; medical record uses null"
      );
    if (
      Date.parse(review.reviewedAt) < Date.parse(raw.completedAt) ||
      Date.parse(review.reviewedAt) > now
    )
      errors.push(
        "review reviewedAt: before trajectory completion or in future"
      );
  } catch (error) {
    errors.push(error.message);
  }
  return errors;
}

// A checkpoint is an ordered prefix, with attempted evidence preserved even on
// failure. AWAITING_REVIEW is valid but cannot schedule another phase/session.
// Integrity errors reject the candidate; valid FAIL/UNCERTAIN evidence stops it.
export async function inspectCheckpoint(
  candidate,
  manifest,
  { readBytes = readRepoBytes, now = Date.now() } = {}
) {
  const errors = await validateManifest(manifest, readBytes);
  const result = { errors, next: null, stopped: false, awaitingReview: false };
  if (errors.length) return result;
  let data;
  try {
    data = parseRecord(resultSchema, candidate, "paired result");
  } catch (error) {
    errors.push(error.message);
    return result;
  }
  const need = (ok, message) => {
    if (!ok) errors.push(message);
  };
  const equal = (a, b, message) => need(same(a, b), message);
  equal(
    data.sessions.map((s) => s.sessionId),
    IDS,
    "session IDs/order mismatch"
  );
  const provenance = Object.fromEntries(
    Object.keys(provenanceSchema.shape).map((k) => [k, data[k]])
  );
  let environmentTime = null;
  try {
    equal(
      data.manifestReference,
      { path: MANIFEST_PATH, sha256: digest(await readBytes(MANIFEST_PATH)) },
      "manifest provenance mismatch"
    );
    const env = await reference(
      data.environmentReference,
      "environment",
      readBytes
    );
    equal(
      env.environmentCheckpointId,
      data.environmentCheckpointId,
      "environment checkpoint mismatch"
    );
    for (const key of ["sourceCommit", "modelIdentifier", "modelConfig"])
      equal(env[key], data[key], `environment ${key} mismatch`);
    environmentTime = Date.parse(env.recordedAt);
    need(
      Number.isFinite(environmentTime) &&
        new Date(environmentTime).toISOString() === env.recordedAt &&
        environmentTime <= now,
      "environment freeze time invalid"
    );
    await reference(data.authorizationReference, "authorization", readBytes);
  } catch (error) {
    errors.push(error.message);
  }
  const config = data.modelConfig;
  need(
    config.temperature.status !== "supported" || config.temperature.value >= 0,
    "temperature invalid"
  );
  need(
    config.maxTokens.status !== "supported" ||
      (Number.isInteger(config.maxTokens.value) && config.maxTokens.value > 0),
    "maxTokens invalid"
  );
  need(
    config.seed.status !== "supported" || Number.isInteger(config.seed.value),
    "seed invalid"
  );

  let boundary = false;
  let checkpointStop = null;
  let checkpointPending = false;
  let completed = 0;
  let anyAttempt = false;
  let previousReadyTime = environmentTime;
  const usedInstances = new Set();
  const usedTrajectories = new Set();
  const usedReviews = new Set();
  const usedRequests = new Set();
  for (let si = 0; si < data.sessions.length; si++) {
    const s = data.sessions[si];
    const spec = manifest.sessions[si];
    if (s.sessionStatus === "NOT_RUN") {
      equal(
        s.phases,
        [],
        `${s.sessionId}: NOT_RUN cannot contain phase observations`
      );
      need(
        s.setupFailure === null &&
          s.sessionInstanceId === null &&
          !s.stopTriggered &&
          s.stopReason === null,
        `${s.sessionId}: NOT_RUN contains evidence/stop`
      );
      if (!boundary) result.next = { sessionId: s.sessionId, phaseIndex: 0 };
      boundary = true;
      continue;
    }
    anyAttempt = true;
    need(
      !boundary,
      `${s.sessionId}: execution after checkpoint stop/pending/unrun predecessor`
    );
    if (s.sessionInstanceId !== null) {
      need(
        !usedInstances.has(s.sessionInstanceId),
        "session isolation violated"
      );
      usedInstances.add(s.sessionInstanceId);
    }
    if (s.setupFailure) {
      equal(s.phases, [], "setup failure cannot include generated phase");
      need(
        Date.parse(s.setupFailure.observedAt) <= now &&
          Date.parse(s.setupFailure.observedAt) >= previousReadyTime,
        "setup failure time/order invalid"
      );
      need(
        s.sessionStatus === "STOPPED" &&
          s.stopTriggered &&
          s.stopReason === "setup_failure",
        "setup failure must stop without retry"
      );
      checkpointStop = "setup_failure";
      boundary = true;
      continue;
    }
    need(s.sessionInstanceId !== null, "attempted session instance required");
    need(
      s.phases.length > 0 && s.phases.length <= spec.phasePlan.length,
      "phase count mismatch"
    );
    let sessionStop = null;
    let pending = false;
    let previousRef = null;
    for (let pi = 0; pi < s.phases.length; pi++) {
      const p = s.phases[pi];
      const plan = spec.phasePlan[pi];
      need(
        !sessionStop && !pending,
        `${s.sessionId}: phase generated after failure/UNCERTAIN/pending review`
      );
      if (!plan) {
        errors.push("negative control must not have phase 2");
        continue;
      }
      equal(
        [p.phaseId, p.turnIndex, p.userInput],
        [plan.phaseId, plan.turnIndex, spec.frozenInputs[pi]],
        "phase order/frozen input mismatch"
      );
      let verdict = "FAIL";
      let stop = null;
      let readyTime = previousReadyTime;
      if (p.trajectoryReference === null) {
        stop = "missing_raw";
        for (const key of fields)
          equal(p[key], null, "missing raw cannot invent observations");
        equal(p.reviewReferences, [], "missing raw cannot have review");
      } else {
        try {
          need(
            !usedTrajectories.has(p.trajectoryReference.path),
            "duplicate trajectory reference"
          );
          usedTrajectories.add(p.trajectoryReference.path);
          const raw = parseRecord(
            trajectorySchema,
            await reference(p.trajectoryReference, "trajectories", readBytes),
            "paired trajectory"
          );
          equal(
            [
              raw.experimentId,
              raw.sessionId,
              raw.phaseId,
              raw.turnIndex,
              raw.userInput
            ],
            [
              EXPERIMENT,
              s.sessionId,
              plan.phaseId,
              plan.turnIndex,
              spec.frozenInputs[pi]
            ],
            "raw subject/input linkage mismatch"
          );
          equal(raw.provenance, provenance, "raw provenance mismatch");
          equal(
            raw.sessionInstanceId,
            s.sessionInstanceId,
            "two phases must share session instance"
          );
          equal(
            raw.previousTrajectoryReference,
            previousRef,
            "previous phase linkage mismatch"
          );
          need(!usedRequests.has(raw.requestId), "duplicate requestId/retry");
          usedRequests.add(raw.requestId);
          need(
            pi === 0
              ? raw.initialMessageCount === 0
              : raw.initialMessageCount >= 2,
            "session history boundary invalid"
          );
          const start = Date.parse(raw.startedAt),
            end = Date.parse(raw.completedAt);
          need(
            start >= previousReadyTime && end >= start && end <= now,
            "phase time/order/review-before-next-phase violation"
          );
          for (const c of raw.toolObservation.calls)
            need(
              Date.parse(c.startedAt) >= start &&
                Date.parse(c.completedAt) >= Date.parse(c.startedAt) &&
                Date.parse(c.completedAt) <= end,
              "tool temporal boundary invalid"
            );
          for (const key of fields)
            equal(p[key], raw[key], `phase ${key} differs from raw`);
          const automatic = evaluateTrajectory(raw, spec, pi);
          equal(
            raw.automaticVerdict,
            automatic.verdict,
            "automatic FAIL cannot be rewritten as PASS"
          );
          stop = automatic.reasons[0] ?? null;
          const reviews = [];
          for (const ref of p.reviewReferences) {
            need(!usedReviews.has(ref.path), "duplicate review reference");
            usedReviews.add(ref.path);
            const review = await reference(ref, "reviews", readBytes);
            const reviewErrors = await validatePairedReview(
              review,
              raw,
              p.trajectoryReference,
              { readBytes, now }
            );
            errors.push(...reviewErrors);
            if (reviewErrors.length === 0) reviews.push(review);
          }
          const types = reviews.map((r) => r.reviewType);
          need(
            new Set(types).size === types.length,
            "duplicate review type; adjudication requires separate version"
          );
          const epistemic = reviews.find((r) => r.reviewType === "epistemic");
          const requiredTypes = [
            "epistemic",
            ...(epistemic?.medicalContentReviewRequired
              ? ["medical_content"]
              : [])
          ];
          const completeReview = requiredTypes.every((type) =>
            types.includes(type)
          );
          readyTime = Math.max(
            end,
            ...reviews.map((r) => Date.parse(r.reviewedAt))
          );
          if (stop) verdict = "FAIL";
          else if (reviews.some((r) => r.decision === "FAIL")) {
            stop = "manual_fail";
            verdict = "FAIL";
          } else if (reviews.some((r) => r.decision === "UNCERTAIN")) {
            stop = "manual_uncertain";
            verdict = "UNCERTAIN";
          } else if (!completeReview) verdict = "PENDING";
          else {
            // Reuse the existing validated-record PASS predicate, without
            // invoking or changing readiness state or the development schema.
            need(
              reviews.every((r) => manualReviewAllowsReadiness(r, [])),
              "required review is not passing"
            );
            verdict = "PASS";
          }
          previousRef = p.trajectoryReference;
        } catch (error) {
          errors.push(error.message);
          stop = "integrity";
        }
      }
      equal(
        p.phaseVerdict,
        verdict,
        "phase verdict cannot override FAIL/UNCERTAIN/missing required review"
      );
      equal(
        p.phaseStatus,
        stop
          ? "STOPPED"
          : verdict === "PENDING"
            ? "AWAITING_REVIEW"
            : "COMPLETED",
        "phase status mismatch"
      );
      equal(p.stopTriggered, stop !== null, "phase stop flag mismatch");
      equal(p.stopReason, stop, "phase stop reason mismatch");
      if (stop) sessionStop = stop;
      if (verdict === "PENDING") pending = true;
      previousReadyTime = readyTime;
    }
    const sessionStatus = sessionStop
      ? "STOPPED"
      : pending || s.phases.length < spec.phasePlan.length
        ? "IN_PROGRESS"
        : "COMPLETED";
    equal(
      s.sessionStatus,
      sessionStatus,
      "session status cannot override phase state"
    );
    equal(s.stopTriggered, sessionStop !== null, "session stop mismatch");
    equal(s.stopReason, sessionStop, "session stop reason mismatch");
    if (sessionStop || pending || sessionStatus !== "COMPLETED") {
      boundary = true;
      checkpointStop = sessionStop;
      checkpointPending = pending;
      if (!sessionStop && !pending)
        result.next = { sessionId: s.sessionId, phaseIndex: s.phases.length };
    } else completed++;
  }
  equal(
    data.stopTriggered,
    checkpointStop !== null,
    "checkpoint stop mismatch"
  );
  equal(data.stopReason, checkpointStop, "checkpoint stop reason mismatch");
  equal(
    data.checkpointStatus,
    checkpointStop
      ? "STOPPED"
      : completed === 5
        ? "COMPLETED"
        : anyAttempt
          ? "IN_PROGRESS"
          : "NOT_RUN",
    "checkpoint status mismatch"
  );
  result.stopped = checkpointStop !== null;
  result.awaitingReview = checkpointPending;
  if (errors.length || result.stopped || result.awaitingReview)
    result.next = null;
  return result;
}

export async function validateRepositoryContracts() {
  const manifest = JSON.parse(await readRepoBytes(MANIFEST_PATH));
  const errors = await validateManifest(manifest);
  if (
    !same(
      JSON.parse(await readRepoBytes(RESULT_TEMPLATE_PATH)),
      resultTemplate()
    )
  )
    errors.push("result template changed or contains observations");
  if (
    !same(
      JSON.parse(await readRepoBytes(REVIEW_TEMPLATE_PATH)),
      reviewTemplate()
    )
  )
    errors.push("review template changed or contains a judgment");
  if (errors.length) throw new Error(errors.join("\n"));
  return manifest;
}

async function main() {
  const args = process.argv.slice(2);
  if (
    !(
      args.length === 0 ||
      (args.length === 1 && args[0] === "--self-test") ||
      (args.length === 2 && args[0] === "--result")
    )
  )
    throw new Error(
      "Usage: validator [--self-test | --result <checkpoint.json>]; offline only"
    );
  const manifest = await validateRepositoryContracts();
  if (args[0] === "--self-test") {
    const { validatorSelfTest } = await import("./r1-paired-self-test.mjs");
    await validatorSelfTest(manifest);
  } else if (args[0] === "--result") {
    const inspected = await inspectCheckpoint(
      JSON.parse(await readFile(args[1], "utf8")),
      manifest
    );
    if (inspected.errors.length) throw new Error(inspected.errors.join("\n"));
    console.log(
      JSON.stringify(
        { mode: "offline-validation", ...inspected, liveAuthorized: false },
        null,
        2
      )
    );
  } else
    console.log(
      "Paired manifest and templates valid: PREREGISTERED / NOT_RUN; 5 sessions, at most 9 turns; no result/review/live evidence."
    );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
