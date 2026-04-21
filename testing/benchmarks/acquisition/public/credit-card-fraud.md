# Credit Card Fraud

- Dataset slug: `credit-card-fraud`
- Benchmark role: public P0 robustness and imbalance stress case
- Acquisition mode: `manual-stage`
- Status: `pending`

## Preferred Source

- Kaggle dataset: `mlg-ulb/creditcardfraud`
- URL: `https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud`

## Provenance Reference

- ULB / Worldline collaboration summary
- Reference page: `https://openbigdata.org/resource/credit-card-fraud-detection/`

## Canonical Staging Target

- Root: `testing/benchmarks/data/public/credit-card-fraud/v1/`
- Canonical file: `testing/benchmarks/data/public/credit-card-fraud/v1/canonical/data.csv`

## Manual Stage Rule

- stage the exact benchmark input bytes manually
- later manifest must pin whether the benchmark uses the original PCA-transformed file untouched or a canonical copy with only filename normalization

## Risks

- metric choice matters more here than on the other public datasets
- the benchmark runner should not pretend this is an accuracy-first dataset

## Notes

- keep this in P0 only if the later benchmark contract explicitly reports an imbalance-appropriate metric
- if runtime or metric fit becomes awkward, this is the first public P0 candidate to swap out
