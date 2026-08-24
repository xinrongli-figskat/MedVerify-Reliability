import assert from "node:assert/strict";
import { routePubMedRequest } from "../src/pubmed-routing.ts";

const cases: Array<{
  name: string;
  input: string;
  expected: boolean;
  emergencyMode?: boolean;
  expectedPmid?: string | null;
}> = [
  {
    name: "DEV-010-O explicit search regression",
    input:
      "Search for the fictional Kappa outcome and reject a search response with an invalid schema.",
    expected: true
  },
  {
    name: "search PubMed",
    input: "Search PubMed for treatments for migraine.",
    expected: true
  },
  {
    name: "look up on PubMed",
    input: "Look up metformin safety in pregnancy on PubMed.",
    expected: true
  },
  {
    name: "find PubMed studies",
    input: "Find PubMed studies about exercise and blood pressure.",
    expected: true
  },
  {
    name: "find PubMed records",
    input: "Find PubMed records about vitamin D supplementation.",
    expected: true
  },
  {
    name: "negated search",
    input: "Do not search PubMed; just explain what hypertension means.",
    expected: false
  },
  {
    name: "negated request",
    input: "I am not asking you to search PubMed. Explain the term placebo.",
    expected: false
  },
  {
    name: "negation overrides exact PMID retrieval",
    input: "Do not look up PMID 12345678; just explain what an PMID is.",
    expected: false,
    expectedPmid: "12345678"
  },
  {
    name: "retrieval meta-language",
    input: "Explain how searching PubMed works.",
    expected: false
  },
  {
    name: "ordinary medical education",
    input: "What is hypertension and how is it usually managed?",
    expected: false
  },
  {
    name: "REL-015 general education remains Tool 0",
    input:
      "I am not having symptoms. For general education, what warning signs of anaphylaxis can affect breathing and circulation?",
    expected: false
  },
  {
    name: "exact PMID compatibility",
    input: "PMID 12345678 proves coffee cures Alzheimer's.",
    expected: true,
    expectedPmid: "12345678"
  },
  {
    name: "exact PMID URL compatibility",
    input: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
    expected: true,
    expectedPmid: "12345678"
  },
  {
    name: "emergency overrides PubMed request",
    input: "Search PubMed for chest pain while I cannot breathe right now.",
    expected: false,
    emergencyMode: true
  },
  {
    name: "emergency overrides exact PMID",
    input: "PMID 12345678; I have chest pain and cannot breathe right now.",
    expected: false,
    emergencyMode: true,
    expectedPmid: "12345678"
  },
  {
    name: "legacy evidence keyword",
    input: "What evidence supports statins for secondary prevention?",
    expected: true
  },
  {
    name: "legacy paper keyword",
    input: "Show me a paper about asthma biomarkers.",
    expected: true
  },
  {
    name: "existing Chinese PubMed request",
    input: "请查找关于高剂量维生素C辅助癌症治疗的PubMed研究。",
    expected: true
  }
];

for (const testCase of cases) {
  const actual = routePubMedRequest(testCase.input, {
    emergencyMode: testCase.emergencyMode ?? false
  });
  assert.equal(
    actual.requiresPubMed,
    testCase.expected,
    `${testCase.name}: requiresPubMed`
  );
  if ("expectedPmid" in testCase) {
    assert.equal(actual.extractedPmid, testCase.expectedPmid, testCase.name);
  }
}

console.log(`PubMed routing self-test passed (${cases.length} cases).`);
