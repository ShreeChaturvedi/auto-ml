import { Download, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PdfViewerProps {
  url: string;
  fileName?: string;
  className?: string;
}

export default function PdfViewer({ url, fileName, className }: PdfViewerProps) {
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName ?? 'document.pdf';
    link.rel = 'noopener';
    link.click();
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex h-12 shrink-0 items-center justify-end gap-1 border-b bg-background px-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleDownload}
          aria-label="Download PDF"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          aria-label="Open PDF in new tab"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 bg-muted/20">
        <iframe
          key={url}
          src={url}
          title={fileName ?? 'PDF preview'}
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}
