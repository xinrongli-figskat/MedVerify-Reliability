import type { UIMessageChunk } from "ai";
import { z } from "zod";

export type PubMedRetrievalStage = "preflight" | "esearch" | "esummary";

export type PubMedOutcome =
  | {
      kind: "successful_records";
      recordsReturned: number;
    }
  | {
      kind: "zero_results";
      totalFound: 0;
    }
  | {
      kind: "invalid_response";
      category: "parse_error" | "schema_error";
      stage: PubMedRetrievalStage;
    }
  | {
      kind: "tool_failure";
      category:
        | "http_error"
        | "network_error"
        | "timeout"
        | "configuration_error"
        | "query_guard_error"
        | "execution_error";
      stage: PubMedRetrievalStage;
      httpStatus?: number;
    };

export type PubMedRecord = {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  publicationDate: string;
  doi: string | null;
  pubmedUrl: string;
};

export type PubMedSearchPayload = {
  esearchresult: {
    count: string;
    idlist: string[];
    querytranslation?: string;
  };
};

export type PubMedSummaryRecord = {
  uid: string;
  pubdate?: string;
  source?: string;
  authors?: Array<{ name?: string }>;
  title?: string;
  fulljournalname?: string;
  articleids?: Array<{ idtype?: string; value?: string }>;
};

export type PubMedSummaryPayload = {
  result: {
    uids: string[];
    [pmid: string]: unknown;
  };
};

type ValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; issues: string[] };

const pmidSchema = z.string().regex(/^[1-9]\d{0,7}$/);
const nonnegativeIntegerStringSchema = z.string().regex(/^\d+$/);

const pubMedSearchResponseSchema = z
  .object({
    esearchresult: z
      .object({
        count: nonnegativeIntegerStringSchema,
        idlist: z.array(pmidSchema),
        querytranslation: z.string().optional()
      })
      .passthrough()
  })
  .passthrough();

const pubMedSummaryRecordSchema = z
  .object({
    uid: pmidSchema,
    pubdate: z.string().optional(),
    source: z.string().optional(),
    authors: z
      .array(
        z
          .object({
            name: z.string().optional()
          })
          .passthrough()
      )
      .optional(),
    title: z.string().optional(),
    fulljournalname: z.string().optional(),
    articleids: z
      .array(
        z
          .object({
            idtype: z.string().optional(),
            value: z.string().optional()
          })
          .passthrough()
      )
      .optional()
  })
  .passthrough();

const pubMedSummaryResponseSchema = z
  .object({
    result: z
      .object({
        uids: z.array(pmidSchema)
      })
      .catchall(z.unknown())
  })
  .passthrough();

const pubMedOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("successful_records"),
    recordsReturned: z.number().int().positive()
  }),
  z.object({
    kind: z.literal("zero_results"),
    totalFound: z.literal(0)
  }),
  z.object({
    kind: z.literal("invalid_response"),
    category: z.enum(["parse_error", "schema_error"]),
    stage: z.enum(["preflight", "esearch", "esummary"])
  }),
  z.object({
    kind: z.literal("tool_failure"),
    category: z.enum([
      "http_error",
      "network_error",
      "timeout",
      "configuration_error",
      "query_guard_error",
      "execution_error"
    ]),
    stage: z.enum(["preflight", "esearch", "esummary"]),
    httpStatus: z.number().int().min(100).max(599).optional()
  })
]);

function formatIssues(error: z.ZodError) {
  return error.issues.map((issue) =>
    [issue.path.join("."), issue.message].filter(Boolean).join(": ")
  );
}

export function validatePubMedSearchPayload(
  value: unknown
): ValidationResult<PubMedSearchPayload> {
  const parsed = pubMedSearchResponseSchema.safeParse(value);
  if (!parsed.success) {
    return { valid: false, issues: formatIssues(parsed.error) };
  }

  const { count, idlist } = parsed.data.esearchresult;
  const totalFound = Number(count);
  const uniqueIds = new Set(idlist);
  if (
    !Number.isSafeInteger(totalFound) ||
    totalFound < idlist.length ||
    (totalFound === 0) !== (idlist.length === 0) ||
    uniqueIds.size !== idlist.length
  ) {
    return {
      valid: false,
      issues: ["esearchresult count/idlist relationship is inconsistent"]
    };
  }

  return { valid: true, data: parsed.data };
}

export function validatePubMedSummaryPayload(
  value: unknown,
  requestedPmids: string[]
): ValidationResult<{
  payload: PubMedSummaryPayload;
  recordsByPmid: Record<string, PubMedSummaryRecord>;
}> {
  const envelope = pubMedSummaryResponseSchema.safeParse(value);
  if (!envelope.success) {
    return { valid: false, issues: formatIssues(envelope.error) };
  }

  const requested = new Set(requestedPmids);
  const returnedUids = envelope.data.result.uids;
  if (
    new Set(returnedUids).size !== returnedUids.length ||
    requestedPmids.some((pmid) => !returnedUids.includes(pmid))
  ) {
    return {
      valid: false,
      issues: ["ESummary uids do not cover the requested PMIDs"]
    };
  }

  const recordsByPmid: Record<string, PubMedSummaryRecord> = {};
  for (const pmid of requested) {
    const record = pubMedSummaryRecordSchema.safeParse(
      envelope.data.result[pmid]
    );
    if (!record.success || record.data.uid !== pmid) {
      return {
        valid: false,
        issues: [
          `ESummary record ${pmid} is missing, malformed, or has a mismatched uid`
        ]
      };
    }
    recordsByPmid[pmid] = record.data;
  }

  return {
    valid: true,
    data: {
      payload: envelope.data,
      recordsByPmid
    }
  };
}

export function readPubMedOutcome(value: unknown): PubMedOutcome | null {
  if (!value || typeof value !== "object") return null;
  const outcome = pubMedOutcomeSchema.safeParse(
    (value as { outcome?: unknown }).outcome
  );
  return outcome.success ? outcome.data : null;
}

export function classifyPubMedRequestError(
  error: unknown
): "network_error" | "timeout" {
  return error instanceof DOMException && error.name === "TimeoutError"
    ? "timeout"
    : "network_error";
}

export function buildPubMedFinalizationSystemPrompt(
  outcome: PubMedOutcome,
  successfulRetrievalPrompt: string
) {
  if (
    outcome.kind === "tool_failure" &&
    outcome.category === "query_guard_error"
  ) {
    return `You are MedVerify Agent V0.2. Query validation stopped retrieval before any PubMed request.
Do not call a Tool, emit Tool syntax, or claim PubMed returned zero records.
Return exactly this text and nothing else:
"I could not safely translate your question into a PubMed query, so no search was sent. Please clarify the topic and constraints, or provide a query using 'Use this exact PubMed query: ...'. This does not establish whether supporting evidence exists."`;
  }
  if (outcome.kind === "successful_records") {
    return `${successfulRetrievalPrompt}

FINALIZATION PHASE

PubMed returned validated bibliographic records. You do not have access to any
tools in this phase.

Do not request another Tool call or emit Tool syntax. Use only the validated
records already returned in this conversation. Copy identifiers exactly.
Do not mention a PMID, PMCID, DOI, title, author, or journal that is absent from
those records. Bibliographic metadata does not establish article-level support,
contradiction, efficacy, or safety.

Return only the user-facing answer, retrieved metadata, evidence status, and
reliability note.`;
  }

  if (outcome.kind === "zero_results") {
    return `You are MedVerify Agent V0.2 finalizing a completed PubMed search
that returned zero validated records.

Do not call or describe a Tool. Do not output Tool syntax, identifiers, titles,
citations, or a PubMed evidence list. Do not describe this as a network,
timeout, parsing, schema, or service failure. Do not make a database-wide or
scientific-literature-wide absence claim.

Return exactly these two sentences and nothing else:
"This search returned no PubMed records. This does not prove that no evidence
exists in PubMed or the scientific literature."`;
  }

  const invalidResponseClause =
    outcome.kind === "invalid_response"
      ? " because the response could not be validated"
      : "";
  return `You are MedVerify Agent V0.2 finalizing a PubMed retrieval that did
not produce validated evidence records.

Do not call or describe a Tool. Do not output Tool syntax, identifiers, titles,
citations, or a PubMed evidence list. Do not claim the search succeeded, and do
not infer that PubMed or the scientific literature contains no evidence.

Return exactly these two sentences and nothing else:
"I could not complete the PubMed search${invalidResponseClause}. This failed
retrieval cannot determine whether supporting evidence exists."`;
}

type FinalizationContext = {
  outcome: PubMedOutcome;
  toolOutput: unknown;
};

const TOOL_SYNTAX_PATTERN =
  /<\/?(?:tool_call|arg_key|arg_value)>|\b(?:tool_call|arg_key|arg_value)\b/i;

function hasUnsupportedCitationIdentifier(
  answer: string,
  records: PubMedRecord[]
) {
  const availablePmids = new Set(records.map((record) => record.pmid));
  const availableDois = new Set(
    records
      .map((record) => record.doi?.toLowerCase())
      .filter((doi): doi is string => Boolean(doi))
  );
  const citedPmids = [
    ...answer.matchAll(/\bPMID(?:\*\*)?\s*:?\s*(?:\*\*)?\s*([1-9]\d{4,7})\b/gi),
    ...answer.matchAll(
      /\bpubmed\.ncbi\.nlm\.nih\.gov\/([1-9]\d{4,7})(?:\/|\b)/gi
    )
  ].map((match) => match[1]);
  if (citedPmids.some((pmid) => !availablePmids.has(pmid))) return true;

  if (/\bPMC\d{5,8}\b/i.test(answer) || /\bPMCID\b/i.test(answer)) {
    return true;
  }

  const citedDois = [...answer.matchAll(/\b10\.\d{4,9}\/[^\s<>"']+/gi)].map(
    (match) => match[0].replace(/[.,;:!?)}\]]+$/g, "").toLowerCase()
  );
  return citedDois.some((doi) => !availableDois.has(doi));
}

export function deterministicPubMedFinalAnswer(
  context: FinalizationContext,
  generatedAnswer: string
) {
  const { outcome } = context;
  if (
    outcome.kind === "tool_failure" &&
    outcome.category === "query_guard_error"
  ) {
    return "I could not safely translate your question into a PubMed query, so no search was sent. Please clarify the topic and constraints, or provide a query using 'Use this exact PubMed query: ...'. This does not establish whether supporting evidence exists.";
  }
  if (outcome.kind === "zero_results") {
    return "This search returned no PubMed records. This does not prove that no evidence exists in PubMed or the scientific literature.";
  }
  if (outcome.kind === "invalid_response") {
    return "I could not complete the PubMed search because the response could not be validated. This failed retrieval cannot determine whether supporting evidence exists.";
  }
  if (outcome.kind === "tool_failure") {
    return "I could not complete the PubMed search. This failed retrieval cannot determine whether supporting evidence exists.";
  }

  const records = readPubMedRecords(context.toolOutput);
  if (records.length !== outcome.recordsReturned) {
    return "I could not complete the PubMed search because the response could not be validated. This failed retrieval cannot determine whether supporting evidence exists.";
  }
  const trimmedAnswer = generatedAnswer.trim();
  if (
    trimmedAnswer &&
    !TOOL_SYNTAX_PATTERN.test(trimmedAnswer) &&
    !hasUnsupportedCitationIdentifier(trimmedAnswer, records)
  ) {
    return trimmedAnswer;
  }

  const evidenceLines = records
    .map((record) => `- PMID: ${record.pmid}\n- Title: ${record.title}`)
    .join("\n");
  return `Answer:
The PubMed lookup returned validated bibliographic metadata. This response uses
only the validated records listed below.

Retrieved PubMed evidence:
${evidenceLines}

Evidence status:
The identifiers and titles above came from this retrieval. Metadata alone does
not verify an article's claims or conclusions.

Reliability note:
No abstract or full text was retrieved.`;
}

function readPubMedRecords(value: unknown): PubMedRecord[] {
  if (!value || typeof value !== "object") return [];
  const records = (value as { records?: unknown }).records;
  if (!Array.isArray(records)) return [];
  return records.filter((record): record is PubMedRecord => {
    if (!record || typeof record !== "object") return false;
    const candidate = record as Partial<PubMedRecord>;
    return (
      typeof candidate.pmid === "string" &&
      typeof candidate.title === "string" &&
      Array.isArray(candidate.authors) &&
      typeof candidate.journal === "string" &&
      typeof candidate.publicationDate === "string" &&
      (typeof candidate.doi === "string" || candidate.doi === null) &&
      typeof candidate.pubmedUrl === "string"
    );
  });
}

export function createPubMedFinalAnswerTransform(
  getContext: () => FinalizationContext | null
) {
  const buffers = new Map<
    string,
    { context: FinalizationContext | null; text: string }
  >();
  let finalAnswerEmitted = false;
  let streamFailed = false;

  const emitFallback = (controller: TransformStreamDefaultController) => {
    const context = getContext();
    if (finalAnswerEmitted || streamFailed || !context) return;
    const id = "pubmed-final-answer";
    controller.enqueue({ type: "text-start", id });
    controller.enqueue({
      type: "text-delta",
      id,
      delta: deterministicPubMedFinalAnswer(context, "")
    });
    controller.enqueue({ type: "text-end", id });
    finalAnswerEmitted = true;
  };

  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      if (chunk.type === "text-start") {
        const context = getContext();
        buffers.set(chunk.id, { context, text: "" });
        return;
      }

      if (chunk.type === "text-delta") {
        const buffer = buffers.get(chunk.id);
        if (buffer) {
          buffer.text += chunk.delta;
          return;
        }
        controller.enqueue(chunk);
        return;
      }

      if (chunk.type === "text-end") {
        const buffer = buffers.get(chunk.id);
        if (buffer) {
          if (buffer.context) {
            controller.enqueue({ type: "text-start", id: chunk.id });
            controller.enqueue({
              type: "text-delta",
              id: chunk.id,
              delta: deterministicPubMedFinalAnswer(buffer.context, buffer.text)
            });
            controller.enqueue(chunk);
            finalAnswerEmitted = true;
          }
          buffers.delete(chunk.id);
        }
        return;
      }

      if (chunk.type === "error" || chunk.type === "abort") {
        streamFailed = true;
      }
      if (chunk.type === "finish") emitFallback(controller);
      controller.enqueue(chunk);
    },
    flush(controller) {
      for (const [id, buffer] of buffers) {
        if (buffer.context) {
          controller.enqueue({ type: "text-start", id });
          controller.enqueue({
            type: "text-delta",
            id,
            delta: deterministicPubMedFinalAnswer(buffer.context, buffer.text)
          });
          controller.enqueue({ type: "text-end", id });
          finalAnswerEmitted = true;
        }
      }
      buffers.clear();
      emitFallback(controller);
    }
  });
}
