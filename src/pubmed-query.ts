export type GroundedConcept = {
  term: string;
  sourceText: string;
  sourceStart: number;
  sourceEnd: number;
  mapping: "literal" | "alias" | "translation";
};

export type PubMedQueryGuardResult = {
  executedQuery: string;
  modified: boolean;
  removedTerms: string[];
  forcedExactPmid: boolean;
  status: "validated" | "rejected" | "explicit_query" | "exact_pmid";
  groundedConcepts: GroundedConcept[];
  missingConcepts: string[];
  rejectedTerms: Array<{ term: string; reason: string }>;
  normalizations: Array<{ from: string; to: string }>;
  rejectionReason: string | null;
};

// A deliberately small, reviewable vocabulary. Unknown translations are blocked,
// not accepted on a model's assertion that they are equivalent to the source.
const aliases: Array<{ term: string; pattern: RegExp }> = [
  {
    term: "vitamin C",
    pattern: /^(?:vitamin\s+c|ascorbic\s+acid|维生素\s*[cＣ]|抗坏血酸)/iu
  },
  { term: "vitamin D", pattern: /^(?:vitamin\s+d|维生素\s*[dＤ])/iu },
  { term: "breast cancer", pattern: /^(?:breast\s+cancers?|乳腺癌)/iu },
  { term: "cancer", pattern: /^(?:cancers?|癌症)/iu },
  { term: "cure rate", pattern: /^(?:cure\s+rates?|治愈率)/iu },
  { term: "toxicity", pattern: /^(?:toxicity|毒性)/iu },
  { term: "safety", pattern: /^(?:safety|安全性)/iu },
  {
    term: "adverse effects",
    pattern: /^(?:adverse\s+effects?|side\s+effects?|不良反应|副作用)/iu
  },
  { term: "high dose", pattern: /^(?:high[ -]dose|高剂量)/iu },
  { term: "intravenous", pattern: /^(?:intravenous|静脉注射|静脉)/iu },
  { term: "oral", pattern: /^(?:oral|口服)/iu },
  { term: "adjuvant", pattern: /^(?:adjuvant|adjunctive|辅助)/iu },
  { term: "treatment", pattern: /^(?:treatments?|治疗)/iu },
  {
    term: "randomized controlled trial",
    pattern: /^(?:randomi[sz]ed\s+controlled\s+trials?|随机对照试验)/iu
  },
  {
    term: "randomized trial",
    pattern: /^(?:randomi[sz]ed\s+trials?|随机试验)/iu
  },
  { term: "clinical trial", pattern: /^(?:clinical\s+trials?|临床试验)/iu },
  {
    term: "systematic review",
    pattern: /^(?:systematic\s+reviews?|系统综述)/iu
  },
  { term: "meta-analysis", pattern: /^(?:meta[ -]analys(?:is|es)|荟萃分析)/iu },
  { term: "cohort study", pattern: /^(?:cohort\s+stud(?:y|ies)|队列研究)/iu },
  {
    term: "case-control study",
    pattern: /^(?:case[ -]control\s+stud(?:y|ies)|病例对照研究)/iu
  }
];

// Only request framing and function words belong here. Medical modifiers such as
// toxicity, outcomes, populations, doses and administration routes remain anchors.
const framingWords = new Set(
  `a an the is are was were be been being do does did can could would should
   may might will have has had there any some all that which what whether how
   of for in on at to from with about into and as by it its this these those
   i me my you your we our please find search look up retrieve show give list
   check include including pubmed evidence evidences paper papers study studies article articles
   literature record records research related relevant regarding concerning
   showing shows show supporting supports support prove proves proven proof
   cure cures cured eradicate eradicates eradicated compare versus vs`.split(
    /\s+/
  )
);
const chineseFraming =
  /^(?:请问|帮我|查找|搜索|检索|查询|关于|相关|研究|文献|论文|证据|患者|是否|可以|证明|治愈|所有|请|用|在|与|和|的|中|有|能|对)/u;

function maskNonSearchInstructions(text: string): string {
  // A conditional request to fabricate citations is an instruction about the
  // answer, not a biomedical restriction. Keep offsets into the original text.
  return text
    .replace(/\bas\s+an?\s+(?:outcome|endpoint)(?:\s+measure)?\b/gi, (match) =>
      " ".repeat(match.length)
    )
    .replace(
      /(?:^|[.!?]\s+)(?:if\b[^.!?]*\b(?:invent|fabricate|make up)\b[^.!?]*|(?:do not|never)\s+(?:invent|fabricate|make up)\b[^.!?]*)[.!?]?/gi,
      (match) => " ".repeat(match.length)
    )
    .replace(
      /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)(?=\s+(?:pubmed\s+)?(?:papers|studies|articles|records)\b)/gi,
      (match) => " ".repeat(match.length)
    );
}

function conceptsFrom(text: string): {
  concepts: GroundedConcept[];
  ignored: string[];
  untranslated: string[];
} {
  const concepts: GroundedConcept[] = [];
  const ignored: string[] = [];
  const untranslated: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    const rest = text.slice(offset);
    let alias: { term: string; sourceText: string } | undefined;
    for (const entry of aliases) {
      const match = rest.match(entry.pattern);
      if (!match) continue;
      const next = rest[match[0].length] ?? "";
      if (/[a-z0-9]$/i.test(match[0]) && /[a-z0-9]/i.test(next)) continue;
      if (!alias || match[0].length > alias.sourceText.length) {
        alias = { term: entry.term, sourceText: match[0] };
      }
    }
    if (alias) {
      concepts.push({
        ...alias,
        sourceStart: offset,
        sourceEnd: offset + alias.sourceText.length,
        mapping: /\p{Script=Han}/u.test(alias.sourceText)
          ? "translation"
          : alias.sourceText.toLowerCase() === alias.term.toLowerCase()
            ? "literal"
            : "alias"
      });
      offset += alias.sourceText.length;
      continue;
    }
    const chineseNoise = rest.match(chineseFraming)?.[0];
    if (chineseNoise) {
      ignored.push(chineseNoise);
      offset += chineseNoise.length;
      continue;
    }
    const word = rest.match(
      /^(?:\d+(?:\.\d+)?|[a-z][a-z0-9]*(?:[-'][a-z0-9]+)*)/i
    )?.[0];
    if (word) {
      if (framingWords.has(word.toLowerCase())) ignored.push(word);
      else
        concepts.push({
          term: word.toLowerCase(),
          sourceText: word,
          sourceStart: offset,
          sourceEnd: offset + word.length,
          mapping: "literal"
        });
      offset += word.length;
      continue;
    }
    if (/^\p{L}/u.test(rest))
      untranslated.push(String.fromCodePoint(rest.codePointAt(0)!));
    offset += String.fromCodePoint(rest.codePointAt(0)!).length;
  }
  return { concepts, ignored, untranslated };
}

function explicitQueryFrom(text: string): string | null {
  const match = text.match(
    /^\s*(?:(?:run|use|execute)\s+(?:this\s+)?(?:exact\s+)?(?:pubmed\s+)?query\s*[:：]|请?(?:使用|执行)(?:以下|这个)?(?:精确)?(?:PubMed)?查询\s*[:：])\s*([^\r\n]+?)\s*$/i
  );
  if (!match) return null;
  const query = match[1];
  return query.startsWith("`") && query.endsWith("`")
    ? query.slice(1, -1)
    : query;
}

function emptyResult(): PubMedQueryGuardResult {
  return {
    executedQuery: "",
    modified: false,
    removedTerms: [],
    forcedExactPmid: false,
    status: "rejected",
    groundedConcepts: [],
    missingConcepts: [],
    rejectedTerms: [],
    normalizations: [],
    rejectionReason: null
  };
}

export function guardPubMedQuery(
  proposedQuery: string,
  originalUserText: string
): PubMedQueryGuardResult {
  const result = emptyResult();
  const reject = (reason: string) => {
    result.rejectionReason = reason;
    result.modified = proposedQuery.trim() !== "";
    return result;
  };
  const explicitQuery = explicitQueryFrom(originalUserText);
  if (explicitQuery !== null) {
    if (explicitQuery.length < 2 || explicitQuery.length > 300)
      return reject("invalid_explicit_query_length");
    return {
      ...result,
      executedQuery: explicitQuery,
      modified: explicitQuery !== proposedQuery.trim(),
      status: "explicit_query"
    };
  }

  const sourceText = maskNonSearchInstructions(originalUserText);
  // Boolean/exclusion relationships require explicit query syntax; dropping a
  // negation or silently converting alternatives to AND would change intent.
  if (
    /\b(?:not|no|without|excluding|except|exclude|or|nor|neither|less than|more than)\b|\b[a-z]+n't\b|\b\d+\s*[-–]\s*\d+\b|不含|不包括|排除|或者|或|不是|并非|未|没有|[<>≤≥]/i.test(
      sourceText
    )
  ) {
    return reject("unsupported_query_relationship");
  }
  if (/[[\]{}"`+*/^=]/.test(sourceText))
    return reject("use_explicit_query_for_advanced_syntax");
  const source = conceptsFrom(sourceText);
  result.groundedConcepts = source.concepts;
  if (source.untranslated.length) return reject("unmapped_source_language");
  if (!source.concepts.length) return reject("no_source_topic");

  // Model-generated field tags, grouping and wildcards must not introduce
  // unrequested retrieval restrictions. Explicit user queries use the path above.
  if (/[[\]{}()"`*^:/<>≤≥]/.test(proposedQuery))
    return reject("unrequested_query_syntax");
  const proposal = conceptsFrom(proposedQuery);
  const allowed = new Set(
    source.concepts.map((concept) => concept.term.toLowerCase())
  );
  const retained = new Map<string, string>();
  for (const concept of proposal.concepts) {
    const key = concept.term.toLowerCase();
    if (!allowed.has(key)) {
      result.rejectedTerms.push({
        term: concept.sourceText,
        reason: "not_grounded_in_user_question"
      });
      continue;
    }
    retained.set(key, concept.term);
    if (concept.sourceText !== concept.term)
      result.normalizations.push({
        from: concept.sourceText,
        to: concept.term
      });
  }
  for (const term of [...proposal.ignored, ...proposal.untranslated]) {
    result.rejectedTerms.push({
      term,
      reason: "not_a_verified_search_concept"
    });
  }
  result.removedTerms = [
    ...new Set(result.rejectedTerms.map((item) => item.term))
  ];
  result.missingConcepts = [
    ...new Set(source.concepts.map((concept) => concept.term))
  ].filter((term) => !retained.has(term.toLowerCase()));
  if (result.missingConcepts.length) return reject("missing_source_concepts");
  const query = [...retained.values()].join(" ");
  if (query.length < 2 || query.length > 300)
    return reject("invalid_guarded_query_length");
  return {
    ...result,
    executedQuery: query,
    modified: query !== proposedQuery.trim(),
    status: "validated"
  };
}

// Used by the tool and tests so exact-PMID lookup cannot accidentally enter the
// natural-language guard. The identifier has already been extracted by routing.
export function preparePubMedQuery(
  proposedQuery: string | null,
  originalUserText: string,
  extractedPmid: string | null
): PubMedQueryGuardResult {
  if (extractedPmid !== null && /^[1-9]\d{0,7}$/.test(extractedPmid)) {
    const executedQuery = `${extractedPmid}[UID]`;
    return {
      ...emptyResult(),
      executedQuery,
      modified: proposedQuery !== executedQuery,
      forcedExactPmid: true,
      status: "exact_pmid"
    };
  }
  return guardPubMedQuery(proposedQuery ?? "", originalUserText);
}
