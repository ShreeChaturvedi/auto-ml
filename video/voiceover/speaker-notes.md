# Speaker Notes

The audience can read what's on screen. Your job is to add the things the slide can't show — context, the story behind a number, what to look at, why we did it this way. Don't recite the slide.

Each section says (a) what's on screen so you know what they're seeing, then (b) what to actually say. Say it however it comes out of your mouth.

---

## 1 · Title  *(logo, "Agentic AutoML Platform", tagline, CSE 449 lockup)*

**On screen:** the product wordmark and the Miami CSE 449 capstone lockup land.

**Say:**
"Hi everyone — thanks for watching. I'm Shree Chaturvedi. My partner Ayush and I built this for our senior capstone, and over the next twenty minutes I'll walk you through what it does, how it works under the hood, and how well it actually performs."

---

## 2 · Hook  *("Data scientists spend 80% of their time except training models" + activity bar chart)*

**On screen:** the 80% number lands big in red. The chart on the right shows where the day actually goes — cleaning data is 26%, prep is 20%, viz is 14%, deployment 11%, reporting 9%, training itself only 20%.

**Say:**
"Pretty much everyone in this room has heard the eighty-percent stat. The reason I'm putting it back on screen is that the chart on the right is the part that surprised me. Look how the day actually splits — cleaning is the biggest single bucket. Bigger than modeling. We started this project because we kept losing whole afternoons to that kind of work, and we wanted to know if an agent could take it back."

---

## 3 · Team  *(two columns: photos, names, majors, roles, three numbered bullets each)*

**On screen:** photos of me and Ayush. Underneath each of us, three bullets describe what we own — for me it's the agentic workflow, the LangGraph FSM, and the UI; for Ayush it's the notebook runtime, the Docker sandbox, and the Optuna eval harness.

**Say:**
"There's two of us — me on the left, Ayush on the right. The bullets cover what we built, but the shorter version is that we split the system right down the middle. Ayush owns everything that runs your code. I own everything that decides what code to run. We picked that division about a month in because it kept us from stepping on each other, and honestly, it kept the system honest — neither half could fake a dependency on the other."

---

## 4 · Acknowledgements  *(two advisor columns: photos, names, roles, three bullets each)*

**On screen:** Dr. Samer Khamaiseh and Professor Lynn Stahr. The bullets describe what each of them pushed us on — Khamaiseh on the architecture and sandboxing, Stahr on cadence, drafts, and the panel.

**Say:**
"Two people who made this project a lot better than it would have been alone. Dr. Khamaiseh was our technical advisor — every time we tried to wave our hands at something hard, he caught us. Sandboxing in particular. We had a much weaker plan for that originally. And Professor Stahr ran the whole capstone — she set the cadence, she read every revision of every document we put together, and she's the reason there's a real panel watching today instead of just a checkbox."

---

## 5 · Problem trio  *("A modern ML workflow lives in 6 different tools" — three panels with a focus shift)*

**On screen:** three card panels. The slide spotlights them one at a time — first the tool fragmentation panel (Jupyter, dbt, pandas, sklearn, MLflow, Streamlit), then the skill-stack one (SQL, Python, stats, containers, MLOps), then the AutoML one (which rows to drop, how to encode, when to regularize).

**Say (timed to the focus shifts):**
"Three problems we kept running into. First one — your workflow lives in six different tools. The slide lists ours, but the real point is the cost of jumping between them. Every transition is a chance to lose context."

*(when panel 2 highlights):*
"Second — the person who can do all of that is rare. Most people are deep in maybe one or two of those areas, not all five. So either you hire a small team that costs a lot, or one person spreads themselves too thin."

*(when panel 3 highlights):*
"Third — and this is the one I care about most — existing AutoML tools optimize the model, but they hide the choices a real production team needs to defend. Stuff like which rows you dropped, how you encoded the categoricals, when you regularized. We wanted those decisions visible. Every single one. That's the project."

---

## 6 · Why now  *(2020/2023/2024/2026 timeline + "GAP" lane diagram)*

**On screen:** a four-marker timeline with the years and a one-line context for each. After the timeline lifts, you see a two-lane diagram: the top lane is what classical AutoML handles — model search, hyperparameter tuning, train-test split, metric eval — labeled "Previous tools stopped here." The bottom lane is everything else — domain framing, profiling, transformation approval, feature hypotheses, error triage, handoff — labeled "Our agent picks up the rest." A red GAP marker sits between them.

**Say:**
"The reason this project is possible right now and not two years ago — the agent infrastructure caught up. ReAct in 2023 made tool use stable. LangGraph in 2024 made agents typed and observable. So when we started, we had real building blocks instead of duct tape."

*(when the lane diagram appears):*
"This is the part to remember. The top lane is what classical AutoML already does — well. The bottom lane is the work that's been done by hand for the last decade. What we built is the bridge across that gap."

---

## 7 · Agenda  *(8 chapter station list + 3 proofs on the right)*

**On screen:** a numbered station rail with eight chapter titles down the left. Chapter 3 — preprocessing — has an accent pulse. On the right, three proof statements with serif epigraphs: humans in the loop without losing pace, observable agentic pipelines, one platform end-to-end.

**Say:**
"Quick map. There's eight chapters on the left. The one I'd flag is chapter three — preprocessing — that's where you'll see the LangGraph state machine actually doing work. The right column is what I'm asking you to evaluate me on by the end. Three claims: that a person can stay in the loop without slowing the agent down, that everything the agent does is auditable, and that one platform actually carries the whole workflow. Watch for those."

---

## 8 · URL intro  *(silent)*

**On screen:** the address bar of a browser with the URL being typed.

*Don't talk over it.*

---

## 9 · Landing scroll  *(55 seconds, silent capture)*

**On screen:** the marketing landing page scrolls on its own. No narration was recorded for this beat.

**Optional (one line max if you feel the silence is too long):**
"That's the marketing site we built. Same product story, different surface."

*Otherwise let it play.*

---

## 10 · Signup demo  *(Ayush filling out signup form)*

**On screen:** the signup form fills in — name, email, password, submit.

**Say:**
"OK, the demo. Meet Ayush — same person from the team slide, but for this scenario he's just a data science student who landed on our site with a CSV he wants a model on. He doesn't have an account yet, so let's get him in. Name, school email, password he won't forget on day two. And he's in."

---

## 11 · Signup → Gmail → verify  *(silent — second tab opens, verification email arrives)*

**On screen:** a second tab opens with a Gmail-style inbox, the verification email is there, he clicks the link.

*Don't talk over it. The flow speaks for itself.*

---

## 12 · Full app walkthrough  *(6 min 43 s, silent)*

**On screen:** the entire product walkthrough — home, upload, EDA, preprocessing, feature engineering, training, experiments. No narration.

*This is the longest silent stretch in the video. If you want to add per-phase narration here, we should write it separately — it'll be a different style than these slide notes. Otherwise, let the visuals carry it.*

---

## 13 · Tech stack  *(four-layer architecture diagram + telemetry strip)*

**On screen:** a single vertical spine with four layers branching off — EXPERIENCE, ORCHESTRATION, INTELLIGENCE (pulsing accent blue), EXECUTION. Each layer lists the tech in it. Below: a telemetry strip with five numbers — 1,550 tests (flashing green), 97% coverage, 12,000 LOC typed, 62 packages, 21 schema migrations. The closer reads "We didn't automate the 80%. We made it auditable."

**Say:**
"Quick architectural overview before I go deeper. The thing to focus on is layer three — INTELLIGENCE, the one pulsing blue. That's the only layer in the system that makes a probabilistic decision. Everything else — the React frontend, the Express backend, the Postgres database, the Docker sandbox — is deterministic. We isolated the part that can guess, and we surrounded it with code that can't."

*(when the test count flashes green):*
"And we held ourselves to that. Fifteen hundred and fifty tests, all green. Ninety-seven percent coverage. Every layer has receipts."

---

## 14 · Architecture — hook  *("How this actually runs.")*

**On screen:** a serif sentence pair contrasting "A chatbot that writes code is *easy*" (easy in green) with "A chatbot that writes code, runs it, fails, recovers, and commits the result — *is not*" (is not in red). Then a sans-serif line: "Here's the *machinery* that makes it boring." A faint preview of the training graph sits on the right.

**Say:**
"This is the part of the talk that I'm most excited about — the backend architecture. The framing on screen is exactly how I think about it. Building something that just writes code is easy now, anyone can do that with the API. Building something that writes code, runs it, watches it fail, fixes the failure on its own, and then logs everything it did — that's where the real work was. The rest of this section is how we made that part boring."

---

## 15 · Architecture — engine  *("One state graph." — 6-node graph + code panel + reducer chips)*

**On screen:** the LangGraph state graph appears, six nodes — start, prepare, invoke_model, execute_tools (which fans out to pause/complete/fail and loops back to prepare). A blue "routeNextStep()" pill annotates the fan-out. A code panel reveals graph.ts on the right. Three small chips at the bottom show the state reducers — messages (append-only), toolCalls (array reducer), pendingInputKind (last-wins). A telemetry pill at the bottom-right reads "1 graph · 3 phases · 29 stages."

**Say:**
"This is the core of the system. One LangGraph state graph that every phase of the product runs on. You're looking at a turn-based loop — start, prepare context, call the model, the model calls tools, then we route to the next state. The thing to focus on is that 'routeNextStep' pill on the right. That's deterministic logic — it's *not* the model deciding what happens next. That's what keeps the agent from spinning forever or going off-script."

*(when the reducer chips land):*
"The little chips at the bottom are the state reducers. They're how we merge each turn's state changes back in cleanly — which is what lets us replay any run later, deterministically, from the database."

---

## 16 · Architecture — phase adapter  *("One engine. Three rulebooks.")*

**On screen:** the engine from the previous slide shrinks to scale 0.6 in the upper area. Three cards plug into it via dashed connectors — PREPROCESSING (9 stages), FEATURE ENGINEERING (10 stages), TRAINING (10 stages). On the right, a code panel shows STAGE_TOOL_ALLOWLIST. Below it: "The model cannot reach for a tool that doesn't belong here."

**Say:**
"Same engine you just saw — but it has to handle three different kinds of work. Preprocessing, feature engineering, training. The thing that makes one engine work for all three is on the right. Every stage has a list of tools it's allowed to call, and that's hard-coded. So when training is running, the model literally cannot call a feature-engineering tool, even if it tries. The model gets a lot of latitude inside each stage, but the stage itself is a fence."

---

## 17 · Training — propose A  *(3 stages enter + 2 tool-call cards)*

**On screen:** ten training graph nodes lay out. The first three light up in sequence — answer, then configure_experiment, then propose_model. Two tool-call cards appear at the bottom — configure_experiment with "creditcard.csv · fraud · roc_auc", and propose_training_plan with "3 candidates". The propose_model node starts pulsing amber at the end.

**Say:**
"Now we're inside training itself. First few stages are setup. The agent confirms what you asked for, then it picks the dataset, target column, and metric — that's the first tool card you see. Then it proposes three candidate models. That's the second card. And right at the end, you'll notice propose_model starts glowing amber. That's because it's about to pause for a human."

---

## 18 · Approval pause  *(silent, 4 seconds)*

**On screen:** a still moment — the graph is paused, waiting for user input.

*Say nothing. The silence is the point — it shows the system actually waiting on a person.*

---

## 19 · Training — propose B  *(graph unpauses, hands off to code generation)*

**On screen:** the pause clears, and the graph hands off to generate_code.

**Say:**
"User picked a model. The graph picks back up. Now comes the part where the agent has to actually write code that runs."

---

## 20 · Execute cascade  *(72 seconds — the hero scene with the full fail/recover sequence)*

**On screen:** title "Generate. Run. Fail. Recover." Then a long animated sequence — code segments draft, a notebook materializes, the cell runs, it fails with a red `ModuleNotFoundError: No module named 'xgboost'` traceback in a terminal. A retry curve animates, an amber `install_package` pill appears, the cell re-runs, training epochs print in green. Eventually `__TRAIN_COMPLETE__` highlights yellow as it types in. A code panel appears showing parseTrainCompleteMetrics with `lastIndexOf` underlined. NDJSON event pills cascade in on the right.

**Say (pace this slow — it's the hero scene):**
"This is the centerpiece. Watch what happens when something goes wrong."

*(when the code drafts):*
"Agent generates the training code, writes it into a notebook cell, runs it in a sandboxed kernel."

*(when the failure appears):*
"And it fails. ModuleNotFoundError — xgboost isn't installed in the container."

*(during the retry curve):*
"What happens next is the part I want you to see. The executor reads the traceback, pulls the missing module name out of it, and installs it — outside the model's turn. The model doesn't even know that happened. Then it just re-runs the same cell."

*(when training completes):*
"The way we know training actually finished is by scanning stdout for a marker the cell prints when it's done — that __TRAIN_COMPLETE__ line you can see now. We use lastIndexOf because earlier failed runs probably printed one too, and the last one is the one we trust."

*(when the cascade pills appear):*
"And that's the rest of the cascade. Evaluate, register, done. One graph, three phases, twenty-nine stages — one registered model out the back."

---

## 21 · Architecture — pullback  *("Everything the agent does — written down twice." — ledger reveal)*

**On screen:** the training graph zooms back out to scale 0.4. An NDJSON event ticker lists every event type streaming from the backend. Below, a six-card Postgres ledger strip counts up through the table sizes — runs, events, artifacts, approvals, handoffs, notebook bindings. Caption: "Every edge, one row." Then a serif closer fades in: "Probabilistic core. Deterministic shell." with "shell" underlined in Miami red. A small telemetry pill at the bottom shows "29 STAGES · 6 LEDGER TABLES · 1 REGISTERED MODEL."

**Say:**
"Stepping back out. Everything the agent does gets written down twice. Once over the wire as a JSON event the frontend streams in real time, and once into Postgres as a permanent record. Six tables, one row per edge of the graph. That's how the agent stops being a chat demo and becomes something you can audit, replay, and ship."

*(when the closer lands):*
"That's the whole thesis. Probabilistic core, deterministic shell. That's what makes the difference between something cute and something you'd actually deploy."

---

## 22 · Benchmarks — hook  *("Three measurements." — three stat panels)*

**On screen:** three benchmark panels, equal weight. Speed shows "7×" with caption "× faster than Jupyter." Quality shows "TOP 8%" with "Kaggle percentile, Titanic." Guardrails shows "16/20" with "flaws caught" — and that one has a breathing halo around it.

**Say:**
"Onto whether this actually works. Three things we measured. The speed number on the left, the Kaggle leaderboard number in the middle, and the guardrails number on the right. The sixteen out of twenty is the one I care about most — that's the next three slides."

---

## 23 · Benchmarks — speed  *(bar race for 5 datasets + "7×" hero)*

**On screen:** five horizontal bar-race rows, one per Kaggle dataset. Three bars per row — ours (thick black), manual Jupyter (grey), AutoGluon (amber). Each row's time is in minutes. Hero rail on the right shows "7×" big with "FASTER" underneath, and "116 minutes reclaimed per session vs Jupyter."

**Say:**
"Five Kaggle datasets, same workflow each time — upload to held-out metric. The black bars are us, grey is manual Jupyter, amber is AutoGluon. Median across all five — we came in seven times faster than Jupyter. Practically, that's about two hours of an afternoon you didn't have to spend babysitting a notebook."

---

## 24 · Benchmarks — quality  *(percentile gauge + 5 per-dataset cells)*

**On screen:** a wide percentile gauge spans the top — a marker slides to rank 92, with a callout. Below: a five-cell strip showing per-dataset percentiles. Titanic flashes green when its number lands.

**Say:**
"Speed doesn't matter if the models are bad. So we submitted the outputs to the Kaggle public leaderboards. Same pipeline every time, no per-dataset tuning. On Titanic — that's the green one — we landed in the top eight percent. Ninety-second percentile. And on every other dataset we were top fifteen or better. So this isn't a fast pipeline that produces mediocre models. It's a fast pipeline that produces competitive ones."

---

## 25 · Benchmarks — guardrails  *("Ten flaws in the data. How many get flagged?" — 10-row table + 16/20 vs 3/20 hero)*

**On screen:** a ten-row table lists ten well-known data quality flaws — target leakage, hidden missings, datetime as numeric, etc. Two columns: "Our Platform" and "Sklearn Baseline." Status dots flip from neutral to green checks (caught) or red X's (missed) — left side first, then right side. At the end, a hero band lands: "16/20" in blue, "vs", "3/20" in red, both labeled "flaws caught."

**Say:**
"Last benchmark. We took ten well-known data quality issues — target leakage, hidden missing values, dates stored as numbers — and we seeded them into the test data on purpose. Question is, does the platform catch them?"

*(when the dots flip on the left):*
"Our agent catches eight of them. Sister benchmark caught another eight, which is where the sixteen-out-of-twenty comes from."

*(when the right side flips):*
"Sklearn defaults caught one and a half on the same flaws. Three out of twenty when you double it. So we're catching about five times the issues the standard baseline catches. That's the one I'd remember."

---

## 26 · Journey — pulse  *("Eleven months. One working *prototype.*" — commit chart + counters)*

**On screen:** a weekly commit-activity chart spans the slide. Three sprint bands tint the background — foundation, agentic, production. A peak callout points at week 17 with "420 commits." Three counters on the right: 1,989 commits, 324 issues, 115 merge requests.

**Say:**
"One last section before I wrap up. Eleven months of work, three phases. The chart on the left is our weekly commits — you can see the work concentrated in three big surges. Almost two thousand commits total, three hundred and twenty-four issues, a hundred and fifteen merge requests. Peak week was four hundred and twenty commits — that was the week we shipped the first end-to-end demo."

---

## 27 · Journey — foundation  *(Sprints 1-4, "Foundation" header)*

**On screen:** zoom on sprints 1-4. The header pill is in foundation-blue. Stats: 134 commits, supporting copy about backend / UI shell / NL→SQL by February.

**Say:**
"First phase was foundation — the first four sprints. Backend, UI shell, natural-language SQL. Mostly invisible plumbing — the kind of thing where the demo doesn't change for weeks but the system gets a lot more solid underneath."

---

## 28 · Journey — agentic  *(Sprints 5-8, "Agentic Turn" header)*

**On screen:** zoom on sprints 5-8 in agentic-green. Stats: 412 commits.

**Say:**
"Second phase is what we call the agentic turn — sprints five through eight. This is when the whole pipeline collapsed onto one LangGraph state machine. Four hundred and twelve commits in this phase. That's also when we finally started labeling our issues consistently — small thing, but it changed how we worked."

---

## 29 · Journey — production  *(Sprints 9-11, "Production" header in amber)*

**On screen:** zoom on sprints 9-11 in production-amber. Stats: 151 commits, callout about peak day.

**Say:**
"And then production — the last three sprints. Experiments, security hardening, this video. A hundred and fifty-one commits in a single day at one point — that was last Tuesday, when we locked the demo capture."

---

## 30 · AI Collaboration  *("The AI *collaborators* that made this ship." — three cards)*

**On screen:** title with "collaborators" underlined. Three cards — OpenAI on the left ("drove the engine"), Gemini in the middle (hero card with "+1"), Cursor on the right ("triaged 324 issues"). Three pills at the bottom show small invocation stats.

**Say:**
"Quick honest beat — yes, we used AI to build an AI product. Not pretending otherwise. OpenAI drove the engine itself, Gemini helped us pair on the frontend work, and Cursor was how we triaged all three hundred and twenty-four issues. The interesting thing isn't that we used these tools, it's that the workflow we built for ourselves looked a lot like the workflow we shipped."

---

## 31 · Retro — learned  *("What we *learned*" — 3 statements in blue tone)*

**On screen:** three short statements in a blue retro card — state machines beat chained prompts, retrieval beats prompt tuning, eval harnesses are infrastructure.

**Say:**
"Three things I'd write down if I was starting over. State machines beat chained prompts — we tried both. Retrieval beats prompt tuning — also tried both. And eval harnesses are infrastructure, not nice-to-have. We shipped ours in sprint nine. We should've shipped it in sprint one."

---

## 32 · Retro — went well  *("What went *well*" — 2 statements in green tone)*

**On screen:** two statements in a green retro card.

**Say:**
"Two things that worked better than I expected. Playwright caught three real regressions before our QA week even started — that's a tool I'd add to any project from day one now. And tool calling on top of LangGraph turned a lot of half-formed improvisation into something that actually felt like a structured workflow."

---

## 33 · Retro — differently  *("What we'd do *differently*" — 2 statements in amber tone)*

**On screen:** two statements in an amber retro card.

**Say:**
"And two things I'd change. We spent about nine months reinventing what LangGraph already does. Should've adopted it on day one. And we should've shipped the end-to-end shell early — even if every phase was hollow — just so we could feel the product on day one instead of imagining it for the first six months."

---

## 34 · Closing  *(silent — 13.5s wordmark assembly)*

**On screen:** the wordmark and tagline reassemble in silence.

*Don't talk. The silence is the bookend.*
