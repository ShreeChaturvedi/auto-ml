export interface VoiceComposerAnimateRange {
  start: number;
  end: number;
}

export interface VoiceComposerSurface {
  focus(): void;
  getSelectionOffset(): number;
  syncValue(
    value: string,
    cursorOffset?: number,
    animateRange?: VoiceComposerAnimateRange
  ): void;
}

export type GetVoiceComposer = () => VoiceComposerSurface | null;

interface SyncVoiceComposerValueOptions {
  getComposer: GetVoiceComposer;
  value: string;
  cursorOffset: number;
  onValueChange: (value: string, cursorOffset?: number) => void;
  animateRange?: VoiceComposerAnimateRange;
}

export function focusVoiceComposer(getComposer: GetVoiceComposer): void {
  getComposer()?.focus();
}

export function getVoiceComposerSelectionOffset(
  getComposer: GetVoiceComposer,
  fallbackValue: string
): number {
  return getComposer()?.getSelectionOffset() ?? fallbackValue.length;
}

export function syncVoiceComposerValue({
  getComposer,
  value,
  cursorOffset,
  onValueChange,
  animateRange,
}: SyncVoiceComposerValueOptions): void {
  getComposer()?.syncValue(value, cursorOffset, animateRange);
  onValueChange(value, cursorOffset);
}
