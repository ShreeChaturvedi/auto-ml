# Benchmark Assets

This directory contains the benchmark control plane for the expo benchmark suite.

## Subdirectories

- `catalog/`: tracked schemas and manifest files
- `data/`: staged benchmark bytes and repo-native derived data
- `runs/`: ignored run artifacts written by benchmark executions

## Rules

- Do not store benchmark source-of-truth data under `backend/storage/`.
- Do not put benchmark catalog files into `testing/fixtures/`.
- Public staged dataset bytes must stay out of git.
- Repo-native derived and poisoned benchmark data may be committed when modest in size and required for reproducibility.
