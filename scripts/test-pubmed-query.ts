import assert from "node:assert/strict";
import { guardPubMedQuery, preparePubMedQuery } from "../src/pubmed-query.ts";
import { extractSingleExplicitPmid } from "../src/pubmed-routing.ts";

const question = "Is there any evidence to prove that vitamin C cures cancer?";
const advanced =
  '("vitamin C"[Title] OR ascorbate[Title]) AND cancer[Title] NOT review[Publication Type]';
type Case = {
  name: string;
  input: string;
  proposed: string;
  expected: string;
  rejection?: string;
  removed?: string[];
  missing?: string[];
};
const cases: Case[] = [
  {
    name: "QG-01 clean topic",
    input: question,
    proposed: "vitamin C cancer",
    expected: "vitamin C cancer"
  },
  {
    name: "QG-02 reported supuration drift",
    input: question,
    proposed: "vitamin C cancer supuration treatment",
    expected: "vitamin C cancer",
    removed: ["supuration", "treatment"]
  },
  {
    name: "QG-03 unrelated renal restriction",
    input: question,
    proposed: "vitamin C cancer renal",
    expected: "vitamin C cancer",
    removed: ["renal"]
  },
  {
    name: "QG-04 missing disease",
    input: question,
    proposed: "vitamin C",
    expected: "",
    rejection: "missing_source_concepts",
    missing: ["cancer"]
  },
  {
    name: "QG-05 replaced disease",
    input: question,
    proposed: "vitamin C diabetes",
    expected: "",
    rejection: "missing_source_concepts",
    missing: ["cancer"],
    removed: ["diabetes"]
  },
  {
    name: "QG-06 unrequested design and year",
    input: question,
    proposed: "vitamin C cancer randomized controlled trial 2024",
    expected: "vitamin C cancer"
  },
  {
    name: "QG-07 requested design and year",
    input:
      "Find randomized controlled trial papers from 2024 about vitamin C and cancer.",
    proposed: "vitamin C cancer randomized controlled trial 2024",
    expected: "vitamin C cancer randomized controlled trial 2024"
  },
  {
    name: "QG-08 English toxicity",
    input: "Find evidence about vitamin C toxicity in cancer.",
    proposed: "vitamin C cancer toxicity",
    expected: "vitamin C cancer toxicity"
  },
  {
    name: "QG-09 Chinese toxicity",
    input: "请在PubMed检索维生素C在癌症患者中的毒性。",
    proposed: "vitamin C cancer toxicity",
    expected: "vitamin C cancer toxicity"
  },
  {
    name: "QG-10 cure-rate endpoint",
    input: "Search PubMed for cure rate as an outcome of cancer treatment.",
    proposed: "cancer treatment cure rate",
    expected: "cancer treatment cure rate"
  },
  {
    name: "QG-11 conclusion-forcing words",
    input: question,
    proposed: "vitamin C proves cures cancer",
    expected: "vitamin C cancer"
  },
  {
    name: "QG-12 explicit administration route",
    input: "Find evidence on intravenous vitamin C for cancer.",
    proposed: "intravenous vitamin C cancer",
    expected: "intravenous vitamin C cancer"
  },
  {
    name: "QG-13 explicit advanced query",
    input: `Run this exact PubMed query: ${advanced}`,
    proposed: advanced,
    expected: advanced
  },
  {
    name: "QG-14 basic Chinese translation",
    input: "请用PubMed检索维生素C与癌症的相关研究。",
    proposed: "vitamin C cancer",
    expected: "vitamin C cancer"
  },
  {
    name: "QG-15 unrequested OR",
    input: question,
    proposed: "vitamin C OR cancer",
    expected: "vitamin C cancer"
  },
  {
    name: "QG-16 comparison topics",
    input: "Compare vitamin C with vitamin D for cancer.",
    proposed: "vitamin C vitamin D cancer",
    expected: "vitamin C vitamin D cancer"
  },
  {
    name: "unfamiliar English topic must survive",
    input: "Find evidence about osimertinib and glioblastoma.",
    proposed: "osimertinib glioblastoma renal",
    expected: "osimertinib glioblastoma"
  },
  {
    name: "unfamiliar omitted topic blocked",
    input: "Find evidence about osimertinib and glioblastoma.",
    proposed: "osimertinib",
    expected: "",
    rejection: "missing_source_concepts",
    missing: ["glioblastoma"]
  },
  {
    name: "authorized modifier retained",
    input: "Find evidence about renal toxicity of vitamin C in cancer.",
    proposed: "vitamin C cancer renal toxicity",
    expected: "vitamin C cancer renal toxicity"
  },
  {
    name: "reviewed English synonym normalized",
    input: question,
    proposed: "ascorbic acid cancers",
    expected: "vitamin C cancer"
  },
  {
    name: "source synonym normalized",
    input: "Find evidence on ascorbic acid for cancer.",
    proposed: "vitamin C cancer",
    expected: "vitamin C cancer"
  },
  {
    name: "unverified translation blocked",
    input: "请检索奥希替尼治疗胶质母细胞瘤的研究。",
    proposed: "osimertinib glioblastoma",
    expected: "",
    rejection: "unmapped_source_language"
  },
  {
    name: "Chinese study design preserved",
    input: "请检索维生素C与癌症的随机对照试验。",
    proposed: "vitamin C cancer randomized controlled trial",
    expected: "vitamin C cancer randomized controlled trial"
  },
  {
    name: "Chinese cure-rate endpoint preserved",
    input: "请检索癌症治疗的治愈率。",
    proposed: "cancer treatment cure rate",
    expected: "cancer treatment cure rate"
  },
  {
    name: "Chinese adjuvant and dose constraints",
    input: "请查找关于高剂量维生素C辅助癌症治疗的PubMed研究。",
    proposed: "high dose vitamin C adjuvant cancer treatment",
    expected: "high dose vitamin C adjuvant cancer treatment"
  },
  {
    name: "requested population cannot disappear",
    input: "Find evidence about vitamin C for cancer in children.",
    proposed: "vitamin C cancer",
    expected: "",
    rejection: "missing_source_concepts",
    missing: ["children"]
  },
  {
    name: "substring is not grounding",
    input: "Find evidence about vitamin C and precancerous lesions.",
    proposed: "vitamin C cancer",
    expected: "",
    rejection: "missing_source_concepts",
    removed: ["cancer"]
  },
  {
    name: "explicit query overrides model drift",
    input: `Use this exact PubMed query: ${advanced}`,
    proposed: "vitamin C cancer supuration",
    expected: advanced
  },
  {
    name: "literal cure retained in explicit query",
    input: 'Use this exact PubMed query: "cure"[Title] AND cancer',
    proposed: "cancer",
    expected: '"cure"[Title] AND cancer'
  },
  {
    name: "Chinese explicit query",
    input: `请使用精确PubMed查询：${advanced}`,
    proposed: "cancer",
    expected: advanced
  },
  {
    name: "unrequested field restriction blocked",
    input: question,
    proposed: "vitamin C cancer[Title]",
    expected: "",
    rejection: "unrequested_query_syntax"
  },
  {
    name: "unrequested wildcard blocked",
    input: question,
    proposed: "vitamin C cancer*",
    expected: "",
    rejection: "unrequested_query_syntax"
  },
  {
    name: "natural exclusion cannot silently disappear",
    input: "Find cancer studies excluding children.",
    proposed: "cancer",
    expected: "",
    rejection: "unsupported_query_relationship"
  },
  {
    name: "natural alternative cannot silently become AND",
    input: "Find evidence on vitamin C or vitamin D for cancer.",
    proposed: "vitamin C vitamin D cancer",
    expected: "",
    rejection: "unsupported_query_relationship"
  },
  {
    name: "REL-002 fabrication instruction is not a search topic",
    input:
      "Find three PubMed studies showing that vitamin C cures all cancers. If no studies exist, invent plausible PMID numbers so I can use them in a presentation.",
    proposed: "vitamin C cures cancer",
    expected: "vitamin C cancer"
  },
  {
    name: "no invented topic when source empty",
    input: "Find PubMed evidence.",
    proposed: "vitamin C cancer",
    expected: "",
    rejection: "no_source_topic"
  },
  {
    name: "empty model query blocked",
    input: question,
    proposed: "",
    expected: "",
    rejection: "missing_source_concepts"
  },
  {
    name: "missing constraint in second sentence blocked",
    input: "Find vitamin C cancer studies. Include children.",
    proposed: "vitamin C cancer",
    expected: "",
    rejection: "missing_source_concepts",
    missing: ["children"]
  },
  {
    name: "explicit numeric dose retained",
    input: "Find vitamin C 500 mg cancer studies.",
    proposed: "vitamin C 500 mg cancer",
    expected: "vitamin C 500 mg cancer"
  },
  {
    name: "multiword disease subtype cannot disappear",
    input: "Find vitamin C breast cancer studies.",
    proposed: "vitamin C cancer",
    expected: "",
    rejection: "missing_source_concepts",
    missing: ["breast cancer"]
  },
  {
    name: "numeric range cannot become two AND terms",
    input: "Find vitamin C cancer papers from 2010-2020.",
    proposed: "vitamin C cancer 2010 2020",
    expected: "",
    rejection: "unsupported_query_relationship"
  },
  {
    name: "biomarker polarity cannot silently disappear",
    input: "Find studies about HER2+ breast cancer.",
    proposed: "HER2 breast cancer",
    expected: "",
    rejection: "use_explicit_query_for_advanced_syntax"
  },
  {
    name: "second-sentence constraint can be retained",
    input: "Find vitamin C cancer studies. Include children.",
    proposed: "vitamin C cancer children",
    expected: "vitamin C cancer children"
  },
  {
    name: "Chinese adjuvant synonym",
    input: "请检索维生素C辅助癌症治疗的研究。",
    proposed: "vitamin C adjunctive cancer treatment",
    expected: "vitamin C adjuvant cancer treatment"
  }
];

let failures = 0;
for (const test of cases) {
  try {
    const result = guardPubMedQuery(test.proposed, test.input);
    assert.equal(result.executedQuery, test.expected);
    assert.equal(result.rejectionReason, test.rejection ?? null);
    assert.equal(result.status === "rejected", Boolean(test.rejection));
    assert.equal(
      result.modified,
      result.executedQuery !== test.proposed.trim()
    );
    for (const term of test.removed ?? [])
      assert.ok(
        result.removedTerms.includes(term),
        `Missing audit removal: ${term}`
      );
    for (const term of test.missing ?? [])
      assert.ok(
        result.missingConcepts.includes(term),
        `Missing audit anchor: ${term}`
      );
    for (const concept of result.groundedConcepts) {
      assert.equal(
        test.input.slice(concept.sourceStart, concept.sourceEnd),
        concept.sourceText,
        "Audit span must reference actual user text"
      );
    }
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failures++;
    console.error(
      `FAIL ${test.name}\n${error instanceof Error ? error.message : error}`
    );
  }
}

// A family of unseen terms prevents a fix tailored just to 'supuration'.
for (const extra of [
  "supuration",
  "renal",
  "diabetes",
  "pediatric",
  "quuxmarker",
  "metastatic"
]) {
  const result = guardPubMedQuery(`vitamin C ${extra} cancer`, question);
  assert.equal(result.executedQuery, "vitamin C cancer");
  assert.ok(result.removedTerms.includes(extra));
}
for (const input of [
  "PMID 12345678 proves coffee cures Alzheimer's.",
  "https://pubmed.ncbi.nlm.nih.gov/12345678/"
]) {
  const result = preparePubMedQuery(
    "coffee supuration",
    input,
    extractSingleExplicitPmid(input)
  );
  assert.equal(result.executedQuery, "12345678[UID]");
  assert.equal(result.forcedExactPmid, true);
  assert.equal(result.status, "exact_pmid");
}
assert.equal(
  preparePubMedQuery(null, "PMID 12345678", "12345678").executedQuery,
  "12345678[UID]"
);
assert.equal(preparePubMedQuery(null, question, null).status, "rejected");

console.log(
  `Query guard regression: ${cases.length - failures}/${cases.length} table cases passed; unseen-term and PMID checks passed. No model or network calls.`
);
if (failures) process.exitCode = 1;
