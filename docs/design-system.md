# Design System

This document consolidates UI design guidelines for the frontend (layout, typography, color, and core patterns).

## Typography

- UI text: system sans-serif stack (default Tailwind sans).
- Code/data: `font-mono` (Tailwind mono stack).
- Use `text-sm` for dense UI, `text-base` for body, `text-lg`+ for headings.
- Avoid very light/extrabold weights; prefer `font-medium`/`font-semibold`.

## Color System

- Semantic tokens defined in `frontend/src/index.css` (`--background`, `--foreground`, `--primary`, etc.).
- Light/dark themes are supported via `.dark` class.
- Use semantic classes (`bg-background`, `text-foreground`, `border-border`) instead of hard-coded colors.

## Layout Dimensions

- Sidebar width: 288px (`w-72`).
- Top bar height: 56px (`h-14`).
- Tab height: 40px (`h-10`).
- Collapsed sidebar: `w-0` with transition.

## Core UI Patterns

### Upload Phase
- Split layout: left = custom instructions, right = data/doc upload.
- Drag/drop area with clear file-type guidance.

### Data Explorer
- Query panel on the right, data/EDA on the left.
- SQL editor uses Monaco; English mode is present but currently stubbed.
- Query artifacts are rendered as tabs for quick switching.

### Preprocessing
- Table selector at top.
- Suggestions are rendered as cards with toggles and parameter inputs.
- “Express Lane” enables all defaults at once.

## Accessibility

- Use Radix/shadcn primitives for keyboard navigation and ARIA support.
- Maintain WCAG AA contrast ratios for text and UI elements.
- Avoid hover-only affordances for critical actions.
