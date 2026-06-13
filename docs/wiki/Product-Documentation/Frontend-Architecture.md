# Frontend Architecture

The frontend is a React 19 + Vite + TypeScript SPA in `frontend/`. It uses React Router for page routing, Zustand for state, Tailwind/shadcn/Radix for UI primitives, Monaco for code editors, and typed fetch wrappers in `frontend/src/lib/api`.

The main product experience is rendered inside `AppShell`, which provides protected app chrome, the collapsible sidebar, project navigation, and the full-height phase workspace.

## Routes

`frontend/src/App.tsx` defines the high-level route structure:

| Route | Purpose |
| --- | --- |
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/auth/google/callback` | Authentication flows. |
| `/settings/:tab` | Full-page settings route. |
| `/profile` | Redirects to profile settings. |
| `/docs` | Redirects to public/marketing documentation. |
| `/` | Project selection/home. |
| `/project/:projectId` | Redirects to the project's current phase. |
| `/project/:projectId/:phase` | Main project workspace. |
| `/dev/tools`, `/dev/landing-preview` | Development-only routes. |

## Workflow Phases

`frontend/src/types/phase.ts` defines the canonical phase order:

1. `upload` - Data Upload
2. `data-viewer` - Explorer
3. `preprocessing` - Processing
4. `feature-engineering` - Feature Engineering
5. `training` - Training
6. `experiments` - Experiments
7. `deployment` - Deployment

`ProjectWorkspace` lazy-loads phase components and wraps each phase in an error boundary. Notebook sessions are preserved across preprocessing, feature engineering, training, experiments, and deployment to avoid unnecessary reconnects when moving between related phases.

The sidebar phase tree exposes contextual subtabs: plan chats under Upload, data and context files under Explorer, workbooks under Processing/Feature Engineering/Training, model subtabs under Experiments, and deployment subtabs under Deployment.

## State Management

Zustand stores own the app's domain state:

- `authStore`: user/session state.
- `projectStore`: project list, active project, phase unlock/current-phase state.
- `dataStore`: files, artifacts, hydration, and data viewer state.
- `preprocessingStore`, `featureStore`, `workflowSessionStore`, `workbookRegistryStore`: workflow/workbook state.
- `notebookStore`: notebook cells, sessions, locks, suggested cells, WebSocket handling.
- `modelStore`, `experimentsStore`, `deploymentStore`: model, experiment, and deployment state.
- `executionStore`, `settingsStore`, preference stores: runtime settings and UI preferences.

Shared persistence helpers live in `stores/utils/createPersistedStore.ts` and local preference helpers in `frontend/src/lib`.

## API Clients

`frontend/src/lib/api` provides typed wrappers for backend contracts:

- auth, projects, datasets, documents;
- query and streamed NL-to-SQL;
- LLM/workflow streaming;
- preprocessing and feature engineering;
- notebooks, cells, savepoints, Python editor services;
- execution/package/runtimes;
- models, experiments, deployments;
- settings and realtime sessions.

Streaming helpers parse NDJSON/token streams so long-running LLM and query operations can update the UI incrementally.

The shared fetch client attaches bearer tokens from `authStore`, retries once after refresh-token renewal on eligible `401` responses, throws structured `ApiError` objects, and redirects email-verification failures to the pending verification flow.

## UI System

The UI uses shadcn/ui and Radix primitives for accessible controls, Tailwind semantic tokens for theme consistency, and Lucide icons for action buttons. Monaco powers SQL and Python editing.

Project-themed UI should use `projectColorClasses` from `frontend/src/types/project.ts` with `activeProjectId` from `useProjectStore`. `IconModeToggle` is the reference pattern.

Design conventions:

- dense workbench layouts for operational flows;
- cards for repeated items, modals, and framed tools only;
- visible loading, empty, error, and retry states;
- keyboard-accessible menus, dialogs, tabs, and controls through Radix/shadcn primitives;
- light/dark theme support through semantic CSS variables.

Accessibility conventions:

- every icon-only button needs an `aria-label` or equivalent tooltip pattern;
- hover-revealed actions must also be reachable on `focus-visible`;
- custom listbox/combobox behavior should use `role`, `aria-selected`, `aria-expanded`, and `aria-controls`;
- animated transitions should respect reduced-motion preferences;
- dense panels should use `min-w-0`, stable toolbar heights, and internal scroll regions to avoid overflow.

## Realtime UI

Notebook and deployment updates use WebSocket clients in `frontend/src/lib/websocket`. Notebook WebSocket handlers update cells, locks, sessions, and outputs without full-page refreshes.
