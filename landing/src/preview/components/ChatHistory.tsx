import { Check } from 'lucide-react';
import type { ChatMessage } from '@/preview/fixtures/chats';
import styles from '@/preview/tabs/AgenticShell.module.css';

export function ChatHistory({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className={styles.chatHistory}>
      {messages.map((m) => (
        <div key={m.id} className={styles.message}>
          <div className={styles.messageAvatar}>{m.role === 'user' ? 'U' : 'AI'}</div>
          <div className={styles.messageBody}>
            <p className={styles.messageContent}>{m.content}</p>
            {m.toolCalls && m.toolCalls.length > 0 && (
              <div className={styles.toolRows}>
                {m.toolCalls.map((t) => (
                  <div key={t.id} className={styles.toolRow}>
                    <Check size={12} className={styles.toolRowCheck} aria-hidden="true" />
                    <span className={styles.toolRowLabel}>{t.label}</span>
                    {t.hint && <span className={styles.toolRowHint}>{t.hint}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
