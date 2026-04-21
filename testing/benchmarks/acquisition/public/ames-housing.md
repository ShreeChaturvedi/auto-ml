# Ames Housing

- Dataset slug: `ames-housing`
- Benchmark role: public P0 regression anchor
- Acquisition mode: `manual-stage`
- Status: `pending`

## Preferred Source

- Kaggle competition framing: `House Prices - Advanced Regression Techniques`
- URL: `https://www.kaggle.com/c/house-prices-advanced-regression-techniques`

## Open Provenance Reference

- De Cock (2011) source documentation
- URL: `https://jse.amstat.org/v19n3/decock/DataDocumentation.txt`

## Canonical Staging Target

- Root: `testing/benchmarks/data/public/ames-housing/v1/`
- Canonical file: `testing/benchmarks/data/public/ames-housing/v1/canonical/data.csv`

## Manual Stage Rule

- treat the Kaggle-style train split as the benchmark input only if the later manifest explicitly blesses it
- keep the De Cock source docs alongside manifest authoring for provenance notes, even if the staged bytes come from the competition framing

## Risks

- there are multiple public versions of Ames-derived data
- the later manifest must freeze one exact source and one exact column contract

## Notes

- this dataset stays in P0 because it is an easy regression story for judges
- the manifest authoring pass must settle whether the benchmark uses Kaggle competition bytes or a cleaner open-source Ames derivative
