/**
 * End-card configuration. For the capstone video, the end card is a simple
 * "thanks + links" panel rather than a social-media follow CTA.
 *
 * Link list, channel ID, and platform selection are kept for forward
 * compatibility with any future social variant.
 */

import { z } from "zod";

export const brand = z.enum(["capstone"]);
export type Brand = z.infer<typeof brand>;

export const platform = z.enum(["youtube", "linkedin", "x", "github"]);
export type Platform = z.infer<typeof platform>;

export const linkType = z.object({
  label: z.string(),
  url: z.string(),
});
export type LinkType = z.infer<typeof linkType>;
