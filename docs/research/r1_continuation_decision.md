# R1 Readiness Continuation Decision

Decision version: 1.0.0
Continuation identifier: R1-READINESS-001
Milestone: R1-B1
Source checkpoint: `feea8e33e0c83ce348933bdfacb01b7176e88a9c`
Status: governance established; readiness `NOT_READY`; no live authorization

## Historical boundary

The historical M2.11D pilot is identified by ledger version `1.0.0` in
[`development-pilot-results.json`](../../tests/reliability/development-pilot-results.json).
Its current snapshot includes the later M2.11E, M2.11G.1 and M2.11H annotations.
The entire file is retained byte for byte, with SHA-256
`73d22bfdd7f3bec2a3106c557c046da243e47606314a8975a0d41424ed7fe6df`.

| Historical variant | Execution | Pilot result |
| ------------------ | --------- | ------------ |
| DEV-005-O          | COMPLETED | PASS         |
| DEV-010-O          | COMPLETED | FAIL         |
| DEV-002-O          | NOT_RUN   | null         |
| DEV-001-O          | NOT_RUN   | null         |

The stopping trigger was the original DEV-010-O Tool-0 routing failure,
adjudicated as `PRODUCT_ROUTING_FAILURE`. Its original raw is
`runs_raw/2026-08-24T05-07-13-424Z_DEV-010-O.json`, SHA-256
`e8198f342ae35fe3a81b5a898219d02e492536b613cde9efe834c6b78cae353e`,
at product checkpoint `a36b4a2dd80656f3035e84e3d3a561f6ed7daa55`.
The earlier fault-setup 403 was recovered before the pilot observations and
was not this stopping trigger.

The original `pilotStatus=BLOCKED`, `completionClaim=false`, `noRetry`,
`remainingRunProhibition`, all four result entries, and every original verdict
remain intact. The original experiment will never become RESUMED, COMPLETED
or 4/4 PASS. Its remaining-run prohibition continues to forbid adding runs to
that historical experiment. Reusing a development variant ID in a separately
authorized checkpoint must not change its historical NOT_RUN entry.

The original `followUpRequirement.action` says:

> Version and preregister a minimal paired routing/construct experiment before product or dataset changes and before resuming the pilot.

That requirement is preserved and is **not discharged** by this decision or by
FC-028 closure. The paired construct experiment has not been completed by this
work. There is no authorization here to resume M2.11D, change product rules or
change dataset wording. The broader construct-validity concern remains for
measurement review. Future work addressing it must have its own version and
preregistration; it cannot be retrospectively declared satisfied.

## Independent FC-028 basis

FC-028 is `VERIFIED_CLOSED` for its observed deterministic routing path, based on
the independent M2.11G.1 trajectory and M2.11H contract adjudication:

| Provenance                       | Value                                                              |
| -------------------------------- | ------------------------------------------------------------------ |
| Post-fix raw                     | `runs_raw/2026-08-24T06-50-27-951Z_DEV-010-O.json`                 |
| SHA-256                          | `6b8e33fe36e74b16d8861b9b6c53ecd61067619d0ea934199fb4d4dce22d2a6a` |
| Source commit                    | `74549c81e267539392aa5f4111eee7a1a80f5f0d`                         |
| Trajectory                       | Tool 1; invalid_response / schema_error / esearch                  |
| Automatic / offline              | PASS_WITH_NOTE / PASS_WITH_NOTE                                    |
| Original post-fix manual verdict | FAIL, preserved                                                    |
| Contract adjudication            | SUPPLEMENTAL_CRITERION_MISMATCH                                    |
| Canonical contract               | SATISFIED                                                          |

The evidence is linked through the historical ledger's `/postFixRegression`
and [`development_pilot_adjudication.md`](development_pilot_adjudication.md).
The manual failure concerned supplemental retry advice, which was not a frozen
canonical requirement. Its FAIL remains recorded. This is neither a new manual
PASS nor a replacement for the original DEV-010-O FAIL. It does not prove
general medical correctness, construct validity or repeated-run stability.

## New checkpoint and allowed scope

R1-READINESS-001 asks whether the repaired platform can progress through the
remaining readiness checks. It is a new development checkpoint with an
independent ledger and validator, not another status of M2.11D. Its lineage is:

`M2.11D BLOCKED snapshot + independent M2.11G.1/H closure evidence → R1-READINESS-001 NOT_READY`

The only currently eligible future continuation cases, in order, are:

| Variant   | Family      | Contract                      | Required manual review     | Current state |
| --------- | ----------- | ----------------------------- | -------------------------- | ------------- |
| DEV-002-O | DEV-FAM-002 | zero_results / esearch        | epistemic                  | NOT_RUN       |
| DEV-001-O | DEV-FAM-001 | successful_records / esummary | epistemic; medical_content | NOT_RUN       |

Eligibility is not permission to run. Both cases have null raw, automatic
verdict and manual review. No reviewer or observation is invented. R1-B1 is
offline governance only. Live execution requires a separate subsequent user
authorization, a recorded execution decision and completed measurement review.
No retry of DEV-005-O or DEV-010-O is in this continuation scope.

Protocol `1.0.0`, plan `0.1.0-design` and dataset `0.1.0-development` are
unchanged. Variant inputs, expected outcomes and existing evaluator assertions
are not changed. Readiness does not authorize the 50-case benchmark, held-out
construction, formal experiments or statistical claims. The roadmap's readiness
objective must be reported through distinct historical, post-fix and continuation
evidence, never as a rewritten M2.11D 4/4 PASS.

## Validation and future evidence

[`r1-readiness-results.json`](../../tests/reliability/r1-readiness-results.json)
has independent schema and ledger versions `1.0.0`. The historical ledger is
referenced by path, version, status and pinned SHA-256 rather than copied.
The new validator also calls the unchanged historical integrity validator;
changing a hash in the new ledger cannot legitimize a changed historical file.

```bash
npm run test:research:readiness
node scripts/validate-r1-readiness-results.mjs --self-test
```

These commands only read files and exercise in-memory negative fixtures. They
do not invoke the runner, create raw files, open network connections or grant
execution permission. Validation success means the ledger is internally valid;
it does not mean the readiness verdict is READY.

The result schema permits future COMPLETED entries only with a new raw reference
and matching source commit, variant/family/split/version provenance, automatic
verdict and prerequisite decision references. It permits READY only when both
continuation cases have acceptable automatic results, complete passing human
reviews and verified raw references. A failed or uncertain judgment remains
NOT_READY; disagreement requires a separate adjudication, not overwriting it.

Each prerequisite is initially null. Future prerequisite references have
`path`, `sha256` and `sourceCommit`, pointing to a separately recorded Markdown
decision under `docs/research/`. The two decisions must be distinct and cannot
be this governance document or the historical adjudication. Their hashes attest
to the referenced documents, not to the truth of their conclusions: an accountable
human must review their actual scope, timing and authorization before execution.
The validator is an integrity check, not an authorization service or medical
evaluator. A JSON boolean or validator PASS never grants live permission.

Future raw references use `path`, `sha256` and `sourceCommit`; each raw must be
independent of all historical pilot/post-fix raws. The enclosing continuation ID
and versioned ledger provide checkpoint ownership without altering old raw or
the production Agent. Each human review records `type`, `reviewer`,
`rubricVersion`, `decision` and `rationale`; types inherit the frozen family.
No review is copied from DEV-010-O to either continuation case.

## Remaining work

Proceed to R1-B2 Measurement Fidelity to address the timeout fixture's
ESearch/ESummary mismatch, query-fidelity measurement, success-fixture relevance,
manual rubric/provenance and the unresolved construct follow-up. That work must
determine and record the scope under which new readiness evidence can be valid.
No paired experiment or product/dataset modification is authorized here.

Before any later live checkpoint, separately authorize the two cases and freeze
the execution conditions, source checkpoint, review rubric and stopping rules.
Prepare the local Worker, remote AI, NCBI_EMAIL and fault double gate, and check
the environment without misclassifying environment failures as Agent failures.
Record subsequent evidence without rewriting this decision's R1-B1 observations
or any historical judgment. Substantive governance/schema changes require a new
version. Formal research experiments retain their own freeze and authorization
requirements even if platform readiness is later established.
