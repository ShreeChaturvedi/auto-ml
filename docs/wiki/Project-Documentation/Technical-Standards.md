# Technical and Engineering Standards

## Accessibility: WCAG 2.2

The frontend should remain keyboard accessible and screen-reader compatible where practical.

Current practices:

- use Radix/shadcn primitives for dialogs, menus, tabs, checkboxes, switches, popovers, and tooltips;
- keep focus indicators visible and non-obscured;
- provide non-drag interactions for critical actions;
- maintain adequate hit areas for icon buttons and sidebar controls;
- use semantic Tailwind tokens rather than hard-coded low-contrast colors.

Verification:

- manual keyboard walkthroughs for major workflows;
- focused UI tests for stateful controls;
- screenshot/Playwright checks for high-risk visual regressions when UI changes are substantial.

## Software Testing: ISO/IEC/IEEE 29119-Inspired Process

The project uses a pragmatic version of test planning, design, execution, and reporting:

- unit/integration tests for backend services, routes, repositories, and frontend stores/components;
- Playwright benchmark flows for end-to-end product behavior;
- NL-to-SQL/RAG evals for model-assisted behavior;
- API load benchmark for backend performance checks;
- sprint/final reports and benchmark artifacts as evidence.

Required quality gates for typical product changes:

```bash
npm run build
npm run test
npm run lint
```

Additional gates for affected areas:

```bash
npm run benchmark
npm run eval
npm run benchmark:api
```

## Security and Data Handling

- Never commit secrets; use `.env` files locally and CI/project variables in hosted environments.
- Use strong production JWT secrets and SMTP/API credentials.
- Enforce project ownership and deployment ownership for data-bearing routes.
- Treat uploaded documents, datasets, model artifacts, and prediction logs as potentially sensitive.
- Keep Docker execution constrained by network, resource, and workspace configuration.

## Code Quality

- Prefer existing routes, services, repositories, stores, API clients, and UI primitives.
- Keep TypeScript types close to API contracts.
- Use structured parsers and validators instead of ad hoc string handling.
- Add tests near changed behavior and broaden coverage for shared contracts.
- Run root lint instead of isolated lint commands so workspace standards stay aligned.
