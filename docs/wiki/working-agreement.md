# Working Agreement

## Purpose

This agreement defines how the team plans, builds, reviews, verifies, and documents the Agentic AutoML Platform.

## Team and Roles

| Role | Owner |
| --- | --- |
| Product owner / proxy | Shree Chaturvedi |
| Scrum master / facilitator | Ayush Yadav |
| Frontend lead | Zarif Fida Chowdhury |
| Backend/ML lead | Ayush Yadav |
| DevOps/data lead | Shree Chaturvedi |

## Work Management

- GitLab issues and boards are the source of truth for sprint work.
- Issues should include acceptance criteria, test ideas, and relevant dependencies.
- Implementation should happen in focused branches and merge requests.
- Product behavior, setup, API, or architecture changes should update README/wiki/docs as appropriate.

## Definition of Ready

A story is ready when:

- the goal and acceptance criteria are clear;
- dependencies are identified;
- the work can fit in a sprint or has been split;
- the expected test/verification path is known;
- any non-trivial approach has enough design context for implementation.

## Definition of Done

A story is done when:

- acceptance criteria pass;
- the code is reviewed;
- relevant tests are added or updated;
- `npm run build`, `npm run test`, and `npm run lint` pass unless an approved blocker is documented;
- related docs/wiki/API notes are updated;
- secrets and sensitive data are not committed;
- the change is merged through the agreed GitLab workflow.

## Quality and Security Norms

- Prefer strong tests over shallow happy-path checks.
- Use project ownership and deployment ownership middleware for data-bearing routes.
- Keep generated LLM code reviewable and gated by user approval.
- Store secrets in local `.env` files or GitLab CI variables.
- Treat uploaded datasets, documents, model artifacts, and prediction logs as sensitive unless explicitly public.

## Communication

- Use GitLab for project-traceable work and decisions.
- Use team chat or meetings for quick coordination, then reflect durable decisions in issues, merge requests, or the wiki.
- Surface blockers early, especially environment, Docker, database, LLM provider, or testing issues.

## Change Control

This page lives in the GitLab wiki. Update it when the team's workflow changes materially.
