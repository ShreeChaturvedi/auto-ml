# Agentic AutoML Platform — Landing Production Deployment Design

**Date:** 2026-04-14
**Status:** Draft — pending user review
**Owner:** @shree

## 1. Overview

This spec defines the first public production deployment for the marketing landing page of the Agentic AutoML Platform.

The goal is to publish a public landing site on a Vercel-provided `*.vercel.app` domain without exposing the core product application. The deployed surface should include the marketing homepage and the existing workspace demo preview, while all calls to action that imply application access should lead to a minimal holding page rather than the real app.

This is a launch-hardening spec, not a redesign spec. The existing landing UX and visual language stay intact unless a change directly improves deployability, resilience, correctness, or performance.

## 2. Goals

- Deploy the `landing/` workspace as a standalone public production site on Vercel Hobby.
- Keep `/` public and fully functional as the marketing homepage.
- Keep `/workspace-preview` public as the live product demo route.
- Prevent public access to the real application by replacing current auth-entry behavior with a simple holding page.
- Fix current landing-specific correctness issues before launch.
- Improve performance enough that the landing page feels stable and intentional on first public release.
- Establish a verification checklist that must pass before the deployment is considered production-ready.

## 3. Non-Goals

- Deploying the real frontend application or backend.
- Adding auth, waitlist capture, analytics, or email collection.
- Re-architecting the whole landing demo system.
- Full anti-bot or enterprise-grade WAF work beyond what Vercel Hobby and a static architecture reasonably provide.
- Custom domain setup for the first launch.

## 4. Launch Surface

The first production release will expose exactly these meaningful routes:

- `/` — marketing homepage
- `/workspace-preview` — public interactive demo route
- `/login` — minimal “Coming Soon” page

The existing CTA links already target `/login`, so the production-safe behavior is to repurpose that route rather than retarget every CTA. If a future `/coming-soon` alias is wanted, it can be added later, but it is not required for the first release.

### 4.1 Route behavior

`/`

- Serves the current Astro landing page.
- Keeps the hero preview and how-it-works demo experience.

`/workspace-preview`

- Remains public.
- Continues to load the embedded demo workspace and phase switching behavior.
- Must not depend on private backend APIs or real user data.

`/login`

- Stops redirecting to the real app in production.
- Renders plain centered text: `Coming Soon`.
- Uses a full-viewport layout with horizontal and vertical centering.
- Contains no CTA, no email field, and no route onward to the real app.

## 5. Hosting Recommendation

### 5.1 Recommended option

Deploy the `landing/` workspace to Vercel Hobby as a dedicated project.

Reasoning:

- The landing app is already a static Astro site with `output: 'static'`.
- The desired production URL is a Vercel-managed subdomain.
- Static hosting minimizes attack surface compared with exposing the main application.
- Vercel’s workflow is simple for branch-based deploys and production promotion.

### 5.2 Assumed Vercel project model

- One Vercel project dedicated to the landing site.
- Production branch mapped to the branch chosen for launch.
- Production domain uses the default Vercel subdomain.
- Preview deployments may exist, but they are not part of the public launch contract and should not be shared as stable URLs.

### 5.3 Monorepo implications

The landing workspace imports code from `../frontend/src`. That means deployment setup must explicitly account for a monorepo project whose deployable app lives in `landing/` but still depends on sibling source files.

The deployment configuration must therefore satisfy two constraints:

- Build commands must run against the landing workspace.
- The build environment must still include the repository files used by `@frontend` imports.

If Vercel root-directory behavior conflicts with those imports, the fallback is to keep the Vercel project pointed at the repo root and override build/output settings instead of using `landing/` as the project root.

## 6. Security And Abuse Posture

### 6.1 Threat model for first launch

This launch assumes realistic low-to-moderate hostile interest, including:

- opportunistic scraping
- nuisance traffic spikes
- HTTP flood attempts
- repeated requests to public demo routes

This launch does not assume targeted, persistent, enterprise-scale adversaries.

### 6.2 Why this launch surface is relatively safe

The public site is mostly static. The most complex public route is the demo preview, which still runs as a prebuilt frontend artifact rather than a live application backed by sensitive production services.

That means:

- there is no public app login path into the real system
- there is no direct public backend dependency for core functionality
- the public footprint is substantially safer than exposing the main app

### 6.3 Practical protections for first release

- Keep the deployed site static.
- Do not expose backend endpoints through the landing deployment.
- Ensure `/login` is only a holding page.
- Add conservative security headers appropriate for a static site.
- Avoid embedding third-party scripts that increase attack surface.
- Keep large runtime features lazy where possible so burst traffic costs less to serve.

### 6.4 Limits of the first release

Vercel Hobby provides platform-level DDoS mitigation, which is helpful, but this is not the same as a custom-domain setup fronted by Cloudflare with stricter traffic controls. If attack pressure becomes meaningful, the next step is likely a custom domain and CDN/WAF strategy, not more complexity inside the landing app.

## 7. Current Known Gaps

The current landing deployment is not yet ready for production because of concrete codebase issues.

### 7.1 Typecheck failures

Landing typecheck currently fails in these areas:

- `landing/src/components/WorkspacePreviewPage.tsx`
- `landing/src/lib/workspacePreviewMessaging.ts`
- `landing/src/components/WorkspacePreviewPage.test.tsx`

These must be resolved before deploy because they indicate drift in shared type boundaries between the landing and frontend workspaces.

### 7.2 Test instability / React duplication issue

`npm run test:landing` currently fails in the preview navigation suite with an invalid hook call originating from reused frontend components. This strongly suggests the landing Vitest environment is still allowing multiple React resolution paths across workspaces.

This matters because:

- it weakens confidence in the demo route
- it signals a fragile cross-workspace setup
- it can hide real regressions in the embedded demo surface

### 7.3 Performance weight

The landing build output currently contains very large chunks from:

- Monaco
- Plotly
- PDF viewer/runtime
- real workspace demo dependencies

This does not block correctness, but it is the biggest quality risk for launch polish.

## 8. Performance Design

### 8.1 Performance objective

The site should feel fast on first load even though it contains a real interactive demo. The homepage should prioritize quick initial render and defer heavyweight runtime costs until they are actually needed.

### 8.2 Required optimizations

- Keep the homepage shell statically rendered and visually complete before heavy demo code loads.
- Preserve lightweight placeholders for demo surfaces while interactive code hydrates.
- Review whether the hero preview must eagerly import the full demo workspace on first paint.
- Keep how-it-works iframe previews lazy unless there is a specific evidence-backed reason to preload them.
- Avoid pulling in editor and charting dependencies on the critical path if they are not required for above-the-fold perception.

### 8.3 Acceptable compromise

It is acceptable for `/workspace-preview` to carry heavier runtime cost than `/`, because it is an explicit demo route. It is less acceptable for the homepage itself to pay the full cost of advanced app dependencies before the user asks for them.

## 9. Implementation Scope

The implementation phase should cover the following work only:

1. Replace production `/login` behavior with the minimal `Coming Soon` page.
2. Add deployment configuration for Vercel.
3. Add static-site security headers where supported by the chosen Vercel config path.
4. Fix landing typecheck issues.
5. Fix landing test instability caused by cross-workspace React resolution.
6. Make targeted landing performance improvements focused on demo loading behavior.
7. Verify the production build and landing-specific test suite.

## 10. Verification Bar

The deployment is not ready until all of the following are true:

- `npm run build:landing` passes
- `npm --prefix landing run typecheck` passes
- `npm run test:landing` passes
- the minimal `/login` page renders centered `Coming Soon`
- `/workspace-preview` still works after the route change
- the production build serves the intended routes correctly
- there are no references that still send users from the landing site into the real application

If feasible during implementation, these should also pass:

- `npm --prefix landing run lint`
- landing accessibility checks
- landing Lighthouse checks

## 11. Rollout Plan

### 11.1 First release

- Deploy to a Vercel subdomain.
- Keep the release public.
- Manually smoke-test `/`, `/login`, and `/workspace-preview`.

### 11.2 Immediate post-launch checks

- Confirm CTA behavior from hero, nav, and footer.
- Confirm that preview routes work on a cold load, not only through client navigation.
- Confirm there is no accidental redirect into the real app.
- Confirm acceptable load and interaction feel on a throttled browser profile.

## 12. Risks

- Vercel monorepo configuration may need adjustment because the landing build imports from `frontend/src`.
- Fixing the React duplication issue may require changes in test config rather than app code.
- Performance work may reveal that the homepage should mount a lighter preview than the full demo workspace.
- Existing unrelated landing changes in the working tree increase the risk of accidental scope bleed during implementation.

## 13. Decisions

- Host on Vercel Hobby for the first public launch.
- Use a Vercel-provided production subdomain.
- Keep `/workspace-preview` public.
- Do not expose the real application.
- Reuse `/login` as the holding page route.
- Prioritize correctness and performance cleanup before deployment instead of shipping immediately with known failures.

## 14. Open Assumptions

- The current landing design remains visually acceptable for launch without a redesign pass.
- Vercel Hobby is sufficient for the first public release.
- A simple text-only holding page is intentional and acceptable for the first launch.
- Preview deployments do not need additional product work for this phase.
