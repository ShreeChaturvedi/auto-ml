import React from "react";
import type { Theme } from "../../config/themes";
import { getChromeGradient } from "../../config/themes";
import { BrowserChrome } from "./BrowserChrome";

type Props = {
  theme: Theme;
  children: React.ReactNode;
  /**
   * Outer padding and radius were configurable on the legacy AppChrome.
   * BrowserChrome bakes these into CONTINUITY tokens so cross-fades between
   * variants never jump. These props are accepted for back-compat but ignored
   * — if a caller needs custom values, migrate to BrowserChrome directly.
   */
  padding?: number;
  radius?: number;
  /** Optional overlay (e.g. chapter label) rendered inside the frame. */
  overlay?: React.ReactNode;
};

/**
 * Back-compat wrapper for the old AppChrome (mac-window only). New scenes
 * should import `BrowserChrome` directly for access to all three variants
 * (mac / browser / none).
 *
 * Preserves the original signature — `theme` maps to `outerBackground` via
 * `getChromeGradient`; `overlay` is rendered on top of children inside the
 * chrome frame.
 */
export const AppChrome: React.FC<Props> = ({ theme, children, overlay }) => {
  return (
    <BrowserChrome variant="mac" outerBackground={getChromeGradient(theme)}>
      {children}
      {overlay}
    </BrowserChrome>
  );
};
