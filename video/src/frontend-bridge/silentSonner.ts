/**
 * Silent replacement for the `sonner` toast library. Real components call
 * `toast.success(...)` / `<Toaster />` — in a Remotion render we want
 * both to be no-ops (toasts are ephemeral DOM that would flicker across
 * frames and isn't part of the scripted UI).
 */

import React from "react";

const noop = (): undefined => undefined;

export const toast = Object.assign(noop, {
  success: noop,
  error: noop,
  info: noop,
  warning: noop,
  loading: noop,
  custom: noop,
  dismiss: noop,
  message: noop,
  promise: noop,
});

export const Toaster: React.FC = () => null;

export default { toast, Toaster };
