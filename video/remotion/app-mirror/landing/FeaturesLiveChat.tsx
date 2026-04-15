/**
 * FeaturesLiveChat — a static replica of the "01 CHAT" feature card from
 * `landing/src/components/FeaturesSection.astro`, shown during zoom #2.
 *
 * Deliberately a stub — the real FeaturesSection imports React client-only
 * islands (`ChatDeepDive`) whose dep graph pulls in the whole chat composer.
 * For the 3s zoom moment in Beat 1 we only need a clean, representative
 * card: eyebrow + headline + body + a mock exchange preview.
 */
import React from "react";
import { useFadeIn } from "../../helpers/useFadeIn";

export type FeaturesLiveChatProps = {
  width: number;
};

const INTER_STACK = "'Inter Variable', Inter, system-ui, sans-serif";
const MONO_STACK = "'Geist Mono Variable', ui-monospace, monospace";

const TEXT = "#F7F8F8";
const TEXT_MUTED = "#a1a1a6";

export const FeaturesLiveChat: React.FC<FeaturesLiveChatProps> = ({ width }) => {
  const { opacity, transform } = useFadeIn({ durationInFrames: 40, translateY: 12 });

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "48px 32px",
        width,
        boxSizing: "border-box",
        opacity,
        transform,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 48,
          alignItems: "center",
          padding: 32,
          borderRadius: 16,
          border: "0.8px solid rgba(255,255,255,0.08)",
          background: "rgba(20, 20, 22, 0.6)",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: MONO_STACK,
              fontSize: 12,
              letterSpacing: "0.12em",
              color: TEXT_MUTED,
              textTransform: "uppercase",
            }}
          >
            01 — CHAT
          </div>
          <h2
            style={{
              marginTop: 16,
              fontFamily: INTER_STACK,
              fontWeight: 510,
              fontSize: 40,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: TEXT,
            }}
          >
            Talk to your data like a colleague.
          </h2>
          <div
            style={{
              marginTop: 8,
              fontFamily: INTER_STACK,
              fontWeight: 510,
              fontSize: 28,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              color: TEXT_MUTED,
            }}
          >
            Voice, text, or keyboard — agent understands.
          </div>
          <p
            style={{
              marginTop: 24,
              fontFamily: MONO_STACK,
              fontSize: 14,
              color: TEXT_MUTED,
              lineHeight: 1.6,
              maxWidth: 460,
            }}
          >
            Ask in plain English. Watch tool calls stream in real time as the
            agent reads your tables, proposes transformations, and explains its
            reasoning.
          </p>
        </div>

        <div
          style={{
            borderRadius: 12,
            background: "#0F0F11",
            border: "0.8px solid rgba(255,255,255,0.06)",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <ChatBubble who="you">Can you drop outliers above 3 sigma?</ChatBubble>
          <ChatBubble who="agent">
            Proposing `df = df[np.abs(zscore(df)) &lt; 3]` — applying now.
          </ChatBubble>
          <ChatBubble who="agent" tool>
            tool_call: run_python_cell
          </ChatBubble>
          <ChatBubble who="agent">
            Removed 43 rows (1.8%). Distributions now look closer to normal.
          </ChatBubble>
        </div>
      </div>
    </div>
  );
};

const ChatBubble: React.FC<{
  who: "you" | "agent";
  tool?: boolean;
  children: React.ReactNode;
}> = ({ who, tool, children }) => (
  <div
    style={{
      display: "flex",
      justifyContent: who === "you" ? "flex-end" : "flex-start",
    }}
  >
    <div
      style={{
        maxWidth: "85%",
        padding: "8px 12px",
        borderRadius: 10,
        fontFamily: tool ? MONO_STACK : INTER_STACK,
        fontSize: tool ? 12 : 13,
        lineHeight: 1.5,
        color: who === "you" ? "#0A0A0B" : TEXT,
        background:
          who === "you"
            ? "linear-gradient(180deg, #F7F8F8 0%, #E6E6E6 100%)"
            : tool
              ? "rgba(255,255,255,0.03)"
              : "rgba(255,255,255,0.06)",
        border: tool ? "0.8px dashed rgba(255,255,255,0.12)" : "none",
      }}
    >
      {children}
    </div>
  </div>
);
