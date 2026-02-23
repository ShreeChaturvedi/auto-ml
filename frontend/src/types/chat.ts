import type { AnswerCitation } from '@/lib/api/documents';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: AnswerCitation[];
  timestamp: Date;
  cached?: boolean;
  status?: 'ok' | 'not_found';
}
