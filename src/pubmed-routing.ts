export type PubMedRoute = {
  requiresPubMed: boolean;
  extractedPmid: string | null;
};

export function extractSingleExplicitPmid(userText: string): string | null {
  const candidates = new Set<string>();

  for (const match of userText.matchAll(/\bPMID\s*:?\s*([1-9]\d{0,7})\b/gi)) {
    candidates.add(match[1]);
  }

  for (const match of userText.matchAll(
    /pubmed\.ncbi\.nlm\.nih\.gov\/([1-9]\d{0,7})(?:[/?#]|$)/gi
  )) {
    candidates.add(match[1]);
  }

  const trimmedText = userText.trim();
  if (/^[1-9]\d{4,7}$/.test(trimmedText)) {
    candidates.add(trimmedText);
  }

  return candidates.size === 1 ? [...candidates][0] : null;
}

export function routePubMedRequest(
  userText: string,
  options: { emergencyMode: boolean }
): PubMedRoute {
  const extractedPmid = extractSingleExplicitPmid(userText);
  if (options.emergencyMode) {
    return { requiresPubMed: false, extractedPmid };
  }

  const normalizedText = userText
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  const negatesRetrieval =
    /\b(?:do not|don't|dont|please don't|please do not|not asking (?:you )?to|am not asking (?:you )?to|isn't asking (?:you )?to|without)\s+(?:search(?:ing)?|look(?:ing)? up|find(?:ing)?|retrieve|retrieving|check(?:ing)?)\b[^.!?]{0,80}\b(?:pubmed|pmid|papers?|stud(?:y|ies)|literature|evidence|citations?|records?)\b/.test(
      normalizedText
    );
  if (negatesRetrieval) {
    return { requiresPubMed: false, extractedPmid };
  }

  if (extractedPmid !== null) {
    return { requiresPubMed: true, extractedPmid };
  }

  const discussesRetrieval =
    /\b(?:explain|describe|discuss|teach me|tell me|what (?:does|is)|how (?:does|do|can|should)|an explanation of)\b[^.!?]{0,80}\b(?:search(?:ing)?|look(?:ing)? up|find(?:ing)?)\b[^.!?]{0,50}\bpubmed\b/.test(
      normalizedText
    ) ||
    /\b(?:searching|looking up)\s+pubmed\s+(?:works?|is done|as a process)\b/.test(
      normalizedText
    );
  if (discussesRetrieval) {
    return { requiresPubMed: false, extractedPmid };
  }

  const directRetrievalRequest =
    /^(?:please\s+)?(?:search(?:\s+pubmed)?\s+for|look\s+up)\b/.test(
      normalizedText
    ) ||
    /\b(?:search|look up|check)\b[^.!?]{0,80}\b(?:on|in|using)\s+pubmed\b/.test(
      normalizedText
    ) ||
    /\bfind\s+(?:me\s+)?(?:pubmed\s+)?(?:studies|articles|records|papers|literature|evidence|citations?)\b/.test(
      normalizedText
    ) ||
    /(?:查找|搜索|检索)[^。！？]{0,50}pubmed(?:[^。！？]{0,30}(?:研究|文献|论文|记录))?/i.test(
      normalizedText
    );

  const legacyRetrievalSignal =
    /\b(?:pubmed|pmid|papers?|stud(?:y|ies)|literature|evidence|citations?)\b/.test(
      normalizedText
    );

  return {
    requiresPubMed: directRetrievalRequest || legacyRetrievalSignal,
    extractedPmid
  };
}
