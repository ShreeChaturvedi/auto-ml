import { downloadBlob } from '@/lib/utils';

/** Download markdown content as a .md file. */
export function downloadMarkdownFile(name: string, content: string): void {
  const filename = `${name.replace(/\.md$/, '').replace(/\s+/g, '_')}.md`;
  downloadBlob(new Blob([content], { type: 'text/markdown;charset=utf-8;' }), filename);
}
