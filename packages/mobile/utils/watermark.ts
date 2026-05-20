/**
 * SIGIL Watermark System
 * Generates unique invisible signatures for registered content
 */

/**
 * Generate a watermark pattern from a SHA256 hash
 * Returns: "sigil_a3f2b891"
 */
export function generateWatermark(contentHash: string): string {
  const short = contentHash.slice(0, 8).toLowerCase();
  return `sigil_${short}`;
}

/**
 * Embed watermark into code/text content
 * Code: adds hidden comment // @sigil:a3f2b891
 * Text: inserts zero-width characters at word boundaries
 */
export function embedWatermark(content: string, watermark: string): string {
  const pattern = watermark.replace('sigil_', '');
  
  // Detect if it looks like code
  const isCode = /[{};=>]/.test(content) || content.includes('function') || content.includes('import');
  
  if (isCode) {
    return `// @sigil:${pattern}\n${content}`;
  } else {
    // Insert zero-width joiner (U+200D) after first word as invisible marker
    const marker = '\u200D'.repeat(parseInt(pattern.slice(0, 2), 16) % 5 + 1);
    const firstSpace = content.indexOf(' ');
    if (firstSpace > -1) {
      return content.slice(0, firstSpace) + marker + content.slice(firstSpace);
    }
    return content + marker;
  }
}

/**
 * Extract watermark pattern from content (for verification)
 */
export function extractWatermark(content: string): string | null {
  // Check for code watermark
  const codeMatch = content.match(/@sigil:([a-f0-9]{8})/);
  if (codeMatch) return `sigil_${codeMatch[1]}`;
  
  // Check for zero-width characters
  if (content.includes('\u200D')) return 'sigil_detected';
  
  return null;
}

/**
 * Generate watermark search query for scanner
 */
export function getSearchQuery(watermark: string): string {
  return watermark; // "sigil_a3f2b891" is the search term
}
