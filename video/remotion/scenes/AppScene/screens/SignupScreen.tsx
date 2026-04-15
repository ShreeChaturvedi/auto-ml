/**
 * SignupScreen — Beat 2 climax (signup-as-Ayush).
 *
 * Mounts the real `frontend/src/components/auth/SignupForm.tsx` under a
 * `StaticRouterAdapter` at `/signup`, then drives each of the four
 * registered react-hook-form inputs (name / email / password /
 * confirmPassword) via `useTypeIntoInput` — a frame-keyed hook that types
 * into the REAL DOM input using the React-compatible `nativeInputValueSetter`
 * trick. PasswordStrength + PasswordMatch sub-components fire naturally as
 * the password / confirmPassword values change.
 *
 * ## Why we don't reach into SignupForm's `setValue`
 *
 * The real `SignupForm` owns its `useForm()` instance internally — there's
 * no prop surface to inject `setValue` from outside. We deliberately don't
 * fork it (would violate "render real components"). `useTypeIntoInput`
 * resolves each input via CSS selector + dispatches a synthetic `input`
 * event so react-hook-form's listener picks the value up exactly as it
 * would for a human keystroke. See `useTypeIntoInput.ts` for the full
 * rationale.
 *
 * ## Whole-form fade-in (Assemble pivot)
 *
 * Same trade-off as `LoginScreen` — Assemble walks for `data-assemble`
 * markers that the real form doesn't emit. `SIGNUP_ASSEMBLY` is populated
 * as documentation for a future fine-grained pass.
 *
 * Module load order mirrors `HomeScreen` / `LoginScreen`: determinism
 * patches must apply before any frontend module parses.
 */
import "../../../../src/frontend-bridge/determinism";
import React from "react";
import { AbsoluteFill } from "remotion";
import { SignupForm } from "@/components/auth/SignupForm";
import { Spotlight } from "@/components/ui/spotlight";
import { Logo } from "@/components/ui/logo";
import { StaticRouterAdapter } from "../../../../src/frontend-bridge/StaticRouterAdapter";
import { useTypeIntoInput } from "../../../../src/frontend-bridge/useTypeIntoInput";
import { useFadeIn } from "../../../helpers/useFadeIn";
import { useTimelineRunner } from "../useTimelineRunner";
import { SyntheticCursor } from "../../../primitives/SyntheticCursor";
import { SfxTrigger } from "../../../primitives/SfxTrigger";
import {
  SIGNUP_VOICEOVER,
  NAME_SCHEDULE,
  EMAIL_SCHEDULE,
  PASSWORD_SCHEDULE,
  CONFIRM_PASSWORD_SCHEDULE,
} from "../../../../fixtures/timelines/signup-ayush";
import type { AppScreenComponent } from "../screenRegistry";

/**
 * Inlined twin of the real `AuthLayout` — same caveat as `LoginScreen`'s
 * `InlineAuthLayout`. We can't use `AuthLayout` directly because its
 * `<Outlet />` resolves to the active child route, not to the form we
 * want to mount. Visually identical to production.
 */
const InlineAuthLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="relative flex min-h-svh w-full items-center justify-center p-6 md:p-10 bg-neutral-950 overflow-hidden">
    <div className="absolute top-6 left-6 md:top-8 md:left-8 z-20">
      <Logo size="md" className="text-white" />
    </div>
    <div
      className="pointer-events-none absolute inset-0 select-none"
      style={{
        backgroundSize: "40px 40px",
        backgroundImage:
          "linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
      }}
    />
    <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" fill="white" />
    <div className="relative z-10">{children}</div>
  </div>
);

export const SignupScreen: AppScreenComponent = ({ scene, meta }) => {
  const { byKind } = useTimelineRunner(scene, meta, SIGNUP_VOICEOVER);
  const { opacity } = useFadeIn({ durationInFrames: 30 });

  // Drive each of the four form fields. These hooks are pure side effects —
  // they locate the real input via `document.querySelector(name="<field>")`
  // and push the typed substring through React's value setter so
  // react-hook-form's input listener fires.
  useTypeIntoInput({ selector: 'input[name="name"]', schedule: NAME_SCHEDULE });
  useTypeIntoInput({ selector: 'input[name="email"]', schedule: EMAIL_SCHEDULE });
  useTypeIntoInput({ selector: 'input[name="password"]', schedule: PASSWORD_SCHEDULE });
  useTypeIntoInput({
    selector: 'input[name="confirmPassword"]',
    schedule: CONFIRM_PASSWORD_SCHEDULE,
  });

  const cursorPath = byKind.cursorTo.map((e) => ({
    at: e.resolvedStart,
    x: (e.payload.x as number) ?? 0,
    y: (e.payload.y as number) ?? 0,
    clickAt: byKind.click.find((c) => c.payload.target === e.payload.target)
      ?.resolvedStart,
  }));

  return (
    <StaticRouterAdapter path="/signup">
      <AbsoluteFill style={{ opacity }}>
        <InlineAuthLayout>
          <SignupForm />
        </InlineAuthLayout>
      </AbsoluteFill>
      {cursorPath.length > 0 && (
        <SyntheticCursor path={cursorPath} theme="light" />
      )}
      {byKind.sfx.map((e) => (
        <SfxTrigger
          key={e.id}
          at={e.resolvedStart}
          src={(e.payload.file as string) ?? ""}
          volume={(e.payload.volume as number) ?? 1}
        />
      ))}
    </StaticRouterAdapter>
  );
};
