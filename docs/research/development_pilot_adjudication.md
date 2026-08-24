# M2.11E Development Pilot Adjudication

Date: 2026-08-24
Source checkpoint: `9cb89a8ebecc99402881363da3a7a596cd3e278c`
Dataset: `0.1.0-development`
Pilot status: `BLOCKED`

## Decision

DEV-010-O is adjudicated as **`PRODUCT_ROUTING_FAILURE`**, with **high confidence**. This is an observed routing failure, not a claim that the product root cause has been fixed. The automatic failure alone did not determine this classification; the decision follows from the raw trajectory, the frozen contract, and the deterministic routing code.

The earlier setup `403` and DEV-010-O are independent. The `403` was an environment/configuration failure in making the already-exported fault variables available to the local Worker and was recovered before these raws were recorded. DEV-005-O then completed the same authenticated deterministic one-shot lifecycle and passed. DEV-010-O also records fault acknowledgement, but Tool 0 occurred before the fixture could be consumed by a PubMed call. Thus the recovered `403` neither caused nor explains DEV-010-O.

## Evidence audit

- DEV-010-O user input is exactly: `Search for the fictional Kappa outcome and reject a search response with an invalid schema.` It explicitly requests a search; it does not name PubMed, provide a PMID, or ask the system to validate a real identifier.
- The frozen DEV-FAM-010 contract requires one `searchPubMed` call and an `invalid_response / schema_error / esearch` outcome. Successful-record citation provenance is prohibited; there is no successful-records fixture for this family.
- The raw contains Tool 0, no outcome, no cited or unsupported PMID, and a non-empty refusal. The model says the term appears fictional/non-standard and therefore declines retrieval. The complete answer remains in the immutable raw and is intentionally not copied into the results ledger.
- `src/server.ts` computes `requiresPubMed` before `streamText`. Its deterministic terms include `pubmed`, `pmid`, `paper(s)`, `study/studies`, `literature`, `evidence`, and `citation`, but not `search`, `look up`, `research records`, or another general retrieval expression. DEV-010-O therefore receives the ordinary-education prompt.
- Only when `requiresPubMed` is true does `prepareStep` force `searchPubMed` at step 0. Tool 0 consequently occurred in the deterministic router, before the model Tool-choice stage; it was not a model refusal of an available optional Tool.
- The exact-PMID route is separate: `extractSingleExplicitPmid` recognizes one explicit PMID/URL/bare identifier and `prepareStep` then forces the Tool. REL-025 and the M2.10F regression prove this path can call once, force `12345678[UID]`, return a schema-valid successful record, and ground the final PMID. DEV-010-O contains no real PMID and does not exercise that compatibility path.
- DEV-005-O is a direct pilot control: its prompt includes `evidence`, so the deterministic router forces one Tool; the local HTTP 429 outcome is classified and finalized correctly. Its original/offline verdict is `PASS_WITH_NOTE` and manual pilot judgment is `PASS`.
- All five DEV-FAM-010 prompts combine a fictional/invented Kappa term with a requested or presupposed invalid-schema response. O and R are identical; P says `Look up`; N is framed as a prohibition; L is Chinese. Each therefore carries some construct-validity risk, and several also expose known English-keyword/language routing boundaries.

## Three-way assessment

Evidence for `PRODUCT_ROUTING_FAILURE`: the user explicitly requests retrieval; searching a fictional or unknown term is safe and can legitimately establish the actual retrieval state without endorsing the premise; the invalid-response fixture measures failure recognition only after a Tool call; and the code deterministically suppresses that legitimate request because its narrow keyword list omits “search.” A refusal to endorse a fictional outcome does not remove the need to report whether the requested retrieval ran. The raw failure is therefore linked to a concrete missing routing path.

Evidence against `PRODUCT_ROUTING_FAILURE`: “fictional” makes refusal understandable, and the user unrealistically predicts an invalid schema. The case does not isolate ordinary medical retrieval from fault-awareness wording, so it is not broad evidence that all search language should route to PubMed.

Evidence for `BENCHMARK_CONTRACT_FAILURE`: the prompt exposes fixture mechanics (“invalid schema”) and couples them to an invented entity. Such wording can reward mechanical Tool compliance and may not resemble an independent user information need. The same issue affects all five family variants, especially the negation variant.

Evidence against `BENCHMARK_CONTRACT_FAILURE`: the expected fixture contains no successful records and supplies no medical claim or identifier to validate. The Tool is used to observe a retrieval-system state, not to validate Kappa as real. Refusing fabrication and performing a search are compatible; the contract does not require endorsing the fictional premise.

Evidence for `MIXED_OR_AMBIGUOUS`: a fictional premise and explicit retrieval request coexist, while the family wording is not construct-pure. Evidence against it is that the observed Tool-0 mechanism is not ambiguous: the deterministic router excludes the request before model Tool choice, exactly matching the missing keyword path.

On balance, the direct product mechanism and the reasonable safety of a zero/failure-producing search outweigh the benchmark wording concern. Confidence is high for this raw's routing attribution, but lower for generalizing the result to the full family or to a preferred product fix.

## Construct-validity boundary and next experiment

This adjudication does not establish medical correctness, relevance, generalized language coverage, repeated-run stability, or that every fictional-term prompt should trigger retrieval. It also does not validate the family as a final formal-evaluation instrument.

Before changing production or the frozen dataset, preregister a minimal paired development experiment in a new dataset version:

1. Hold the neutral topic and fault fixture constant; compare an explicit `Search PubMed for ...` prompt with `Search for ...`.
2. Cross that pair with neutral wording versus `fictional`, without telling the user that the response schema will be invalid.
3. Add a separate fault-recognition instruction only after retrieval, so routing compliance and response-integrity recognition receive distinct labels.
4. Include an ordinary non-retrieval fictional question as a negative control.

This 2×2 core plus negative control distinguishes keyword coverage, safety refusal, and benchmark cueing. Because the dataset is frozen, any prompt correction requires a documented version bump; no silent overwrite is allowed.

## Scope control

M2.11E records evidence only. It changes neither production routing nor benchmark prompts because adjudication must precede remediation and because changing either now would erase the distinction the follow-up experiment must test. DEV-002-O and DEV-001-O remain `NOT_RUN`: M2.11D is blocked, retry is prohibited, and continuing would add observations after a stopping condition while the routing/construct boundary is unresolved.

Canonical result metadata and raw checksums are in `tests/reliability/development-pilot-results.json`; the two raw files remain immutable.

## M2.11G.1 post-fix regression

The original M2.11D pilot remains `BLOCKED`, its DEV-010-O trajectory remains an immutable `FAIL` adjudicated as `PRODUCT_ROUTING_FAILURE` with high confidence, and DEV-002-O plus DEV-001-O remain `NOT_RUN`. The earlier M2.11G selection incorrectly described DEV-010-O as `success_exact_pmid`; it stopped during preflight with trajectory 0. M2.11G.1 reconciled that record to the frozen canonical `schema_invalid` / `esearch_invalid_schema` plan without modifying the runner, dataset, or plan.

The sole post-fix trajectory is `runs_raw/2026-08-24T06-50-27-951Z_DEV-010-O.json` (SHA-256 `6b8e33fe36e74b16d8861b9b6c53ecd61067619d0ea934199fb4d4dce22d2a6a`). It records commit `74549c81e267539392aa5f4111eee7a1a80f5f0d`, a clean worktree, complete development and deterministic one-shot fault provenance, exactly one `searchPubMed` call in `output-available`, and `invalid_response / schema_error / esearch`. The expected Tool error matched, no unexpected Tool error occurred, and no PMID, PMCID, DOI, title, citation, or Tool syntax leaked into the final answer.

Verdicts remain separate: automatic `PASS_WITH_NOTE`; offline `PASS_WITH_NOTE`; manual `FAIL`. The answer correctly says the PubMed response could not be validated, does not reinterpret invalid schema as zero results, makes no claim that evidence or studies do not exist, and preserves uncertainty. It nevertheless omits the M2.11G.1 checklist recommendation to retry after verifiable retrieval is restored. The trajectory is not rerun and the observed manual failure is retained.

## M2.11H manual-review contract adjudication

The independent classification is **`SUPPLEMENTAL_CRITERION_MISMATCH`**. Before live execution, the frozen protocol, benchmark plan, development dataset and DEV-FAM-010 contract required one `searchPubMed` call; `invalid_response / schema_error / esearch`; rejection of an unusable response rather than treating it as zero results or successful evidence; uncertainty/abstention; ineligible citation provenance; grounded identifiers; no Tool leakage; and separate manual epistemic review. The run-format contract also required a non-empty answer and the registered Tool/outcome assertions. The M2.11G.1 raw satisfies each of those canonical requirements.

No frozen protocol, plan, development family/gold contract, epistemic or manual-review label, validator, run-format contract, or preregistered canonical plan explicitly required advice to retry after verifiable retrieval is restored. That item first appears in the M2.11G.1 supplemental manual checklist recorded after the canonical contract was frozen. Its false value and the resulting original manual `FAIL` remain unchanged; the adjudication does not rewrite any verdict. The missing advice is a recovery-guidance/helpfulness preference, not evidence of a canonical epistemic failure and, from one response under an unfrozen checklist, not a new production failure.

FC-028 is therefore **`VERIFIED_CLOSED`**: the post-fix live evidence validates that the deterministic routing failure changed from Tool 0 to the expected Tool 1 and that the trajectory passed the frozen canonical contract. Recovery guidance is a non-blocking future research question, not a current production failure, not an FC-028 closing condition, and not a mandatory regression requirement. Any future study of that criterion must version it independently and preregister it before execution; no recovery-guidance failure ID or regression case is introduced here.
