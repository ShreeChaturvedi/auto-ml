import { useCallback, useRef, useState } from 'react';
import { BookOpen, FileText, Loader2, MessageSquare, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getAnswer, type AnswerResponse } from '@/lib/api/documents';

interface QAEntry {
  id: string;
  question: string;
  answer: AnswerResponse['answer'] | null;
  loading: boolean;
  error: string | null;
}

interface DocumentQAPanelProps {
  projectId: string | undefined;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function DocumentQAPanel({ projectId, collapsed, onCollapsedChange }: DocumentQAPanelProps) {
  const [entries, setEntries] = useState<QAEntry[]>([]);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleAsk = useCallback(async () => {
    const question = input.trim();
    if (!question || !projectId) return;

    const id = crypto.randomUUID();
    const entry: QAEntry = { id, question, answer: null, loading: true, error: null };
    setEntries((prev) => [...prev, entry]);
    setInput('');

    try {
      const response = await getAnswer(projectId, question, 5);
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, answer: response.answer, loading: false } : e))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get answer';
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, error: message, loading: false } : e))
      );
    }

    // Scroll to bottom after render
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, [input, projectId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleAsk();
      }
    },
    [handleAsk]
  );

  if (collapsed) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-l bg-card pt-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onCollapsedChange(false)}
          title="Open Document Q&A"
        >
          <BookOpen className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col border-l bg-card">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Document Q&A</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onCollapsedChange(true)}
          title="Collapse"
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3 py-2" ref={scrollRef}>
        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <BookOpen className="h-8 w-8 opacity-40" />
            <p className="text-sm">Ask questions about your uploaded documents.</p>
            <p className="text-xs">Answers are generated using semantic search and AI.</p>
          </div>
        )}
        <div className="space-y-4">
          {entries.map((entry) => (
            <div key={entry.id} className="space-y-2">
              {/* Question */}
              <div className="flex gap-2">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm font-medium">{entry.question}</p>
              </div>

              {/* Answer */}
              {entry.loading && (
                <div className="flex items-center gap-2 pl-6 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching documents...
                </div>
              )}
              {entry.error && (
                <div className="pl-6 text-sm text-destructive">{entry.error}</div>
              )}
              {entry.answer && (
                <div className="space-y-2 pl-6">
                  <p className="text-sm whitespace-pre-wrap">{entry.answer.answer}</p>
                  {entry.answer.citations.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Sources:</p>
                      {entry.answer.citations.map((cite, i) => (
                        <div
                          key={cite.chunkId}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground"
                        >
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className={cn('truncate', 'max-w-[200px]')}>
                            [{i + 1}] {cite.filename}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {entry.answer.meta && (
                    <p className="text-[10px] text-muted-foreground/60">
                      {entry.answer.meta.chunksConsidered} chunks searched
                      {entry.answer.meta.cached && ' (cached)'}
                      {' \u00b7 '}
                      {entry.answer.meta.latencyMs}ms
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="shrink-0 border-t p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your documents..."
            rows={1}
            className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => void handleAsk()}
            disabled={!input.trim() || !projectId}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
