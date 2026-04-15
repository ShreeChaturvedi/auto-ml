/**
 * Thin wrapper around react-router v7's `StaticRouter`. In v7 the
 * server/static primitives are re-exported from the root `react-router-dom`
 * package (verified against the installed copy at 7.13.1 — the dom entry
 * re-exports everything from `react-router`), so scenes can mount real
 * components that use `<Link>`, `useNavigate`, `useLocation`, etc. without
 * a browser-history store.
 */

import React, { type ReactNode } from "react";
import { StaticRouter } from "react-router-dom";

interface StaticRouterAdapterProps {
  path: string;
  children: ReactNode;
}

export const StaticRouterAdapter: React.FC<StaticRouterAdapterProps> = ({
  path,
  children,
}) => <StaticRouter location={path}>{children}</StaticRouter>;
