import React, { type ReactNode } from "react";

/**
 * Address bar inside the browser chrome's title bar.
 *
 * Accepts either a plain `url` string (presentational — the default case) or
 * arbitrary `children` for callers that need to drive the pill content with a
 * frame-driven primitive (e.g. `<AddressBarTyper />` in the UrlIntro scene).
 *
 * The discriminated union keeps the default path ergonomic: existing callers
 * still pass `url="..."` and get the same lock-icon + text layout.
 */
export type ChromeAddressBarProps =
  | { url: string; children?: never }
  | { url?: undefined; children: ReactNode };

export const ChromeAddressBar: React.FC<ChromeAddressBarProps> = (props) => {
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
      {"children" in props && props.children !== undefined ? (
        props.children
      ) : (
        <span>{props.url ?? ""}</span>
      )}
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
