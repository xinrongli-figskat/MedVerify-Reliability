import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  VERSION,
  EXPERIMENT,
  FROZEN,
  MANIFEST_PATH,
  ROOT,
  IDS,
  digest,
  readRepoBytes,
  resultTemplate,
  validateManifest,
  evaluateTrajectory
} from "./r1-paired-contract.mjs";
import { inspectCheckpoint } from "./validate-r1-paired-construct.mjs";
import {
  nextExecutionPlan,
  dryRunPlan,
  parseArgs
} from "./run-r1-paired-construct.mjs";

async function rawInventory() {
  const paths = (await readdir(join(ROOT, "runs_raw")))
    .filter((n) => n.endsWith(".json"))
    .sort();
  const bytes = [];
  for (const p of paths)
    bytes.push(Buffer.from(p), await readFile(join(ROOT, "runs_raw", p)));
  return { count: paths.length, sha256: digest(Buffer.concat(bytes)) };
}

async function withSyntheticWorkspace(work) {
  const before = await rawInventory();
  const directory = await mkdtemp(
    join(tmpdir(), "medverify-r1-paired-self-test-")
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Network forbidden in paired self-test");
  };
  let serial = 0;
  try {
    const create = async (options = {}) => {
      const files = new Map();
      const put = async (path, value) => {
        const bytes = Buffer.from(
          typeof value === "string" ? value : JSON.stringify(value)
        );
        const target = join(directory, `synthetic-${serial++}.json`);
        await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
        files.set(path, target);
        return { path, sha256: digest(bytes) };
      };
      const readBytes = async (path) => {
        if (files.has(path)) return readFile(files.get(path));
        if (
          path === MANIFEST_PATH ||
          Object.values(FROZEN).some((r) => r.path === path)
        )
          return readRepoBytes(path);
        throw new Error(
          "Synthetic evidence missing; no repository result fallback"
        );
      };
      const supported = (value) => ({
        status: "supported",
        value,
        reason: null
      });
      const provenance = {
        sourceCommit: "a".repeat(40),
        dirtyWorktree: false,
        model: "SYNTHETIC_ONLY_NO_MODEL",
        modelIdentifier: "synthetic/not-a-provider",
        modelConfig: {
          temperature: supported(0),
          maxTokens: supported(64),
          seed: {
            status: "unsupported",
            value: null,
            reason: "Synthetic unsupported parameter"
          },
          otherParameters: {}
        },
        runnerVersion: VERSION,
        evaluatorVersion: VERSION,
        protocolVersion: VERSION,
        measurementPlanVersion: VERSION,
        rubricVersion: VERSION,
        executionManifestVersion: VERSION,
        manifestReference: {
          path: MANIFEST_PATH,
          sha256: digest(await readRepoBytes(MANIFEST_PATH))
        },
        environmentCheckpointId: "SYNTHETIC-NOT-AN-ENVIRONMENT",
        environmentReference: null,
        authorizationReference: null
      };
      provenance.environmentReference = await put(
        "research_evidence/r1-paired/environment/synthetic-environment.json",
        {
          environmentCheckpointId: provenance.environmentCheckpointId,
          sourceCommit: provenance.sourceCommit,
          modelIdentifier: provenance.modelIdentifier,
          modelConfig: provenance.modelConfig,
          recordedAt: "2000-01-01T00:00:00.000Z"
        }
      );
      provenance.authorizationReference = await put(
        "docs/research/r1_paired_live_synthetic.json".replace(".json", ".md"),
        "SYNTHETIC FORMAT FIXTURE ONLY. This is not user authorization."
      );
      const checkpoint = {
        schemaVersion: VERSION,
        resultContractVersion: VERSION,
        template: false,
        experimentId: EXPERIMENT,
        ...provenance,
        checkpointStatus: "IN_PROGRESS",
        stopTriggered: false,
        stopReason: null,
        retryCount: 0,
        sessions: IDS.map((sessionId) => ({
          sessionId,
          sessionInstanceId: null,
          sessionStatus: "NOT_RUN",
          setupFailure: null,
          phases: [],
          stopTriggered: false,
          stopReason: null,
          retryCount: 0
        }))
      };
      const at = (si, pi) => `${IDS[si]}/${pi + 1}`;
      let halt = options.empty === true;
      let tick = 0;
      for (let si = 0; si < IDS.length && !halt; si++) {
        const session = checkpoint.sessions[si];
        const spec = options.manifest.sessions[si];
        session.sessionInstanceId = `synthetic-isolated-${si}`;
        if (options.setupFailure === IDS[si]) {
          session.setupFailure = {
            reason: "Synthetic setup failure",
            observedAt: "2001-02-01T00:00:00.000Z"
          };
          session.sessionStatus = "STOPPED";
          session.stopTriggered = true;
          session.stopReason = "setup_failure";
          checkpoint.stopTriggered = true;
          checkpoint.stopReason = "setup_failure";
          halt = true;
          break;
        }
        let previous = null;
        for (let pi = 0; pi < spec.phasePlan.length; pi++) {
          const key = at(si, pi),
            expected = spec.phasePlan[pi];
          const base = Date.parse("2001-01-01T00:00:00.000Z") + tick++ * 10000;
          const time = (n) => new Date(base + n).toISOString();
          const retrieval = expected.expectedToolBehaviour.count === 1;
          const raw = {
            schemaVersion: VERSION,
            recordType: "paired_phase_trajectory",
            experimentId: EXPERIMENT,
            sessionId: session.sessionId,
            phaseId: expected.phaseId,
            turnIndex: expected.turnIndex,
            sessionInstanceId: session.sessionInstanceId,
            initialMessageCount: pi === 0 ? 0 : 2,
            requestId: `synthetic-request-${si}-${pi}`,
            previousTrajectoryReference: previous,
            startedAt: time(0),
            completedAt: time(2000),
            provenance,
            userInput: spec.frozenInputs[pi],
            routeObservation: {
              requiresPubMed: retrieval,
              evidence: "Synthetic observed route field"
            },
            toolObservation: {
              calls: retrieval
                ? [
                    {
                      toolName: "searchPubMed",
                      state: "output-available",
                      input: { query: "Kappa outcome" },
                      output: {
                        success: false,
                        outcome: {
                          kind: "invalid_response",
                          category: "schema_error",
                          stage: "esearch"
                        },
                        records: []
                      },
                      startedAt: time(500),
                      completedAt: time(1000)
                    }
                  ]
                : [],
              proposedQuery: retrieval ? "Kappa outcome" : null,
              executedQuery: retrieval ? "Kappa outcome" : null,
              queryGuard: retrieval
                ? { modified: false, removedTerms: [] }
                : null
            },
            faultObservation: {
              armed: retrieval,
              acknowledged: retrieval,
              consumed: retrieval,
              scenario: expected.armFault
            },
            finalAnswerObservation: {
              text: "Synthetic bounded answer; not a model response.",
              finalizationCompleted: true,
              finalizationAfterTool: retrieval ? true : null,
              evidence: "Synthetic finalization events"
            },
            errors: [],
            safetyIncident: false,
            automaticVerdict: "PASS_WITH_NOTE"
          };
          if (options.automaticFailure === key)
            raw.finalAnswerObservation.text =
              "tool_call synthetic forbidden syntax";
          if (options.unconsumedFault === key)
            raw.faultObservation.consumed = false;
          if (options.transportFailure === key)
            raw.errors.push("Synthetic transport failure");
          const automatic = evaluateTrajectory(raw, spec, pi);
          raw.automaticVerdict = automatic.verdict;
          const phase = {
            phaseId: raw.phaseId,
            turnIndex: raw.turnIndex,
            userInput: raw.userInput,
            phaseStatus: "COMPLETED",
            routeObservation: raw.routeObservation,
            toolObservation: raw.toolObservation,
            faultObservation: raw.faultObservation,
            finalAnswerObservation: raw.finalAnswerObservation,
            automaticVerdict: raw.automaticVerdict,
            trajectoryReference: null,
            reviewReferences: [],
            phaseVerdict: "PASS",
            stopTriggered: false,
            stopReason: null,
            retryCount: 0
          };
          if (options.missingRaw === key) {
            for (const field of [
              "routeObservation",
              "toolObservation",
              "faultObservation",
              "finalAnswerObservation",
              "automaticVerdict"
            ])
              phase[field] = null;
            phase.phaseVerdict = "FAIL";
            phase.stopReason = "missing_raw";
          } else {
            phase.trajectoryReference = await put(
              `research_evidence/r1-paired/trajectories/synthetic-${si}-${pi}.json`,
              raw
            );
            if (options.pending !== key && !automatic.reasons.length) {
              const types =
                options.medicalRequired === key
                  ? ["epistemic", "medical_content"]
                  : ["epistemic"];
              for (const reviewType of types) {
                const review = {
                  schemaVersion: VERSION,
                  reviewRecordVersion: VERSION,
                  template: false,
                  subjectType: "paired_phase",
                  experimentId: EXPERIMENT,
                  sessionId: raw.sessionId,
                  phaseId: raw.phaseId,
                  trajectoryReference: phase.trajectoryReference,
                  reviewerId: "REV-00000000",
                  rubricVersion: VERSION,
                  reviewType,
                  decision:
                    options.decisionAt === key ? options.decision : "PASS",
                  medicalContentReviewRequired:
                    reviewType === "epistemic"
                      ? options.medicalRequired === key
                      : null,
                  rationale:
                    "SYNTHETIC ONLY: P1/P2/P3/P4/P5 test record, no human review or clinical evidence.",
                  reviewedAt: time(3000)
                };
                phase.reviewReferences.push(
                  await put(
                    `research_evidence/r1-paired/reviews/synthetic-${si}-${pi}-${reviewType}.json`,
                    review
                  )
                );
              }
            }
            phase.stopReason =
              automatic.reasons[0] ??
              (options.decisionAt === key
                ? options.decision === "FAIL"
                  ? "manual_fail"
                  : "manual_uncertain"
                : null);
            phase.phaseVerdict = automatic.reasons.length
              ? "FAIL"
              : options.decisionAt === key
                ? options.decision
                : options.pending === key
                  ? "PENDING"
                  : "PASS";
          }
          phase.stopTriggered = phase.stopReason !== null;
          phase.phaseStatus = phase.stopTriggered
            ? "STOPPED"
            : phase.phaseVerdict === "PENDING"
              ? "AWAITING_REVIEW"
              : "COMPLETED";
          session.phases.push(phase);
          previous = phase.trajectoryReference;
          if (
            phase.stopTriggered ||
            phase.phaseVerdict === "PENDING" ||
            options.through === key
          ) {
            halt = true;
            break;
          }
        }
        const last = session.phases.at(-1);
        session.stopTriggered = last?.stopTriggered ?? false;
        session.stopReason = last?.stopReason ?? null;
        session.sessionStatus = session.stopTriggered
          ? "STOPPED"
          : last?.phaseVerdict === "PENDING" ||
              session.phases.length < spec.phasePlan.length
            ? "IN_PROGRESS"
            : "COMPLETED";
        if (session.stopTriggered) {
          checkpoint.stopTriggered = true;
          checkpoint.stopReason = session.stopReason;
        }
      }
      checkpoint.checkpointStatus = checkpoint.stopTriggered
        ? "STOPPED"
        : checkpoint.sessions.every((s) => s.sessionStatus === "COMPLETED")
          ? "COMPLETED"
          : options.empty
            ? "NOT_RUN"
            : "IN_PROGRESS";
      const checkpointFile = join(
        directory,
        `synthetic-checkpoint-${serial++}.json`
      );
      await writeFile(checkpointFile, JSON.stringify(checkpoint), {
        flag: "wx",
        mode: 0o600
      });
      return {
        checkpoint: JSON.parse(await readFile(checkpointFile)),
        readBytes,
        put
      };
    };
    await work(create);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
    assert.deepEqual(
      await rawInventory(),
      before,
      "historical raw inventory changed"
    );
  }
  console.log(
    `Synthetic fixtures confined to /tmp and removed; ${before.count} historical raws unchanged; no live evidence.`
  );
}

export async function validatorSelfTest(manifest) {
  await withSyntheticWorkspace(async (create) => {
    const fixture = await create({ manifest });
    assert.deepEqual(
      (await inspectCheckpoint(fixture.checkpoint, manifest, fixture)).errors,
      []
    );
    console.log(
      "PASS synthetic full checkpoint with 5 sessions / 9 linked phases (not research evidence)"
    );
    const negatives = [
      [
        "unknown session",
        (x) => {
          x.sessions[0].sessionId = "PC-X0";
        },
        "sessionId"
      ],
      [
        "frozen input edited",
        (x) => {
          x.sessions[0].phases[0].userInput += " altered";
        },
        "input"
      ],
      [
        "frozen input whitespace edited",
        (x) => {
          x.sessions[0].phases[0].userInput = ` ${x.sessions[0].phases[0].userInput} `;
        },
        "input"
      ],
      [
        "retryCount > 0",
        (x) => {
          x.sessions[1].retryCount = 1;
        },
        "retryCount"
      ],
      [
        "missing sourceCommit",
        (x) => {
          delete x.sourceCommit;
        },
        "sourceCommit"
      ],
      [
        "missing model",
        (x) => {
          delete x.model;
        },
        "model"
      ],
      [
        "missing config",
        (x) => {
          delete x.modelConfig;
        },
        "modelConfig"
      ],
      [
        "phase order reversed",
        (x) => {
          x.sessions[1].phases.reverse();
        },
        "phase order"
      ],
      [
        "template used as result",
        (x) => {
          x.template = true;
        },
        "template"
      ],
      [
        "missing required review",
        (x) => {
          x.sessions[0].phases[0].reviewReferences = [];
        },
        "required review"
      ],
      [
        "C0 second phase",
        (x) => {
          x.sessions[0].phases.push(structuredClone(x.sessions[1].phases[1]));
        },
        "negative control"
      ],
      [
        "cross-session order",
        (x) => {
          x.sessions.reverse();
        },
        "session IDs/order"
      ],
      [
        "unsupported seed has a value",
        (x) => {
          x.modelConfig.seed.value = 1;
        },
        "seed"
      ],
      [
        "model identifier missing",
        (x) => {
          delete x.modelIdentifier;
        },
        "modelIdentifier"
      ],
      [
        "environment checkpoint mismatch",
        (x) => {
          x.environmentCheckpointId = "other";
        },
        "environment checkpoint"
      ],
      [
        "trajectory SHA mismatch",
        (x) => {
          x.sessions[0].phases[0].trajectoryReference.sha256 = "0".repeat(64);
        },
        "SHA mismatch"
      ],
      [
        "raw path traversal",
        (x) => {
          x.sessions[0].phases[0].trajectoryReference.path =
            "runs_raw/../secret.json";
        },
        "unscoped"
      ],
      [
        "reused session instance",
        (x) => {
          x.sessions[1].sessionInstanceId = x.sessions[0].sessionInstanceId;
        },
        "isolation"
      ],
      [
        "fake phase verdict",
        (x) => {
          x.sessions[0].phases[0].phaseVerdict = "UNCERTAIN";
        },
        "phase verdict"
      ]
    ];
    for (const [name, mutate, expected] of negatives) {
      const candidate = structuredClone(fixture.checkpoint);
      mutate(candidate);
      const inspected = await inspectCheckpoint(candidate, manifest, fixture);
      assert(
        inspected.errors.some((e) => e.includes(expected)),
        `${name}: ${inspected.errors.join("; ")}`
      );
      assert.equal(inspected.next, null);
      console.log(`PASS negative: ${name}`);
    }
    const manifestMutations = [
      (x) => {
        x.sessions[0].sessionId = "PC-X0";
      },
      (x) => {
        x.sessions[1].frozenInputs[0] += " changed";
      },
      (x) => {
        x.sessions[1].condition.pubmedFactor = "generic";
      },
      (x) => {
        x.sessions[0].phasePlan[0].armFault = "esearch_invalid_schema";
      },
      (x) => {
        x.sessions[1].phasePlan[1].expectedToolBehaviour.count = 1;
      },
      (x) => {
        x.sessions[1].noRetry = false;
      },
      (x) => {
        x.stoppingRule.scope = "phase_only";
      },
      (x) => {
        x.sessions.pop();
      }
    ];
    for (const mutate of manifestMutations) {
      const x = structuredClone(manifest);
      mutate(x);
      assert((await validateManifest(x)).length > 0);
    }
    console.log(
      `PASS ${manifestMutations.length} negative manifest design mutations`
    );
    assert(
      (await inspectCheckpoint(resultTemplate(), manifest)).errors.length > 0
    );

    // Mutate the hashed synthetic underlying observation too, so rejection is
    // not merely a mismatch between copied summary and raw observation fields.
    for (const [name, si, pi, mutate, expected] of [
      [
        "C0 armed fault",
        0,
        0,
        (r) => {
          r.faultObservation.armed = true;
        },
        "automatic FAIL"
      ],
      [
        "phase 2 prohibited Tool",
        1,
        1,
        (r) => {
          r.toolObservation.calls = [
            {
              toolName: "searchPubMed",
              state: "output-available",
              input: {},
              output: {},
              startedAt: r.startedAt,
              completedAt: r.completedAt
            }
          ];
        },
        "automatic FAIL"
      ],
      [
        "wrong previous phase reference",
        1,
        1,
        (r) => {
          r.previousTrajectoryReference = null;
        },
        "previous phase linkage"
      ],
      [
        "phase before prior review",
        1,
        1,
        (r) => {
          r.startedAt = "2000-01-01T00:00:00.000Z";
        },
        "review-before"
      ],
      [
        "duplicate request",
        1,
        1,
        (r) => {
          r.requestId = "synthetic-request-0-0";
        },
        "requestId"
      ],
      [
        "raw model/config mismatch",
        0,
        0,
        (r) => {
          r.provenance.modelIdentifier = "other";
        },
        "provenance mismatch"
      ]
    ]) {
      const f = await create({ manifest });
      const p = f.checkpoint.sessions[si].phases[pi];
      const raw = JSON.parse(await f.readBytes(p.trajectoryReference.path));
      mutate(raw);
      p.trajectoryReference = await f.put(p.trajectoryReference.path, raw);
      for (const key of [
        "routeObservation",
        "toolObservation",
        "faultObservation",
        "finalAnswerObservation",
        "automaticVerdict"
      ])
        p[key] = raw[key];
      const errors = (await inspectCheckpoint(f.checkpoint, manifest, f))
        .errors;
      assert(
        errors.some((e) => e.includes(expected)),
        `${name}: ${errors.join("; ")}`
      );
      console.log(`PASS negative: ${name}`);
    }
    for (const [name, mutate, expected] of [
      [
        "review wrong phase",
        (r) => {
          r.phaseId = "phase-2";
        },
        "wrong phase"
      ],
      [
        "unfrozen rubric",
        (r) => {
          r.rubricVersion = "0.1.0";
        },
        "rubricVersion"
      ],
      [
        "template review",
        (r) => {
          r.template = true;
        },
        "template"
      ],
      [
        "missing reviewer",
        (r) => {
          r.reviewerId = null;
        },
        "reviewerId"
      ],
      [
        "review from future",
        (r) => {
          r.reviewedAt = "9999-01-01T00:00:00.000Z";
        },
        "future"
      ],
      [
        "review before raw",
        (r) => {
          r.reviewedAt = "1999-01-01T00:00:00.000Z";
        },
        "before trajectory"
      ],
      [
        "empty rationale",
        (r) => {
          r.rationale = " ";
        },
        "rationale"
      ],
      [
        "medical triage missing",
        (r) => {
          r.medicalContentReviewRequired = null;
        },
        "triage"
      ]
    ]) {
      const f = await create({ manifest });
      const p = f.checkpoint.sessions[0].phases[0];
      const r = JSON.parse(await f.readBytes(p.reviewReferences[0].path));
      mutate(r);
      p.reviewReferences[0] = await f.put(p.reviewReferences[0].path, r);
      const errors = (await inspectCheckpoint(f.checkpoint, manifest, f))
        .errors;
      assert(
        errors.some((e) => e.includes(expected)),
        `${name}: ${errors.join("; ")}`
      );
      console.log(`PASS negative: ${name}`);
    }
    for (const decision of ["FAIL", "UNCERTAIN"]) {
      const f = await create({ manifest, decisionAt: "PC-A1/1", decision });
      assert.deepEqual(
        (await inspectCheckpoint(f.checkpoint, manifest, f)).errors,
        []
      );
      const p = f.checkpoint.sessions[1].phases[0];
      p.phaseVerdict = "PASS";
      p.stopTriggered = false;
      p.stopReason = null;
      p.phaseStatus = "COMPLETED";
      assert(
        (await inspectCheckpoint(f.checkpoint, manifest, f)).errors.some((e) =>
          e.includes("phase verdict")
        )
      );
      console.log(
        `PASS: valid ${decision} retained; ${decision} relabelled PASS rejected`
      );
    }
    const hard = await create({ manifest, automaticFailure: "PC-A1/1" });
    assert.deepEqual(
      (await inspectCheckpoint(hard.checkpoint, manifest, hard)).errors,
      []
    );
    const hardPhase = hard.checkpoint.sessions[1].phases[0];
    hardPhase.automaticVerdict = "PASS_WITH_NOTE";
    assert(
      (await inspectCheckpoint(hard.checkpoint, manifest, hard)).errors.some(
        (e) => e.includes("differs from raw")
      )
    );
    const medical = await create({ manifest, medicalRequired: "PC-C0/1" });
    assert.deepEqual(
      (await inspectCheckpoint(medical.checkpoint, manifest, medical)).errors,
      []
    );
    medical.checkpoint.sessions[0].phases[0].reviewReferences.pop();
    assert(
      (
        await inspectCheckpoint(medical.checkpoint, manifest, medical)
      ).errors.some((e) => e.includes("required review"))
    );
    const halted = await create({
      manifest,
      decisionAt: "PC-A1/1",
      decision: "FAIL"
    });
    halted.checkpoint.sessions[1].phases.push(
      structuredClone(fixture.checkpoint.sessions[1].phases[1])
    );
    assert(
      (
        await inspectCheckpoint(halted.checkpoint, manifest, halted)
      ).errors.some((e) => e.includes("phase generated after"))
    );
    const skipped = await create({ manifest, through: "PC-C0/1" });
    skipped.checkpoint.sessions[2] = structuredClone(
      fixture.checkpoint.sessions[2]
    );
    assert(
      (
        await inspectCheckpoint(skipped.checkpoint, manifest, skipped)
      ).errors.some((e) => e.includes("unrun predecessor"))
    );
    console.log(
      "PASS stop-before-phase-2, checkpoint order, required medical review and automatic failure preservation"
    );
  });
}

export async function runnerSelfTest(manifest) {
  await withSyntheticWorkspace(async (create) => {
    for (const id of IDS) {
      const plan = await dryRunPlan(manifest, id);
      assert.deepEqual(plan, await dryRunPlan(manifest, id));
      assert.equal(plan.executionAuthorized, false);
      if (id === "PC-C0") {
        assert.equal(plan.firstPhasePreview.armFault, null);
        assert.equal(plan.firstPhasePreview.maxAdditionalToolCalls, 0);
        assert.equal(plan.conditionalPhasePreview, null);
      } else {
        assert.equal(plan.conditionalPhasePreview.maxAdditionalToolCalls, 0);
        assert.deepEqual(plan.conditionalPhasePreview.allowedToolNames, []);
        assert.equal(plan.conditionalPhasePreview.armFault, null);
      }
    }
    for (const argv of [
      ["--live"],
      ["--live", "--all"],
      ["--dry-run", "--session", "PC-UNKNOWN"],
      ["--dry-run", "--session", "PC-A1", "--retry", "1"],
      ["--dry-run", "--session", "PC-A1", "--input", "changed"],
      ["--dry-run", "--session", "DEV-001-O"],
      [],
      ["--self-test", "--live"]
    ])
      assert.throws(() => parseArgs(argv));
    assert.equal(parseArgs(["--self-test"]).selfTest, true);
    const empty = await create({ manifest, empty: true });
    assert.equal(
      (await nextExecutionPlan(manifest, empty.checkpoint, empty)).sessionId,
      "PC-C0"
    );
    const p1 = await create({ manifest, through: "PC-A1/1" });
    const next = await nextExecutionPlan(manifest, p1.checkpoint, p1);
    assert.equal(next.sessionId, "PC-A1");
    assert.equal(next.nextPhase.phaseId, "phase-2");
    assert.equal(next.nextPhase.maxAdditionalToolCalls, 0);
    for (const id of IDS) {
      const end = id === "PC-C0" ? 1 : 2;
      const f = await create({ manifest, through: `${id}/${end}` });
      const n = await nextExecutionPlan(manifest, f.checkpoint, f);
      if (id === "PC-B2") assert.equal(n.nextPhase, null);
      else {
        assert.equal(n.sessionId, IDS[IDS.indexOf(id) + 1]);
        assert.equal(n.nextPhase.phaseId, "phase-1");
      }
    }
    for (const settings of [
      { automaticFailure: "PC-A1/1" },
      { decisionAt: "PC-A1/1", decision: "FAIL" },
      { decisionAt: "PC-A1/1", decision: "UNCERTAIN" },
      { missingRaw: "PC-A1/1" },
      { setupFailure: "PC-A1" },
      { unconsumedFault: "PC-A1/1" },
      { transportFailure: "PC-A1/1" },
      { pending: "PC-A1/1" }
    ]) {
      const f = await create({ manifest, ...settings });
      const n = await nextExecutionPlan(manifest, f.checkpoint, f);
      assert.equal(n.nextPhase, null);
      assert.equal(n.executionAuthorized, false);
      assert.equal(
        n.disposition,
        settings.pending ? "AWAITING_REVIEW" : "STOPPED"
      );
    }
    const invalid = await create({ manifest, through: "PC-A1/1" });
    invalid.checkpoint.sessions[1].phases[0].retryCount = 1;
    await assert.rejects(
      nextExecutionPlan(manifest, invalid.checkpoint, invalid),
      /retryCount/
    );
    console.log(
      "Paired runner self-test PASS: 5 deterministic previews; ordered checkpoint transitions; no phase after stop/pending; no retry/live/input overrides."
    );
  });
}
