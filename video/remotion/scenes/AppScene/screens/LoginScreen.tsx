/**
 * LoginScreen — Beat 2, pause window.
 *
 * Mounts the real `frontend/src/components/auth/LoginForm.tsx` under a
 * `StaticRouterAdapter` at `/login`. The scene timeline only pauses on the
 * login card briefly before the narrative pivots to signup, so we render
 * the form with a whole-scene fade-in and reserve the `Assemble`-driven
 * piece-by-piece reveal for a future task.
 *
 * ## Why whole-form fade-in (not Assemble)
 *
 * `Assemble` walks children and looks for `data-assemble="<id>"` attributes.
 * The real `LoginForm` doesn't emit those, and we deliberately don't fork it
 * (that would violate the "render real components" contract of this branch).
 * The `LOGIN_ASSEMBLY` fixture is still populated as documentation for a
 * future pass that either (a) annotates the real form with data-assemble
 * attributes or (b) introduces a wrapper that injects them post-mount.
 *
 * Module load order mirrors `HomeScreen`: determinism patches must apply
 * before any frontend module parses so Math.random / Date / matchMedia are
 * deterministic on first render.
 */
import "../../../../src/frontend-bridge/determinism";
import React from "react";
import { AbsoluteFill } from "remotion";
import { LoginForm } from "@/components/auth/LoginForm";
import { Spotlight } from "@/components/ui/spotlight";
import { Logo } from "@/components/ui/logo";
import { StaticRouterAdapter } from "../../../../src/frontend-bridge/StaticRouterAdapter";
import { useFadeIn } from "../../../helpers/useFadeIn";
import { useTimelineRunner } from "../useTimelineRunner";
import { SyntheticCursor } from "../../../primitives/SyntheticCursor";
import { SfxTrigger } from "../../../primitives/SfxTrigger";
import { LOGIN_VOICEOVER } from "../../../../fixtures/timelines/signup-ayush";
import type { AppScreenComponent } from "../screenRegistry";

/**
 * Re-creates the visual surface of the real `AuthLayout` without its
 * react-router `<Outlet />`. We can't use `AuthLayout` directly because
 * `<Outlet />` resolves to whatever child route is active in the static
 * router, not to LoginForm — so we inline the same background (grid +
 * spotlight + logo) and slot the form as a positioned child. Visually
 * identical to production.
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

export const LoginScreen: AppScreenComponent = ({ scene, meta }) => {
  const { byKind } = useTimelineRunner(scene, meta, LOGIN_VOICEOVER);
  const { opacity } = useFadeIn({ durationInFrames: 30 });

  const cursorPath = byKind.cursorTo.map((e) => ({
    at: e.resolvedStart,
    x: (e.payload.x as number) ?? 0,
    y: (e.payload.y as number) ?? 0,
    clickAt: byKind.click.find((c) => c.payload.target === e.payload.target)
      ?.resolvedStart,
  }));

  return (
    <StaticRouterAdapter path="/login">
      <AbsoluteFill style={{ opacity }}>
        <InlineAuthLayout>
          <LoginForm />
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
