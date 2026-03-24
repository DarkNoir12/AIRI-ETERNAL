/**
 * Formats a token count into a shorthand string (e.g. 1.2K, 44.5K, 1.1M).
 * Rounds to 1 decimal point.
 */
export function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`
  }
  return count.toString()
}
