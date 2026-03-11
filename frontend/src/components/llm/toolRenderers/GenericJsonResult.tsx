export function GenericJsonResult({ output }: { output: unknown }) {
  let text: string;
  if (typeof output === 'string') {
    text = output;
  } else {
    try {
      text = JSON.stringify(output, null, 2);
    } catch {
      text = String(output);
    }
  }

  if (text.length > 1500) {
    text = `${text.slice(0, 1500)}…`;
  }

  return (
    <pre className="text-[10px] font-mono whitespace-pre-wrap text-muted-foreground">
      {text}
    </pre>
  );
}
