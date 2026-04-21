# Dataset Manifests

Tracked benchmark dataset manifests live here.

Directory structure:

- `public/`
- `derived/`
- `poison/`

Current convention:

- `status: "pending"` means the dataset contract is tracked but bytes are not yet
  staged or checksummed
- `status: "staged"` means the canonical file has been materialized and the
  checksum is frozen

See [`../README.md`](../README.md) and [`../../README.md`](../../README.md) for the current contract.
