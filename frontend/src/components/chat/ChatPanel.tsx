import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAnswer } from '@/lib/api/documents';
import type { ChatMessage } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { CitationCard } from './CitationCard';

interface ChatPanelProps {
  projectId: string;
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const hasCitations = useMemo(
    () => messages.some((msg) => msg.role === 'assistant' && (msg.citations?.length ?? 0) > 0),
    [messages]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await getAnswer(projectId, trimmed);
      const answer = response.answer;

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          answer.status === 'ok'
            ? answer.answer
            : answer.status === 'not_found'
            ? 'No documents available yet. Upload PDFs or text to enable retrieval.'
            : 'Unable to generate an answer right now.',
        citations: answer.citations,
        timestamp: new Date(),
        cached: answer.meta?.cached,
        status: answer.status
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Failed to fetch answer', err);
      setError(err instanceof Error ? err.message : 'Failed to contact assistant');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">AI Assistant</p>
            <p className="text-xs text-muted-foreground">
              Ask questions about your uploaded documents. Connected to project {projectId}.
            </p>
          </div>
        </div>
        {hasCitations && <Badge variant="secondary">Citations on</Badge>}
      </div>

      {error && (
        <div className="flex items-start gap-2 border-b bg-destructive/5 px-4 py-3 text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div ref={scrollRef} className="space-y-4 p-4">
          {messages.length === 0 ? (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-sm">Try asking:</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>• Summaries of key sections from your PDFs</p>
                <p>• Specific facts (dates, metrics, definitions)</p>
                <p>• Cross-document questions that need citations</p>
              </CardContent>
            </Card>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="space-y-2">
                <MessageBubble message={message} />
                {message.role === 'assistant' && message.citations && message.citations.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {message.citations.map((citation) => (
                      <CitationCard key={citation.chunkId} citation={citation} />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="border-t bg-card/50 p-4">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your documents..."
            className="min-h-[80px] resize-none"
            disabled={isLoading}
          />
          <Button onClick={() => void handleSend()} disabled={isLoading} className="h-[80px] w-20">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Press Cmd/Ctrl + Enter to send. Answers include citations when documents are available.
        </p>
      </div>
    </div>
  );
}
