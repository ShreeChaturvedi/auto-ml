/**
 * DocsPage - Renders README.md on a standalone page
 *
 * Standalone full-page layout (no sidebar) with sticky header,
 * theme toggle, and Markdown rendering with GitHub-flavored extensions.
 */

import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { useTheme } from '@/components/theme-provider';
import readmeContent from '../../../../README.md?raw';

function getEffectiveTheme(theme: string): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme as 'light' | 'dark';
}

export function DocsPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const effectiveTheme = getEffectiveTheme(theme);

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-10">
        <article className="prose prose-neutral dark:prose-invert max-w-none prose-headings:scroll-mt-20 prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:leading-7 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:border prose-img:rounded-md prose-hr:border-border">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              img: ({ src, alt, ...props }) => {
                if (!src) return null;

                // Handle GitHub theme-specific image fragments
                if (src.includes('#gh-light-mode-only')) {
                  if (effectiveTheme !== 'light') return null;
                }
                if (src.includes('#gh-dark-mode-only')) {
                  if (effectiveTheme !== 'dark') return null;
                }

                // Map docs/branding/ paths to /branding/ (served from public/)
                let resolvedSrc = src;
                if (src.includes('docs/branding/')) {
                  resolvedSrc = src.replace(/docs\/branding\//, '/branding/');
                }
                // Strip query params and fragments from local paths
                if (resolvedSrc.startsWith('/branding/')) {
                  resolvedSrc = resolvedSrc.replace(/\?[^#]*/, '').replace(/#.*$/, '');
                }

                return <img src={resolvedSrc} alt={alt} {...props} />;
              },
            }}
          >
            {readmeContent}
          </ReactMarkdown>
        </article>
      </main>
    </div>
  );
}
