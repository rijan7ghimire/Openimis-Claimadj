import { useState } from 'react';
import { api, npr } from '../api.js';
import { Pill, SchemePill, RuleTag, Lines, Timeline, StatusPill } from './ui.jsx';

function ClaimBox({ c, priceList, highlight, title, tone = '' }) {
  return <div className={`card ${tone}`}>
    <div className="row between"><h4>{title}</h4><SchemePill s={c.scheme} /></div>
    <div className="bold navy">{c.person_name} <span className="mute small">· {c.national_id || 'no NID'} · {c.chf_id}</span></div>
    <div className="kv" style={{ margin: '.4rem 0' }}>
      <b>Claim no.</b><span className="mono">{c.code}</span>
      <b>Facility</b><span>{c.hf_name} <span className="mute">({c.district})</span></span>
      <b>Doctor</b><span className="mono">{c.nmc_no || '—'}</span>
      <b>Diagnosis</b><span><span className="mono">{c.diagnosis}</span> {c.dx_label}</span>
      <b>Dates</b><span>{c.care_type === 'I' ? `Inpatient ${c.date_from} → ${c.date_to}` : `Outpatient ${c.date_from}`}</span>
      <b>Status</b><span><StatusPill status_name={c.status_name} review_name={c.review_name} paid={c.paid} /></span>
    </div>
    <Lines lines={c.lines} priceList={priceList} highlight={highlight} />
  </div>;
}

/** The Medical Officer's screen: this claim vs the matched claim(s), the rules, and the decision. */
export default function ReviewPanel({ detail, refData, onDecided }) {
  const [note, setNote] = useState('');
  const [reviewer, setReviewer] = useState('Medical Officer A');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!detail) return null;
  const shared = new Set((detail.matched || []).flatMap(m => m.lines.map(l => l.code)).filter(code => detail.lines.some(l => l.code === code)));
  const decide = async (decision) => {
    setBusy(true); setErr(null);
    try { const d = await api.review(detail.claim_id, decision, note, reviewer); onDecided(d); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const done = !!detail.review;
  return <div className="col gap-l">
    {!detail.flags.length && <div className="note">This claim carries no flag — a reviewer would only see it in a random sample.</div>}
    {detail.flags.length > 0 && <div className="card gold">
      <h4>Why it is in front of you</h4>
      {detail.flags.map((f, i) => <div key={i} className="row top" style={{ margin: '.4rem 0' }}><RuleTag rule={f.rule} weight={f.weight} /><div><b>{f.name}</b> <Pill tone={f.weight === 'high' ? 'red' : 'gold'}>{f.weight}</Pill><div className="small">{f.because}</div></div></div>)}
      <div className="small mute">suspicion score <b>{detail.suspicion}</b> · the system triaged and explained; the decision is yours.</div>
    </div>}
    <div className="compare">
      <ClaimBox c={detail} priceList={refData.priceList} highlight={shared} title="This claim" tone="blue" />
      {detail.matched.length ? detail.matched.map(m => <ClaimBox key={m.claim_id} c={m} priceList={refData.priceList} highlight={shared} title={`Matched claim · ${m.claim_id}`} />)
        : <div className="card soft"><h4>No matched claim</h4><p className="small mute">This rule is about the claim itself (protocol), not a pair. Compare the lines with the standard treatment protocol for {detail.diagnosis}: <span className="mono">{(refData.protocol[detail.diagnosis]?.allow || []).join(', ')}</span>.</p></div>}
    </div>
    {done ? <div className="card green fade">
      <h4>Decision recorded</h4>
      <p><b>{detail.review.reviewer}</b> chose <b>{detail.review.decision}</b>{detail.review.note ? ` — "${detail.review.note}"` : ''}. {detail.review.decision === 'confirm' ? 'The claim is rejected with reason 6 "Item/Service duplicated" and the facility is notified.' : 'The claim continues to valuation and payment.'} The decision feeds back to the rule base.</p>
      <Timeline events={detail.timeline.slice(-3)} />
    </div> : <div className="card">
      <h4>Your decision</h4>
      <div className="grid grid-2" style={{ marginTop: '.5rem' }}>
        <div className="field"><label>Reviewer</label><select value={reviewer} onChange={e => setReviewer(e.target.value)}>{['Medical Officer A', 'Medical Officer B', 'Senior reviewer'].map(r => <option key={r}>{r}</option>)}</select></div>
        <div className="field"><label>Note (optional)</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. same episode, lab entered separately" /></div>
      </div>
      <div className="row wrap" style={{ marginTop: '.8rem' }}>
        <button className="btn danger" disabled={busy || !detail.flags.length} onClick={() => decide('confirm')}>✕ Confirm — reject, reason 6</button>
        <button className="btn success" disabled={busy} onClick={() => decide('clear')}>✓ Clear — false positive, pay</button>
        <button className="btn" disabled={busy} onClick={() => decide('release')}>→ Release — pay, keep note</button>
        {busy && <Pill tone="gray">saving…</Pill>}{err && <span className="red small">{err}</span>}
      </div>
      <p className="tiny mute" style={{ marginTop: '.6rem' }}>Confirm = rejection reason 6 “Item/Service duplicated” (already in openIMIS's reviewer vocabulary). Clear = the rule was wrong here; its weight goes down. Release = pay but keep the note for audit.</p>
    </div>}
  </div>;
}
