import React from "react";
import { useCurrentFrame } from "remotion";

export type MockLLMToolCall = {
  /** Frame the tool call card appears. */
  at: number;
  tool: string;
  args: Record<string, unknown>;
  /** Frame the tool "returns" — if omitted, stays in pending state. */
  resultAt?: number;
  result?: unknown;
};

export type MockLLMStreamProps = {
  /** Frame the stream begins. */
  at: number;
  /** Text to stream — either a single string or an array of message chunks. */
  tokens: string | readonly string[];
  /** Chars revealed per frame. Default 4 (~240 cps — ChatGPT stream feel). */
  charsPerFrame?: number;
  toolCalls?: readonly MockLLMToolCall[];
  /** Style passthrough for the chat bubble. */
  style?: React.CSSProperties;
};

const BUBBLE_STYLE: React.CSSProperties = {
  background: "rgba(248, 248, 250, 0.04)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: 12,
  padding: "14px 16px",
  fontFamily: "Inter Variable, sans-serif",
  fontSize: 16,
  lineHeight: 1.5,
  color: "#e8e8ea",
  whiteSpace: "pre-wrap",
};

const TOOL_CARD_STYLE: React.CSSProperties = {
  marginTop: 8,
  padding: "10px 12px",
  borderRadius: 10,
  background: "rgba(255, 255, 255, 0.05)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 13,
  color: "#c9c9cc",
};

/**
 * Scaffold for the product-demo chat bubble. Reveals characters at
 * `charsPerFrame` and inlines any tool calls (pending → returned) at their
 * keyed frames. Beats 3+ will extend with syntax, rich tool-call types,
 * and streaming code blocks — keep this minimal.
 */
export const MockLLMStream: React.FC<MockLLMStreamProps> = ({
  at,
  tokens,
  charsPerFrame = 4,
  toolCalls,
  style,
}) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;

  const fullText = Array.isArray(tokens) ? tokens.join("\n\n") : (tokens as string);
  const charsVisible = Math.max(
    0,
    Math.min(fullText.length, Math.floor((frame - at) * charsPerFrame)),
  );
  const visible = fullText.slice(0, charsVisible);

  return (
    <div style={{ ...BUBBLE_STYLE, ...style }}>
      {visible}
      {toolCalls?.map((call) => {
        if (frame < call.at) return null;
        const returned = call.resultAt !== undefined && frame >= call.resultAt;
        return (
          <div key={`${call.tool}-${call.at}`} style={TOOL_CARD_STYLE}>
            <div style={{ fontWeight: 600, opacity: 0.85 }}>
              {returned ? "\u25CF" : "\u25CB"}  {call.tool}
            </div>
            <div style={{ marginTop: 4, opacity: 0.7 }}>
              {JSON.stringify(call.args)}
            </div>
            {returned && call.result !== undefined ? (
              <div style={{ marginTop: 4, opacity: 0.6 }}>
                {"\u2192 "}
                {typeof call.result === "string"
                  ? call.result
                  : JSON.stringify(call.result)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
