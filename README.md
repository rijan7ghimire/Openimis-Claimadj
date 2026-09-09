# Claim Journey — MVP

*An interactive walkthrough of one health-insurance claim, from the patient's hand to the final reviewer, laid out exactly along HIB's own "Workflow for Claim Processing" (three lanes, 14 hops) with the steps we propose inserted and marked **proposed**. Everything is prefilled from a scenario — you only press **Next**. React + Vite frontend, Node/Express backend, the rule engine ported 1:1 from the Python prototype, running on the Nepal synthetic claim book.*

## Live demo (GitHub Pages)

**https://rijan7ghimire.github.io/Openimis-Claimadj/** — the same app with the engine running *in the browser*: the two engines (`backend/engine`) and the API layer (`backend/api.js`) are bundled by Vite, and the 9,786-claim Nepal book is fetched once as `data/claims.json`. State lives for the tab (reload = fresh book). Deployed by `.github/workflows/pages.yml` on every push to `main`. Source: https://github.com/rijan7ghimire/Openimis-Claimadj

## Run it locally

```bash
cd "Week 3-4/mvp"
npm run install:all     # once — root, backend, frontend
npm run dev             # API on http://localhost:4000, app on http://localhost:5173
```

Or a single process: `npm run build && npm start` → everything on http://localhost:4000.

Static build like the live demo (no backend): `cd frontend && VITE_STATIC=true npm run build:static`, then serve `frontend/dist` from any static host (set `VITE_BASE=/<repo>/` when it is not served from the domain root).

No database, no Docker, no accounts. The backend loads `backend/data/claims.json` (9,786 Nepal synthetic claims, 8,038 people, 440 facilities) and runs both engines over it at start-up, so the review queue is realistic from the first second. `npm --prefix backend run selftest` replays the ten guided scenarios and checks which rules fire.

## The journey — HIB's three lanes, 14 hops, our 3 proposed steps

The top of the page is a **journey map**: one row per owner (Patient · Health facility · openIMIS · Knowledge-based layer (proposed) · claims desk · Medical Officers · accounts & Executive Director) and one column per hop, with the claim's path drawn through them and every hop labelled and numbered. Teal = done, navy ring = where you are, dashed teal = proposed by us, faded = skipped for this claim (a rejected claim jumps 7 → 14, a clean claim 11 → 13). The three proposed columns (8, 11, 12) are shaded teal, and a **value strip** under the map states what each adds and the measured gain on the Nepal book (418 of 454 frauds vs 4 for the existing engine; 418 vs 17 frauds reached for the same reviewer budget). The value strip sits beside the map as a panel. Any node can be clicked to jump there, and the **left / right arrow keys** step back and next. The three HIB lanes sit above the map, the scenario switcher and the legend above that; the owner labels follow the claim's scheme (HIB or SSF).

Each screen below the map has **one focus**: a short eyebrow (`Step n of 14 · openIMIS today | proposed · actor`), one title, one line about the claim, **one card**, and one Next button. Optional actions (change the patient, customise the claim) are quiet footer links.

| Lane | Hops (in order) |
|---|---|
| **Patient visits hospital** | 1 Membership verification through openIMIS · 2 Hospital card issued, care per benefit package · 3 Member does not pay out-of-pocket (10 % co-payment on diagnostics) |
| **Health facility submits claim** | 4 Hospital prepares the claim document (card + invoices, NMC no., attachments) · 5 Claim form entered in openIMIS (manual / EMR as FHIR) · 6 Manual verification and submission (HIB's top rejection causes as a facility checklist) · 7 System verification by openIMIS (animated `validate_claim`, reasons 6 & 8 shown disabled) · **8 ★ Identity resolution & cross-claim rules (proposed)** |
| **Claim adjudication by HIB** | 9 Completeness incl. attachments · 10 Verification per benefit package · **11 ★ Manual review — ranked, explained queue vs the random 5 % sample (proposed)** · **12 ★ Reviewer decision & feedback to the rule base (proposed)** · 13 Account section recommends settlement · 14 Executive Director approval · online payment (outcome + full timeline) |

A rejected claim jumps from hop 7 to the outcome ("re-submission with correction"); a clean claim skips the reviewer decision and is settled — both visible on the map.

## Guided scenarios (default: cross-scheme duplicate)

Clean visit · within-scheme duplicate (R1) · **cross-scheme HIB→SSF (R3 + R4)** · cross-scheme with no National ID caught by the composite key (R3) · the hard case we miss (no NID + name spelt differently) · impossible overlap (R4) · resubmission after rejection (R5) · off-protocol upcode (STG) · an honest split visit (R2 false positive) · a lapsed policy (the existing engine's job). Optional "Change the patient" and "Customise the claim" panels are collapsed on hops 1 and 4 — never required.

## Deep links for presentations
`/?scenario=<id>&step=<0–13>` loads the scenario, submits the claim when needed and jumps to the hop; `&decision=confirm|clear|release` records the reviewer's call. Examples: `/?scenario=cross_scheme&step=7` (our layer), `/?scenario=cross_hard&step=13` (the paid miss), `/?scenario=lapsed&step=6` (existing engine rejects), `/?scenario=legit_split&step=13&decision=clear`.

## Honest evaluation and the validation book

The rules were developed against `backend/data/claims.json`, whose fraud injection is close to the rules written backwards, so its 92 % / 92 % is an upper bound. `backend/data/validation.json` is an **independent, behaviour-based book** (`../synthetic_data/nepal_validation_book.py`, seed 2026): bad facilities and dual-enrolled patients act with lags drawn from distributions, fraud types the rules do not target (phantom re-admission at the same facility, upcoding inside the protocol, ghost visits) and honest confounders (transfers, homonyms, corrected resubmissions, follow-ups). `node backend/evaluate.js` runs the engines unchanged on both and writes `backend/data/evaluation.json` for the dashboard: before the rule revisions the validation book scored precision ≈ 53 %, recall ≈ 48 %; after them (transfer-aware R4 with a same-facility variant, identity-confidence weighting for R3, an introduced-code test and 14-day look-back for R5, a 14-day identical-bill variant for R1, new R6 provider concentration, R7 one-doctor-two-facilities, R8 service frequency, STG unnecessary admission) it scores precision ≈ 50 %, recall ≈ 74 %, ranked queue 189 vs random ≈ 14 frauds at the same budget; the training book is at 88 % / 92 %. The dashboard lists the remaining causes. To regenerate: `python ../synthetic_data/nepal_validation_book.py && cp ../synthetic_data/out_validation/claims.json backend/data/validation.json && node backend/evaluate.js`.

## Also in the app
**Review queue** (ranked vs random on the whole book, ground-truth toggle) · **Providers** (`/providers`): facilities by flag rate, doctors by busiest day, repeat R5 offenders — the tables behind R6 and R7 · **Review** screen for any claim · **Dashboard** (precision/recall per rule and fraud type, triage vs random, the honest A-vs-B panel, the session's learning loop with live weights) · **Rules** (`/rules`): every parameter (identity key, weights, R3 window, R5 look-back, budget…), our nine rules as if / because cards with live precision on the book, a redundancy review, and the openIMIS edits that already exist with their state · **Algorithm** (`/algorithm`): the ranking algorithm as a flowchart and eight steps, plus the readings from the notebook — precision@k against a random sample, per-rule precision and the suspicion distribution, a drop-one-rule ablation, parameter sweeps, the simulated learning loop, recall by fraud type on both books (figures and `results.json` in `frontend/public/algorithm/`, written by `notebook/claim_ranking.ipynb`) · **Ontology** (`/ontology`, also linked from the dashboard): what the HIC ontology is in three plain points, one table of which coding standards a Nepali claim actually uses organised by what is on the claim (diagnosis, treatment, medicines, tests, patient, doctor, place, exchange format…) for HIB/SSF and for hospitals, and the gaps it closes.

## Slides

`docs/WEEK5_claim_journey.pptx` — the Week 5 deck built from this app (27 slides: the claim journey, ontology and knowledge base, rules and failed cases, proposed solution). `docs/ontology_core.png` is the HIC ontology diagram shown on the Ontology page.

## Structure

```
mvp/
├─ package.json                 npm run dev / build / start
├─ backend/
│  ├─ server.js                 Express API (+ serves frontend/dist) — thin wrappers over api.js
│  ├─ api.js                    transport-independent API: used by server.js AND bundled into the static build
│  ├─ engine/existing.js        ENGINE 1 — openIMIS edits, real rejection codes, 6 & 8 disabled
│  ├─ engine/rules.js           ENGINE 2 — R1–R5 + STG, identity resolution, R3 ±2-day window
│  ├─ engine/store.js           in-memory claim book, identity index, queue, review, settle, metrics, timeline
│  ├─ scenarios.js              the ten guided journeys
│  ├─ selftest.js               replays the scenarios, asserts the rules (priors must be clean)
│  ├─ evaluate.js               honest evaluation: training book vs independent validation book → data/evaluation.json
│  └─ data/claims.json          Nepal synthetic book (from ../synthetic_data)
├─ .github/workflows/pages.yml GitHub Pages deploy (self-test, static build, publish)
└─ frontend/src/
   ├─ api.js                   one `api` object, two transports: HTTP (local) or in-browser engine (VITE_STATIC)
   ├─ pages/Journey.jsx         the 14-hop walkthrough (journey map · eyebrow + title · one card · Next)
   ├─ components/JourneyMap.jsx  the owner-swimlane map (pure SVG; rows × hops, path, skips, click-to-jump)
   ├─ pages/Queue.jsx · Review.jsx · Dashboard.jsx · Rules.jsx · Ontology.jsx · Providers.jsx · Algorithm.jsx
   ├─ public/algorithm/          figures + results.json from the notebook (what the Algorithm page and the Week 5 slides show)
├─ notebook/                     the engine as plain Python (claim_ranking.py) + the executed notebook claim_ranking.ipynb + flowchart.py
│                                 (mirror of Week 5/ranking_notebook; reads ../backend/data)
   └─ components/               EngineViews (animated checklists), QueueTable, ReviewPanel, ui
```

### API
`GET /api/reference` · `GET /api/persons?q=` · `GET /api/persons/:id/history` · `GET /api/scenarios` · `POST /api/scenarios/:id/load` · `POST /api/claims/submit` `{person, draft}` · `GET /api/claims/:id` · `GET /api/queue?mode=triage|random` · `POST /api/review/:id` `{decision, note}` · `POST /api/claims/:id/settle` · `GET /api/metrics` · `GET /api/providers` · `GET /api/evaluation`

## Fidelity to openIMIS and to the adjudication report
Status codes Entered 2 → Checked 4 → Processed 8 → Valuated 16 / Rejected 1; review status Idle → Selected → Delivered; the −1…21 rejection reasons with **6 "Item/Service duplicated"** as the reviewer's outcome; Nepali fiscal-year claim codes; HIB's benefit package (NPR 3,500 / 100,000), the 10 % co-payment on diagnostics (Jan 2024), and HIB's documented top rejection causes (missing NMC number, tests without prescriptions, medicines differing from prescription) as the facility and completeness checklists. What is simulated: valuation arithmetic, the batch run and payment hops, reviewer identities.

## Scope deliberately left out
Real openIMIS integration (hook documented in `../repos/REPOS.md` §10), authentication, persistence across restarts, Devanagari UI. Re-weighting from reviewer decisions is now real but session-only (confirm +0.5, clear −0.5, bounded 0.5–5).
