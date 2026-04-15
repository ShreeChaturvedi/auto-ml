import React from "react";
import { AbsoluteFill } from "remotion";
import type { ChapterMark, SceneWithMetadata } from "../../config/scenes";
import type { Theme } from "../../config/themes";
import { COLORS } from "../../config/themes";
import { CodeReveal } from "./CodeReveal";
import { Demo } from "./Demo";
import { EndCard } from "./EndCard";
import { Slide } from "./Slide";
import { TableOfContents } from "./TableOfContents";
import { Title } from "./Title/Title";

type Props = {
  sceneAndMetadata: SceneWithMetadata;
  theme: Theme;
  chapters: ChapterMark[];
};

/**
 * Dispatches each scene variant to its renderer.
 *
 * Adding a new scene type:
 *  1. Add the variant to `config/scenes.ts` `selectableScenes`.
 *  2. Add a `case` branch below pointing at your component.
 *  3. (Optional) populate the component in its own folder under `remotion/scenes/`.
 */
export const Scene: React.FC<Props> = ({ sceneAndMetadata, theme, chapters }) => {
  const { scene } = sceneAndMetadata;

  switch (scene.type) {
    case "slide":
      return <Slide scene={scene} theme={theme} />;

    case "codeReveal":
      return <CodeReveal scene={scene} theme={theme} />;

    case "demo":
      return <Demo scene={scene} theme={theme} />;

    case "title":
      return (
        <Title
          title={scene.title}
          subtitle={scene.subtitle}
          theme={theme}
          voiceoverFile={scene.voiceoverFile}
        />
      );

    case "endcard":
      return <EndCard links={scene.links} theme={theme} />;

    case "tableofcontents":
      return <TableOfContents theme={theme} chapters={chapters} />;

    default:
      scene satisfies never;
      return <AbsoluteFill style={{ background: COLORS[theme].BACKGROUND }} />;
  }
};
