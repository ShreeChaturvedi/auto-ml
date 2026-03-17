/**
 * Shared utilities for PyPI package display
 */

/**
 * Clean up PyPI descriptions for rendering as markdown.
 * Converts RST to markdown and cleans up formatting.
 */
export function sanitizeDescription(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // Decode common HTML entities first
  cleaned = cleaned
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Remove inline HTML tags but preserve content
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Remove badge images (common in READMEs) - lines with multiple [![...](...)]
  cleaned = cleaned.replace(/^\[!\[.*?\]\(.*?\)\]\(.*?\)\s*$/gm, '');
  cleaned = cleaned.replace(/!\[.*?\]\(https:\/\/[^)]+\)/g, '');

  // Convert RST-style headers to markdown
  // Pattern: line of text followed by a line of only = or - chars
  const lines = cleaned.split('\n');
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];

    // Check if next line is RST underline
    if (nextLine && /^[=]{3,}$/.test(nextLine.trim())) {
      processedLines.push('# ' + line.trim());
      i++; // Skip the underline
    } else if (nextLine && /^[-]{3,}$/.test(nextLine.trim())) {
      processedLines.push('## ' + line.trim());
      i++; // Skip the underline
    } else if (/^[-]{3,}$/.test(line.trim()) || /^[=]{3,}$/.test(line.trim())) {
      // Skip standalone separator lines
      continue;
    } else {
      processedLines.push(line);
    }
  }

  cleaned = processedLines.join('\n');

  // Convert RST code blocks (:: at end of line followed by indented block)
  cleaned = cleaned.replace(/::\s*\n\n((?: {4}.+\n?)+)/g, (_, code) => {
    const unindented = code.split('\n').map((l: string) => l.replace(/^ {4}/, '')).join('\n');
    return '\n```\n' + unindented.trim() + '\n```\n';
  });

  // Convert RST inline literals ``code`` to markdown `code`
  cleaned = cleaned.replace(/``([^`]+)``/g, '`$1`');

  // Convert RST links `text <url>`_ to markdown [text](url)
  cleaned = cleaned.replace(/`([^<]+)\s*<([^>]+)>`_/g, '[$1]($2)');

  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  return cleaned;
}
