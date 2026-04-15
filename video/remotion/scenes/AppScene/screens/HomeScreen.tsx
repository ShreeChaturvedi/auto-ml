/**
 * HomeScreen — de-risk target for Beat 2.
 *
 * Mounts the *real* `frontend/src/pages/HomePage.tsx` inside Remotion's
 * rendering pipeline, driven by the frontend-bridge shims. If this renders
 * correctly, the architectural thesis holds: the same React component that
 * runs in production can render byte-deterministically inside a video frame.
 *
 * Module load order matters:
 *   1. `determinism` patches Math.random / Date / matchMedia / IntersectionObserver
 *      before any real component module is parsed — the HomePage generates a
 *      flourish path via Math.random(), so the patch has to be in effect
 *      before the module evaluates.
 *   2. `setAuthFixture` stamps the mock auth store synchronously so HomePage's
 *      `useAuthStore(state => state.user?.name)` selector returns "Ayush Yadav"
 *      on first render.
 *   3. The real HomePage is wrapped in `StaticRouterAdapter` at "/" so any
 *      future in-app `Link` / `useNavigate` usage from child components (e.g.
 *      the real ProjectDialog, which we shim to null for now) resolves without
 *      a browser history. "Learn more" is an external `<a target="_blank">`.
 */
import "../../../../src/frontend-bridge/determinism";
import { HomePage } from "@/pages/HomePage";
import { StaticRouterAdapter } from "../../../../src/frontend-bridge/StaticRouterAdapter";
import { setAuthFixture } from "../../../../src/frontend-bridge/mockAuthStore";
import { AYUSH_YADAV } from "../../../../fixtures/auth/ayush-yadav";
import type { AppScreenComponent } from "../screenRegistry";

// Pre-authenticate Ayush at module load. `setAuthFixture` mutates the mock
// auth store synchronously, so HomePage's selector reads the right user on
// its very first render. We build a full `SafeUser` from the thin
// name+email+password fixture — the rest of the fields have no visible
// effect on HomePage but satisfy `SafeUser`'s required shape.
setAuthFixture({
  user_id: "ayush-1",
  email: AYUSH_YADAV.email,
  name: AYUSH_YADAV.name,
  role: "user",
  email_verified: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-04-15T19:30:00.000Z",
  last_login_at: "2026-04-15T19:30:00.000Z",
});

export const HomeScreen: AppScreenComponent = () => {
  return (
    <StaticRouterAdapter path="/">
      <HomePage />
    </StaticRouterAdapter>
  );
};
