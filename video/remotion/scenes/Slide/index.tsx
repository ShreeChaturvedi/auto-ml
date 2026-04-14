import React from "react";
import { AbsoluteFill } from "remotion";
import type { z } from "zod";
import type { slideScene } from "../../../config/scenes";
import type { Theme } from "../../../config/themes";
import { COLORS } from "../../../config/themes";
import { SceneVoiceover } from "../../helpers/SceneVoiceover";
import { AcknowledgementsSlide } from "./AcknowledgementsSlide";
import { HookSlide } from "./HookSlide";
import { IntroSlide } from "./IntroSlide";
import { ProblemTrioSlide } from "./ProblemTrioSlide";
import { SandboxSlide } from "./SandboxSlide";
import { TeamSlide } from "./TeamSlide";
import { TitleSlide } from "./TitleSlide";
import { ProblemSlide } from "./ProblemSlide";
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
    case "intro":
      return <IntroSlide theme={theme} meta={meta} />;
    case "team":
      return <TeamSlide theme={theme} meta={meta} />;
    case "acknowledgements":
      return <AcknowledgementsSlide theme={theme} meta={meta} />;
    case "problem":
      return <ProblemSlide theme={theme} meta={meta} />;
    case "sandbox":
      // TEMP — removed in the dispatcher-integration commit (Commit 10).
      return <SandboxSlide theme={theme} meta={meta} />;
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
