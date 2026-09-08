import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, pct } from '../api.js';
import { useReference } from '../context.jsx';
import { RuleTag } from '../components/ui.jsx';

/* Rules & parameters — everything the system uses to decide, in one place, with where each rule came from,
   where it fails, and a redundancy review. Our rules mirror backend/engine/rules.js; the existing edits mirror
   backend/engine/existing.js. */

const OURS = [
  { id: 'R1', when: 'same person · same scheme · same date · a shared service (high) — or the identical bill, same diagnosis, re-entered 1–14 days later (medium)', because: 'one service cannot be billed twice; a re-entered bill is a re-billed visit unless the treatment genuinely repeats', type: 'duplicate claim', flag: 'same service, same day · same bill days later',
    from: [['Week 2 rule catalog R1', 'IF two claims share (scheme, beneficiary-id, service-code, service-date) AND have different claim-IDs THEN flag WITHIN_SCHEME_DUPLICATE'], ['openIMIS code', 'REJECTION_REASON_DUPLICATED = 6 is commented out in claim/validations.py:38 — the reviewer UI still offers reason 6'], ['Validation book (revision)', 're-bills arrived 0–14 days later; the same-day rule caught 11 of 38 — hence the 14-day identical-bill variant, exempting dialysis / chemotherapy protocols']],
    limits: 'The medium variant cannot tell a re-bill from a genuinely repeated treatment outside the exempted protocols; those show up as false positives the reviewer clears.' },
  { id: 'R2', when: 'same person · same facility · same visit date · different lines', because: 'one episode possibly split into two claims', type: 'unbundling', flag: 'same episode split',
    from: [['HIB domain-expert interview (2025)', '"claim vault" — SSF holds claims for the same hospital + contributor + visit date for review'], ['Week 2 rule catalog R2', 'route to vault: one patient, one hospital, one day is one episode'], ['Adjudication report (2025), fraud table', 'Unbundling — one package split into multiple claims; detection: rule engine, claims-history cross-check']],
    limits: 'Honest split visits look identical (22 false positives on the training book), which is why R2 is medium weight and the reviewer clears them. Splits across two days fall to R1\'s near-duplicate variant or nothing.' },
  { id: 'R3', when: 'same identity key · a different scheme · dates within ±2 days · same diagnosis or a shared service; weight high on a National-ID match, medium on a composite (name + DOB + sex) match', because: 'HIB and SSF do not see each other; the same care is claimed twice — and a composite match could be a namesake', type: 'cross-scheme double claim', flag: 'same person, two payers',
    from: [['Week 1 finding (HIB/GIZ, Apr 2024)', 'the HIB ↔ SSF silo; National-ID linkage named by HIB as the fix'], ['Week 2 rule catalog R3', 'IF two claims in DIFFERENT schemes share (national-ID match, service/diagnosis, overlapping dates)'], ['ISSA Guideline 13 · report: "multiple claims across insurers"', 'cross-referencing of data across schemes; detection: industry data sharing'], ['Validation book (revision)', '14 homonyms fired R3 on the composite key — the identity confidence now sets the weight']],
    limits: 'Needs an identity: 0 % on no-NID + name-variant cases; lags beyond 2 days are missed (about a third of the validation book\'s cross-scheme cases).' },
  { id: 'R4', when: 'two inpatient stays overlapping — at different facilities (high), or at the same facility (medium); a same-day discharge-to-admission for the same diagnosis is read as a transfer and exempted', because: 'a patient cannot be admitted in two places at once; a second overlapping stay billed by the same facility is one admission billed twice or a phantom re-admission', type: 'impossible clinical sequence · phantom hospitalisation', flag: 'impossible day',
    from: [['Week 2 rule catalog R4', '"impossible day" red-flag literature; PhilHealth same-day dual-facility dialysis case (2019)'], ['Adjudication report (2025), fraud table', 'Ghost / phantom hospitalisation — claims with no real admission; detection: records inspection, biometrics'], ['Validation book (revision)', '39 transfers fired R4 and 31 same-facility phantom re-admissions were invisible — hence the exemption and the same-facility variant']],
    limits: 'A fraudulent overlap that starts exactly on the discharge day with the same diagnosis is now read as a transfer and missed.' },
  { id: 'R5', when: 'an earlier rejected claim · same diagnosis · within 14 days · and the new claim introduces a code the rejected claim did not have', because: 'the claim is being re-shaped to slip past the edit that rejected it; simply removing the rejected line is an honest correction', type: 'resubmission gaming', flag: 'rejected, then re-entered',
    from: [['Week 2 rule catalog R5', 'edit-gaming attack surface of the openIMIS pipeline'], ['openIMIS code', 'claim.services enter_and_submit keeps no memory of earlier rejections'], ['Validation book (revision)', 'honest corrections (off-list line removed) fired R5 17 times; resubmissions lagged up to 14 days — hence the "introduced code" test and the 14-day look-back']],
    limits: 'A legitimate new prescription after a rejection also introduces a code; the reviewer sees both claims side by side.' },
  { id: 'STG', when: 'a billed service outside the treatment protocol for the diagnosis · or an inpatient admission for a diagnosis the protocol treats as outpatient · or a stay longer than the protocol maximum', because: 'the diagnosis does not warrant the service, the admission or the stay — possible upcoding, unnecessary hospitalisation or an inflated bill', type: 'upcoding · unnecessary services · inflated bills / extended stay', flag: 'diagnosis–treatment mismatch',
    from: [['HIB domain-expert interview (2025)', '"standard treatment protocol" — reviewers weigh claims against it by hand'], ['openIMIS code', 'ICD_NOT_IN_LIST (reason 8) is commented out in claim/validations.py:40; the diagnosis is never validated'], ['Adjudication report (2025), reviewer checks', 'Medical necessity — was hospitalisation required, or OPD-treatable? Diagnosis–treatment consistency — diagnosis matches procedure, drugs, length of stay'], ['Nepal STP / NLEM 2021', 'the national protocol and essential-medicines list the elicited protocols approximate']],
    limits: 'Blind to upcoding that stays inside the protocol (0 of 15 on the validation book) — that needs peer benchmarking, not a rule.' },
  { id: 'R6', when: 'the facility\'s share of strongly flagged claims over its last 100 claims is at least 25 % and more than three times the median facility', because: 'fraud is a repeated behaviour of a few providers; every claim from such a facility deserves a closer look', type: 'provider concentration (all types)', flag: 'facility flag rate far above peers',
    from: [['Adjudication report (2025)', 'peer benchmarking; PM-JAY provider profiling — 1,114 hospitals de-empanelled, 1,504 fined (Mar 2025); NHA National Anti-Fraud Unit'], ['Providers view', 'the same ranking, shown as a table'], ['World Bank (2018) / NHCAA', 'provider-level analytics as the standard second line after claim edits']],
    limits: 'Low weight only, and only after 20 claims: it nudges ranking, it never flags alone. Its precision depends entirely on the rules that feed it.' },
  { id: 'R7', when: 'the treating doctor\'s NMC number appears on another facility\'s claim on the same day', because: 'one doctor cannot treat in two facilities at once — a ghost visit, a borrowed registration number, or duty-hour work billed privately', type: 'phantom hospitalisation · duty-hour billing', flag: 'same provider, many facilities',
    from: [['Ontology red flag rfSameProviderManyFacilities', 'known from the typology, previously not encoded'], ['Adjudication report (2025)', 'Khyber Teaching Hospital audit: surgeries claimed during official duty hours; PM-JAY ghost hospitalisation'], ['HIB practice', 'the NMC number is on every prescription and stored in Claim.guaranteeId — the data already exists']],
    limits: 'On synthetic data NMC numbers are random, so the few hits are chance collisions; on real data the signal is expected to be strong but rare.' },
  { id: 'R8', when: 'the same service for the same person more often in 30 days than the diagnosis warrants (consultations > 4, laboratory tests > 3, imaging > 2), except under dialysis / chemotherapy protocols', because: 'repeated tests and visits beyond the protocol are the "random tests" HIB introduced a 10 % co-payment to curb', type: 'unnecessary services · inflated bills', flag: 'service frequency anomaly',
    from: [['Adjudication report (2025)', 'HIB 10 % co-payment to limit random tests (Jan 2024); "whole-body tests" as a fraud pattern; Taiwan NHI real-time duplicate-service check; HIRA drug-utilisation review'], ['openIMIS code', 'the FREQUENCY edit (reason 5) exists but never runs because no service carries a frequency']],
    limits: 'Thresholds are guesses until clinicians set them per service; chronic conditions outside the exempted protocols will trip it.' },
];

const REVIEW = [
  ['R1 vs R2', 'Both key on same person + same date. Not redundant: R1 needs a shared service, R2 needs the same facility and different lines; they are written as if / else-if so a pair fires at most one of them.', 'kept'],
  ['R3 vs R4', 'A cross-scheme inpatient duplicate at two hospitals fires both on the same matched claim — one event counted twice (the demo claim scored 6). Now R4 is recorded as supporting evidence with 0 points when R3 already fired on the same claim; the demo scores 3.', 'subsumption added'],
  ['R1 near-duplicate vs R8', 'Both react to repeated services. R1 needs the identical bill and diagnosis within 14 days (a re-bill); R8 counts one service across many bills in 30 days (over-use). Overlap only when the same single-line bill repeats, which is rare.', 'kept'],
  ['R4 same-facility vs R2', 'Both are "same facility"; R2 is same-day outpatient splitting, R4 is overlapping inpatient stays — disjoint by care type.', 'kept'],
  ['STG unnecessary admission vs Engine 1 CARE_TYPE (reason 10)', 'Reason 10 checks whether the facility may admit at all; STG checks whether the diagnosis warrants admission. Different questions.', 'kept'],
  ['R5 vs Engine 1', 'Engine 1 rejects the first claim; R5 remembers that rejection. Complementary by design.', 'kept'],
  ['R6 vs everything', 'R6 is derived from the other rules\' flags, so it can only amplify, never detect. It was capped at low weight and 25 % to stop the feedback loop seen in testing (precision fell to 29 % before the cap).', 'capped'],
  ['R7 vs R6', 'Both are provider signals; R7 is a specific same-day event, R6 a rate. Independent evidence.', 'kept'],
  ['Weights', 'R3 on a composite identity now carries medium weight instead of high; R4 at the same facility carries medium. Weight follows the confidence of the evidence.', 'rebalanced'],
];

const EXISTING = [
  [9, 'Target date', 'discharge date must not precede admission', 'active'],
  [21, 'Coverage', 'an active policy must cover the person on the service date', 'active'],
  [7, 'Valid member', 'the member number must exist', 'active'],
  [2, 'Price list', 'every line must be in the facility price list', 'active'],
  [10, 'Care type', 'inpatient claims only from facilities that admit', 'active'],
  [4, 'Patient category', 'adult / child × M / F must match every line', 'active'],
  [16, 'Quantity cap', 'no line above the quantity limit', 'active'],
  [17, 'Waiting period', 'policy start + waiting period before the service date', 'active'],
  [5, 'Frequency', 'runs only if a service has a frequency set — none is, so it never compares claims', 'off'],
  [6, 'Duplicated', 'commented out in the code; the reviewer screen still lists it as a reason', 'disabled'],
  [8, 'Diagnosis not in list', 'commented out; the diagnosis is never validated', 'disabled'],
];

const NOT_ENCODED = [
  ['rfMissingNmcNumber', 'Prescription without an NMC registration number', 'HIB\'s top rejection cause; a completeness check, not fraud detection — belongs in the facility checklist (hop 6), where the app already shows it'],
  ['rfServiceAfterDeath · ftClaimsForDeceased', 'Service date after recorded death', 'needs the civil death register — a data-sharing question, not a rule'],
  ['ftPhantomHospitalisation (ghost visits)', 'A visit for a person who never attended', 'nothing on a single claim distinguishes it (1 of 23 caught on the validation book); needs biometrics at admission, field audit, beneficiary feedback letters (World Bank 2018) or R6 over time'],
  ['ftInflatedBillsExtendedStay (inside the protocol)', 'A dearer allowed item swapped for a cheaper one', 'needs peer benchmarking of facilities (0 of 15 caught); the openIMIS AI module is the better tool'],
  ['Sub-limits, room-rent caps, pre-authorisation, waiting periods, non-disclosure', 'Report\'s Indian-insurer checks', 'not part of HIB\'s or SSF\'s benefit design (family ceiling and package rates instead); openIMIS applies ceilings at valuation'],
  ['ftForgedDocuments · ftImpersonation · ftCollusionKickbacks', 'Forged documents, card sharing, collusion', 'document forensics, biometrics and investigation — outside what claim data can show'],
];

export default function Rules() {
  const { ref } = useReference();
  const [m, setM] = useState(null);
  const [open, setOpen] = useState(null);
  useEffect(() => { api.metrics().then(setM); }, []);
  const byRule = m?.dataset?.byRule || {};
  const weights = ref.weights || { high: 3, medium: 2, low: 1 };
  const nProto = Object.keys(ref.protocol || {}).length, nPrice = Object.keys(ref.priceList || {}).length;

  const PARAMS = [
    ['Identity key', 'National ID; if absent, name + date of birth + sex', 'the only key that can join HIB and SSF; a composite match lowers R3 to medium because it can be a namesake'],
    ['Rule weights', `high = ${weights.high} · medium = ${weights.medium} · low = ${weights.low}`, 'starting points; reviewer decisions move each rule\'s weight (confirm +0.5, clear −0.5, bounded 0.5–5); a flag with lower confidence is scaled down'],
    ['R1 near-duplicate window', '14 days', 'validation book: re-bills lag 0–14 days'],
    ['R3 date window', `± ${ref.r3_window_days ?? 2} days`, 'the other scheme is often billed a day or two later; lags up to 10 days seen on the validation book are missed on purpose (precision)'],
    ['R4 transfer exception', 'discharge day = admission day, same diagnosis, different facility', 'a referral, not an impossibility'],
    ['R5 look-back', '14 days · only when a new code is introduced', 'validation book: resubmissions lag 1–14 days; honest corrections remove a line, gaming swaps one'],
    ['R6 provider threshold', '≥ 20 claims · ≥ 25 % strongly flagged · > 3× the median facility', 'low weight; judged on the facility\'s last 100 claims'],
    ['R8 frequency limits (30 days)', 'consultations 4 · laboratory 3 · imaging 2', 'placeholders until clinicians set them; dialysis / chemotherapy protocols exempt'],
    ['Treatment protocols', `${nProto} diagnoses`, 'allowed services, whether admission is expected, and a maximum length of stay; generic inpatient items always allowed'],
    ['Price list', `${nPrice} items`, 'what the existing engine checks lines against'],
    ['Quantity cap', '30 per line', 'the existing engine\'s hard limit (reason 16)'],
    ['Reviewer budget', '5 % of claims', 'HIB\'s random sample today — fixed by headcount (about 50,000 claims a day, 26 reviewers); the ranked queue is judged on the same number of claims'],
    ['What a flag can do', 'never reject', 'a flag only ranks the claim for a Medical Officer; the decision stays human'],
    ['Reviewer decisions', 'confirm → reason 6 · clear · release', 'each is recorded against the rules that fired and moves their weight'],
  ];

  return <div className="page plain">
    <div className="center">
      <div className="eyebrow">Reference · <span className="std-tag partial">counts from the synthetic books</span></div>
      <h1 style={{ fontSize: '1.7rem', marginTop: '.3rem' }}>Rules and parameters</h1>
      <p className="lead">How a claim is scored: resolve <b>who</b> the person is, fetch their <b>history</b> across facilities and schemes, run nine rules, add up the weights, and rank the claim for a reviewer. Nothing here rejects a claim on its own.</p>
    </div>

    <h2>1 · Parameters</h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="params"><thead><tr><th>Parameter</th><th>Value</th><th>Why</th></tr></thead>
        <tbody>{PARAMS.map(([k, v, w]) => <tr key={k}><td>{k}</td><td className="v">{v}</td><td className="small">{w}</td></tr>)}</tbody></table>
    </div>

    <h2>2 · Our rules <small>run after openIMIS's own checks, before settlement · click a rule for where it came from and where it fails</small></h2>
    <div className="col">{OURS.map(r => {
      const w = ref.rules?.[r.id]?.weight || 'medium', live = byRule[r.id], now = m?.ruleWeight?.[r.id];
      const isNew = ['R6', 'R7', 'R8'].includes(r.id);
      return <div key={r.id} className="rulecard" style={{ cursor: 'pointer', borderColor: isNew ? 'var(--teal)' : undefined }} onClick={() => setOpen(open === r.id ? null : r.id)}>
        <div><RuleTag rule={r.id} weight={w} /><div className="meta" style={{ marginTop: '.3rem' }}>{w} · +{now ?? weights[w]}{now != null && now !== weights[w] && <span className="mute"> (was {weights[w]})</span>}</div>{isNew && <div className="std-tag used" style={{ marginTop: '.3rem' }}>new</div>}</div>
        <div>
          <div className="bold navy">{ref.rules?.[r.id]?.name || r.id}</div>
          <div className="cond"><b>if</b>{r.when}</div>
          <div className="cond"><b>because</b>{r.because}</div>
          <div className="meta">detects <i>{r.type}</i> · red flag <i>{r.flag}</i> · {open === r.id ? 'click to close' : 'click for provenance and limits'}</div>
          {open === r.id && <div className="mt" style={{ borderTop: '1px solid var(--line-2)', paddingTop: '.6rem' }}>
            <div className="eyebrow">Where it comes from</div>
            <table style={{ marginTop: '.3rem' }}><tbody>{r.from.map(([src, what]) => <tr key={src}><td className="small bold navy" style={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>{src}</td><td className="small">{what}</td></tr>)}</tbody></table>
            <div className="eyebrow mt">Where it fails</div>
            <p className="small" style={{ margin: '.2rem 0 0' }}>{r.limits}</p>
          </div>}
        </div>
        <div className="live">{live ? <><b>{pct(live.fraud / live.fired)}</b>precision on the book<br />{live.fired} fired · {live.fraud} fraud</> : <span className="mute">not fired on the book</span>}</div>
      </div>;
    })}</div>

    <h2>3 · Redundancy review <small>which rules overlap, and what was done about it</small></h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="params"><thead><tr><th>Pair</th><th>Finding</th><th>Outcome</th></tr></thead>
        <tbody>{REVIEW.map(([p, f, o]) => <tr key={p}><td>{p}</td><td className="small">{f}</td><td><span className={`std-tag ${o === 'kept' ? 'no' : 'used'}`}>{o}</span></td></tr>)}</tbody></table>
    </div>

    <h2>4 · Known red flags we have not encoded <small>from the World Bank / NHCAA typology, the adjudication report and the interviews — and why not</small></h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="params"><thead><tr><th>Ontology term</th><th>Red flag / fraud type</th><th>Why it is not a rule (yet)</th></tr></thead>
        <tbody>{NOT_ENCODED.map(([t, f, why]) => <tr key={t}><td className="mono small" style={{ whiteSpace: 'normal' }}>{t}</td><td className="small bold">{f}</td><td className="small">{why}</td></tr>)}</tbody></table>
    </div>

    <h2>5 · What openIMIS already checks <small>each claim on its own · validations.py</small></h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="params"><thead><tr><th>Reason</th><th>Edit</th><th>What it checks</th><th>State</th></tr></thead>
        <tbody>{EXISTING.map(([code, name, what, st]) => <tr key={code}><td>{code}</td><td className="small bold">{name}</td><td className="small">{what}</td><td><span className={`std-tag ${st === 'active' ? 'used' : st === 'off' ? 'partial' : 'no'}`}>{st}</span></td></tr>)}</tbody></table>
    </div>
    <p className="std-note mt">The existing edits look at one claim at a time, so a duplicate, a cross-scheme claim or an off-protocol treatment passes them all. That is the gap the rules above fill. See the <Link to="/ontology">Ontology</Link> for the vocabulary, the <Link to="/providers">Providers</Link> view for R6 and R7 as tables, and the <Link to="/dashboard">Dashboard</Link> for the honest results on both synthetic books.</p>
  </div>;
}
