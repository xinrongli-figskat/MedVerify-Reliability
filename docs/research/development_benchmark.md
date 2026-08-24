# Reliability Development Benchmark

Benchmark version: 0.1.0-development
Protocol version: 1.0.0
Milestone: M2.11C
Status: constructed, validated, execution-plannable, with M2.11D single-variant live integration

## Scope

This milestone constructs the development-only reliability benchmark described by the frozen M2.11A protocol. The normative machine-readable dataset is [`tests/reliability/benchmark-development.json`](../../tests/reliability/benchmark-development.json). It contains 10 scenario families and 50 case variants. Every family and variant is assigned to `development`; no held-out family, prompt, answer, assertion, identifier fixture, or hidden gold prose is present.

The benchmark is an offline fixture contract, not an experiment or a claim about system quality. It has not been sent to the Agent, a model, the server, PubMed, or live cases. Existing registry cases and immutable raw runs remain development/history evidence and are not inputs to this dataset.

M2.11C adds a deterministic execution planner, not live benchmark execution. It validates both frozen benchmark inputs and maps their stable file order to list, selection, and dry-run output. It never executes dataset strings, opens a network/session/Agent path, or creates raw data. Non-dry-run selection is rejected before those capabilities exist.

M2.11D adds an explicitly authorized, single-variant `--live` path. A validated deterministic plan is mapped into the existing Reliability Runner case contract, preserving its shared lifecycle, assertions, verdict algorithm, fault double gate, diagnostics, and immutable writer. Bulk live selectors remain prohibited. This authorizes only the preregistered four-state pilot, not the 50-variant experiment, held-out construction, or pilot-driven prompt/assertion tuning.

```bash
node scripts/run-reliability-development.mjs --list
node scripts/run-reliability-development.mjs --all --dry-run
node scripts/run-reliability-development.mjs --family DEV-FAM-001 --dry-run
node scripts/run-reliability-development.mjs --variant DEV-001-O --dry-run
npm run test:benchmark:development:runner
```

Dry-run plans are deterministic and marked `DRY_RUN_ONLY`. They contain the protocol/dataset identity, family and variant mapping, expected Tool/outcome contract, review requirements, and the future non-sensitive raw provenance values. They contain no model output, verdict, run path, request/session identifier, time-derived value, secret, or held-out information.

## Construction rules

- The scenario family is the split and anti-leakage unit. All semantic, language, context, and repeated-run derivatives inherit the parent family's development split.
- Each family contains exactly five variants. Across the dataset, all six frozen perturbation labels occur: `original`, `paraphrase`, `negation`, `irrelevant_context`, `language_variant`, and `repeated_run`.
- The seven frozen coverage cells are represented, all four evidence states and five failure categories are covered, and both `esearch` and `esummary` stages occur.
- Fixtures describe deterministic Tool outcomes only. They contain no observed result, model output, medical gold answer, real article title, publication identifier, or live endpoint.
- Automatic contracts concern evidence state, failure category/stage, Tool control, query fidelity, grounding eligibility, and leakage. Epistemic and medical-content review remain separate human judgments.
- Variants that change language or add irrelevant context must preserve the family's evidence-state label. Negation tests interpretation and must not reverse the deterministic Tool fixture. Repeated-run variants are construction fixtures only; repetition counts and statistical methods remain unfrozen for the future pilot/power-analysis milestone.

## Family inventory

| Family      | Frozen coverage     | Evidence contract               | Stage    | Primary dimensions                            |
| ----------- | ------------------- | ------------------------------- | -------- | --------------------------------------------- |
| DEV-FAM-001 | COV-SUCCESS         | successful records              | esummary | citation grounding, query fidelity            |
| DEV-FAM-002 | COV-ZERO            | zero results                    | esearch  | retrieval outcomes, uncertainty/abstention    |
| DEV-FAM-003 | COV-PARSE-ESEARCH   | invalid response / parse error  | esearch  | response integrity, epistemic behaviour       |
| DEV-FAM-004 | COV-SCHEMA-ESUMMARY | invalid response / schema error | esummary | response integrity, language variation        |
| DEV-FAM-005 | COV-HTTP            | Tool failure / HTTP error       | esearch  | infrastructure failure, agent/tool control    |
| DEV-FAM-006 | COV-NETWORK         | Tool failure / network error    | esearch  | infrastructure failure, semantic perturbation |
| DEV-FAM-007 | COV-TIMEOUT         | Tool failure / timeout          | esummary | repetition, leakage, cross-model evaluation   |
| DEV-FAM-008 | supplemental        | successful records              | esummary | epistemic behaviour, citation grounding       |
| DEV-FAM-009 | supplemental        | zero results                    | esearch  | query fidelity, language variation            |
| DEV-FAM-010 | supplemental        | invalid response / schema error | esearch  | Tool control, uncertainty/abstention          |

## Evaluation boundary

Construction validation checks structure, enum membership, family inheritance, counts, coverage, deterministic labels, review separation, absence of held-out content, and absence of observed execution data. It does not score responses and cannot validate medical correctness. Sample size, repetition count, confidence intervals, statistical methods, and cross-model comparisons are deliberately not frozen here.

Validate without network access or repository writes:

```bash
npm run test:benchmark:development
node scripts/validate-reliability-benchmark-development.mjs --self-test
```

The development validator is independent of the frozen M2.11A validator. Both should pass. M2.11C planning is not a benchmark experiment or live Harness run. Held-out generation, development pilot execution (M2.11D), and formal evaluation are future milestones.
