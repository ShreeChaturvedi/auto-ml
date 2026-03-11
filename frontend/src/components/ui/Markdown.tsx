import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface MarkdownProps {
  children: string;
  className?: string;
  components?: Components;
}

/**
 * Shared Markdown renderer with remarkGfm + remarkMath + rehypeKatex configured.
 * Accepts an optional `components` prop to override or extend element renderers.
 */
export function Markdown({ children, className, components }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
