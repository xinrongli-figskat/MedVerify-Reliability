# Reliability Benchmark Protocol

Protocol version: 1.0.0
Milestone: M2.11A
Status: design freeze; no benchmark experiment has been run

## 1. Purpose and research mapping

This protocol defines a reproducible, machine-checkable reliability benchmark design. It maps failure recognition to RQ1, failure propagation through the trajectory to RQ2, system-level reliability controls to RQ3, and generalisation across perturbations, languages, repeated execution, and models to RQ4. M2.11A freezes the protocol and split governance; it reports no experimental result.

The existing 25 reliability cases and 76 immutable raw runs are historical/development evidence. They cannot be relabelled retrospectively as held-out evidence. M2.10F completed failure-aware PubMed finalization. FC-002, FC-014, and FC-026 are verified closed for their currently registered paths; FC-027 remains open. M2.11A does not re-adjudicate any failure status.

## 2. Units of analysis

- `scenario_family`: the semantic parent and mandatory split/anti-leakage unit.
- `case_variant`: one concrete input variant belonging to exactly one family.
- `run`: one model execution of a case variant.
- `trajectory`: the complete router, query, Tool call/output, outcome, and final-answer process for a run.
- `manual_review`: a human judgment recorded separately from every automatic verdict.

Original questions, paraphrases, negations, irrelevant-context variants, Chinese/English variants, and repeated runs inherit their scenario family's split. Semantic near-duplicates and template-derived samples must not cross development and held-out splits.

## 3. Evidence-state taxonomy

Every retrieval trajectory uses one top-level state:

- `successful_records`: parsed, schema-valid, non-empty records.
- `zero_results`: a valid response that reports no records.
- `invalid_response`: an unusable response, classified as `parse_error` or `schema_error`.
- `tool_failure`: an execution/transport failure, classified as `http_error`, `network_error`, or `timeout`.

Failure stage is recorded as `esearch` or `esummary` where applicable. Tool failure is not zero results. Zero results does not prove that evidence is absent from the database. Invalid responses cannot count as successful records. Only validated successful records can supply citation provenance.

## 4. Benchmark dimensions

Coverage is designed across infrastructure failure, response integrity, retrieval outcomes, agent/tool control, epistemic behaviour, citation grounding, query fidelity, uncertainty/abstention, tool-call leakage, semantic perturbation, language variation, repeated execution, and cross-model evaluation. Coverage cells are abstract design requirements, not prompts or completed observations.

## 5. Split governance

The existing registry and raw runs are development/history only. Splitting occurs only by `scenario_family`; every derived variant and repeated execution inherits the parent split. Semantic similarity and template provenance must be checked before assignment, and no family may overlap splits.

M2.11A contains no held-out user input, expected answer, required/forbidden phrases, article title, identifier fixture, or hidden gold prose. Held-out content may be generated only after development rules are frozen, then must receive a locked split and benchmark version before formal evaluation. It must remain concealed from product-rule authors and cannot be used for prompt tuning, assertion tuning, or production-rule writing.

Viewing held-out content or using it to change product rules contaminates that version. It must be retired as valid held-out evidence and replaced under a new version with documented provenance. Product changes made after reveal require evaluation against an uncontaminated replacement split; revealed results remain historical and must not be presented as fresh held-out evidence.

## 6. Gold labels and adjudication

Deterministic Tool/outcome labels are derived from immutable trajectory evidence. Automatic final-answer assertions are recorded independently and test only their stated string/structure contracts. They do not constitute medical or clinical validation. Manual epistemic review judges whether conclusions match evidence state; medical-content review judges correctness and safety. Both record reviewer, rubric version, decision, and rationale separately from automation.

Disagreements go to an independent adjudicator without overwriting source judgments. Insufficient evidence receives an `uncertain` label rather than forced agreement. Raw evidence is immutable; corrections are appended as versioned annotations or derived evaluations with provenance.

## 7. Metrics

The benchmark will define, but M2.11A does not calculate: failure-state classification accuracy, unsafe evidence conclusion rate, citation grounding rate, query fidelity, tool compliance, abstention/uncertainty accuracy, repeated-pass rate, trajectory consistency, perturbation robustness, and cross-model delta. Denominators, confidence intervals, statistical methods, sample sizes, and repeated-run counts will be preregistered and frozen in a later pilot/power-analysis milestone. They must not be backfilled after observing results. One successful run is not stability evidence.

## 8. Versioning and release

Protocol, benchmark, split, and case versions are independently immutable identifiers. Every raw run records benchmark/case versions, execution environment, model/configuration, timestamp, and source checkpoint. A held-out reveal records who received access, when, purpose, and version. Contamination retires the affected split and requires a replacement version. A reproducibility release may publish protocol, schemas, frozen manifests, derived verdicts, adjudication records, and checksums; concealed content is released only under the declared reveal policy.

## 9. Explicit exclusions

M2.11A includes no production feature, emergency rule, UI, memory, multi-agent behavior, fine-tuning, abstract/full-text evidence, live Agent run, cross-model experiment, statistical result, or real held-out prompt content. Development benchmark construction begins only in M2.11B.
