# Benchmark Catalog

Tracked benchmark metadata lives here.

- `schemas/` contains machine-readable schema files.
- `datasets/` will contain live dataset manifests in a later pass.
- `suites/` will contain benchmark suite manifests in a later pass.

For storage and lifecycle rules, treat [`../README.md`](../README.md) as the primary source of truth.

This first implementation slice intentionally adds schemas plus bootstrap validation before adding live manifests with real checksums. The validator currently enforces schema-shaped required fields and repo-specific path rules, but it is still a lightweight bootstrap rather than a full JSON Schema engine.
