import React from "react";
import { PAGES, type PageSpec, type BodyKey } from "./manifest";
import { SECTION, COLORS } from "./theme";
import { HOW } from "./content";

import { CoverPage } from "./templates/CoverPage";
import { BackCoverPage } from "./templates/BackCoverPage";
import { DividerPage } from "./primitives/DividerPage";
import { PhasePage } from "./templates/PhasePage";
import { SpreadPage } from "./templates/SpreadPage";

import { EndpaperPage } from "./pages/EndpaperPage";
import { TocPage } from "./pages/TocPage";
import { EightyPercentPage } from "./pages/EightyPercentPage";
import { WhyNowPage } from "./pages/WhyNowPage";
import { WhatChangedPage } from "./pages/WhatChangedPage";
import { ThreePillarsPage } from "./pages/ThreePillarsPage";
import { PreprocessingFsmPage } from "./pages/PreprocessingFsmPage";
import { McpRegistryPage } from "./pages/McpRegistryPage";
import { SandboxPage } from "./pages/SandboxPage";
import { SpeedPage } from "./pages/SpeedPage";
import { QualityGuardrailsPage } from "./pages/QualityGuardrailsPage";
import { TeamPage } from "./pages/TeamPage";
import { ClosingPage } from "./pages/ClosingPage";

/**
 * Top-level booklet composer. Iterates `manifest.PAGES` in order and
 * dispatches each spec to its corresponding template. Every page renders
 * as a `.page` block (see `styles/print.css`), so Puppeteer paginates
 * natively using `page-break-before: always`.
 */

export const Booklet: React.FC = () => (
  <div className="booklet-root">
    {PAGES.map((p) => (
      <PageSwitch key={p.num} spec={p} totalPages={PAGES.length} />
    ))}
  </div>
);

const BODY_COMPONENTS: Record<
  BodyKey,
  React.FC<{
    parity: "recto" | "verso";
    pageNumber: number;
    totalPages: number;
  }>
> = {
  "eighty-percent":     EightyPercentPage,
  "why-now":            WhyNowPage,
  "what-changed":       WhatChangedPage,
  "three-pillars":      ThreePillarsPage,
  "preprocessing-fsm":  PreprocessingFsmPage,
  "mcp-registry":       McpRegistryPage,
  "sandbox":            SandboxPage,
  "speed":              SpeedPage,
  "quality-guardrails": QualityGuardrailsPage,
  "team":               TeamPage,
  "closing":            ClosingPage,
};

const PageSwitch: React.FC<{ spec: PageSpec; totalPages: number }> = ({
  spec,
  totalPages,
}) => {
  switch (spec.kind) {
    case "cover":
      return <CoverPage />;

    case "back-cover":
      return <BackCoverPage />;

    case "endpaper":
      return (
        <EndpaperPage
          parity={spec.parity}
          pageNumber={spec.num}
          totalPages={totalPages}
        />
      );

    case "toc":
      return (
        <TocPage
          parity={spec.parity}
          pageNumber={spec.num}
          totalPages={totalPages}
        />
      );

    case "divider":
      return (
        <DividerPage
          chapterNum={spec.chapterNum}
          chapterTitle={spec.chapterTitle}
          subtitle={spec.subtitle}
          color={SECTION[spec.sectionKey]}
          artSlot={spec.artSlot}
          chapterIndex={spec.chapterIndex}
          chapterTotal={spec.chapterTotal}
        />
      );

    case "phase": {
      const phase = HOW.phases[spec.phaseIndex];
      if (!phase) {
        // Fatal at build time — manifest should never point at a missing phase.
        throw new Error(`no HOW.phases[${spec.phaseIndex}]`);
      }
      return (
        <PhasePage
          phase={phase}
          parity={spec.parity}
          pageNumber={spec.num}
          totalPages={totalPages}
          sectionLabel="HOW"
          sectionColor={SECTION[spec.sectionKey]}
        />
      );
    }

    case "spread":
      return (
        <SpreadPage
          half={spec.half}
          parity={spec.parity}
          pageNumber={spec.num}
          totalPages={totalPages}
          sectionLabel="BUILD"
          sectionColor={SECTION[spec.sectionKey]}
        />
      );

    case "body": {
      const Component = BODY_COMPONENTS[spec.body];
      if (!Component) {
        throw new Error(`no body component registered for "${spec.body}"`);
      }
      return (
        <Component
          parity={spec.parity}
          pageNumber={spec.num}
          totalPages={totalPages}
        />
      );
    }

    default: {
      // Exhaustiveness check — if PageSpec grows a new variant, TS will
      // flag this as an unreachable branch.
      const _never: never = spec;
      void _never;
      return (
        <section
          className="page"
          style={{ background: COLORS.PAPER, padding: 24 }}
        >
          unknown page spec
        </section>
      );
    }
  }
};
