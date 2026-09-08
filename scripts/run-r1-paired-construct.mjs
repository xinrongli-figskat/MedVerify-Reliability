import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  VERSION,
  EXPERIMENT,
  IDS,
  validateManifest
} from "./r1-paired-contract.mjs";
import {
  inspectCheckpoint,
  validateRepositoryContracts
} from "./validate-r1-paired-construct.mjs";

function plannedPhase(session, index) {
  const phase = session.phasePlan[index];
  if (!phase) throw new Error("No eligible phase");
  return {
    ...phase,
    userInput: session.frozenInputs[index],
    sessionPolicy:
      index === 0
        ? "fresh_isolated_session"
        : "reuse_phase_1_session_and_outcome",
    allowedToolNames: phase.expectedToolBehaviour.names,
    maxAdditionalToolCalls: phase.expectedToolBehaviour.count,
    maxRetries: 0,
    reviewBeforeAdvance: true
  };
}

export async function dryRunPlan(manifest, sessionId) {
  const errors = await validateManifest(manifest);
  if (errors.length) throw new Error(errors.join("\n"));
  const session = manifest.sessions.find((s) => s.sessionId === sessionId);
  if (!session) throw new Error("Unknown session");
  return {
    mode: "DRY_RUN_ONLY",
    runnerVersion: VERSION,
    experimentId: EXPERIMENT,
    executionManifestVersion: manifest.manifestVersion,
    sessionId,
    liveImplemented: false,
    executionAuthorized: false,
    prerequisiteSessions: IDS.slice(0, IDS.indexOf(sessionId)),
    firstPhasePreview: plannedPhase(session, 0),
    conditionalPhasePreview:
      session.phasePlan.length === 2 ? plannedPhase(session, 1) : null,
    note: "Design preview only. No phase is scheduled without a validated checkpoint; phase 2 requires phase 1 evidence and passing reviews."
  };
}

// No transport, Worker, Agent client, fetch, model, raw writer or retry path.
// The ONLY way to obtain a next-phase plan from observed checkpoint state is
// through full evidence validation. Invalid/stopped/pending prefixes fail closed.
export async function nextExecutionPlan(manifest, checkpoint, options) {
  const inspected = await inspectCheckpoint(checkpoint, manifest, options);
  if (inspected.errors.length) throw new Error(inspected.errors.join("\n"));
  if (!inspected.next)
    return {
      mode: "OFFLINE_NEXT_PLAN",
      nextPhase: null,
      executionAuthorized: false,
      disposition: inspected.stopped
        ? "STOPPED"
        : inspected.awaitingReview
          ? "AWAITING_REVIEW"
          : "COMPLETE"
    };
  const { sessionId, phaseIndex } = inspected.next;
  return {
    mode: "OFFLINE_NEXT_PLAN",
    experimentId: EXPERIMENT,
    sessionId,
    nextPhase: plannedPhase(
      manifest.sessions.find((s) => s.sessionId === sessionId),
      phaseIndex
    ),
    executionAuthorized: false,
    liveImplemented: false
  };
}

export function parseArgs(args) {
  if (args.length === 1 && args[0] === "--self-test") return { selfTest: true };
  if (
    args.length === 3 &&
    args[0] === "--dry-run" &&
    args[1] === "--session" &&
    IDS.includes(args[2])
  )
    return { sessionId: args[2] };
  if (
    args.length === 3 &&
    args[0] === "--dry-run" &&
    args[1] === "--checkpoint" &&
    args[2] &&
    !args[2].startsWith("--")
  )
    return { checkpointPath: args[2] };
  throw new Error(
    "Offline only: --dry-run --session <known PC-ID> | --dry-run --checkpoint <file> | --self-test. Live, bulk live, retries, input overrides and other selectors are unavailable."
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await validateRepositoryContracts();
  if (args.selfTest) {
    const { runnerSelfTest } = await import("./r1-paired-self-test.mjs");
    await runnerSelfTest(manifest);
  } else {
    const plan = args.checkpointPath
      ? await nextExecutionPlan(
          manifest,
          JSON.parse(await readFile(args.checkpointPath, "utf8"))
        )
      : await dryRunPlan(manifest, args.sessionId);
    console.log(JSON.stringify(plan, null, 2));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
