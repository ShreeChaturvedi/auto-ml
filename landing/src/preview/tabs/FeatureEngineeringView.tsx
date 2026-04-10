import { featureEngineeringChat } from '@/preview/fixtures/chats';
import { featureEngineeringNotebook } from '@/preview/fixtures/notebooks';
import { ChatHistory } from '@/preview/components/ChatHistory';
import { NotebookColumn } from '@/preview/components/NotebookColumn';
import styles from './AgenticShell.module.css';

export function FeatureEngineeringView() {
  return (
    <div className={styles.root}>
      <div className={styles.chatColumn}>
        <ChatHistory messages={featureEngineeringChat} />
        <div className={styles.chatComposer}>
          <textarea
            className={styles.chatInput}
            placeholder="Ask about a feature…"
            rows={2}
            readOnly
          />
        </div>
      </div>
      <NotebookColumn cells={featureEngineeringNotebook} />
    </div>
  );
}
