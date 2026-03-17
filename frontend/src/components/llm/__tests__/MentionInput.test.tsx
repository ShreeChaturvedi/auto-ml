import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';

import {
  MentionInput,
  type MentionInputHandle,
} from '@/components/llm/MentionInput';

function MentionInputHarness({ voiceActive = false }: { voiceActive?: boolean }) {
  const [value, setValue] = useState('');
  const [cursorOffset, setCursorOffset] = useState<number | null>(null);
  const inputRef = useRef<MentionInputHandle>(null);

  return (
    <div>
      <MentionInput
        ref={inputRef}
        value={value}
        onValueChange={(nextValue) => setValue(nextValue)}
        onKeyDown={() => {}}
        mentionNames={new Set()}
        placeholder="Ask something"
        voiceActive={voiceActive}
      />
      <button
        type="button"
        onClick={() => {
          inputRef.current?.focus();
          setCursorOffset(inputRef.current?.getSelectionOffset() ?? null);
        }}
      >
        Focus editor
      </button>
      <output data-testid="value">{value}</output>
      <output data-testid="cursor-offset">{cursorOffset ?? ''}</output>
    </div>
  );
}

describe('MentionInput', () => {
  it('restores the placeholder after typing and deleting back to empty', () => {
    render(<MentionInputHarness />);

    const editor = screen.getByRole('textbox');

    expect(screen.getByText('Ask something')).toBeInTheDocument();

    editor.textContent = 'hello';
    fireEvent.input(editor);

    expect(screen.getByTestId('value')).toHaveTextContent('hello');
    expect(screen.queryByText('Ask something')).not.toBeInTheDocument();

    editor.textContent = '';
    fireEvent.input(editor);

    expect(screen.getByTestId('value')).toBeEmptyDOMElement();
    expect(screen.getByText('Ask something')).toBeInTheDocument();
    expect(editor.innerHTML).toBe('');
  });

  it('focuses an empty voice editor at offset zero without pushing the caret into placeholder layout', () => {
    const { container } = render(<MentionInputHarness voiceActive />);

    fireEvent.click(screen.getByRole('button', { name: 'Focus editor' }));

    expect(screen.getByText('Ask something')).toBeInTheDocument();
    expect(container.querySelector('.mention-input-voice-caret')).toBeInTheDocument();
    expect(screen.getByTestId('cursor-offset')).toHaveTextContent('0');
    expect(screen.getByRole('textbox').innerHTML).toBe('');
  });
});
