import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, pct } from '../api.js';
import { useReference } from '../context.jsx';
import { RuleTag } from '../components/ui.jsx';

/* Rules & parameters — everything the system uses to decide, in one place, with where each rule came from.
   Our rules mirror backend/engine/rules.js; the existing edits mirror backend/engine/existing.js. */

const OURS = [
  { id: 'R1', when: 'same person · same scheme · same date · at least one shared service', because: 'one service cannot be billed twice', type: 'duplicate claim', flag: 'same service, same day',
    from: [['Week 2 rule catalog R1', 'IF two claims share (scheme, beneficiary-id, service-code, service-date) AND have different claim-IDs THEN flag WITHIN_SCHEME_DUPLICATE'], ['openIMIS code', 'REJECTION_REASON_DUPLICATED = 6 is commented out in claim/validations.py:38 — the reviewer UI still offers reason 6'], ['SSF mechanism (HIB/SSF presentation, Apr 2024)', 'composite claim id = hospital claim id + SSF claim id']],
    limits: 'Only exact same-date duplicates. On the validation book, re-bills days later were missed (11 of 38 caught). A wider window with a shared-service test is the fix.' },
  { id: 'R2', when: 'same person · same facility · same visit date · different lines', because: 'one episode possibly split into two claims', type: 'unbundling', flag: 'same episode split',
    from: [['HIB domain-expert interview (2025)', '"claim vault" — SSF holds claims for the same hospital + contributor + visit date for review'], ['Week 2 rule catalog R2', 'route to vault: one patient, one hospital, one day is one episode']],
    limits: 'Honest split visits look identical (22 false positives on the training book), which is why R2 is medium weight and the reviewer clears them.' },
  { id: 'R3', when: 'same identity key · a different scheme · dates within ±2 days · same diagnosis or a shared service', because: 'HIB and SSF do not see each other; the same care is claimed twice', type: 'cross-scheme double claim', flag: 'same person, two payers',
    from: [['Week 1 finding (HIB/GIZ, Apr 2024)', 'the HIB ↔ SSF silo; National-ID linkage named by HIB as the fix'], ['Week 2 rule catalog R3', 'IF two claims in DIFFERENT schemes share (national-ID match, service/diagnosis, overlapping dates)'], ['ISSA Guideline 13', 'cross-referencing of data across schemes'], ['knowledge base 04', 'independent ledgers, no shared identifier']],
    limits: 'Needs an identity: 0 % on no-NID + name-variant cases. Homonyms without a National ID cause false positives (14 on the validation book); lags beyond 2 days are missed.' },
  { id: 'R4', when: 'two inpatient stays · different facilities · overlapping dates', because: 'a patient cannot be admitted in two places at once', type: 'impossible clinical sequence', flag: 'impossible day',
    from: [['Week 2 rule catalog R4', '"impossible day" red-flag literature; PhilHealth same-day dual-facility dialysis case (2019)']],
    limits: 'Hospital transfers overlap by the transfer day and fire R4 (39 false positives on the validation book). A same-facility phantom re-admission does not fire it. Fix: exempt discharge-day = admission-day, add a same-facility overlap rule.' },
  { id: 'R5', when: 'an earlier rejected claim · same diagnosis · within 7 days · the codes were changed', because: 'the claim is being re-shaped to slip past the edit that rejected it', type: 'resubmission gaming', flag: 'rejected, then re-entered',
    from: [['Week 2 rule catalog R5', 'edit-gaming attack surface of the openIMIS pipeline'], ['openIMIS code', 'claim.services enter_and_submit keeps no memory of earlier rejections']],
    limits: 'Honest corrections after a real rejection look the same (R5 fired 69 times on the validation book, 20 fraud). Fix: fire only when the rejected line is replaced by a priced equivalent, not removed; look back 14 days.' },
  { id: 'STG', when: 'a billed service is not in the treatment protocol for the diagnosis, or the stay is longer than the protocol\'s maximum', because: 'the diagnosis does not warrant the service — possible upcoding or unnecessary care', type: 'upcoding · unnecessary services', flag: 'diagnosis–treatment mismatch',
    from: [['HIB domain-expert interview (2025)', '"standard treatment protocol" — reviewers weigh claims against it by hand'], ['openIMIS code', 'ICD_NOT_IN_LIST (reason 8) is commented out in claim/validations.py:40; the diagnosis is never validated'], ['Nepal STP / NLEM 2021', 'the national protocol and essential-medicines list the elicited protocols approximate']],
    limits: 'Blind to upcoding that stays inside the protocol (0 of 15 on the validation book) — that needs peer benchmarking, not a rule.' },
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

/* Known from the typology and the interviews, deliberately NOT encoded yet — and why. */
const NOT_ENCODED = [
  ['rfMissingNmcNumber', 'Prescription without an NMC registration number', 'HIB\'s top rejection cause; a completeness check, not fraud detection — belongs in the facility checklist (hop 6), where the app already shows it'],
  ['rfSameProviderManyFacilities', 'One NMC number billing across many facilities and dates', 'needs a provider profile over time (see Providers); candidate R6'],
  ['rfServiceAfterDeath', 'Service date after recorded death', 'needs the civil death register — a data-sharing question, not a rule'],
  ['ftPhantomHospitalisation', 'Ghost visits and phantom re-admissions at the same facility', 'nothing on a single claim distinguishes them (0 of 23 ghost visits caught on the validation book); needs biometrics at admission, field audit or a provider profile'],
  ['ftInflatedBillsExtendedStay', 'Inflated bills, upcoding inside the protocol', 'needs peer benchmarking of facilities (0 of 15 caught); the openIMIS AI module is the better tool'],
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
    ['Identity key', 'National ID; if absent, name + date of birth + sex', 'the only key that can join HIB and SSF; the fallback fails when a name is spelt differently and joins homonyms'],
    ['Rule weights', `high = ${weights.high} · medium = ${weights.medium} · low = ${weights.low}`, 'starting points; reviewer decisions move each rule\'s weight (confirm +0.5, clear −0.5, bounded 0.5–5)'],
    ['R3 date window', `± ${ref.r3_window_days ?? 2} days`, 'the other scheme is often billed a day or two later; 0 days missed OPD cases (recall 83 → 97 % on the training book); lags up to 10 days seen on the validation book'],
    ['R5 look-back', '7 days', 'a rejected claim re-entered within a week with changed codes'],
    ['R2 vault key', 'facility + person + visit date', 'the key SSF already uses to spot split claims'],
    ['Treatment protocols', `${nProto} diagnoses`, 'allowed services and a maximum length of stay per diagnosis; generic inpatient items always allowed'],
    ['Price list', `${nPrice} items`, 'what the existing engine checks lines against'],
    ['Quantity cap', '30 per line', 'the existing engine\'s hard limit (reason 16)'],
    ['Reviewer budget', '5 % of claims', 'HIB\'s random sample today — fixed by headcount (about 50,000 claims a day, 26 reviewers); the ranked queue is judged on the same number of claims'],
    ['What a flag can do', 'never reject', 'a flag only ranks the claim for a Medical Officer; the decision stays human'],
    ['Reviewer decisions', 'confirm → reason 6 · clear · release', 'each is recorded against the rules that fired and moves their weight'],
  ];

  return <div className="page plain">
    <div className="center">
      <div className="eyebrow">Reference</div>
      <h1 style={{ fontSize: '1.7rem', marginTop: '.3rem' }}>Rules and parameters</h1>
      <p className="lead">How a claim is scored: resolve <b>who</b> the person is, fetch their <b>history</b> across facilities and schemes, run six rules, add up the weights, and rank the claim for a reviewer. Nothing here rejects a claim on its own.</p>
    </div>

    <h2>1 · Parameters</h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="params"><thead><tr><th>Parameter</th><th>Value</th><th>Why</th></tr></thead>
        <tbody>{PARAMS.map(([k, v, w]) => <tr key={k}><td>{k}</td><td className="v">{v}</td><td className="small">{w}</td></tr>)}</tbody></table>
    </div>

    <h2>2 · Our rules <small>run after openIMIS's own checks, before settlement · click a rule for where it came from and where it fails</small></h2>
    <div className="col">{OURS.map(r => {
      const w = ref.rules?.[r.id]?.weight || 'medium', live = byRule[r.id], now = m?.ruleWeight?.[r.id];
      return <div key={r.id} className="rulecard" style={{ cursor: 'pointer' }} onClick={() => setOpen(open === r.id ? null : r.id)}>
        <div><RuleTag rule={r.id} weight={w} /><div className="meta" style={{ marginTop: '.3rem' }}>{w} · +{now ?? weights[w]}{now != null && now !== weights[w] && <span className="mute"> (was {weights[w]})</span>}</div></div>
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
        <div className="live">{live ? <><b>{pct(live.fraud / live.fired)}</b>precision on the book<br />{live.fired} fired · {live.fraud} fraud</> : <span className="mute">…</span>}</div>
      </div>;
    })}</div>

    <h2>3 · Known red flags we have not encoded <small>from the World Bank / NHCAA typology and the interviews — and why not</small></h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="params"><thead><tr><th>Ontology term</th><th>Red flag / fraud type</th><th>Why it is not a rule (yet)</th></tr></thead>
        <tbody>{NOT_ENCODED.map(([t, f, why]) => <tr key={t}><td className="mono small" style={{ whiteSpace: 'normal' }}>{t}</td><td className="small bold">{f}</td><td className="small">{why}</td></tr>)}</tbody></table>
    </div>

    <h2>4 · What openIMIS already checks <small>each claim on its own · validations.py</small></h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="params"><thead><tr><th>Reason</th><th>Edit</th><th>What it checks</th><th>State</th></tr></thead>
        <tbody>{EXISTING.map(([code, name, what, st]) => <tr key={code}><td>{code}</td><td className="small bold">{name}</td><td className="small">{what}</td><td><span className={`std-tag ${st === 'active' ? 'used' : st === 'off' ? 'partial' : 'no'}`}>{st}</span></td></tr>)}</tbody></table>
    </div>
    <p className="std-note mt">The existing edits look at one claim at a time, so a duplicate, a cross-scheme claim or an off-protocol treatment passes them all. That is the gap the six rules above fill. See the <Link to="/ontology">Ontology</Link> for the vocabulary, the <Link to="/providers">Providers</Link> view for what claim pairs cannot see, and the <Link to="/dashboard">Dashboard</Link> for the honest results.</p>
  </div>;
}
