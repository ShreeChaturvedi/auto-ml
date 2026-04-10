import { preprocessingChat } from '@/preview/fixtures/chats';
import { preprocessingNotebook } from '@/preview/fixtures/notebooks';
import { ChatHistory } from '@/preview/components/ChatHistory';
import { NotebookColumn } from '@/preview/components/NotebookColumn';
import styles from './AgenticShell.module.css';

export function PreprocessingView() {
  return (
    <div className={styles.root}>
      <div className={styles.chatColumn}>
        <ChatHistory messages={preprocessingChat} />
        <div className={styles.chatComposer}>
          <textarea
            className={styles.chatInput}
            placeholder="Ask a follow-up…"
            rows={2}
            readOnly
          />
        </div>
      </div>
      <NotebookColumn cells={preprocessingNotebook} />
    </div>
  );
}
