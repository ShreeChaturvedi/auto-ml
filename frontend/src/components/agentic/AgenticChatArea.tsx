import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChatMessage } from '@/types/llmUi';
import type { DomainAdapter } from '@/types/agentic';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import { ChatMessageList } from '@/components/llm/ChatMessageList';

interface AgenticChatAreaProps {
  messages: ChatMessage[];
  adapter: DomainAdapter;
  isGenerating: boolean;
  error: string | null;
  onEditMessage?: (msgId: string, newContent: string) => void;
  onResend?: (msgId: string) => void;
}

export function AgenticChatArea({
  messages,
  adapter,
  isGenerating,
  error,
  onEditMessage,
  onResend
}: AgenticChatAreaProps) {
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const handleStartEdit = (msg: ChatMessage) => {
    if (msg.type !== 'user') return;
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
  };

  const handleSaveEdit = (msgId: string) => {
    if (!editContent.trim()) return;
    onEditMessage?.(msgId, editContent);
    setEditingMessageId(null);
    onResend?.(msgId);
  };

  return (
    <ScrollArea className="flex-1 px-6 py-4">
      <div className="mx-auto w-full max-w-5xl space-y-4 pb-28">
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50/80 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <ChatMessageList
          messages={messages}
          renderExtra={(msg) => {
            // User messages: override with inline edit controls
            if (msg.type === 'user') {
              const isEditing = editingMessageId === msg.id;
              return (
                <div key={msg.id} className="flex flex-col items-end group">
                  <div className="rounded-lg bg-primary/10 px-4 py-2 text-sm max-w-[80%] whitespace-pre-wrap">
                    {isEditing ? (
                      <div className="flex flex-col gap-1">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full min-w-[220px] bg-transparent p-0 text-sm leading-relaxed resize-none border-0 shadow-none focus:ring-0"
                          rows={Math.max(1, msg.content.split('\n').length)}
                          autoFocus
                        />
                        <div className="flex justify-end gap-1 -mr-2 -mb-1">
                          <Button variant="ghost" size="icon-xs" className="h-6 w-6" onClick={() => setEditingMessageId(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon-xs" className="h-6 w-6" onClick={() => handleSaveEdit(msg.id)}>
                            <Check className="h-3 w-3 text-emerald-600" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        {msg.content}
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="absolute -left-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                          onClick={() => handleStartEdit(msg)}
                        >
                          <span className="text-xs">✎</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            // Tool calls: prefer domain adapter registry over shared ToolIndicator
            if (msg.type === 'tool_call' && adapter.toolUiRegistry?.[msg.call.tool]) {
              const Component = adapter.toolUiRegistry[msg.call.tool];
              return <Component key={msg.id} call={msg.call} result={msg.result} />;
            }

            // UI Schema: placeholder render
            if (msg.type === 'ui') {
              return (
                <div key={msg.id} className="rounded border border-primary/20 bg-primary/5 p-4 text-sm">
                  [UI Schema Render: {msg.schema.kind}]
                </div>
              );
            }

            return null;
          }}
        />

        {isGenerating && (
          <div className="text-xs text-muted-foreground animate-pulse">
            Agent is working...
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
