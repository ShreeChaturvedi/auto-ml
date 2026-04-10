import { trainingChat } from '@/preview/fixtures/chats';
import { trainingNotebook } from '@/preview/fixtures/notebooks';
import { ChatHistory } from '@/preview/components/ChatHistory';
import { NotebookColumn } from '@/preview/components/NotebookColumn';
import styles from './AgenticShell.module.css';

export function TrainingView() {
  return (
    <div className={styles.root}>
      <div className={styles.chatColumn}>
        <ChatHistory messages={trainingChat} />
        <div className={styles.chatComposer}>
          <textarea
            className={styles.chatInput}
            placeholder="Ask about training…"
            rows={2}
            readOnly
          />
        </div>
      </div>
      <NotebookColumn cells={trainingNotebook} />
    </div>
  );
}
