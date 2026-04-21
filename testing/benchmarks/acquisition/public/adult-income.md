# Adult Income

- Dataset slug: `adult-income`
- Benchmark role: public P0 fifth-slot anchor
- Acquisition mode: `scripted-open`
- Status: `pending`

## Preferred Source

- UCI Machine Learning Repository: `Adult`
- URL: `https://uci-ics-mlr-prod.aws.uci.edu/dataset/2/adult`

## Canonical Staging Target

- Root: `testing/benchmarks/data/public/adult-income/v1/`
- Canonical file: `testing/benchmarks/data/public/adult-income/v1/canonical/data.csv`

## Intended Canonicalization

- combine the train/test style upstream files into one canonical CSV only if the manifest later explicitly blesses that transformation
- normalize column names to the benchmark contract, not ad hoc per run
- preserve the original income target semantics

## Why This Dataset Is Safe To Stage Early

- open source, no Kaggle gating
- stable official provenance
- good fit for mixed categorical preprocessing

## Notes

- this is the strongest candidate for a fully scripted acquisition flow
- once staged, the manifest should record source URL, license, byte checksum, and canonical row/column expectations
