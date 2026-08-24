import assert from "node:assert/strict";
import type { UIMessageChunk } from "ai";
import { createPubMedFaultFetch } from "../src/pubmed-fault-injection.ts";
import {
  classifyPubMedRequestError,
  createPubMedFinalAnswerTransform,
  deterministicPubMedFinalAnswer,
  readPubMedOutcome,
  validatePubMedSearchPayload,
  validatePubMedSummaryPayload,
  type PubMedOutcome,
  type PubMedRecord
} from "../src/pubmed-outcomes.ts";

const record: PubMedRecord = {
  pmid: "12345678",
  title: "Deterministic fixture title",
  authors: [],
  journal: "Fixture journal",
  publicationDate: "1994",
  doi: null,
  pubmedUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/"
};

const successfulOutcome = {
  kind: "successful_records",
  recordsReturned: 1
} satisfies PubMedOutcome;
const zeroOutcome = {
  kind: "zero_results",
  totalFound: 0
} satisfies PubMedOutcome;
const invalidOutcome = {
  kind: "invalid_response",
  category: "schema_error",
  stage: "esearch"
} satisfies PubMedOutcome;
const failureOutcome = {
  kind: "tool_failure",
  category: "http_error",
  stage: "esearch",
  httpStatus: 429
} satisfies PubMedOutcome;

assert.equal(
  validatePubMedSearchPayload({
    esearchresult: { count: "0", idlist: [] }
  }).valid,
  true
);
assert.equal(validatePubMedSearchPayload({ unexpected: true }).valid, false);
assert.equal(
  validatePubMedSearchPayload({
    esearchresult: { count: "1", idlist: [] }
  }).valid,
  false
);

const validSummary = {
  result: {
    uids: ["12345678"],
    "12345678": {
      uid: "12345678",
      title: record.title,
      authors: [],
      articleids: []
    }
  }
};
assert.equal(
  validatePubMedSummaryPayload(validSummary, ["12345678"]).valid,
  true
);
assert.equal(
  validatePubMedSummaryPayload({ result: { uids: ["12345678"] } }, ["12345678"])
    .valid,
  false
);
assert.equal(
  validatePubMedSummaryPayload(
    {
      result: {
        uids: ["12345678"],
        "12345678": { uid: "87654321" }
      }
    },
    ["12345678"]
  ).valid,
  false
);

assert.deepEqual(
  readPubMedOutcome({ outcome: failureOutcome }),
  failureOutcome
);
assert.equal(readPubMedOutcome({ outcome: { kind: "unknown" } }), null);
assert.equal(
  classifyPubMedRequestError(new DOMException("timeout", "TimeoutError")),
  "timeout"
);
assert.equal(
  classifyPubMedRequestError(new TypeError("network")),
  "network_error"
);

const toolOutput = { records: [record] };
assert.match(
  deterministicPubMedFinalAnswer(
    { outcome: failureOutcome, toolOutput: null },
    "unsafe model text"
  ),
  /could not complete the PubMed search/
);
assert.match(
  deterministicPubMedFinalAnswer(
    { outcome: invalidOutcome, toolOutput: null },
    "unsafe model text"
  ),
  /response could not be validated/
);
assert.match(
  deterministicPubMedFinalAnswer(
    { outcome: zeroOutcome, toolOutput: null },
    "<tool_call>unsafe</tool_call>"
  ),
  /This search returned no PubMed records/
);
assert.equal(
  deterministicPubMedFinalAnswer(
    { outcome: successfulOutcome, toolOutput },
    "A safe final answer."
  ),
  "A safe final answer."
);
const leakageFallback = deterministicPubMedFinalAnswer(
  { outcome: successfulOutcome, toolOutput },
  "<tool_call>searchPubMed</tool_call>"
);
assert.match(leakageFallback, /PMID: 12345678/);
assert.doesNotMatch(leakageFallback, /<tool_call>/i);
const unsupportedCitationFallback = deterministicPubMedFinalAnswer(
  { outcome: successfulOutcome, toolOutput },
  "PMID: 87654321 supports the claim."
);
assert.match(unsupportedCitationFallback, /PMID: 12345678/);
assert.doesNotMatch(unsupportedCitationFallback, /87654321/);
assert.match(
  deterministicPubMedFinalAnswer(
    { outcome: successfulOutcome, toolOutput: { records: [] } },
    "A generated answer."
  ),
  /response could not be validated/
);

const guardedChunks = new ReadableStream({
  start(controller) {
    controller.enqueue({ type: "text-start", id: "text-1" } as const);
    controller.enqueue({
      type: "text-delta",
      id: "text-1",
      delta: "unsafe generated answer"
    } as const);
    controller.enqueue({ type: "text-end", id: "text-1" } as const);
    controller.close();
  }
}).pipeThrough(
  createPubMedFinalAnswerTransform(() => ({
    outcome: zeroOutcome,
    toolOutput: null
  }))
);
const outputChunks = [];
for await (const chunk of guardedChunks) outputChunks.push(chunk);
const guardedText = outputChunks
  .filter((chunk) => chunk.type === "text-delta")
  .map((chunk) => chunk.delta)
  .join("");
assert.equal(
  guardedText,
  "This search returned no PubMed records. This does not prove that no evidence exists in PubMed or the scientific literature."
);

let delayedContext: {
  outcome: PubMedOutcome;
  toolOutput: unknown;
} | null = null;
const preFinalTransform = createPubMedFinalAnswerTransform(
  () => delayedContext
);
const preFinalOutput: UIMessageChunk[] = [];
const collectPreFinalOutput = (async () => {
  for await (const chunk of preFinalTransform.readable) {
    preFinalOutput.push(chunk);
  }
})();
const preFinalWriter = preFinalTransform.writable.getWriter();
await preFinalWriter.write({ type: "text-start", id: "pre-final" });
await preFinalWriter.write({
  type: "text-delta",
  id: "pre-final",
  delta: "untrusted text before the Tool outcome"
});
await preFinalWriter.write({ type: "text-end", id: "pre-final" });
delayedContext = { outcome: failureOutcome, toolOutput: null };
await preFinalWriter.write({ type: "finish" });
await preFinalWriter.close();
await collectPreFinalOutput;
const preFinalText = preFinalOutput
  .filter((chunk) => chunk.type === "text-delta")
  .map((chunk) => chunk.delta)
  .join("");
assert.equal(
  preFinalText,
  "I could not complete the PubMed search. This failed retrieval cannot determine whether supporting evidence exists."
);
assert.doesNotMatch(preFinalText, /untrusted text/);

const esearchUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const esummaryUrl =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

assert.equal(
  (await createPubMedFaultFetch("http_429")(esearchUrl)).status,
  429
);
assert.equal(
  (await createPubMedFaultFetch("http_500")(esearchUrl)).status,
  500
);
await assert.rejects(
  createPubMedFaultFetch("network_error")(esearchUrl),
  (error) => classifyPubMedRequestError(error) === "network_error"
);
await assert.rejects(
  createPubMedFaultFetch("timeout")(esearchUrl),
  (error) => classifyPubMedRequestError(error) === "timeout"
);
await assert.rejects(
  (await createPubMedFaultFetch("esearch_malformed_json")(esearchUrl)).json()
);
assert.equal(
  validatePubMedSearchPayload(
    await (
      await createPubMedFaultFetch("esearch_invalid_schema")(esearchUrl)
    ).json()
  ).valid,
  false
);

for (const scenario of [
  "esummary_malformed_json",
  "esummary_invalid_schema",
  "success_exact_pmid"
] as const) {
  const searchPayload = await (
    await createPubMedFaultFetch(scenario)(esearchUrl)
  ).json();
  assert.equal(validatePubMedSearchPayload(searchPayload).valid, true);
}
await assert.rejects(
  (await createPubMedFaultFetch("esummary_malformed_json")(esummaryUrl)).json()
);
assert.equal(
  validatePubMedSummaryPayload(
    await (
      await createPubMedFaultFetch("esummary_invalid_schema")(esummaryUrl)
    ).json(),
    ["12345678"]
  ).valid,
  false
);
assert.equal(
  validatePubMedSearchPayload(
    await (await createPubMedFaultFetch("zero_results")(esearchUrl)).json()
  ).valid,
  true
);
assert.equal(
  validatePubMedSummaryPayload(
    await (
      await createPubMedFaultFetch("success_exact_pmid")(esummaryUrl)
    ).json(),
    ["12345678"]
  ).valid,
  true
);

console.log("PubMed outcome self-test passed; no network connection was used.");
