import React from "react";

export type ChromeAddressBarProps = {
  /** Fully-formed URL string rendered inside the address bar. URL transitions
   * (crossfade between values) are driven externally by callers via the
   * Demo scene's timeline — this component stays presentational. */
  url: string;
};

export const ChromeAddressBar: React.FC<ChromeAddressBarProps> = ({ url }) => {
  return (
    <div
      style={{
        background: "#EDEDEF",
        borderRadius: 999,
        height: 28,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        fontSize: 13,
        color: "#3C3C43",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontFeatureSettings: '"tnum"',
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        maxWidth: 720,
        justifySelf: "center",
      }}
    >
      <LockIcon />
      <span>{url}</span>
    </div>
  );
};

const LockIcon: React.FC = () => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x={3} y={11} width={18} height={11} rx={2} ry={2} />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
