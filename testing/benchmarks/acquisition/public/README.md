# Public Suite Acquisition

These playbooks describe how to stage the public benchmark datasets without embedding fetch logic into scored runs.

For each dataset:

- acquisition mode is declared up front
- canonical output filename is always `canonical/data.csv`
- status remains `pending` until bytes are staged and checksummed
