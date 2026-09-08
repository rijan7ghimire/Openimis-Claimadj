import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, npr } from '../api.js';
import { useReference } from '../context.jsx';
import QueueTable from '../components/QueueTable.jsx';
import ReviewPanel from '../components/ReviewPanel.jsx';
import { Engine1Checks, Engine2Flags } from '../components/EngineViews.jsx';
import JourneyMap from '../components/JourneyMap.jsx';
import { Pill, SchemePill, Identity, Lines, Timeline, Spinner, StatusPill } from '../components/ui.jsx';

/* One claim, HIB's three lanes, 14 hops (3 proposed). One focus per screen; everything prefilled. */
const PHASES = [
  { id: 'visit', label: 'Patient visits hospital' },
  { id: 'submit', label: 'Health facility submits claim' },
  { id: 'adjudicate', label: 'Claim adjudication by HIB' },
];
const STEPS = [
  { key: 'verify', owner: 'facility', short: ['Membership', 'verification'], phase: 'visit', title: 'Membership verification', sub: 'The hospital looks the patient up in openIMIS before treating.', actor: 'Hospital front desk' },
  { key: 'card_care', owner: 'facility', short: ['Hospital card', 'and care'], phase: 'visit', title: 'Hospital card and care', sub: 'The patient is treated according to need and the benefit package.', actor: 'Treating doctor' },
  { key: 'no_oop', owner: 'patient', short: ['Nothing paid', 'at the counter'], phase: 'visit', title: 'No out-of-pocket payment', sub: 'The scheme pays the facility; the patient pays nothing at the counter.', actor: 'Patient' },
  { key: 'prepare', owner: 'facility', short: ['Claim', 'document'], phase: 'submit', title: 'The claim document', sub: 'Prepared from the patient\'s card and the invoices.', actor: 'Hospital claim admin' },
  { key: 'enter', owner: 'facility', short: ['Entered in', 'openIMIS'], phase: 'submit', title: 'Entered in openIMIS', sub: 'Keyed in manually, or sent by an EMR as a FHIR claim.', actor: 'Hospital claim admin' },
  { key: 'facility_verify', owner: 'facility', short: ['Facility check', 'and submission'], phase: 'submit', title: 'Facility verification and submission', sub: 'The facility checks its own claim against HIB\'s usual rejection causes.', actor: 'Hospital claim admin' },
  { key: 'system_verify', owner: 'openimis', short: ['System', 'verification'], phase: 'submit', title: 'System verification by openIMIS', sub: 'The existing edits — each one looks at this claim alone.', actor: 'openIMIS · validate_claim' },
  { key: 'proposed_layer', owner: 'ours', short: ['Identity and', 'cross-claim', 'rules'], phase: 'submit', title: 'Identity resolution and cross-claim rules', sub: 'The only step that compares this claim with others — across facilities, across schemes, and against the provider.', actor: 'Knowledge-based layer', proposed: true },
  { key: 'completeness', owner: 'desk', short: ['Completeness', 'check'], phase: 'adjudicate', title: 'Completeness check', sub: 'The scheme opens the claim and its attachments.', actor: 'HIB claims desk' },
  { key: 'benefit_verify', owner: 'desk', short: ['Benefit', 'package check'], phase: 'adjudicate', title: 'Verification against the benefit package', sub: 'Covered, priced, within the ceiling?', actor: 'HIB claims desk' },
  { key: 'manual_review', owner: 'mo', short: ['Ranked', 'review queue'], phase: 'adjudicate', title: 'The review queue', sub: 'Today a random 5 % sample; proposed, a ranked queue with reasons.', actor: 'Medical Officers', proposed: true },
  { key: 'decision', owner: 'mo', short: ['Reviewer', 'decision'], phase: 'adjudicate', title: 'Reviewer decision', sub: 'Confirm, clear or release — the decision teaches the rules.', actor: 'Medical Officer', proposed: true },
  { key: 'accounts', owner: 'finance', short: ['Settlement', 'recommended'], phase: 'adjudicate', title: 'Settlement', sub: 'The account section recommends the amount to pay.', actor: 'HIB accounts section' },
  { key: 'payment', owner: 'finance', short: ['Approval and', 'payment'], phase: 'adjudicate', title: 'Outcome', sub: 'Executive Director approval and online payment — or rejection.', actor: 'Executive Director' },
];
const idx = (key) => STEPS.findIndex(s => s.key === key);
const DIAG = new Set(['LAB-CBC', 'LAB-HBA1C', 'LAB-RFT', 'LAB-LFT', 'LAB-URINE', 'LAB-MALARIA', 'LAB-WIDAL', 'XRAY', 'USG', 'ECG', 'ECHO', 'CT-HEAD', 'MRI-LUMBAR', 'MRI-SPINE']);

export default function Journey() {
  const { ref } = useReference();
  const [params] = useSearchParams();
  const [scenarios, setScenarios] = useState([]);
  const [scenario, setScenario] = useState(null);
  const [person, setPerson] = useState(null);
  const [priors, setPriors] = useState([]);
  const [draft, setDraft] = useState(null);
  const [result, setResult] = useState(null);
  const [reviewed, setReviewed] = useState(null);
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [queue, setQueue] = useState(null);
  const [qmode, setQmode] = useState('triage');
  const [edit, setEdit] = useState(false);
  const [pq, setPq] = useState(''); const [found, setFound] = useState([]);

  const c = reviewed || result;
  const rejected = !!c && c.status === 1;
  const flagged = !!c && (c.flags?.length || 0) > 0;
  const cur = STEPS[step];

  useEffect(() => { api.scenarios().then(setScenarios); }, []);
  const booted = useRef(false);   // StrictMode mounts twice in dev — never load (and submit) the scenario twice
  useEffect(() => {
    if (booted.current) return; booted.current = true;
    const sid = params.get('scenario') || 'cross_scheme';
    const target = Math.min(STEPS.length - 1, Math.max(0, Number(params.get('step') || 0)));
    loadScenario(sid, target, params.get('decision'));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cur.key === 'manual_review') { setQueue(null); api.queue(qmode, 30).then(setQueue); } }, [step, qmode]);  // eslint-disable-line
  useEffect(() => {
    if ((cur.key === 'accounts' || cur.key === 'payment') && c && c.status === 4 && (!c.flags.length || c.review) && !c.paid) api.settle(c.claim_id).then(setReviewed).catch(() => {});
  }, [step, result, reviewed]);  // eslint-disable-line
  useEffect(() => { if (edit && cur.key === 'verify') api.persons(pq).then(setFound); }, [pq, edit, step]);  // eslint-disable-line
  useEffect(() => { setEdit(false); }, [step]);

  async function loadScenario(sid, target = 0, decision = null) {
    setBusy(true); setErr(null);
    try {
      const r = await api.loadScenario(sid);
      setScenario({ ...r.scenario, id: sid }); setPerson(r.person); setPriors(r.priors); setDraft(r.draft); setResult(null); setReviewed(null);
      let t = target;
      if (t > idx('enter')) {
        const d = await api.submit(r.person, r.draft, sid, r.scenario.truth); setResult(d);
        if (d.status === 1 && t > idx('system_verify')) t = idx('payment');
        if (d.status !== 1 && !d.flags.length && t === idx('decision')) t = idx('accounts');
        if (t >= idx('accounts') && d.flags.length && decision) { const rv = await api.review(d.claim_id, decision, 'demo deep link'); setReviewed(rv); }
      }
      setStep(t); setMaxStep(t);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function submit() {
    setBusy(true); setErr(null);
    try { const d = await api.submit(person, draft, scenario?.id, scenario?.truth); setResult(d); return d; } catch (e) { setErr(e.message); return null; } finally { setBusy(false); }
  }
  const go = (n) => { setStep(n); setMaxStep(m => Math.max(m, n)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const skipped = (n) => {
    const k = STEPS[n].key;
    if (rejected) return ['proposed_layer', 'completeness', 'benefit_verify', 'manual_review', 'decision', 'accounts'].includes(k);
    if (c && !flagged) return k === 'decision';
    return false;
  };
  async function jumpTo(n) {
    let t = n, d = result;
    if (t > idx('enter') && !d) { d = await submit(); if (!d) return; }
    if (d && d.status === 1 && t > idx('system_verify')) t = idx('payment');
    if (d && d.status !== 1 && !d.flags.length && t === idx('decision')) t = idx('accounts');
    go(t);
  }
  async function next() {
    if (cur.key === 'enter' && !result) { const d = await submit(); if (!d) return; go(step + 1); return; }
    if (cur.key === 'system_verify' && result?.status === 1) { go(idx('payment')); return; }
    let n = step + 1; while (n < STEPS.length - 1 && skipped(n)) n++; go(n);
  }
  const amount = (draft?.lines || []).reduce((s, l) => s + (ref.priceList[l.code] || 0) * (Number(l.qty) || 1), 0);
  const copay = Math.round(0.10 * (draft?.lines || []).filter(l => DIAG.has(l.code)).reduce((s, l) => s + (ref.priceList[l.code] || 0) * l.qty, 0));
  const fac = draft ? ref.facilities.find(f => f.hf_id === draft.facility_id) : null;
  const proto = draft ? ref.protocol[draft.diagnosis] : null;
  const memberNo = draft ? (draft.scheme === 'HIB' ? person?.hib_id : person?.ssf_id) : null;
  const offProtocol = new Set((draft?.lines || []).map(l => l.code).filter(x => proto && !proto.allow.includes(x)));

  const valuePanel = <div className="valwrap">
    <aside className="valstrip">
      <div className="vs-head">★ Where this study adds value</div>
      <p className="vs-today">openIMIS checks each claim alone, its duplicate rule is switched off, and reviewers get a random 5 % sample. We add three hops:</p>
      <div className="vs-items">
        <button className={cur.key === 'proposed_layer' ? 'on' : ''} onClick={() => jumpTo(idx('proposed_layer'))}><b>8</b><span><i>Sees across facilities and schemes.</i> Nine rules: 92 % of planted frauds on our own synthetic book (88 % precision), 74 % on an independent synthetic book at 50 % precision — see the dashboard. The existing engine catches 4 of 454.</span></button>
        <button className={cur.key === 'manual_review' ? 'on' : ''} onClick={() => jumpTo(idx('manual_review'))}><b>11</b><span><i>A ranked queue with reasons.</i> Same reviewer budget: 418 frauds reached instead of 14–34 on our book; 189 instead of about 14 on the independent book.</span></button>
        <button className={cur.key === 'decision' ? 'on' : ''} onClick={() => jumpTo(idx('decision'))}><b>12</b><span><i>Every decision teaches the rules.</i> Confirm, clear or release is recorded per rule.</span></button>
      </div>
    </aside>
  </div>;

  /* ---------- header: lanes + one line about the claim ---------- */
  const header = <>
    <div className="jmap-bar">
      <div className="jm-legend"><span><i className="d done" /> done</span><span><i className="d cur" /> you are here</span><span><i className="d prop" /> ★ where our study adds value</span><span><i className="d skip" /> skipped for this claim</span></div>
      <select value={scenario?.id || ''} onChange={e => loadScenario(e.target.value)}>{scenarios.map(s => <option key={s.id} value={s.id}>Scenario: {s.title}</option>)}</select>
    </div>
    <div className="jmap-side">
      <div className="jmap-wrap"><JourneyMap steps={STEPS} phases={PHASES} step={step} scheme={draft?.scheme || 'HIB'} skipped={skipped} onJump={jumpTo} /></div>
    </div>
    <div className="centered">
      <div className="center">
        <div className="eyebrow">Step {step + 1} of {STEPS.length} · {cur.proposed ? <span className="prop">proposed</span> : 'openIMIS today'} · {cur.actor.replace('HIB', draft?.scheme || 'HIB')}</div>
        <h1 style={{ fontSize: '1.7rem', marginTop: '.3rem' }}>{cur.title}</h1>
        <p className="mute" style={{ marginBottom: 0 }}>{cur.sub}</p>
        {person && <div className="claimline">
          <span className="bold navy">{c?.person_name || person.name}</span>
          {draft && <SchemePill s={draft.scheme} />}
          {person.national_id ? <Pill tone="teal">NID</Pill> : <Pill tone="gold">no NID</Pill>}
          {person.hib_id && person.ssf_id && <Pill tone="red">dual-enrolled</Pill>}
          {c?.code ? <span className="mono">{c.code}</span> : fac && <span>{fac.name}</span>}
          {c && <StatusPill status_name={c.status_name} review_name={c.review_name} paid={c.paid} />}
          {c?.suspicion > 0 && <Pill tone="red">suspicion {c.suspicion} · {c.rules.join(', ')}</Pill>}
        </div>}
      </div>
    </div>
  </>;

  const Check = ({ ok = true, children, why }) => <div className={`check ${ok ? 'pass' : 'fail'}`} style={{ animation: 'none', opacity: 1, transform: 'none' }}><div className="ico">{ok ? '✓' : '✕'}</div><div><div className="name">{children}</div>{why && <div className="detail">{why}</div>}</div><div /></div>;

  /* ---------- one card per step ---------- */
  const body = () => {
    if (!person || !draft) return <p className="mute center">Loading…</p>;
    switch (cur.key) {
      case 'verify': return <>
        {scenario && <p className="small mute center" style={{ marginTop: '-.4rem' }}>{scenario.expect}</p>}
        <div className="card">
          <div className="row between top wrap">
            <div><div className="bold navy" style={{ fontSize: '1.15rem' }}>{person.name}</div><div className="small mute">{person.sex === 'F' ? 'Female' : 'Male'} · born {person.dob} · {person.district}, {person.province}</div><div style={{ marginTop: '.5rem' }}><Identity p={person} /></div></div>
            <div className="kv"><b>HIB</b><span>{person.hib_id ? <>member <span className="mono">{person.hib_id}</span> · policy {person.hib_policy_active === false ? <span className="red bold">lapsed</span> : <span className="green bold">active</span>}</> : <span className="mute">not a member</span>}</span>
              <b>SSF</b><span>{person.ssf_id ? <>contributor <span className="mono">{person.ssf_id}</span>{draft.name_override && <> · on file as <b>{draft.name_override}</b></>}</> : <span className="mute">not a contributor</span>}</span>
              <b>National ID</b><span>{person.national_id ? <span className="mono">{person.national_id}</span> : <span className="gold bold">not recorded</span>}</span></div>
          </div>
          <p className="quiet">Each scheme verifies membership in its own openIMIS. Nothing here tells HIB what SSF knows about this person, or the other way round.</p>
          {draft.scheme === 'SSF' && <p className="quiet"><b className="teal">How SSF differs.</b> SSF keeps its members in SoSys (its contributor system) and mirrors them to openIMIS over FHIR; the contributor number, not a family card, is the key, and the policy is bound to the fiscal year of the contribution.</p>}
          {priors.length > 0 && <><div className="sep" /><div className="small">{priors.map(p => <div key={p.claim_id}>Earlier claim: <SchemePill s={p.scheme} /> <span className="mono">{p.code}</span> · {p.hf_name} · {p.date_from} · {p.diagnosis} {p.dx_label} · {npr(p.amount)} · <b>{p.status_name}</b>{p.status === 1 && <span className="red"> (reason {p.rejection_reason})</span>}</div>)}</div></>}
          {edit && <><div className="sep" /><input placeholder="search the book: name, National ID, HIB/SSF number…" value={pq} onChange={e => setPq(e.target.value)} />
            <div className="col mt" style={{ maxHeight: 240, overflow: 'auto' }}>{found.map(p => <div key={p.insuree_id} className="scen" onClick={() => { setPerson(p); setPriors([]); setResult(null); setReviewed(null); setDraft(d => ({ ...d, scheme: p.hib_id ? 'HIB' : 'SSF', name_override: undefined })); setEdit(false); }}><div className="t">{p.name}</div><div className="s">{p.sex} · {p.dob} · {p.district}</div></div>)}</div></>}
        </div>
      </>;
      case 'card_care': return <div className="card">
        <div className="kv"><b>Member no.</b><span className="mono">{memberNo}</span><b>Facility</b><span>{fac.name} <span className="mute">· {fac.district} · {fac.level === 'H' ? 'hospital' : fac.level === 'C' ? 'PHCC' : 'health post'}</span></span><b>Doctor</b><span><span className="mono">{draft.nmc_no}</span> <span className="mute">NMC registration</span></span><b>Diagnosis</b><span><span className="mono">{draft.diagnosis}</span> {proto?.label}</span><b>Care</b><span>{draft.care_type === 'I' ? `Inpatient, ${draft.date_from} → ${draft.date_to}` : `Outpatient, ${draft.date_from}`}</span><b>Package</b><span>{draft.scheme === 'HIB' ? 'HIB family policy · NPR 100,000 / year' : 'SSF medical benefit'}</span></div>
        <div className="sep" /><Lines lines={draft.lines} priceList={ref.priceList} highlight={offProtocol} />
        {offProtocol.size > 0 && <p className="quiet gold">Highlighted lines are outside the treatment protocol for this diagnosis — openIMIS does not check that.</p>}
      </div>;
      case 'no_oop': return <div className="card">
        <div className="grid grid-3"><div className="stat"><div className="v">{npr(amount)}</div><div className="l">billed by the facility</div></div><div className="stat teal"><div className="v">NPR 0</div><div className="l">paid at the counter</div></div><div className="stat"><div className="v">{npr(copay)}</div><div className="l">10 % co-payment on diagnostics</div></div></div>
        <p className="quiet">Money flows scheme → facility, never to the patient. The facility is the economic beneficiary of every line on the claim — which is why the claim, not the patient, is where fraud enters.</p>
      </div>;
      case 'prepare': return <div className="card">
        <div className="kv"><b>Patient</b><span>{draft.name_override || person.name} · <span className="mono">{memberNo}</span></span><b>National ID</b><span>{person.national_id || <span className="gold">none</span>}</span><b>Facility</b><span>{fac.name}</span><b>Doctor</b><span className="mono">{draft.nmc_no}</span><b>Diagnosis</b><span>{draft.diagnosis} · {proto?.label}</span><b>Dates</b><span>{draft.date_from}{draft.care_type === 'I' ? ' → ' + draft.date_to : ''}</span></div>
        <div className="sep" /><Lines lines={draft.lines} priceList={ref.priceList} />
        <div className="row wrap mt small"><Pill tone="outline">📎 discharge summary / OPD ticket</Pill><Pill tone="outline">📎 prescription · NMC {draft.nmc_no}</Pill><Pill tone="outline">📎 invoices</Pill></div>
        {edit && <><div className="sep" /><div className="grid grid-2">
          <div className="field"><label>Scheme</label><div className="seg">{['HIB', 'SSF'].map(s => <button key={s} className={draft.scheme === s ? 'on' : ''} disabled={!(s === 'HIB' ? person.hib_id : person.ssf_id)} onClick={() => setDraft(d => ({ ...d, scheme: s }))}>{s}</button>)}</div></div>
          <div className="field"><label>Diagnosis</label><select value={draft.diagnosis} onChange={e => setDraft(d => ({ ...d, diagnosis: e.target.value }))}>{Object.entries(ref.protocol).map(([k, v]) => <option key={k} value={k}>{k} · {v.label}</option>)}</select></div>
          <div className="field"><label>Facility</label><select value={draft.facility_id} onChange={e => { const f = ref.facilities.find(x => x.hf_id === e.target.value); setDraft(d => ({ ...d, facility_id: e.target.value, nmc_no: f?.doctors?.[0] || '' })); }}>{ref.facilities.filter(f => (draft.scheme === 'HIB' ? f.hib : f.ssf)).slice(0, 120).map(f => <option key={f.hf_id} value={f.hf_id}>{f.name} · {f.district}</option>)}</select></div>
          <div className="field"><label>{draft.care_type === 'I' ? 'Admission' : 'Visit date'}</label><input type="date" value={draft.date_from} onChange={e => setDraft(d => ({ ...d, date_from: e.target.value, date_to: d.care_type === 'I' && d.date_to < e.target.value ? e.target.value : d.date_to }))} /></div></div>
          <div className="row wrap mt" style={{ gap: '.35rem' }}>{Object.keys(ref.priceList).concat(['MRI-SPINE']).map(code => { const on = draft.lines.some(l => l.code === code); return <span key={code} className={`chip ${on ? 'on' : ''}`} style={{ borderStyle: proto?.allow.includes(code) ? 'solid' : 'dashed' }} onClick={() => setDraft(d => ({ ...d, lines: on ? d.lines.filter(l => l.code !== code) : [...d.lines, { code, qty: 1 }] }))}>{code}</span>; })}</div></>}
      </div>;
      case 'enter': {
        const preview = { resourceType: 'Claim', status: 'active', use: 'claim', patient: { reference: `Patient/${memberNo}`, display: draft.name_override || person.name }, provider: { reference: `Organization/${fac.hf_id}`, display: fac.name }, enterer: { reference: `Practitioner/${draft.nmc_no}` }, billablePeriod: { start: draft.date_from, end: draft.care_type === 'I' ? draft.date_to : draft.date_from }, diagnosis: [{ diagnosisCodeableConcept: { coding: [{ system: 'ICD-10', code: draft.diagnosis, display: proto?.label }] } }], item: draft.lines.map((l, i) => ({ sequence: i + 1, productOrService: { coding: [{ code: l.code }] }, quantity: { value: l.qty }, unitPrice: { value: ref.priceList[l.code] || 0, currency: 'NPR' } })), total: { value: amount, currency: 'NPR' } };
        return <div className="card">
          <div className="kv"><b>Claim no.</b><span>{result ? <span className="mono">{result.code}</span> : <span className="mute">assigned on entry — Bikram-Sambat fiscal year</span>}</span><b>Status</b><span>{result ? <StatusPill status_name="Entered" /> : <span className="mute">Entered (2) after Next</span>}</span><b>Scheme</b><span><SchemePill s={draft.scheme} /></span><b>Travels with it</b><span>member number, facility, doctor's NMC number, diagnosis, lines, attachments</span><b>Does not</b><span>anything about this person's claims in the other scheme, or at other facilities</span></div>
          {draft.scheme === 'SSF' && <p className="quiet"><b className="teal">How SSF differs.</b> About 85 % of SSF claims arrive through openIMIS; SSF adds a composite claim id (hospital claim id + SSF claim id) and a booking step, and its "vault" key (facility + contributor + visit date) is the origin of our rule R2.</p>}
          <details style={{ marginTop: '.8rem' }}><summary className="small mute" style={{ cursor: 'pointer' }}>The FHIR R4 Claim as an EMR would send it</summary><pre style={{ marginTop: '.5rem' }}>{JSON.stringify(preview, null, 2)}</pre></details>
          <details style={{ marginTop: '.5rem' }}><summary className="small mute" style={{ cursor: 'pointer' }}>What our layer would add to the FHIR ClaimResponse (proposed)</summary><pre style={{ marginTop: '.5rem' }}>{JSON.stringify({ resourceType: 'ClaimResponse', outcome: 'queued', adjudication: [{ category: { coding: [{ system: 'https://w3id.org/hic-nepal/rule/', code: 'R3' }] }, reason: { text: 'same person, same diagnosis within 2 days, different scheme' }, value: 3 }], extension: [{ url: 'https://w3id.org/hic-nepal/ontology#suspicionScore', valueDecimal: 6 }, { url: 'https://w3id.org/hic-nepal/ontology#reviewStatus', valueCode: 'selected' }] }, null, 2)}</pre></details>
        </div>;
      }
      case 'facility_verify': return <div className="card">
        <div className="checks">
          <Check ok={!!draft.nmc_no}>NMC registration number on the prescription <span className="mono mute">{draft.nmc_no}</span></Check>
          <Check>Every diagnostic test has a prescription</Check>
          <Check>Medicines dispensed match the prescription</Check>
          <Check>Attachments complete</Check>
          <Check ok={draft.lines.every(l => l.code in ref.priceList)} why={draft.lines.some(l => !(l.code in ref.priceList)) ? 'an item is not on the price list — HIB will reject it' : undefined}>All items on the price list</Check>
        </div>
        <p className="quiet">These are HIB's most frequent rejection causes — about one claim in five. Submitted as <span className="mono">{result?.code}</span>, status Entered (2).</p>
        {draft.scheme === 'SSF' && <p className="quiet"><b className="teal">How SSF differs.</b> SSF's medical team reviews in openIMIS and its accounting system pays; the same rejection vocabulary applies.</p>}
      </div>;
      case 'system_verify': return <div className="card">
        <Engine1Checks engine1={result?.engine1} />
        {result?.status === 1 && <p className="quiet red">Back to the facility for re-submission with correction — the existing engine doing its job, before any reviewer and before our layer.</p>}
      </div>;
      case 'proposed_layer': return <div className="card"><Engine2Flags detail={result} refData={ref} /></div>;
      case 'completeness': return <div className="card"><div className="checks">
        <Check>Attachments present and legible</Check>
        <Check ok={!!result?.nmc_no}>Prescriber's NMC registration number present <span className="mono mute">{result?.nmc_no}</span></Check>
        <Check>Prescription covers every test and medicine billed</Check>
        <Check>Identity on the card matches the claim <span className="mono mute">{result?.chf_id}</span></Check>
        <Check>Dates coherent, submitted within the window</Check>
      </div></div>;
      case 'benefit_verify': return <div className="card"><div className="checks">
        <Check ok={!!result?.policy_active}>Policy in force on the service date</Check>
        <Check ok={draft.lines.every(l => l.code in ref.priceList)}>Every line in the benefit package and priced</Check>
        <Check ok={amount <= 100000}>Within the annual ceiling</Check>
        <Check>Care type allowed at this facility level</Check>
        <Check ok={offProtocol.size === 0} why={offProtocol.size ? 'openIMIS does not check this (reason 8 disabled) — our STG rule does' : undefined}>Diagnosis consistent with the treatment</Check>
      </div><p className="quiet">Approved so far {npr(amount)} · co-payment {npr(copay)}</p></div>;
      case 'manual_review': return <>
        {queue && <p className="small center" style={{ marginTop: '-.4rem' }}>{flagged
          ? <>Your claim is <b>#{queue.items.findIndex(x => x.claim_id === result.claim_id) + 1 || '—'}</b> in the ranked queue with suspicion <b>{result.suspicion}</b> — a Medical Officer sees it first, with the reason.</>
          : <>Your claim carries no flag: a 1-in-20 chance in today's random sample, and not shown at all in the ranked queue.</>}</p>}
        <div className="card soft" style={{ marginBottom: '1rem' }}>
          <div className="grid grid-4" style={{ gap: '.5rem' }}>
            <div className="stat"><div className="v">≈ 50,000</div><div className="l">claims a day at HIB (2024)</div></div>
            <div className="stat"><div className="v">26</div><div className="l">central reviewers (10 in 2020)</div></div>
            <div className="stat"><div className="v">≈ 1,900</div><div className="l">claims per reviewer per day</div></div>
            <div className="stat teal"><div className="v">≈ 5 %</div><div className="l">what 26 people can open at 5 min a claim</div></div>
          </div>
          <p className="quiet" style={{ marginTop: '.6rem' }}>The random sample is not a policy choice, it is arithmetic: the budget is fixed by headcount. The only lever is <b>which</b> 5 % gets opened. (HIB and GIZ presentations, Apr 2024; reviewer time is an assumption.)</p>
        </div>
        <QueueTable data={queue} mode={qmode} onMode={setQmode} highlightId={result?.claim_id} onOpen={() => flagged && go(idx('decision'))} refData={ref} />
      </>;
      case 'decision': return <ReviewPanel detail={reviewed || result} refData={ref} onDecided={setReviewed} />;
      case 'accounts': return <div className="card">
        {c && c.status === 1 ? <p className="quiet red" style={{ margin: 0 }}>No settlement — rejected{c.rejection_reason === 6 ? ' by the reviewer, reason 6 "Item/Service duplicated"' : ` (reason ${c.rejection_reason})`}.</p> : <>
          <div className="grid grid-3"><div className="stat"><div className="v">{npr(amount)}</div><div className="l">claimed</div></div><div className="stat"><div className="v">− {npr(copay)}</div><div className="l">co-payment</div></div><div className="stat teal"><div className="v">{npr(amount - copay)}</div><div className="l">recommended</div></div></div>
          <p className="quiet">After the monthly batch run, payment is irreversible — which is why our layer runs before this point.</p></>}
      </div>;
      case 'payment': {
        const paid = !!c?.paid, rej = c?.status === 1;
        return <>
          <div className={`card ${rej ? 'red' : paid ? 'green' : 'soft'}`}>
            <h2 style={{ margin: 0 }}>{rej ? `Rejected — reason ${c.rejection_reason}${c.rejection_reason === 6 ? ' “Item/Service duplicated”' : ' ' + (ref.rejectionCodes[c.rejection_reason] || '')}` : paid ? `Paid — ${npr(amount - copay)} to ${fac.name}` : flagged ? 'Waiting for the reviewer' : 'Being settled…'}</h2>
            <p className="small" style={{ margin: '.4rem 0 0' }}>{rej && c.rejection_reason === 6 ? 'The Medical Officer confirmed the flag; the facility is notified and the linked claim stays on record as evidence.' : rej ? 'Caught by the existing engine at system verification — before any reviewer was involved.' : paid && flagged ? 'A person looked at it and let it through; the rule that fired is now a little less sure of itself.' : paid ? 'Nothing fired, nobody had to look, the facility is paid.' : 'Open the reviewer step to decide.'}{c?.truth && c.truth !== 'unknown' && <> Ground truth: <Pill tone={c.truth === 'legitimate' ? 'green' : 'red'}>{c.truth}</Pill>{scenario?.hard && <span className="gold"> — the miss we expected: no National ID and a name spelt differently, so the fraud was paid.</span>}</>}</p>
          </div>
          <div className="card">
            <div className="grid grid-2">
              <div className="card soft"><div className="eyebrow">Today · openIMIS as it runs</div>
                <div className="bold navy" style={{ fontSize: '1.05rem', marginTop: '.2rem' }}>{rej && c.rejection_reason !== 6 ? `Rejected — reason ${c.rejection_reason}` : 'Paid'}</div>
                <p className="small" style={{ margin: '.3rem 0 0' }}>{rej && c.rejection_reason !== 6 ? 'The existing edit caught it; our layer was never needed.' : flagged ? `The edits pass it, a Medical Officer sees it only with a 1-in-20 chance in the random sample, and the money goes out after the batch run. ${c?.truth && c.truth !== 'legitimate' ? 'This fraud would have been paid.' : 'This honest claim is paid, as it should be.'}` : 'Nothing to catch; paid.'}</p></div>
              <div className="card teal"><div className="eyebrow" style={{ color: 'var(--teal-2)' }}>With the knowledge layer</div>
                <div className="bold navy" style={{ fontSize: '1.05rem', marginTop: '.2rem' }}>{rej && c.rejection_reason === 6 ? 'Rejected — reason 6, with the linked claim as evidence' : paid && flagged ? 'Paid after a person cleared it' : paid ? 'Paid, nobody had to look' : flagged ? 'Held for a Medical Officer' : rej ? `Rejected — reason ${c.rejection_reason} (existing engine)` : 'Being settled'}</div>
                <p className="small" style={{ margin: '.3rem 0 0' }}>{flagged ? `Flagged at hop 8 (${c.rules.join(', ')}, suspicion ${c.suspicion}), ranked for review before settlement, decided by a person, and the decision recorded against the rules.` : scenario?.hard ? 'Nothing fired: no National ID and a differently spelt name — the miss we expected, paid in both columns.' : 'No rule fired; the layer added nothing to a reviewer\'s day.'}</p></div>
            </div>
            <div className="sep" /><Timeline events={c?.timeline || []} />
          </div>
          <div className="row wrap" style={{ justifyContent: 'center' }}><button className="btn primary" onClick={() => loadScenario(scenario?.id || 'cross_scheme')}>Replay</button><Link className="btn" to="/queue">Review queue</Link><Link className="btn" to="/dashboard">Dashboard</Link></div>
        </>;
      }
      default: return null;
    }
  };

  const keys = useRef({});
  keys.current = { next, back: () => step > 0 && go(step - 1), canNext: !busy && cur.key !== 'payment' && !(cur.key === 'decision' && flagged && !reviewed) };
  useEffect(() => {
    const h = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' && keys.current.canNext) { e.preventDefault(); keys.current.next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); keys.current.back(); }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);

  const nextLabel = cur.key === 'enter' && !result ? 'Enter the claim →' : cur.key === 'payment' ? null : cur.key === 'decision' && flagged && !reviewed ? 'Decide above to continue' : 'Next →';
  return <div className="page journey2">
    {header}
    <div className="centered">
      {err && <div className="note red">{err}</div>}
      <div className="col gap-l">{body()}</div>
      {nextLabel && <div className="mt">
        <button className="btn primary lg wide" disabled={busy || (cur.key === 'decision' && flagged && !reviewed)} onClick={next}>{busy ? <><Spinner /> working…</> : nextLabel}</button>
        <div className="footlinks">
          {step > 0 && <button onClick={() => go(step - 1)}>← back</button>}
          <span className="keyhint"><kbd>←</kbd> <kbd>→</kbd> keys</span>
          {cur.key === 'verify' && <button onClick={() => setEdit(v => !v)}>{edit ? 'keep this patient' : 'change the patient'}</button>}
          {cur.key === 'prepare' && !result && <button onClick={() => setEdit(v => !v)}>{edit ? 'done' : 'customise the claim'}</button>}
        </div>
      </div>}
    </div>
    {valuePanel}
  </div>;
}
