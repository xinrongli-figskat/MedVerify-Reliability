# R1-C1 Paired Execution Infrastructure Contract

Contract version: 1.0.0
Experiment: R1-PAIRED-CONSTRUCT-001
Registration: PREREGISTERED; execution: NOT_RUN
Scope: offline planning, evidence validation and review linkage only
Live implementation/authorization: none

## Frozen design and authority

The normative experiment remains the unchanged
[preregistration 1.0.0](r1_paired_construct_preregistration.md).
The [manifest](../../tests/reliability/r1-paired-construct-manifest.json)
transcribes its five fixed inputs, conditional second input, 2×2 factors,
negative control, order C0/A1/A2/B1/B2, at most nine turns, failure stopping
conditions and no-retry rule. Phase names `phase-1` and `phase-2` are recording
identifiers for those existing turns, not new experimental conditions.

The implementation independently pins the preregistration, protocol, Study 1
measurement decision, rubric and continuation decision by SHA-256. Full manifest
comparison covers every field and rejects unknown fields, altered conditions,
counts, order, inputs, stop rules or retries. Substantive changes require a new
version; updating a JSON version or hash alone does not authorize a changed study.

The 50 development variants, production routing/prompt, historical M2.11D and
R1 readiness records are unchanged. This paired experiment does not use DEV IDs,
cannot resume M2.11D, and cannot satisfy the historical follow-up merely by
having an executable plan.

## Files and commands

| File                                                  | Purpose                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `scripts/r1-paired-contract.mjs`                      | Strict Zod schemas 1.0.0, pinned manifest, structural evaluator and template factories |
| `scripts/validate-r1-paired-construct.mjs`            | Manifest/template validation, real checkpoint validation and paired review linkage     |
| `scripts/run-r1-paired-construct.mjs`                 | Deterministic previews and evidence-dependent next-phase planner; no transport         |
| `scripts/r1-paired-self-test.mjs`                     | Explicitly synthetic /tmp fixtures and positive/negative transition tests              |
| `tests/reliability/r1-paired-construct-manifest.json` | Design only; no observations                                                           |
| `tests/reliability/r1-paired-result-template.json`    | `template=true`; null provenance/observations; not a result                            |
| `tests/reliability/r1-paired-review-template.json`    | `template=true`; no reviewer or judgment                                               |

```bash
node scripts/validate-r1-paired-construct.mjs
node scripts/validate-r1-paired-construct.mjs --self-test
node scripts/run-r1-paired-construct.mjs --self-test
node scripts/run-r1-paired-construct.mjs --dry-run --session PC-C0
node scripts/run-r1-paired-construct.mjs --dry-run --session PC-A1
node scripts/run-r1-paired-construct.mjs --dry-run --session PC-A2
node scripts/run-r1-paired-construct.mjs --dry-run --session PC-B1
node scripts/run-r1-paired-construct.mjs --dry-run --session PC-B2
```

For future existing evidence, `--result <checkpoint.json>` validates read-only;
runner `--dry-run --checkpoint <checkpoint.json>` returns the next eligible
phase plan or a stopped/pending/completed disposition. These commands cannot
execute that plan. `--live`, bulk live, retry, arbitrary input and unknown session
selectors are rejected before any execution capability exists.

## Result contract 1.0.0

The executable schemas are `provenanceSchema`, `resultSchema`, `phaseSchema`,
`trajectorySchema` and `reviewSchema` in `r1-paired-contract.mjs`. Objects are
strict: extra fields, wrong types and missing fields are rejected. The result
is a checkpoint envelope containing exactly five ordered session entries;
shared provenance is stored at the envelope and copied into every phase
trajectory. Each session therefore resolves to exactly one model/config/source
combination. This prevents individually valid session files from hiding an
earlier checkpoint stop or a cross-condition model change.

Envelope provenance requires:

- sourceCommit (40 hexadecimal characters) and dirtyWorktree;
- model (backend label), modelIdentifier (actual provider model identifier);
- modelConfig with temperature, maxTokens, seed and otherParameters;
- runnerVersion, evaluatorVersion, protocolVersion, measurementPlanVersion,
  rubricVersion and executionManifestVersion;
- manifestReference (repository path and SHA-256 of actual bytes);
- environmentCheckpointId and environmentReference;
- authorizationReference to a separate future `docs/research/r1_paired_live_*.md`.

Each parameter is `{status, value, reason}`. `supported` requires a finite numeric
value and null reason; maxTokens must be a positive integer and seed an integer.
`unsupported` or `not_applicable` requires an explicit null value and nonempty
reason. A parameter omitted, silently defaulted or represented by null alone
does not satisfy future real-result provenance. `otherParameters` records any
additional effective non-secret model settings.

The environment JSON must identify the same environmentCheckpointId,
sourceCommit, modelIdentifier and modelConfig, with canonical UTC recordedAt
no later than any attempted phase. It can also retain non-secret runtime,
dependency, worker and tool configuration evidence. Actual values and capability
support must be verified during C2; the present templates intentionally do not
invent them.

Every session has sessionId, sessionInstanceId, sessionStatus, setupFailure,
phases, stopTriggered, stopReason and retryCount. Every attempted phase has
phaseId, turnIndex, exact userInput, phaseStatus, routeObservation,
toolObservation, faultObservation, finalAnswerObservation, automaticVerdict,
trajectoryReference, reviewReferences, phaseVerdict and its own stop/retry fields.
Checkpoint, session and phase retryCount must all equal zero.

Templates show null placeholders for both planned phases. Real results contain
only attempted phases, as an ordered prefix. Unrun sessions have `phases=[]`,
null instance and no observations. After an early stop the omitted conditional
phase is NOT_RUN by manifest, not an invented observation. Templates can only
pass template validation; changing the template flag alone cannot produce a
valid result. There is no real result or review ledger created in R1-C1.

## Phase trajectories and linkage

Future evidence uses a separate namespace, never ordinary DEV raw:

```text
research_evidence/r1-paired/trajectories/<id>.json
research_evidence/r1-paired/reviews/<id>.json
research_evidence/r1-paired/environment/<id>.json
```

No such evidence directory is created by this milestone. Readers reject lexical
traversal, paths outside the declared namespace, symlinks and SHA mismatches.
Self-tests inject readers mapping logical paths only to disposable /tmp files;
they never fall back to repository research results.

Trajectory records have recordType=`paired_phase_trajectory`, experiment/session/
phase/turn identities, exact input, complete shared provenance, sessionInstanceId,
requestId, initialMessageCount, startedAt/completedAt, observations, errors,
safetyIncident and stored automaticVerdict. Phase 1 requires an empty session;
phase 2 requires prior messages and the same instance. Distinct sessions must
have distinct instances; request IDs and trajectory/review paths cannot be reused.
Phase 2's previousTrajectoryReference must equal phase 1's exact path/SHA.

Tool observations retain actual per-phase calls, input/output and start/end
times, plus proposed/executed query and queryGuard diagnostics. Fault armed,
acknowledged and consumed are **this phase's** observations. Phase 2 has all
three false and scenario null; the consumed first-phase fixture is reached only
through previousTrajectoryReference. C0 likewise has no fault and no Tool.

Phase summary observations must equal the referenced trajectory. The evaluator
recomputes structural checks from observations instead of trusting stored PASS:
expected route/count/name/completion, actual invalid_response/schema_error/esearch
payload with empty records, fault consumption, nonempty finalization, prohibited
syntax, transport errors, safety incident and dirty worktree. Finalization/time
diagnostics remain observations requiring review; the validator is not a source
of missing temporal facts or an independent medical adjudicator.

The schema can preserve an attempted phase with missing raw as STOPPED /
missing_raw, null observations and no review. A pre-execution setup failure is
a separate session setupFailure, with no generated phase; it stops the checkpoint
and cannot authorize a restart. Broken/non-null references are integrity errors
and yield no next plan. Failure records are not repaired by fabricated raw.

## Paired manual review 1.0.0

Choice B: a separate paired review subject contract. The existing development
review schema, DEV variant regex, readiness integration and frozen rubric remain
unchanged. The paired adapter imports the original frozen rubric version and
validated-record PASS predicate. It links to the same byte-pinned
[rubric 1.0.0](r1_manual_review_rubric.md); no parallel medical scoring rubric is
introduced and no PC session is disguised as a DEV variant.

Paired records require schemaVersion, reviewRecordVersion, template=false,
subjectType=paired_phase, experimentId, sessionId, phaseId, trajectoryReference
(path/SHA), reviewerId, rubricVersion, reviewType, decision,
medicalContentReviewRequired, rationale and reviewedAt. IDs, hash and subject
must match the owning phase. Reviewer IDs retain the REV-uppercase-hex format.
Review time cannot precede trajectory completion or lie in the future; the next
phase/session cannot start before all preceding reviews finish.

An epistemic review is required for each successfully observed phase. It applies
Study 1 P1–P5 where applicable, including C0's prohibition on real medical
assertions. Its medicalContentReviewRequired boolean explicitly records whether
the actual answer needs the rubric's medical-content review; when true that
second reviewType is required before advancement. A medical_content review uses
null for that triage field. This operationalizes the existing rubric's applicable
medical-content boundary, without adding a demand for positive clinical support
or changing any frozen input. Triage/rationale truth and competence remain human
responsibilities; the format validator does not decide clinical applicability.

PASS requires every applicable obligation to be assessable and met. FAIL and
UNCERTAIN are valid source judgments. Either stops the checkpoint; neither can
be converted to phase PASS. Pending required review is AWAITING_REVIEW and cannot
advance. A hard automatic failure stops immediately without waiting to invent a
review; later review of that failed phase can be linked without erasing failure.
Any further adjudication/override mechanism requires a separately versioned
contract, not replacement of the source judgments.

## Offline state machine

```text
Validated checkpoint prefix
  -> next session phase 1, only after preceding sessions complete
  -> actual phase raw + recomputed assertions + linked reviews
  -> missing review: AWAITING_REVIEW, no next phase
  -> any stop: STOPPED, no later phase/session
  -> all pass and expected outcome confirmed: same-session phase 2
  -> phase 2 pass: next session
  -> final session complete: no next phase
```

The runner enforces this when deriving a next-phase plan. A design preview for
an individual session is explicitly not scheduling or permission; it lists the
conditional phase and prior-session prerequisites. A STOPPED checkpoint never
returns phase 2, even if its manifest contains that conditional design.

There is no live transport or durable execution store. Consequently these are
offline transition guarantees, not claims that a deployed model has been forced
to obey zero Tool calls or that independently edited/replaced files cannot lie.
The future executor must preserve single checkpoint ownership, exclusive raw
publication, crash recovery without retry, reviews before advancement, and
authorization/environment checks. Hashes prove byte linkage, not human identity,
authorization meaning, commit ancestry, model configuration truth or judgment.

## C2 boundaries

R1-C1 makes the infrastructure reviewable; it does not complete paired execution
or change R1 readiness from NOT_READY. C2 may prepare a distinct live checkpoint
freeze only after reviewing this work and resolving faithful transport/recording.
The frozen second input currently matches production PubMed routing while the
design requires zero additional calls. A plan saying zero calls is not a fix for
that live constraint: do not silently alter Router, prompt, the input, or replace
two turns with one. If faithful execution is unavailable, remain in preparation
and record a new scoped decision.

The separate 24/50 development routing mismatch inventory is an offline
diagnostic, not a live failure rate or a reversal of FC-028 closure. Product or
dataset correction must follow the preregistered paired construct experiment;
this milestone makes no such correction. No held-out or formal experiment is
authorized by these contracts.
