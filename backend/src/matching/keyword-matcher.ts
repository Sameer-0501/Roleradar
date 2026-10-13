/**
 * Keyword Matcher.
 *
 * Evaluates optional user keywords against verified job content.
 * Keywords act as an additional filter and cannot bypass core role, location,
 * experience, or company criteria.
 */

import type { KeywordMatchResult } from './matching-types.js';

export function matchKeywords(
  title: string,
  description: string | null | undefined,
  requirements: string | null | undefined,
  userKeywords: string[]
): KeywordMatchResult {
  if (!userKeywords || userKeywords.length === 0) {
    return {
      matched: true,
      matchedKeywords: [],
      reason: 'No custom keywords configured (filter passed)',
    };
  }

  const combinedText = `${title}\n${description || ''}\n${requirements || ''}`.toLowerCase();
  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];

  for (const kw of userKeywords) {
    const cleaned = kw.trim().toLowerCase();
    if (!cleaned) continue;

    if (combinedText.includes(cleaned)) {
      matchedKeywords.push(kw);
    } else {
      missingKeywords.push(kw);
    }
  }

  if (missingKeywords.length > 0) {
    return {
      matched: false,
      matchedKeywords,
      reason: `Missing required keywords: ${missingKeywords.join(', ')}`,
    };
  }

  return {
    matched: true,
    matchedKeywords,
    reason: `All keywords matched: ${matchedKeywords.join(', ')}`,
  };
}
