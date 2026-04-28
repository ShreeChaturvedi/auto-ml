import React from "react";
import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import type { slideScene } from "../../../config/scenes";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { SceneVoiceover } from "../../helpers/SceneVoiceover";
import { AcknowledgementsSlide } from "./AcknowledgementsSlide";
import { AgendaSlide } from "./AgendaSlide";
import { AICollaborationSlide } from "./AICollaborationSlide";
import { ArchEngineSlide } from "./ArchEngineSlide";
import { ArchHookSlide } from "./ArchHookSlide";
import { ArchPhaseAdapterSlide } from "./ArchPhaseAdapterSlide";
import { ArchPullbackSlide } from "./ArchPullbackSlide";
import { ArchTrainingExecuteCascadeSlide } from "./ArchTrainingExecuteCascadeSlide";
import { ArchTrainingProposeApprovalSlide } from "./ArchTrainingProposeApprovalSlide";
import { ArchTrainingProposeASlide } from "./ArchTrainingProposeASlide";
import { ArchTrainingProposeBSlide } from "./ArchTrainingProposeBSlide";
import { BenchmarksGuardrailsSlide } from "./BenchmarksGuardrailsSlide";
import { BenchmarksHookSlide } from "./BenchmarksHookSlide";
import { BenchmarksQualitySlide } from "./BenchmarksQualitySlide";
import { BenchmarksSpeedSlide } from "./BenchmarksSpeedSlide";
import { ClosingSlide } from "./ClosingSlide";
import { HookSlide } from "./HookSlide";
import { JourneyAgenticSlide } from "./JourneyAgenticSlide";
import { JourneyFoundationSlide } from "./JourneyFoundationSlide";
import { JourneyProductionSlide } from "./JourneyProductionSlide";
import { JourneyPulseSlide } from "./JourneyPulseSlide";
import { ProblemTrioSlide } from "./ProblemTrioSlide";
import { RetroDifferentlySlide } from "./RetroDifferentlySlide";
import { RetroLearnedSlide } from "./RetroLearnedSlide";
import { RetroWentWellSlide } from "./RetroWentWellSlide";
import { TeamSlide } from "./TeamSlide";
import { TechStackSlide } from "./TechStackSlide";
import { ThankYouSlide } from "./ThankYouSlide";
import { TitleSlide } from "./TitleSlide";
import { WhyNowSlide } from "./WhyNowSlide";

type SlideSceneType = z.infer<typeof slideScene>;

export type SlideBodyProps = {
  theme: Theme;
  meta: SlideSceneType["meta"];
};

type Props = {
  scene: SlideSceneType;
  theme: Theme;
};

/**
 * Dispatches a slide scene to the component whose `id` matches.
 *
 * Slide-agent contract: when adding `NewFooSlide`:
 *   1. Create `./NewFooSlide.tsx` exporting a `React.FC<SlideBodyProps>`.
 *   2. Import it here and add a new `case "new-foo"` branch.
 *   3. Reference it from a scene entry: `{ type: "slide", id: "new-foo", ... }`.
 */
export const Slide: React.FC<Props> = ({ scene, theme }) => {
  return (
    <>
      <SlideBody id={scene.id} theme={theme} meta={scene.meta} />
      <SceneVoiceover file={scene.voiceoverFile} />
    </>
  );
};

const SlideBody: React.FC<{ id: string } & SlideBodyProps> = ({
  id,
  theme,
  meta,
}) => {
  switch (id) {
    case "hook":
      return <HookSlide theme={theme} meta={meta} />;
    case "title":
      return <TitleSlide theme={theme} meta={meta} />;
    case "problem-trio":
      return <ProblemTrioSlide theme={theme} meta={meta} />;
    case "why-now":
      return <WhyNowSlide theme={theme} meta={meta} />;
    case "team":
      return <TeamSlide theme={theme} meta={meta} />;
    case "acknowledgements":
      return <AcknowledgementsSlide theme={theme} meta={meta} />;
    case "agenda":
      return <AgendaSlide theme={theme} meta={meta} />;
    case "tech-stack":
      return <TechStackSlide theme={theme} meta={meta} />;
    case "arch-hook":
      return <ArchHookSlide theme={theme} meta={meta} />;
    case "arch-engine":
      return <ArchEngineSlide theme={theme} meta={meta} />;
    case "arch-phase-adapter":
      return <ArchPhaseAdapterSlide theme={theme} meta={meta} />;
    case "arch-training-propose-a":
      return <ArchTrainingProposeASlide theme={theme} meta={meta} />;
    case "arch-training-propose-approval":
      return <ArchTrainingProposeApprovalSlide theme={theme} meta={meta} />;
    case "arch-training-propose-b":
      return <ArchTrainingProposeBSlide theme={theme} meta={meta} />;
    case "arch-training-execute-cascade":
      return <ArchTrainingExecuteCascadeSlide theme={theme} meta={meta} />;
    case "arch-pullback":
      return <ArchPullbackSlide theme={theme} meta={meta} />;
    case "benchmarks-hook":
      return <BenchmarksHookSlide theme={theme} meta={meta} />;
    case "benchmarks-speed":
      return <BenchmarksSpeedSlide theme={theme} meta={meta} />;
    case "benchmarks-quality":
      return <BenchmarksQualitySlide theme={theme} meta={meta} />;
    case "benchmarks-guardrails":
      return <BenchmarksGuardrailsSlide theme={theme} meta={meta} />;
    case "journey-pulse":
      return <JourneyPulseSlide theme={theme} meta={meta} />;
    case "journey-foundation":
      return <JourneyFoundationSlide theme={theme} meta={meta} />;
    case "journey-agentic":
      return <JourneyAgenticSlide theme={theme} meta={meta} />;
    case "journey-production":
      return <JourneyProductionSlide theme={theme} meta={meta} />;
    case "ai-collaboration":
      return <AICollaborationSlide theme={theme} meta={meta} />;
    case "retro-learned":
      return <RetroLearnedSlide theme={theme} meta={meta} />;
    case "retro-went-well":
      return <RetroWentWellSlide theme={theme} meta={meta} />;
    case "retro-differently":
      return <RetroDifferentlySlide theme={theme} meta={meta} />;
    case "closing":
      return <ClosingSlide theme={theme} meta={meta} />;
    case "thank-you":
      return <ThankYouSlide theme={theme} meta={meta} />;
    default:
      return (
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            color: COLORS[theme].WORD_COLOR_ON_BG_GREYED,
            fontSize: 32,
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <div>
            Slide <code>{id}</code> is not registered.
            <br />
            Add a case in <code>scenes/Slide/index.tsx</code>.
          </div>
        </AbsoluteFill>
      );
  }
};
