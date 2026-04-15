# Dataset fixtures — Beat 3+

**Status: Deferred — populated as part of Beat 3+ follow-up plan.**

Beats 1 & 2 (landing scroll + auth) do not require these files. They are
listed here as a contract for the Beat 3 work so the upload → EDA →
preprocessing scenes have real data to narrate against.

## Files to author

### `student-retention.csv`

- **Source:** UCI Student Dropout & Academic Success dataset
  https://archive.ics.uci.edu/dataset/697/predict+students+dropout+and+academic+success
  Licence: CC-BY 4.0 (credit "Realinho et al., 2021" in video description).
- **Transform (see plan Appendix A):**
  - Filter `Target` to binary `{Dropout, Graduate}` (drop `Enrolled`).
  - Stratified-sample to **~3000 rows** preserving the class ratio.
  - Rename 17 columns to Miami-friendly labels (e.g. `Curricular units 1st sem (grade)`
    → `fall_gpa`).
  - Inject realistic missingness per column (see `tweaks.md` for the
    exact per-column rates).

### `miami-retention-policy.md`

- **Source:** Hand-written 4-page policy brief (original work).
- **Sections:**
  1. Academic Standing — GPA thresholds, probation rules.
  2. Financial Aid — aid-renewal criteria, SAP policy.
  3. Retention Interventions — early-warning program, advising cadence.
  4. Glossary — term definitions referenced by the EDA chat.
  5. Demographic Equity — fair-lending-style protected-class notes used to
     seed the bias-checking scene.

### `tweaks.md`

- Plain-English log of every transformation applied to the raw UCI CSV:
  row filter, sampling, column rename, missingness injection. Used by the
  video's EDA chat scenes so the narration is factually grounded.

## Usage

Once authored, these files live alongside this README and are consumed by:

- `remotion/scenes/App/screens/project.upload/` — shows the CSV dropping
  into the uploader.
- `remotion/scenes/App/screens/project.eda/` — the chat cites the policy MD
  via `cite://miami-retention-policy.md#<section>` anchors.
- `remotion/scenes/App/screens/project.preprocess/` — recapitulates the
  missingness injection as a real preprocessing step.

## Size

Expect ~300 KB for the CSV and ~8 KB for each MD file. They are fine to
commit; do **not** gitignore this directory.
