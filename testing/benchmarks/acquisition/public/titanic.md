# Titanic

- Dataset slug: `titanic`
- Benchmark role: public P0 recognizability anchor
- Acquisition mode: `manual-stage`
- Status: `pending`

## Preferred Source

- Kaggle competition: `Titanic - Machine Learning from Disaster`
- URL: `https://www.kaggle.com/c/titanic`

## Canonical Staging Target

- Root: `testing/benchmarks/data/public/titanic/v1/`
- Canonical file: `testing/benchmarks/data/public/titanic/v1/canonical/data.csv`

## Manual Stage Rule

- export the benchmark input from the sanctioned source outside scored execution
- place the selected input file under the `upstream/` subdirectory before canonicalization
- record exactly which Kaggle file was used in the future dataset manifest

## Risks

- Kaggle-gated acquisition makes this less reproducible than `adult-income`
- the dataset is familiar enough that it should not carry the whole benchmark narrative by itself

## Notes

- keep this in P0 for judge legibility, not provenance strength
- do not add fetch automation for this dataset unless the acquisition policy changes
