import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, pct } from '../api.js';
import { useReference } from '../context.jsx';
import { RuleTag } from '../components/ui.jsx';

/* Rules & parameters — everything the system uses to decide, in one place.
   Our rules mirror backend/engine/rules.js; the existing edits mirror backend/engine/existing.js. */

const OURS = [
  { id: 'R1', when: 'same person · same scheme · same date · at least one shared service', because: 'one service cannot be billed twice', type: 'duplicate claim', flag: 'same service, same day', source: 'rule catalog R1 · openIMIS reason 6 (disabled)' },
  { id: 'R2', when: 'same person · same facility · same visit date · different lines', because: 'one episode possibly split into two claims', type: 'unbundling', flag: 'same episode split', source: 'rule catalog R2 · the SSF claim-vault key' },
  { id: 'R3', when: 'same person (identity key) · a different scheme · dates within ±2 days · same diagnosis or a shared service', because: 'HIB and SSF do not see each other; the same care is claimed twice', type: 'cross-scheme double claim', flag: 'same person, two payers', source: 'rule catalog R3 · independent ledgers' },
  { id: 'R4', when: 'two inpatient stays · different facilities · overlapping dates', because: 'a patient cannot be admitted in two places at once', type: 'impossible clinical sequence', flag: 'impossible day', source: 'rule catalog R4' },
  { id: 'R5', when: 'an earlier claim was rejected · same diagnosis · within 7 days · the codes were changed', because: 'the claim is being re-shaped to slip past the edit that rejected it', type: 'resubmission gaming', flag: 'rejected, then re-entered', source: 'rule catalog R5 · edit-gaming attack surface' },
  { id: 'STG', when: 'a billed service is not in the treatment protocol for the diagnosis, or the stay is longer than the protocol\'s maximum', because: 'the diagnosis does not warrant the service — possible upcoding or unnecessary care', type: 'upcoding · unnecessary services', flag: 'diagnosis–treatment mismatch', source: 'HIB expert interview · openIMIS reason 8 (disabled)' },
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

export default function Rules() {
  const { ref } = useReference();
  const [m, setM] = useState(null);
  useEffect(() => { api.metrics().then(setM); }, []);
  const byRule = m?.dataset?.byRule || {};
  const weights = ref.weights || { high: 3, medium: 2, low: 1 };
  const nProto = Object.keys(ref.protocol || {}).length, nPrice = Object.keys(ref.priceList || {}).length;

  const PARAMS = [
    ['Identity key', 'National ID; if absent, name + date of birth + sex', 'the only key that can join HIB and SSF; the fallback fails when a name is spelt differently'],
    ['Rule weights', `high = ${weights.high} · medium = ${weights.medium} · low = ${weights.low}`, 'suspicion = the sum of the weights of the rules that fired'],
    ['R3 date window', `± ${ref.r3_window_days ?? 2} days`, 'the other scheme is often billed a day or two later; 0 days missed OPD cases (recall 83 → 97 %)'],
    ['R5 look-back', '7 days', 'a rejected claim re-entered within a week with changed codes'],
    ['R2 vault key', 'facility + person + visit date', 'the key SSF already uses to spot split claims'],
    ['Treatment protocols', `${nProto} diagnoses`, 'allowed services and a maximum length of stay per diagnosis; generic inpatient items always allowed'],
    ['Price list', `${nPrice} items`, 'what the existing engine checks lines against'],
    ['Quantity cap', '30 per line', 'the existing engine\'s hard limit (reason 16)'],
    ['Reviewer budget', '5 % of claims', 'HIB\'s random sample today; the ranked queue is judged on the same number of claims'],
    ['What a flag can do', 'never reject', 'a flag only ranks the claim for a Medical Officer; the decision stays human'],
    ['Reviewer decisions', 'confirm → reason 6 · clear · release', 'each is recorded against the rules that fired: confirmed → weight up, cleared → weight down'],
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

    <h2>2 · Our rules <small>run after openIMIS's own checks, before settlement</small></h2>
    <div className="col">{OURS.map(r => {
      const w = ref.rules?.[r.id]?.weight || 'medium', live = byRule[r.id];
      return <div key={r.id} className="rulecard">
        <div><RuleTag rule={r.id} weight={w} /><div className="meta" style={{ marginTop: '.3rem' }}>{w} · +{weights[w]}</div></div>
        <div>
          <div className="bold navy">{ref.rules?.[r.id]?.name || r.id}</div>
          <div className="cond"><b>if</b>{r.when}</div>
          <div className="cond"><b>because</b>{r.because}</div>
          <div className="meta">detects <i>{r.type}</i> · red flag <i>{r.flag}</i> · source: {r.source}</div>
        </div>
        <div className="live">{live ? <><b>{pct(live.fraud / live.fired)}</b>precision on the book<br />{live.fired} fired · {live.fraud} fraud</> : <span className="mute">…</span>}</div>
      </div>;
    })}</div>

    <h2>3 · What openIMIS already checks <small>each claim on its own · validations.py</small></h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="params"><thead><tr><th>Reason</th><th>Edit</th><th>What it checks</th><th>State</th></tr></thead>
        <tbody>{EXISTING.map(([code, name, what, st]) => <tr key={code}><td>{code}</td><td className="small bold">{name}</td><td className="small">{what}</td><td><span className={`std-tag ${st === 'active' ? 'used' : st === 'off' ? 'partial' : 'no'}`}>{st}</span></td></tr>)}</tbody></table>
    </div>
    <p className="std-note mt">The existing edits look at one claim at a time, so a duplicate, a cross-scheme claim or an off-protocol treatment passes them all. That is the gap the six rules above fill. See the <Link to="/ontology">Ontology</Link> for the vocabulary they use and the <Link to="/dashboard">Dashboard</Link> for the results.</p>
  </div>;
}
