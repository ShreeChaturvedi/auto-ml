/**
 * No-op replacement for `frontend/src/components/projects/ProjectDialog.tsx`.
 *
 * The real dialog pulls in a heavy chain that is not useful inside a Remotion
 * render — `@radix-ui/react-dialog`, `@radix-ui/react-popover`,
 * `react-colorful`, animated-placeholder-textarea, lucide icon registry —
 * none of which we ship in the video workspace. The dialog is only visible
 * when `open={true}`, which is always false on a fresh HomePage render.
 *
 * By aliasing `@/components/projects/ProjectDialog` to this component we
 * keep the call sites in HomePage (and any future screens that mount the
 * dialog closed) typechecked against the same public props without pulling
 * the transitive dependency graph into the video bundle.
 *
 * Beats 3+ that need to render the dialog open will either:
 *   - remove this alias and install the missing packages, or
 *   - add a scripted, non-interactive visual of the dialog form.
 */
import React from "react";
import type { Project } from "./types";

export interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project;
}

export const ProjectDialog: React.FC<ProjectDialogProps> = () => null;
