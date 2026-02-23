import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';
import type { AnswerCitation } from '@/lib/api/documents';

interface CitationCardProps {
  citation: AnswerCitation;
}

export function CitationCard({ citation }: CitationCardProps) {
  return (
    <Card className="text-xs">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <CardTitle className="text-sm font-medium truncate">{citation.filename}</CardTitle>
          <Badge variant="secondary">
            Span {citation.span.start}-{citation.span.end}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground line-clamp-4">
          Span location within the source document.
        </p>
      </CardContent>
    </Card>
  );
}
