# Claim Journey — everything the web app says, in one file

*The content of the Claim Journey web app (React + Node), written out page by page. **All claims in the app are synthetic**: 9,786 generated claims in the training book (seed 42, 454 with planted fraud) and 6,825 in the independent validation book (seed 2026, 261 with planted fraud) — 16,611 synthetic claims in total, no real patient or claim data anywhere. Long screens are summarised; nothing is invented beyond what the app shows.*

- Live: https://rijan7ghimire.github.io/Openimis-Claimadj/ · Source: https://github.com/rijan7ghimire/Openimis-Claimadj
- Local: `npm run install:all` then `npm run dev` → http://localhost:5173 (API on :4000). Static build: `VITE_STATIC=true npm run build:static` in `frontend/`.
- Pages: **Journey** (home) · **Review queue** · **Review** (one claim) · **Dashboard** · **Providers** · **Rules** · **Ontology**.

---

## 1 · What the app is

One health-insurance claim is walked from the patient's hand to the final reviewer along the Health Insurance Board's (HIB) own "Workflow for Claim Processing": three lanes, fourteen hops. Eleven hops are what openIMIS and HIB do today; three are the hops this study proposes (8, 11, 12). Two engines run on every claim:

- **Engine 1 — the existing openIMIS edits**, ported from `claim/validations.py`, each looking at one claim on its own.
- **Engine 2 — our knowledge-based layer**: identity resolution, the person's claim history across facilities and both schemes (HIB and the Social Security Fund, SSF), six explainable rules, a suspicion score, a ranked review queue and a reviewer decision that feeds back to the rules. It never rejects a claim; it explains.

Everything is prefilled from a scenario; the user only presses **Next** (or the ← → keys).

---

## 2 · The Journey page

### 2.1 The map at the top

A swimlane map: **rows are owners**, **columns are the 14 hops**, and the claim's path is drawn through them.

| Row (owner) | Who |
|---|---|
| Patient | member and family |
| Health facility | front desk · doctor · claims admin |
| openIMIS | the scheme's instance · `validate_claim` |
| Knowledge-based layer | proposed · identity + rules (our layer) |
| Claims desk | claim officers (HIB or SSF, following the claim's scheme) |
| Medical Officers | reviewers · random sample today |
| Accounts & Executive Director | accounts section · Executive Director |

Legend: teal = done · navy ring = you are here · dashed teal = ★ where our study adds value (hops 8, 11, 12) · faded = skipped for this claim. A rejected claim jumps 7 → 14; a clean claim skips the reviewer decision (11 → 13). Any node can be clicked to jump there. The three HIB lanes sit above the map; the scenario switcher and legend above that.

### 2.2 The fourteen hops

| # | Lane | Hop (title on screen) | Owner | Today / proposed | What the screen shows |
|---|---|---|---|---|---|
| 1 | Patient visits hospital | Membership verification — "the hospital looks the patient up in openIMIS before treating" | Hospital front desk | openIMIS today | The person: name, sex, birth date, district; HIB member number and policy status; SSF contributor number; National ID or "not recorded"; any earlier claims in the book. Note: *each scheme verifies membership in its own openIMIS; nothing here tells HIB what SSF knows.* Optional: change the patient (search the book). |
| 2 | Patient visits hospital | Hospital card and care — "treated according to need and the benefit package" | Treating doctor | today | Member no., facility (level: hospital / PHCC / health post), doctor's NMC registration number, diagnosis (ICD-10 + label), care type and dates, package (HIB family policy NPR 100,000 / year or SSF medical benefit), billed lines; lines outside the treatment protocol are highlighted ("openIMIS does not check that"). |
| 3 | Patient visits hospital | No out-of-pocket payment — "the scheme pays the facility" | Patient | today | Billed amount · **NPR 0 paid at the counter** · 10 % co-payment on diagnostics. *Money flows scheme → facility, never to the patient; the facility is the economic beneficiary of every line, which is why fraud enters through the claim.* |
| 4 | Facility submits claim | The claim document — "prepared from the card and the invoices" | Hospital claim admin | today | Patient + member no., National ID, facility, doctor, diagnosis, dates, lines; attachments: discharge summary / OPD ticket, prescription with NMC no., invoices. Optional: customise the claim (scheme, diagnosis, facility, date, lines). |
| 5 | Facility submits claim | Entered in openIMIS — "keyed in manually, or sent by an EMR as a FHIR claim" | Hospital claim admin | today | Claim number assigned on entry (Bikram-Sambat fiscal year, e.g. `2083-084-000123`), status Entered (2); what travels with the claim (member no., facility, NMC no., diagnosis, lines, attachments) and what does not (anything about the person's claims in the other scheme or at other facilities). The FHIR R4 `Claim` resource as an EMR would send it (collapsed). Next = **Enter the claim**. |
| 6 | Facility submits claim | Facility verification and submission | Hospital claim admin | today | Checklist of HIB's most frequent rejection causes (about one claim in five): NMC number on the prescription · every diagnostic test has a prescription · medicines match the prescription · attachments complete · all items on the price list. |
| 7 | Facility submits claim | System verification by openIMIS — "the existing edits, each one looks at this claim alone" | openIMIS · `validate_claim` | today | Engine 1 animated checklist (see §4). Outcome: ACCEPTED → Checked (4), or REJECTED (1) with the reason — "back to the facility for re-submission with correction". |
| 8 ★ | Facility submits claim | Identity resolution and cross-claim rules — "the only step that compares this claim with others" | Knowledge-based layer | **proposed** | 1 · Identity resolution (matched on National ID, or composite key name + DOB + sex). 2 · Match against the claim history & vault: N earlier claims for this identity across every facility and both schemes. Then one card per rule that fired (rule, name, weight, **Because:** sentence, source, matched claim). Routing: *Suspicion score S → routed to the review queue (review status Selected). The claim is not rejected — a person decides.* Or: *No rule fired → clean.* |
| 9 | Adjudication | Completeness check — "HIB opens the claim and its attachments" | Claims desk | today | Attachments present and legible · prescriber's NMC number present · prescription covers every test and medicine · identity on the card matches the claim · dates coherent, submitted within the window. |
| 10 | Adjudication | Verification against the benefit package — "covered, priced, within the ceiling?" | Claims desk | today | Policy in force on the service date · every line in the package and priced · within the annual ceiling · care type allowed at this facility level · diagnosis consistent with the treatment (*openIMIS does not check this — reason 8 disabled — our STG rule does*). Approved so far and co-payment. |
| 11 ★ | Adjudication | The review queue — with the reviewer arithmetic: about 50,000 claims a day at HIB (2024), 26 central reviewers (10 in 2020), about 1,900 claims per reviewer per day, so about 5 % is what 26 people can open at 5 minutes a claim (the random sample is headcount arithmetic, not a policy choice) — "today a random 5 % sample; proposed, a ranked queue with reasons" | Medical Officers | **proposed** | Where this claim sits in the ranked queue and with what suspicion; toggle between *Ranked by suspicion (ours)* and *5 % random sample (today)*; the queue table (§5). A clean claim: "a 1-in-20 chance in today's random sample, not shown at all in the ranked queue". |
| 12 ★ | Adjudication | Reviewer decision — "confirm, clear or release; the decision teaches the rules" | Medical Officer | **proposed** | The review panel (§6): why it is in front of you, this claim vs the matched claim side by side, the decision. |
| 13 | Adjudication | Settlement — "the account section recommends the amount to pay" | Accounts section | today | Claimed − co-payment = recommended. *After the monthly batch run, payment is irreversible — which is why our layer runs before this point.* Rejected claims: "No settlement". |
| 14 | Adjudication | Outcome, with a counterfactual: **Today · openIMIS as it runs** (paid; a Medical Officer sees it only with a 1-in-20 chance) next to **With the knowledge layer** (flagged at hop 8, ranked, decided by a person, decision recorded) — "Executive Director approval and online payment, or rejection" | Executive Director | today | Paid — amount to facility / Rejected — reason (6 "Item/Service duplicated" when the reviewer confirmed) / Waiting for the reviewer. Ground truth of the synthetic claim. The full timeline: care delivered → claim entered → automated edits → our layer screened → processed → valuated → batch run → accounts section → ED approval → paid. Buttons: Replay · Review queue · Dashboard. |

Hops 1, 5 and 6 add a short **How SSF differs** note when the claim is an SSF claim (SoSys, contributor number, fiscal-year binding; 85 % of claims via openIMIS, composite claim id, booking, the vault key behind R2; SSF medical team reviews, accounting pays). Hop 5 also shows what our layer would add to the FHIR **ClaimResponse** (adjudication category = rule id, reason text, suspicion and review-status extensions).

Under every step: a **Next** button, ← back, and the keyboard hint (← → keys). Deep links: `/?scenario=<id>&step=<0–13>&decision=confirm|clear|release`.

### 2.3 "Where this study adds value" (strip at the bottom of the page)

Today openIMIS checks each claim alone, its duplicate rule is switched off, and reviewers get a random 5 % sample. We add three hops:

- **8 · Sees across facilities and schemes.** Nine rules: 92 % of planted frauds on our own synthetic book (88 % precision), 74 % on an independent synthetic book at 50 % precision. The existing engine catches 4 of 454.
- **11 · A ranked queue with reasons.** Same reviewer budget: 418 frauds reached instead of 14–34 on our book; 189 instead of about 14 on the independent book.
- **12 · Every decision teaches the rules.** Confirm, clear or release is recorded per rule.

---

## 3 · The ten guided scenarios

| id | Title | Tagline | What happens | Ground truth |
|---|---|---|---|---|
| clean | A clean outpatient visit | The happy path — nothing fires, the claim is paid | Engine 1 passes; our layer finds nothing to compare it with; straight to valuation and payment | legitimate |
| within_dup | Within-scheme exact duplicate | The same consultation billed twice under a new claim code | Engine 1 passes it (there is no duplicate rule); R1 matches the earlier claim → flagged, high | within_dup |
| cross_scheme *(default)* | Cross-scheme duplicate (HIB → SSF) | One appendectomy, reimbursed by both schemes | HIB paid the surgery at Bir Hospital; the same person, an SSF contributor, claims it again at TUTH. Neither system sees the other; R3 joins them on the National ID; R4 also fires (two admissions at once) → suspicion 6 | cross_scheme |
| cross_composite | Cross-scheme, no National ID | Caught anyway — by name, date of birth and sex | Identity falls back to the composite key; the records still join because the name is spelt the same → R3 | cross_scheme |
| cross_hard | Cross-scheme, no National ID, name spelt differently | The one we miss — and why it matters | SSF recorded "K. Bahadur", HIB "Krishna Bahadur"; the composite key cannot join them → nothing fires; the claim is paid. The identity-resolution ceiling and the case for National-ID linkage | cross_scheme (hard) |
| overlap | Impossible overlap | Admitted in Pokhara and Kathmandu at the same time | Two inpatient stays with overlapping dates at different hospitals; Engine 1 passes both; R4 sees the pair | impossible_overlap |
| resubmission | Resubmission gaming | Rejected on Monday, back on Thursday with a swapped code | The first claim (an unpriced MRI) is rejected by Engine 1, correctly; three days later the same person and diagnosis return with a priced code; Engine 1 passes it; R5 remembers the rejection | resubmission |
| upcode | Off-protocol upcode | An appendectomy billed under a common cold | Every line is priced and covered, so Engine 1 passes; STG checks the lines against the protocol for J06 | stg_upcode |
| legit_split | An honest split visit (false positive) | Why the layer never auto-rejects | A genuine check-up whose lab line was entered as a second claim; R2 flags a possible split episode; the reviewer clears it and the feedback lowers R2's weight | legitimate |
| lapsed | Lapsed policy (the existing engine's job) | Caught before our layer runs | No active policy on the service date → Engine 1 rejects with reason 21 NO_COVERAGE; the journey jumps to the outcome | legitimate |

---

## 4 · Engine 1 — what openIMIS already checks (hop 7, Rules page §3)

Each edit looks at one claim on its own. Source: `openimis-be-claim_py`, `claim/validations.py`.

| Reason | Edit | What it checks | State |
|---|---|---|---|
| 9 | Target date | discharge date must not precede admission | active |
| 21 | Coverage | an active policy must cover the person on the service date | active |
| 7 | Valid member | the member number must exist | active |
| 2 | Price list | every line must be in the facility price list | active |
| 10 | Care type | inpatient claims only from facilities that admit | active |
| 4 | Patient category | adult / child × M / F must match every line | active |
| 16 | Quantity cap | no line above the quantity limit (30) | active |
| 17 | Waiting period | policy start + waiting period before the service date | active |
| 5 | Frequency | runs only if a service has a frequency set — none is, so it never compares claims | off |
| 6 | Duplicated | commented out in the code (`validations.py:38`); the reviewer screen still lists it as a reason | disabled |
| 8 | Diagnosis not in list | commented out (`validations.py:40`); the diagnosis is never validated | disabled |

Outcome text: *ACCEPTED → status Checked (4). Every check looked at this one claim on its own; nothing here compares it with any other claim — reason 6 is disabled.* Or: *REJECTED (1) — reason N NAME.*

---

## 5 · Engine 2 — our layer (hop 8, Rules page §1–2)

### 5.1 How a claim is scored

Resolve **who** the person is → fetch their **history** across facilities and schemes → run six rules → **suspicion = sum of the weights** of the rules that fired → rank the claim for a reviewer. Nothing here rejects a claim on its own.

### 5.2 Parameters

| Parameter | Value | Why |
|---|---|---|
| Identity key | National ID; if absent, name + date of birth + sex | the only key that can join HIB and SSF; the fallback fails when a name is spelt differently |
| Rule weights | high = 3 · medium = 2 · low = 1 | starting points; reviewer decisions move each rule's weight (confirm +0.5, clear −0.5, release unchanged, bounded 0.5–5); new claims are scored with the current weights |
| R3 date window | ± 2 days | the other scheme is often billed a day or two later; 0 days missed OPD cases (recall 83 → 97 %) |
| R5 look-back | 7 days | a rejected claim re-entered within a week with changed codes |
| R2 vault key | facility + person + visit date | the key SSF already uses to spot split claims |
| Treatment protocols | 24 diagnoses | allowed services and a maximum length of stay per diagnosis; generic inpatient items always allowed |
| Price list | 30 items | what the existing engine checks lines against |
| Quantity cap | 30 per line | the existing engine's hard limit (reason 16) |
| Reviewer budget | 5 % of claims | HIB's random sample today; the ranked queue is judged on the same number of claims |
| What a flag can do | never reject | a flag only ranks the claim for a Medical Officer; the decision stays human |
| Reviewer decisions | confirm → reason 6 · clear · release | each is recorded against the rules that fired: confirmed → weight up, cleared → weight down |

### 5.3 The nine rules (R1–R5 and STG revised after the validation book; R6–R8 new, from the adjudication report)

| Rule | Name | If | Because | Weight | Detects / red flag | Source | On the book (fired · precision) |
|---|---|---|---|---|---|---|---|
| R1 | Within-scheme exact duplicate | same person · same scheme · same date · at least one shared service | one service cannot be billed twice | high +3 | duplicate claim / same service, same day | rule catalog R1 · openIMIS reason 6 (disabled) | 141 · 93 % |
| R2 | Same-episode split billing (vault) | same person · same facility · same visit date · different lines | one episode possibly split into two claims | medium +2 | unbundling / same episode split | rule catalog R2 · the SSF claim-vault key | 108 · 79 % |
| R3 | Cross-scheme duplicate (HIB ↔ SSF) | same identity key · a different scheme · dates within ±2 days · same diagnosis or a shared service | HIB and SSF do not see each other; the same care is claimed twice | high +3 | cross-scheme double claim / same person, two payers | rule catalog R3 · independent ledgers | 72 · 96 % |
| R4 | Impossible overlap (two facilities at once) | two inpatient stays · different facilities · overlapping dates | a patient cannot be admitted in two places at once | high +3 | impossible clinical sequence / impossible day | rule catalog R4 | 36 · 100 % |
| R5 | Resubmission gaming | an earlier rejected claim · same diagnosis · within 7 days · the codes were changed | the claim is being re-shaped to slip past the edit that rejected it | medium +2 | resubmission gaming / rejected, then re-entered | rule catalog R5 · edit-gaming attack surface | 50 · 98 % |
| STG | Off-protocol services, over-long stay or unnecessary admission | a billed service outside the protocol; or an inpatient admission for a diagnosis the protocol treats as outpatient; or a stay above the protocol maximum | the diagnosis does not warrant the service, the admission or the stay | medium +2 | upcoding · unnecessary services · inflated bills / diagnosis–treatment mismatch | HIB expert interview · openIMIS reason 8 (disabled) · report: medical necessity | 71 · 100 % |
| R6 (new) | Provider concentration | the facility's share of strongly flagged claims over its last 100 claims is ≥ 25 % and > 3× the median facility | fraud is a repeated behaviour of a few providers | low +1 | provider concentration / facility flag rate above peers | report: peer benchmarking, PM-JAY provider profiling and de-empanelment | training: not fired; validation: 111 · 30 % |
| R7 (new) | One doctor, two facilities, same day | the treating doctor's NMC number is on another facility's claim on the same day | one doctor cannot treat in two facilities at once | low +1 | phantom hospitalisation · duty-hour billing / same provider, many facilities | ontology red flag rfSameProviderManyFacilities · report: Khyber audit, ghost hospitalisation | 7 · 0 % (random NMC collisions in synthetic data) |
| R8 (new) | Service frequency beyond the diagnosis | the same service for the same person more than 4 (consultations) / 3 (lab) / 2 (imaging) times in 30 days, dialysis and chemotherapy protocols exempt | repeated tests and visits beyond the protocol — the "random tests" HIB's 10 % co-payment targets | medium +2 | unnecessary services / service frequency anomaly | report: HIB co-payment (Jan 2024), Taiwan NHI duplicate-service check, HIRA DUR · openIMIS reason 5 never runs | 7 · 43 % |

Revisions from the validation book: **R1** adds a medium variant for the identical bill re-entered 1–14 days later (dialysis / chemotherapy exempt); **R3** carries medium weight on a composite-identity match (could be a namesake); **R4** exempts a same-day discharge-to-admission for the same diagnosis (a transfer) and adds a medium variant for overlapping stays at the same facility (phantom re-admission); **R5** looks back 14 days and fires only when the resubmission introduces a code the rejected claim did not have (an honest correction removes a line); **STG** adds unnecessary admission. **Subsumption:** when R3 and R4 hit the same matched claim, R4 is recorded with 0 points (the demo claim now scores 3, not 6). The Rules page shows a redundancy review table (R1/R2, R3/R4, R1/R8, R4/R2, STG/reason 10, R5/Engine 1, R6/all, R7/R6, weights).

Each rule card on the Rules page opens to **where it comes from** (Week 2 catalog entry, openIMIS code line, interview note, standard) and **where it fails** (measured on the validation book). A third table lists **known red flags not encoded** and why: missing NMC number (a completeness check), one NMC number at many facilities (needs a provider profile, candidate R6), service after death (needs the civil register), ghost visits and same-facility phantom re-admissions (invisible on a single claim), upcoding inside the protocol (needs peer benchmarking), forged documents / card sharing / collusion (outside claim data).

Each flag the app shows carries: rule, name, weight (+points), a **Because:** sentence written for the reviewer with the concrete dates, facilities and codes, the source, and the matched claim id. Example (cross-scheme scenario): *R3 — same person (matched on National ID) with the same diagnosis/service within 2 days of S0001, but a DIFFERENT scheme (HIB vs SSF) — neither system sees the other today. R4 — admission 2026-07-06..07-09 at Tribhuvan University Teaching Hospital overlaps the inpatient stay 2026-07-05..07-08 at Bir Hospital.*

---

## 6 · Review queue page and the queue at hop 11

*"The claims waiting for a Medical Officer. Today HIB picks a random 5 % sample; our layer ranks by suspicion and says why. Click a row to review it."*

- Two modes: **Ranked by suspicion (ours)** and **5 % random sample (today)**; a checkbox shows the synthetic ground truth.
- Two cards: *Our ranked queue — N frauds in the top M claims (F flagged in total), every one with a rule and a reason* vs *Random 5 % sample — n frauds among m randomly drawn claims, the same reviewer effort, no explanation.* On the training book: **418** frauds in the ranked queue against **14–34** in the random sample (the random draw varies with the seed: 17 in the evaluation run, 32 in the app's live draw), for the same budget of about 489 claims.
- Columns: #, claim no. (with "yours" for claims submitted in this session), patient (NID / no NID · member no.), scheme, facility (district), diagnosis, dates (OPD / IPD), claimed NPR, rules, suspicion, ground truth (optional).

---

## 7 · Review screen (any claim) and the reviewer decision at hop 12

- **Why it is in front of you**: each rule that fired with its weight and *because*; "suspicion score S · the system triaged and explained; the decision is yours." An unflagged claim reads: *This claim carries no flag — a reviewer would only see it in a random sample.*
- **This claim** vs **Matched claim** side by side: person and identifiers, claim no., facility, doctor (NMC), diagnosis, dates, status, lines with shared lines highlighted. For a protocol flag (STG) there is no pair: the lines are compared with the protocol's allowed services.
- **Your decision** (reviewer name, optional note):
  - **✕ Confirm — reject, reason 6**: the claim is rejected with reason 6 "Item/Service duplicated" (already in openIMIS's reviewer vocabulary); the facility is notified; the linked claim stays on record as evidence; the rule's weight goes up.
  - **✓ Clear — false positive, pay**: the rule was wrong here; the claim continues to valuation and payment; the rule's weight goes down.
  - **→ Release — pay, keep note**: pay, but keep the flag and note for audit.
  - Every decision is stored against the rules that fired and appears in the claim's timeline and on the dashboard.

---

## 7b · Providers page

*Claims are flagged one at a time, but fraud clusters.* Facilities ranked by flag rate (with the median flag rate as baseline; red = more than three times the median), doctors ranked by the most claims in one day (with facilities count and busiest date), and facilities with two or more R5 flags. Closes with the candidate rule **R6**: if a facility's flag rate is more than three times the median over 90 days, or one NMC number bills at more than one facility on the same day, raise the weight of every flag from that provider by 1 and put the facility on the audit list — because fraud is a repeated behaviour of a few providers. Not implemented.

## 7c · Algorithm page

*How a claim gets its place in the queue — the flowchart, the eight steps, and the readings from the program (`notebook/claim_ranking.ipynb`, a line-for-line Python port of the engine that reproduces the app's numbers exactly). All figures and numbers on the page come from `public/algorithm/results.json` and the PNGs the notebook writes.*

**It is a weighted additive rule model (a scorecard), not a trained classifier.** Every claim is processed once, in submission order: (1) Engine 1, the openIMIS edits on the claim alone; (2) identity resolution, National ID else name + DOB + sex, the same key for HIB and SSF; (3) the claim history of that identity across schemes and facilities plus the facility's flag rate and the doctor's recent claims; (4) the rules — R1–R5 per earlier claim, R8 and STG per claim, R7 per doctor, R6 per facility — each hit a flag with a weight and a "because"; (5) scoring — R4 subsumed under R3 on the same matched claim, points = learned weight × confidence, suspicion = Σ points; (6) routing — any flag → Selected, none → paid; (7) ranking — the queue sorted by suspicion, cut at the 5 % budget; (8) learning — confirm +0.5, clear −0.5, bounded 0.5–5.

**Readings (both synthetic books):**

| | A · training (seed 42) | B · validation (seed 2026) |
|---|---|---|
| claims · planted fraud | 9,786 · 454 (4.6 %) | 6,825 · 261 (3.8 %) |
| precision · recall | 88.2 % · 92.1 % | 50.0 % · 73.9 % |
| frauds at the 5 % budget: ranked vs random (mean of 30 draws) | 418 vs ≈ 25 (app's own draw: 23) | 189 vs ≈ 13 (app: 13.6) |
| precision in the top 50 · at the budget | 96 % · 88 % | 72 % · 55 % |

- **Precision@k curve.** Ranked queue vs the expectation of a random sample; a straight line on A, bending after ≈ 250 claims on B where the false positives start.
- **Per rule and suspicion.** Precision per rule on both books; 9,276 of 9,332 legitimate claims score 0 and never enter the queue; frauds score 2–7.
- **Ablation** (one rule off, the whole book re-run): recall lost on A / B — R1 21 / 10, R2 16 / 4, R3 14 / 14, R4 5 / 10, R5 10 / 11, STG 14 / 8, R6 0 / 3, R7 0 / 0, R8 0 / 1. R6 is the only rule whose removal raises precision (B: 50 → 62 %).
- **Sensitivity.** R3 window 0 / 2 / 5 days → B recall 67 / 74 / 78 % at precision 49 / 50 / 52 %; R1 identical-bill window 0 / 14 days → B recall 67 / 74 %; R5 look-back 7 / 14 days → B recall 68 / 74 %; budget 2 / 5 / 10 % → A frauds 184 / 418 / 418.
- **Learning loop, simulated.** A reviewer decides the top 150 by ground truth: R1, R2, R4, STG rise to the 5.0 ceiling, R3 to 4.5, R5 and R8 settle at 3.0, R6 and R7 stay at 1.
- **Recall by fraud type on both books** and **the two books in figures** (volume, amounts, planted fraud, identity coverage).
- A "Reproduce it" card links to the notebook in the repository.

## 8 · Dashboard

*"The Nepal synthetic book loaded in this app (9,786 claims, 8,037 people, 654 enrolled in both schemes, 43 % with a National ID). Ground truth is known, so the run scores itself."*

| Stat | Value |
|---|---|
| Fraudulent claims planted | 454 (4.6 % of the book; HIB estimate ≈ 5.5 %) |
| Caught by the existing engine | 4 (it rejected 1,011 claims — all legitimate rule violations) |
| Precision of our layer | 91.9 % (455 flagged · 37 false positives) |
| Recall of our layer | 92.1 % (418 of 454 caught · 36 missed) |

Charts: frauds detected (existing engine 4 vs our layer 418) · same reviewer budget, 489 claims (random 17 vs ranked 418, "≈ 15–25× more for the same effort") · precision by rule (R2 79 %, R1 93 %, R5 98 %, R4 100 %, R3 96 %, STG 100 %).

Recall by fraud type:

| Type | Planted | Caught | Recall |
|---|---|---|---|
| within_dup | 124 | 124 | 100 % |
| same_episode | 83 | 83 | 100 % |
| resubmission | 49 | 49 | 100 % |
| impossible_overlap | 33 | 31 | 94 % |
| cross_scheme | 70 | 68 | 97 % |
| stg_upcode | 66 | 63 | 95 % |
| cross_scheme (hard: no NID + name variant) | 29 | 0 | 0 % |

*The hard cross-scheme cases are the identity-resolution ceiling — 0 % by construction. That is the evidence for National-ID linkage.*

**Honest evaluation panel** ("The rules were tested on a book we also wrote"): states the coupling between the rules and the training generator, then compares **A · training book** (9,786 claims, 454 fraud, 92 % precision, 92 % recall, ranked 418 vs random 23 on average over 30 draws, range 14–34) with **B · validation book** (6,825 claims, 261 fraud at 3.8 %, **53 % precision, 48 % recall**, ranked 125 vs random 14 on average, range 6–23; the existing engine rejected 577 claims, none fraud). Recall by type A vs B with the reason for each drop (re-bills days later 29 %, cross-scheme with long lags and name variants 61 %, resubmissions beyond 7 days 50 %, same-facility phantom re-admissions 39 %, upcoding inside the protocol 0 %, ghost visits 4 %). B's false positives by cause (transfers 39, look-alikes 33, honest corrections 17, homonyms 14…) and B's misses by cause. A closing card states what the drop teaches and the specific fixes (transfer exception for R4, homonym guard for R3, R5 limited to code swaps, wider R1 window, provider profile). A note on external data: no public Nepal claims dataset exists; the openIMIS demo database (structure, no labels) and CMS Medicare Part B + OIG LEIE (provider-level labels) are the usable outside sets; real HIB data needs NHRC approval.

Learning loop — this session: submitted · flagged · reviewed · paid counters, and per rule: fired (book), confirmed, cleared, released. the table shows each rule's **weight now** against its start, and the last weight changes of the session. *Every reviewer decision moves the weight of the rules that fired: confirm +0.5, clear −0.5, release unchanged, bounded 0.5–5. New claims are scored with the current weights; the book evaluation uses the starting weights.* Links to the Rules and Ontology pages.

---

## 9 · Ontology page

*An ontology is a shared vocabulary: the things a claim talks about, what each one means, and how they connect. Ours is called HIC (health-insurance claim). It reuses the codes Nepal already uses and adds only what is missing.* Files: `Week 3-4/ontology/claim_adjudication.ttl` (OWL 2 / Turtle, prefix `hic:` = `https://w3id.org/hic-nepal/ontology#`, 44 classes, 62 properties, 697 triples, every term labelled and defined).

**1 · What it looks like** — the core diagram in three bands: the person across schemes (Scheme ← Membership ← Beneficiary → Membership → Scheme, with IdentityKey); the claim (Practitioner ← HealthFacility ← Claim → Diagnosis → TreatmentProtocol; ClaimLine → Item; the person's earlier Claims); our knowledge and the decision (FraudType → DetectionRule → DetectionFlag → ReviewDecision → RejectionReason 6, with the decision teaching the rule's weight). Three ideas:

- **A person, not a member number.** One Beneficiary can hold an HIB membership and an SSF membership; openIMIS has no such idea — each scheme sees only its own number. This is the whole reason cross-scheme duplicates go unseen.
- **Rules are things, not code.** Each rule has a condition, a plain-language *because*, a weight, the fraud type it detects, the red flag it looks for, and its source. That is what makes every flag explainable.
- **Everything else is borrowed.** FHIR resource names, ICD-10 codes, openIMIS statuses and rejection reasons, the World Bank / NHCAA fraud typology.

**2 · Which codes a Nepali claim actually uses** (by what is on the claim):

| On the claim | International standard | HIB and SSF today | Nepali hospitals today | In our ontology |
|---|---|---|---|---|
| The diagnosis | ICD-10 (WHO); ICD-11 is the successor | in use: ICD-10, up to five codes per claim — but openIMIS never validates it (reason 8 off) | in use: ICD-10 for the HMIS report and the claim; recorders trained on ICD-11 since 2021 | Diagnosis · icdCode |
| The treatment (services, procedures) | ICHI (WHO) · SNOMED CT | not used: local price-list codes (CONS-OPD, SURG-APPENDECTOMY…) | not used: hospital tariff codes mapped to the price list on entry | Service · itemCode |
| Medicines | ATC / DDD (WHO) | partly: price-list items; NLEM 2021 is the reference | partly: brand or generic names; NLEM for free medicines | MedicalItem |
| Laboratory tests | LOINC | not used: local codes (LAB-CBC) | not used: local test names | Service |
| The patient | National ID (Government of Nepal) | partly: CHFID or SSF number, each scheme its own; National ID recorded only for some | partly: hospital registration number; the scheme card | Beneficiary → Membership → Scheme · IdentityKey |
| The doctor | Nepal Medical Council registration | in use: NMC number on the prescription; a missing number is a top rejection cause | in use | Practitioner · nmcNumber |
| The place | ISO 3166-2:NP provinces | partly: openIMIS location tree region → district → municipality → ward | in use: the same tree in the HMIS | Province … Ward |
| The claim itself | HL7 FHIR R4 Claim | in use: EMRs send FHIR claims to openIMIS (about 70 % of HIB hospitals); SSF ↔ openIMIS over FHIR | in use: the EMR sends a FHIR Claim, or staff key it in | Claim ≡ fhir:Claim |
| The claim number | — | Bikram-Sambat fiscal-year code, unique inside one scheme only | the hospital's own invoice number | claimCode |
| What happens to it | openIMIS statuses and rejection reasons | Entered → Checked → Processed → Valuated / Rejected; reasons 1–21, with 6 = "Item/Service duplicated" | notified of rejection and resubmits | ClaimStatus · RejectionReason |
| Routine reporting | DHIS2 (national HMIS) | separate from claims | monthly report to the HMIS | — |

Pattern: the diagnosis, the doctor and the exchange format follow international standards; the treatment, the tests and the medicines do not; and the patient has no identifier both schemes share.

**3 · The gaps it closes**

| Gap | Today | In the ontology |
|---|---|---|
| The same person in two schemes | HIB and SSF each know their own member number; nothing joins them | one Beneficiary with several Memberships and an IdentityKey (National ID, else name + DOB + sex); rule R3 uses it |
| The diagnosis is never checked against the treatment | reason 8 switched off; no protocol in the system | TreatmentProtocol per diagnosis, elicited from the HIB expert; the STG rule uses it |
| No duplicate check at all | reason 6 commented out; the frequency edit compares nothing by default | rules R1–R5 compare a claim with the person's history across facilities and schemes |
| Rules live in people's heads | reviewers apply their own logic; nothing records why a claim was flagged | every rule is an object with a condition, a because, a weight, the fraud type, the red flag and its provenance |
| Four names for one field | legacy DB columns, Django fields, GraphQL fields and FHIR elements all differ | FHIR names are canonical; a crosswalk maps the rest (`03_naming_standards.md`) |

**4 · Competency questions** answered from the ontology's own terms: which rules depend on the IdentityKey (R3; all rules read history through the identity index); which fraud types have a rule (7 of 16) and which have none (phantom hospitalisation, forged documents, inflated bills, impersonation, non-disclosure, collusion, claims for the deceased, duty-hour billing, staged rescue); which red flags are known but unused (missing NMC number, same provider at many facilities, service after death); what STG needs that openIMIS lacks (TreatmentProtocol); what a reviewer decision changes. The Turtle file is downloadable from the page.

**5 · Glossary** for readers outside Nepal: HIB, SSF, openIMIS, CHFID, National ID, NMC number, Bikram Sambat, Medical Officer, claim vault, standard treatment protocol, reason 6.

Sources listed on the page: openIMIS Nepal / Health Insurance; openIMIS wiki — SSF Nepal; openIMIS FHIR R4 Implementation Guide; WHO Nepal — ICD-11 training (Dec 2021); MoHP Digital Health — ICD-10 to ICD-11; DoHS HMIS portal (DHIS2); National List of Essential Medicines Nepal 2021; the project ontology files and the adjudication report.

---

## 10 · The data behind the app (two synthetic Nepal claim books)

**B · validation book** (`nepal_validation_book.py`, seed 2026, 6,825 claims, 5,589 insurees, 261 fraudulent = 3.8 %): written independently of the rules. Fifteen busy facilities behave dishonestly (re-billing a visit 0–14 days later, splitting visits across the same or the next day, phantom re-admissions at the same facility, upcoding inside the protocol or stretching stays, ghost visits); 22 % of dual-enrolled patients claim the same episode from the other scheme with lags of 0–10 days and 30 % name variants; resubmissions after real rejections are 55 % gaming and 45 % honest corrections; honest confounders: hospital transfers overlapping by the transfer day, homonyms without a National ID, follow-up visits, dialysis series.

**A · training book:**

- 9,786 claims · 8,037 insurees · 440 facilities (25 real HIB referral hospitals plus district hospitals, PHCCs and health posts in all 77 districts, weighted by the 2021 census) · 14 % inpatient · NPR 37.8 M claimed.
- Romanised Nepali names with spelling variants; National ID for 60 % of adults; HIB family policies (some lapsed) and SSF membership for working-age adults; 654 dual-enrolled people.
- Every facility has doctors with NMC numbers; 24 diagnoses have a treatment protocol (allowed services, maximum stay).
- 454 fraudulent claims planted with ground truth (within-scheme duplicates, split billing, cross-scheme duplicates including 29 hard cases, impossible overlaps, resubmissions, off-protocol upcodes) plus honest look-alikes (legitimate split visits, repeated dialysis, lapsed policies, off-list items).
- No real individuals. Generator: `Week 3-4/synthetic_data/nepal_synthetic_claims.py` (extends openIMIS PR #214).

## 11 · openIMIS vocabulary used throughout

- Claim status: Entered (2) → Checked (4) → Processed (8) → Valuated (16); Rejected (1).
- Review status: Idle (1) · Not selected (2) · Selected (4) · Delivered (8) · Bypassed (16).
- Rejection reasons shown: 2 NOT_IN_PRICE_LIST · 4 CATEGORY_LIMITATION · 5 FREQUENCY_FAILURE · 6 DUPLICATED · 7 FAMILY · 8 ICD_NOT_IN_LIST · 9 TARGET_DATE · 10 CARE_TYPE · 16 QTY_OVER_LIMIT · 17 WAITING_PERIOD · 21 NO_COVERAGE.
- Identifiers: National ID `NID-…`; HIB member `HIB…` (CHFID); SSF contributor `SSF…`; NMC `NMC-…`; claim codes `2083-084-…` (HIB) / `SSF-2083-084-…` (SSF); session claims `S0001…`.

## 12 · What is simulated, and what is left out

Simulated: valuation arithmetic, the batch run and payment hops, reviewer identities. Left out: real openIMIS integration (hook documented in `repos/REPOS.md` §10), authentication, persistence across restarts, Devanagari UI, automatic re-weighting of rules from feedback.
