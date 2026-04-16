# Benchmark Acquisition Playbooks

This directory contains safe-only acquisition and staging instructions for benchmark datasets.

## Purpose

- document the chosen source for each dataset
- define whether acquisition is `scripted-open`, `manual-stage`, or `derived`
- pin the intended canonical filename and staging location
- record known provenance and reproducibility risks before any download or runner code exists

## Rules

- These playbooks do not download data.
- Scored benchmark execution must never fetch from the network.
- Public staged bytes belong under `testing/benchmarks/data/public/<slug>/v1/`.
- Repo-native derived benchmark data belongs under `testing/benchmarks/data/derived/` or `testing/benchmarks/data/poison/`.

## Current Suite

- Public P0: `titanic`, `ames-housing`, `credit-card-fraud`, `spaceship-titanic`, `adult-income`
- Guardrails base: `novacraft-customer-health-clean`
