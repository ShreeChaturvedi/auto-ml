# Voiceover Transcript — Capstone Voice

Edit any block below. When you're done, ping me ("sync") and I'll:
1. Write each changed block back to `voiceover/scripts/<id>.txt`
2. Re-render only the changed MP3s via `npm run voiceover` (idempotent)
3. Refresh `public/voiceover/main/<id>.mp3` + alignment

## Conventions

- `{{MARK_NAME}}` — sync token. Stripped before TTS. Used by slides to fire visual flourishes when the narrator hits that point in the line.
- `**bold**` — writer-facing emphasis annotation. Stripped before TTS (verified via `walkScript`). Don't put it on numbers if the slide doesn't visually emphasize them.
- Each `{{MARK}} text` block separated by a blank line.
- Numbers ≤ 100 spelled out unless they're inside a snake_case identifier.
- Voice persona: confident, technical, dry. The agent is "the agent / the graph / the executor / the ledger" — never "the AI".

## Render budget

Every scene's `durationInFrames` (design budget) is overridden by its MP3 length when the file exists. So:
- **Audio shorter than budget** → trailing visual hold gets trimmed.
- **Audio longer than budget** → final composed frame holds for the extra time (no jank).
- Aim for ±2s of budget unless the slide is a landing/intro that can stretch.

`Δ` column below: `(rendered − budget)`. `+` = audio runs long; `−` = audio runs short.

---

## OPENING MOVEMENT

### 1. `title` — 9.0s budget · 5.6s rendered · Δ −3.4s

Slide: 3D logo mark assembles → wordmark → tagline → CSE-449 institutional lockup. Mostly silence by design.

```
{{WORDMARK}} Agentic AutoML Platform.

{{TAGLINE}} From a dataset to deployed models, **agentically** and **autonomously**.
```

---

### 2. `hook` — 12.0s budget · 19.9s rendered · Δ +7.9s ⚠ runs long

Slide: hero "80%" stat with the Anaconda 2022 ledger. ⚠ Currently overruns budget by ~8s — trim or accept the extra hold.

```
{{LEDE}} Data scientists spend **eighty percent** of their time on everything except {{TRAINING}}**training models**.

{{LEDGER}} They cleanse, prepare, visualize, and deploy, and {{HERO_ROW}} the actual modeling is **one slice** of the day.

{{CITE}} That number comes from Anaconda's twenty-twenty-two survey of three thousand practitioners.
```

---

### 3. `team` — 14.0s budget · 13.9s rendered · Δ ≈ 0

Slide: Shree (left) + Ayush (right) with role + bullets.

```
{{HEADING}} **Two engineers** built this.

{{COL1}} I'm **Shree**, and I built the agentic workflow, the LangGraph state machine, and the UI system that sits on top of it.

{{COL2}} **Ayush** built the notebook runtime, the Docker sandbox that runs every cell, and the evaluation harness we score the platform against.

{{HOLD}} Between the two of us, every layer of the product has an author.
```

---

### 4. `acknowledgements` — 13.0s budget · 22.0s rendered · Δ +9.0s ⚠ runs long

Slide: Khamaiseh + Stahr advisor cards with amber glow finish.

```
{{HEADING}} Two advisors **shaped** this project.

{{SAMER}} **Doctor Samer Khamaiseh** pushed us hard on architecture, on sandboxing, and on what the word **working** actually means when you ship software.

{{STAHR}} **Professor Lynn Stahr** set the cadence of the year, read every draft we wrote, and built the review panel that treats today as **real work**.
```

---

### 5. `problem-trio` — 34.0s budget · 28.8s rendered · Δ −5.2s

Slide: 3-card indictment — six tools / five disciplines / AutoML hides decisions.

```
{{HEADING}} A modern machine learning workflow lives in **six** different tools.

{{TOOLS}} Jupyter, dbt, pandas, sklearn, MLflow, and Streamlit, spread across **four** languages and roughly **eleven** context switches an hour.

{{SKILLS}} The person who owns that stack needs **five** disciplines at once, from SQL and Python to statistics, containers, and MLOps, and the average engineer honestly covers **one and a half** of them.

{{AUTOML}} Classical AutoML papers over the gap by optimizing the model and hiding the decisions underneath. When to drop rows, how to encode, when to regularize, the things a production team has to be able to defend.

{{CLOSER}} Three problems, and **one** workspace that solves all of them.
```

---

### 6. `why-now` — 24.0s budget · 22.9s rendered · Δ ≈ 0

Slide: 4-beat timeline 2020 → 2026, then "build for the right column" closer.

```
{{HEADING}} The tooling has finally caught up with the ambition.

{{T2020}} In **twenty-twenty**, we had transformer-scale models that were brilliant on paper and brittle in production.

{{T2023}} By **twenty-twenty-three**, ReAct and structured tool use meant agents could finally reason through a task instead of guessing at it.

{{T2024}} **Twenty-twenty-four** brought LangGraph and MCP, which made those agents typed, durable, and observable.

{{T2026}} And in **twenty-twenty-six**, classical AutoML is still optimizing the **easy twenty percent** while the other **eighty** stays human.

{{CLOSER}} This platform is built for the **right column**.
```

---

### 7. `agenda` — 27.0s budget · 23.5s rendered · Δ −3.5s

Slide: 7 chapters left, 3 proofs right, blue pulse on chapter 3 (LangGraph).

```
{{HEADING}} Here is the next **twenty minutes**.

{{ROWS}} Seven chapters, starting with upload, {{R2}}then exploration, {{R3}}then preprocessing, where the **LangGraph state machine** really shows up, {{R4}}followed by feature work, {{R5}}training inside **Docker**, {{R6}}experiments, {{R7}}and finally what comes next.

{{PROOFS}} Three things we want to prove along the way. That humans stay in the loop **without losing pace**, {{P2}}that an agentic pipeline can be **observed** instead of blindly executed, {{P3}}and that **one platform** can carry the full workflow end to end.

{{PULSE}} Chapter three is **the spine** of the talk, so watch for it.
```

---

## URL INTRO + DEMOS

### URL intro — no voiceover (5.5s, pure Remotion)

A new-tab backdrop zooms into the URL pill and types `agentic-automl.vercel.app`. Pixel-continuous hand-off into the landing scroll.

---

### 8. `scene-landing` — 55.6s budget (MP4 length) · demo voiceover

Demo: pre-rendered landing-page scroll capture. Narration rides on top.

```
{{HERO}} **The fastest way to build production ML models**, agentically. You upload the data, describe the goal, and walk away.

{{PHASES}} The landing page is the product in miniature. Seven phases — **ingest, explore, preprocess, engineer, train, experiments, deploy** — and the agent works each one in order.

{{NOTEBOOK}} What you get back is a real notebook. **Pandas, sklearn, Plotly** — every cell editable, every decision on the record.

{{PILLARS}} Underneath, three things carry the weight. A **Docker sandbox** that isolates execution. **Optuna** that finds the winning model. **LangGraph** that keeps the sub-agents in lockstep.

{{CLOSER}} Stop babysitting your notebooks.
```

---

### 9. `scene-signup` — 25.0s budget · 11.5s rendered · Δ −13.5s

Demo: Playwright signup form drive.

```
{{CTA}} This is Ayush. He is a data science student at Miami, and he has a dataset he wants a model for.

{{SIGNUP}} He does not have an account yet, so we will start there.

{{TYPE_NAME}} Name and school email, {{TYPE_PASSWORD}} followed by a password he will remember on day two.

{{SUBMIT}} And he is in.
```

---

### `signup-gmail` — no voiceover (15s)

Secondary tab opens to a Gmail-lookalike for verify-email.

---

### 10. `scene-home` — 4.0s budget · 2.9s rendered · Δ ≈ 0

Demo: home page after login.

```
{{HOMEPAGE}} No project, no data, no starter scripts — yet.
```

---

### 11. `scene-walkthrough` — 466s budget (7:46 MP4) · demo voiceover

Demo: the full application walkthrough — home → upload → explorer → preprocessing → feature engineering → training → experiments. Narration is deliberately sparse (~52% talk / 48% silence) so visuals carry the beats.

```
{{UPLOAD}} I sign in, name the project **NovaCraft Churn Intelligence**, and pick the seven files Ayush left on the desktop — five CSVs and a **business context PDF** that spells out what churn means for this company.

{{PLAN}} I paste the goal. Predict whether an account stays active, optimize for recall on churned accounts. The agent explores the workspace, reads each dataset profile, searches the PDF for the churn definition, and drafts a plan before it writes a single line of code.

{{PLAN_DETAIL}} Target variable — `is_active`. Thirty-day forecast horizon. Time-based train-validation-test splits. Primary metric **PR-AUC**, with F1 and precision-at-top-k as ranking checks. Every risk and assumption written down before the first model runs.

{{EXPLORE}} **Exploration** is next. The data viewer loads the full workspace — customers, subscriptions, marketing campaigns, support tickets, usage metrics. I ask a question in English — segment customers by industry and company size, compare their engagement — and the agent writes the SQL, shows me the query, runs it, and paints the answer into the grid. I approve or reject each generation.

{{PREPROCESS}} **Preprocessing** opens as a workbook. I pick `usage_metrics.csv` and type the instruction — clean missing `annual_revenue_usd` values before modeling churn. The agent proposes the fix, impute missing values gets accepted, and the cell lands in the notebook, ready to execute.

{{PREPROCESS_RUN}} Generate, run, validate, commit. Each step is a receipt. Row counts stay stable. If a run fails, the executor parses the traceback, installs the missing package out-of-band, and retries the same cell — the identical-call guard exempts re-runs of the same cell, because that's recovery, not a stuck loop.

{{FEATURES}} **Feature engineering** opens a fresh draft pipeline. I ask for five candidate features. The agent proposes them with source columns, cyclical encoders for time-of-year signals, and a rationale for each. I switch on the ones that matter — `support_ticket_velocity`, `logins_per_active_user`, expansion ratios — and the notebook steps build themselves underneath.

{{FEATURES_RUN}} Execution succeeds. Validation passes. The feature is **registered** and the pipeline checkpointed. Then I apply the pipeline and it writes out `feature_v1.csv` — a clean, versioned dataset ready for training, reproducible from the raw CSVs any time I need to rebuild it.

{{TRAINING}} **Training**. I point the workbook at `feature_v1.csv`, name the target column, and ask for gradient boosting and random forest. The agent configures the experiment, sets up cross-validation, and then proposes three candidate models — each with a paragraph explaining why this data, this horizon, this split strategy.

{{RUNTIME}} The runtime manager confirms the sandbox already has the packages it needs — pandas, sklearn, optuna, the full scientific stack — and surfaces any missing dependency before the model turn ever starts.

{{APPROVAL}} A random forest comes up first, tuned for the time-ordered signal. I mark it **selected**. The graph pauses on a human approval gate until I confirm — radio buttons, not prompt engineering — then unpauses and writes the real training code into the notebook.

{{EXECUTE}} The cell runs inside the **Docker sandbox**. Cross-validation splits, calibration curves, feature importance, a saved model artifact. F1 at nine nine eight six. ROC AUC at nine nine nine oh. Model registered as `feature_v1_random_forest` and available to every downstream phase.

{{RECOVERY}} One cell trips on a missing module. The executor catches the traceback, installs the package out-of-band, and re-runs the exact same cell — the graph handles the recovery and the next cell picks up where the last one left off.

{{EXPERIMENTS}} **Experiments** is the leaderboard. Every run ranked, every metric reported, every decision explained in prose the agent wrote while the code was still warm. The dashboard opens on the top-line card — best accuracy, models trained, overfit risk, algorithm diversity, metric spread — and an executive summary that names the leader and explains what the margin actually means.

{{SUMMARY}} The agent's write-up does the reasoning out loud. Why `feature_v1_random_forest` leads on ROC AUC, where the evidence is thin because only one model has reported, and what the missing train-side metrics mean for the overfitting assessment. The recommendations section tells me to run a broader benchmark — logistic regression, gradient boosting, XGBoost — before I trust the ranking.

{{SECOND_MODEL}} So I do exactly that. I kick off a **LightGBM** proposal in a parallel workbook, and the leaderboard redraws itself with two algorithms instead of one. Overfit risk reads **low** with a one-point-three-percent gap between train and test. A radar chart lays the two models on top of each other — recall, ROC AUC, accuracy, precision, F1-weighted — and the shape tells the story before I read a single number.

{{LIGHTGBM_PAGE}} I open the LightGBM page. The **confusion matrix** is the first red flag — every test point predicted as one, zero true negatives, five hundred and sixteen true positives, two hundred and ninety false positives. The ROC curve hugs the diagonal at AUC zero-point-five-one. The calibration curve drifts below the perfect line. Cross-validation sits tight at nine-twenty across five folds — the training is stable, only stable at the wrong answer.

{{ERROR_TREE}} The **error tree** underneath makes the failure legible. A decision tree trained on the prediction errors splits first on `total_logins`, then on `feature_adoption_pct`, and the misclassifications concentrate in a handful of leaves. I can see which customer segments the LightGBM proposal is confused by, ranked by confidence, before I write a single diagnostic line of code.

{{FOREST_PAGE}} Then I open the **random forest** page and the plots flip. The confusion matrix is clean — zero false positives on the held-out slice. The ROC curve snaps to the top-left corner at AUC equal to one. The calibration curve tracks the diagonal. Same dataset, same target, same split — the shapes of the plots are the decision.

{{RECOMMENDATIONS}} The agent's recommendations now read differently. Deploy `feature_v1_random_forest` as the current candidate. Add training diagnostics — train-set metrics, cross-validation curves, fit-time — to validate generalization. And run probability calibration and threshold analysis before production, because churn interventions ride on the scores, not only the class labels.

{{DEPLOY}} From here, one click ships the winning model to a monitored endpoint. The ledger keeps everything straight — runs, events, artifacts, approvals, handoffs. Three phases can run in parallel and the state never tangles. Every decision anchored to a row in the ledger, every cell re-executable from a fresh kernel, every artifact traceable back to the CSV that produced it.

{{CLOSER}} One project, one graph, **one notebook that explains itself** — built by the agent while I watched, auditable from the first dataset profile to the last calibration plot.
```

---

## TECH STACK BRIDGE

### 11. `tech-stack` — 15.0s budget · 14.7s rendered · Δ ≈ 0

Slide: 4 ledger rows (Experience / Orchestration / Intelligence / Execution) + telemetry receipts (1,550 tests, 97% coverage). Bridges product demo into architecture deep-dive.

```
{{HEADLINE}} The design is a **probabilistic core** running inside a **deterministic shell**.

{{L1}} There is an experience layer on top, {{L2}} an orchestration layer underneath it, {{L3}} an **intelligence** layer that is the only part of the system allowed to guess, {{L4}} and an execution layer on the bottom.

{{TELEMETRY}} **Fifteen hundred and fifty tests** run green on every commit, ninety-seven percent of the code is covered, and every layer writes a **receipt** when it does work.

{{CLOSER}} We did not automate the eighty percent. We made it **auditable**.
```

---

## ARCHITECTURE DEEP-DIVE

### 12. `arch-hook` — 18.0s budget · 21.0s rendered · Δ +3.0s

```
{{EYEBROW}} Now to the **backend**.

{{LINE1}} A chatbot that writes **code** is easy to build.

{{LINE2}} A chatbot that writes code, **runs** it, **fails**, **recovers**, and **commits** the result is a very different piece of software.

{{CLOSER}} This is the machinery that makes that second version feel **boring**.
```

---

### 13. `arch-engine` — 32.0s budget · 26.9s rendered · Δ −5.1s

```
{{TITLE}} One **graph**, six **nodes**, and every phase of the product uses it.

{{CODE_IN}} Under the hood it is a **LangGraph** **state graph**.

{{NODES}} Each turn prepares the context, invokes the model, executes whatever tools the model called, and then either pauses for a human, completes cleanly, or fails loudly.

{{ROUTER}} A router reads the current state and chooses the next node, which means there are no loops the system did not authorize.

{{REDUCERS}} State **reducers** merge each turn back in, so we never re-enter the graph in a weird place.

{{PILL}} One graph, three phases, twenty-nine stages.
```

---

### 14. `arch-phase-adapter` — 22.0s budget · 16.9s rendered · Δ −5.1s

```
{{TITLE}} Same engine, with different rules per **phase**.

{{CARDS}} Preprocessing has nine stages, feature engineering has ten, and training has ten of its own.

{{CODE_IN}} Each stage declares its own tool **allowlist**.

{{EXEC}} Inside **execute_training**, for example, the model can call execute_training and nothing else.

{{CLOSE}} The stage is a fence, and the model stays inside it.
```

---

### 15. `arch-training-propose-a` — 15.0s budget · 15.7s rendered · Δ ≈ 0

```
{{EYEBROW}} Training begins here.

{{ANSWER}} Stage one is **answer**, where the agent restates what you actually asked it to do.

{{CONFIGURE}} Stage two is **configure_experiment**, which pins down the dataset, the target column, and the metric.

{{PROPOSE}} Stage three is **propose_model**, where the agent lines up three candidates and hands the choice to a **human**.
```

---

### `arch-training-propose-approval` — silent by design (4.0s)

The approval beat plays in pure silence — `voiceoverFile` intentionally omitted.

---

### 16. `arch-training-propose-b` — 10.0s budget · 6.5s rendered · Δ −3.5s

```
{{RESUME}} The user picks a model and the graph **unpauses**.

{{HANDOFF}} From here on, the interesting part is writing code the agent has to actually **run**.
```

---

### 17. `arch-training-execute-cascade` — 72.0s budget · 69.9s rendered · Δ ≈ 0

```
{{TITLE}} Generate, run, fail, recover.

{{GEN}} Stage four is **generate_code**, which drops a draft into the notebook.

{{WRITE}} Stage five is **write_code**, which commits that draft to a real cell.

{{EXEC1}} Stage six is **execute_training**, which runs the cell inside a sandboxed kernel.

{{FAIL}} And on the first run, it **fails**, with a **ModuleNotFoundError** for **xgboost**.

{{PARSE}} The executor reads the traceback and pulls the missing module name out of it.

{{INSTALL}} Then it calls **install_package** **out-of-band**, outside the model's turn, so the model never sees the plumbing.

{{RETRY}} After the install, it re-runs the **same cell**, with the same ID and the same arguments.

{{EXEMPT}} Our identical-call guard makes an exception for **run_cell**, because re-running a cell after a fix is **normal** behavior, not a stuck loop.

{{MARKER}} Training finishes and the cell prints a **marker** to stdout.

{{CODE_IN}} Double underscore, **TRAIN_COMPLETE**, a pipe character, and then the JSON payload.

{{LASTINDEXOF}} We scan stdout with **last-index-of**, because earlier failed runs printed their own markers, and the last one wins.

{{EVAL}} Stage seven is **evaluate_results**, which reads the metrics out of that payload.

{{REG}} Stage eight is **register_model**, which writes the result into the model registry.

{{CASCADE}} One graph, three phases, twenty-nine stages, one registered model.
```

---

### 18. `arch-pullback` — 46.0s budget · 32.5s rendered · Δ −13.5s

```
{{TITLE}} Everything the agent does is **written down twice**.

{{EVENTS}} The backend streams **JSON events** to the browser across nine types, covering state updates, tool executions, artifacts, pauses, errors, tokens, thinking, usage, and done.

{{DB}} Every one of those events is also written to **Postgres**, across six tables for runs, events, artifacts, approvals, handoffs, and notebook bindings.

{{PARALLEL}} Three phases can run **in parallel** inside a single project, with one paused for approval, one actively running, and one already finished, and the ledger keeps all three straight.

{{SERIF1}} A probabilistic core,

{{SERIF2}} inside a deterministic shell.

{{CLOSE}} That is how an agent becomes **production software**.
```

---

## BENCHMARKS — PROOF OF THE THREE CLAIMS

### 19. `benchmarks-hook` — 15.0s budget · 13.7s rendered · Δ ≈ 0

```
{{TITLE}} Three measurements, run in a single night.

{{PANELS}} We measured **speed** against a manual Jupyter workflow, **guardrails** against ten seeded data flaws, and **quality** against live Kaggle leaderboards.

{{HERO}} The headline number is **sixteen out of twenty**, and it is the one to watch.
```

---

### 20. `benchmarks-speed` — 18.0s budget · 13.9s rendered · Δ −4.1s

```
{{TITLE}} From raw CSV to a held-out evaluation, in **minutes**.

{{BARS}} Five Kaggle datasets, timed on the same clock from upload to metric, with **manual Jupyter** in grey and **AutoGluon** in amber.

{{HERO}} The median across all five runs is **seven times faster**.

{{SAVED}} That is a hundred and sixteen minutes of an afternoon, **back** in your pocket.
```

---

### 21. `benchmarks-quality` — 18.0s budget · 21.1s rendered · Δ +3.1s

```
{{TITLE}} Where the outputs actually **land** on the public Kaggle leaderboards.

{{GAUGE}} Same pipeline, no per-dataset tuning, five submissions across five datasets.

{{TITANIC}} **Top eight percent** on Titanic, which is the ninety-second percentile overall.

{{STRIP}} And **top fifteen percent or better** on every other dataset we submitted.
```

---

### 22. `benchmarks-guardrails` — 20.0s budget · 15.5s rendered · Δ −4.5s

```
{{TITLE}} Ten well-known flaws seeded into the data, and we measured which ones the platform catches.

{{ROWS}} Target leakage, hidden missing values, datetime columns typed as numeric, and seven more defects drawn from the standard playbook, all seeded into the same test set.

{{OURS}} Our agent catches **eight** out of the ten cleanly.

{{BASELINE}} Sklearn defaults catch roughly **one and a half**.

{{HERO}} Across the full twenty-check rubric, sixteen for us versus **three** for the baseline.
```

---

## JOURNEY — 11 MONTHS

### 23. `journey-pulse` — 10.0s budget · 9.7s rendered · Δ ≈ 0

```
{{EYEBROW}} Eleven months of work, in **three phases**.

{{COUNTERS}} Nearly two thousand commits, three hundred twenty-four issues, and a hundred fifteen merge requests.

{{PEAK}} The peak week landed **four hundred twenty commits**, the week we shipped this demo.
```

---

### 24. `journey-foundation` — 8.0s budget · 7.3s rendered · Δ ≈ 0

```
{{HEADER}} The **foundation** phase, sprints one through four.

{{HERO}} A working backend, a UI shell, and natural-language SQL running end to end by February.

{{MILES}} A hundred thirty-four commits and nine months of plumbing that nobody sees.
```

---

### 25. `journey-agentic` — 8.0s budget · 8.8s rendered · Δ ≈ 0

```
{{HEADER}} The **agentic turn**, sprints five through eight.

{{HERO}} The entire pipeline collapses onto a single **LangGraph** state machine.

{{PILL}} Four hundred twelve commits, and the week issues finally started getting **labelled** properly.
```

---

### 26. `journey-production` — 8.0s budget · 8.1s rendered · Δ ≈ 0

```
{{HEADER}} The **production** phase, sprints nine through eleven.

{{HERO}} Experiments, security hardening, and the Remotion reel you are watching right now.

{{PEAK}} **One hundred fifty-one** commits in a single day, last Tuesday.
```

---

## RETROSPECTIVE

### 27. `ai-collaboration` — 8.0s budget · 8.2s rendered · Δ ≈ 0

```
{{EYEBROW}} Yes, we used **AI** to build an AI product, and we are upfront about it.

{{CARDS}} **OpenAI** drove the core engine, **Gemini** paired with us on the frontend, and **Cursor** helped triage {{ISSUES}}**three hundred twenty-four** issues across the year.
```

---

### 28. `retro-learned` — 7.0s budget · 7.7s rendered · Δ ≈ 0

```
{{TITLE}} What we **learned** over the year.

{{S1}} **State machines** beat chained prompts, every single time.

{{S2}} **Retrieval** beat prompt tuning once the corpus got real.

{{S3}} Eval harnesses are infrastructure, and you ship them in sprint **one**, not sprint nine.
```

---

### 29. `retro-went-well` — 7.0s budget · 7.8s rendered · Δ ≈ 0

```
{{TITLE}} What went **well**.

{{S1}} Playwright caught **three regressions** in CI before our QA pass ever saw them.

{{S2}} Tool calling on top of LangGraph turned loose improvisation into a **structured workflow** we could actually reason about.
```

---

### 30. `retro-differently` — 7.0s budget · 7.5s rendered · Δ ≈ 0

```
{{TITLE}} What we would do **differently**.

{{S1}} Start on **LangGraph** from day one. We spent **nine months** rolling our own orchestrator before we gave up.

{{S2}} Ship the **end-to-end shell** first so you can feel the product on day one, even if every layer is a stub.
```

---

## CLOSING

### `closing` — silent by design (13.5s)

The 5-phase wordmark assembly ("Stop babysitting your notebooks." → "Thank you." → wordmark) plays in design silence. **Adding a voiceoverFile here would collapse the bookend animation** because calc-metadata hard-overrides duration with MP3 length. Leave it silent.

---

## EDIT WORKFLOW

1. Edit any block above.
2. When done, ping me with one of:
   - **"sync"** — write all edited blocks back to `.txt` files and re-render only the changed MP3s.
   - **"sync hook"** (or any id) — re-render just one.
   - **"sync all"** — force re-render every file (use after a major rewrite).
3. The Remotion Studio at http://localhost:3000 hot-reloads on MP3 file changes.

## Constraints to remember when editing

- **Don't add `?`, `!`, or `;`.** Existing canon is periods + em-dashes only.
- **Don't say "the AI"** — say "the agent / the graph / the executor / the ledger".
- **No marketing words**: amazing, powerful, seamless, leverage, utilize, enable, simply, just, easy.
- **No rhetorical questions.** Re-cast as declarative.
- **Spell out integers ≤ 100** (`nine`, `twenty-nine`) except inside snake_case tokens.
- **`{{MARK_NAME}}`** must be uppercase + underscores, ASCII only.
- A block can be one mark with no text (silent beat) — e.g. `{{LOCKUP}}` alone holds for that mark's resolved frame, then nothing is spoken.

If you want me to draft alternates for any specific slide rather than just polish what's there, say so — I'll rewrite top-to-bottom.
