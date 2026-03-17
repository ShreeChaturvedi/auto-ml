/**
 * PackageBrowser - Renders the long-form markdown description of a PyPI package
 * inside the PackageDialog, with compact styling overrides.
 */

import { Loader2 } from 'lucide-react';
import { Markdown } from '@/components/ui/Markdown';

export interface PackageBrowserProps {
  loadingDetails: boolean;
  description: string;
}

export function PackageBrowser({ loadingDetails, description }: PackageBrowserProps) {
  if (loadingDetails) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading package details...
      </div>
    );
  }

  if (!description) {
    return null;
  }

  return (
    <div className="text-sm text-foreground max-h-[250px] overflow-y-auto border-t pt-3">
      <Markdown
        components={{
          // Remove badges/images that won't render well
          img: () => null,
          // Compact headings
          h1: ({ children }) => <h3 className="text-base font-semibold mt-4 mb-2 first:mt-0">{children}</h3>,
          h2: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-1.5">{children}</h4>,
          h3: ({ children }) => <h5 className="text-sm font-medium mt-2 mb-1">{children}</h5>,
          // Compact paragraphs
          p: ({ children }) => <p className="text-sm text-muted-foreground mb-2 last:mb-0 leading-relaxed">{children}</p>,
          // Compact lists
          ul: ({ children }) => <ul className="list-disc pl-4 text-sm text-muted-foreground mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 text-sm text-muted-foreground mb-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="text-sm">{children}</li>,
          // Styled code
          code: ({ className, children }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return (
                <pre className="bg-zinc-900 dark:bg-zinc-950 text-zinc-100 p-2 rounded text-xs font-mono overflow-x-auto my-2">
                  <code>{children}</code>
                </pre>
              );
            }
            return (
              <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                {children}
              </code>
            );
          },
          // Styled links
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              {children}
            </a>
          ),
          // Horizontal rules
          hr: () => <hr className="my-2 border-border" />
        }}
      >
        {description.length > 2500
          ? description.slice(0, 2500) + '\n\n...'
          : description}
      </Markdown>
    </div>
  );
}
