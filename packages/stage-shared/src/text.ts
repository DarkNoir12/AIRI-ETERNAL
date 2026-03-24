/**
 * NOTICE: CJK characters tokenize roughly 1:1 (one char ≈ one token) while ASCII/Latin
 * text tokenizes at ~4 chars per token. Counts are summed separately so estimates remain
 * accurate for the multilingual (Japanese/Chinese/Korean) content this project targets.
 */
export function estimateTokens(text: string): number {
  const trimmed = text.trim()
  if (!trimmed)
    return 1

  let cjkCount = 0
  for (const char of trimmed) {
    const cp = char.codePointAt(0) ?? 0
    if (
      (cp >= 0x4E00 && cp <= 0x9FFF) // CJK Unified Ideographs
      || (cp >= 0x3400 && cp <= 0x4DBF) // CJK Ext-A
      || (cp >= 0x20000 && cp <= 0x2A6DF) // CJK Ext-B
      || (cp >= 0xF900 && cp <= 0xFAFF) // CJK Compatibility Ideographs
      || (cp >= 0x3000 && cp <= 0x303F) // CJK Symbols and Punctuation
      || (cp >= 0x3040 && cp <= 0x309F) // Hiragana
      || (cp >= 0x30A0 && cp <= 0x30FF) // Katakana
      || (cp >= 0xAC00 && cp <= 0xD7AF) // Hangul Syllables
    ) {
      cjkCount++
    }
  }

  const nonCjkCount = trimmed.length - cjkCount
  return Math.max(1, cjkCount + Math.ceil(nonCjkCount / 4))
}
