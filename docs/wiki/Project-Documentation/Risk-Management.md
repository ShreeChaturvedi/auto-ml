# Risk Management

| Risk | Impact | Mitigation |
| --- | --- | --- |
| LLM output is incorrect or unsafe to execute. | Bad transformations, misleading SQL, or broken training code. | Stream workflow steps, keep generated code visible, require approval gates, validate schemas, reject unsafe SQL, and support interrupt/retry. |
| Python execution can exhaust host resources. | Local or deployed service instability. | Use Docker runtime limits for memory, CPU, timeout, tmpfs, and isolated workspaces. |
| Deployment prediction logs may contain sensitive data. | Privacy and compliance exposure. | Treat logs as protected data, enforce deployment ownership/API keys, and restrict access in production. |
| Database migrations drift from deployed backend code. | Runtime failures or missing persistence. | Run `npm run db:migrate` during setup/deploy and keep migrations idempotent. |
| Benchmark data is misplaced or committed incorrectly. | Bloated repo or unreproducible evaluation. | Follow `testing/benchmarks` storage rules and keep large public staged bytes out of git. |
| Auth or ownership checks are bypassed in new routes. | Cross-project data access. | Use route-level ownership middleware, write route tests, and review all new API surfaces. |
| Frontend state persistence becomes stale after schema changes. | Broken UI state or confusing workspace behavior. | Version persisted state, test stores, and provide recovery/reinitialization paths. |
| Docker network policy blocks needed packages or allows too much access. | Failed workflows or security exposure. | Configure `EXECUTION_NETWORK` deliberately per environment and document package/runtime expectations. |
| LLM provider latency/cost spikes. | Slow UX and cost overruns. | Use model-specific timeouts, stream progress, keep deterministic fallbacks where possible, and monitor usage. |
| Final documentation diverges from code. | Onboarding and maintenance errors. | Keep wiki pages tied to repo paths, commands, and current route/service structure. |
