/**
 * Shared utility for downloading markdown content as a .md file.
 */
export function downloadMarkdownFile(name: string, content: string): void {
  const filename = `${name.replace(/\.md$/, '').replace(/\s+/g, '_')}.md`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
