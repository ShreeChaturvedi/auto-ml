# Spaceship Titanic

- Dataset slug: `spaceship-titanic`
- Benchmark role: public P0 preprocessing-rich classification case
- Acquisition mode: `manual-stage`
- Status: `pending`

## Preferred Source

- Kaggle competition: `Spaceship Titanic`
- URL: `https://www.kaggle.com/competitions/spaceship-titanic`

## Canonical Staging Target

- Root: `testing/benchmarks/data/public/spaceship-titanic/v1/`
- Canonical file: `testing/benchmarks/data/public/spaceship-titanic/v1/canonical/data.csv`

## Manual Stage Rule

- stage the chosen benchmark input file outside scored execution
- record the exact upstream filename in the later manifest

## Why It Stays In P0

- familiar enough to explain quickly
- less over-rehearsed than classic Titanic
- strong fit for the platform’s preprocessing story

## Risks

- still Kaggle-gated
- later manifest must freeze one exact source file and target contract
