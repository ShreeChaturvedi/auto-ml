import { ArrowUp, CornerDownLeft, CornerDownRight, Keyboard, Paperclip } from 'lucide-react';
import type { ContextualTip } from './contextual-tip-bar';
import { Kbd } from './contextual-tip-bar';

/** Static tips shared by all chat-based domain adapters. */
export const COMMON_CHAT_TIPS: ContextualTip[] = [
  { id: 'tip-shift-enter', icon: Keyboard, content: <><Kbd><ArrowUp className="h-3 w-3" /></Kbd>{' '}<Kbd><CornerDownLeft className="h-3 w-3" /></Kbd> for newline</> },
  { id: 'tip-at-mention', icon: Paperclip, content: '@ to mention a file in your message' },
  { id: 'tip-tab', icon: CornerDownRight, content: <><Kbd>Tab</Kbd> to accept a suggested prompt</> },
];
