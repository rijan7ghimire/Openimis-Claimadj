import { npr } from '../api.js';
import { SchemePill, Pill, Identity } from './ui.jsx';

/** The claim card follows the claim through the journey (right rail). */
export default function ClaimCard({ person, draft, result, reviewed, refData }) {
  const c = reviewed || result;
  const fac = draft?.facility_id ? refData?.facilities.find(f => f.hf_id === draft.facility_id) : null;
  const dx = draft?.diagnosis ? refData?.protocol[draft.diagnosis] : null;
  const amount = (draft?.lines || []).reduce((s, l) => s + (refData?.priceList[l.code] || 0) * (Number(l.qty) || 1), 0);
  const rejected = c && c.status === 1;
  const flagged = c && (c.rules || []).length > 0;
  const reviewedDone = c && c.review;
  const paid = c && c.paid;
  const track = rejected
    ? [['Entered', true], ['Checked', !!c.engine1?.accepted], ...(flagged ? [['Flagged → review queue', true]] : []), ['Rejected — reason ' + c.rejection_reason, 'bad']]
    : [['Entered', !!c], ['Checked', !!c], [flagged ? 'Flagged → review queue' : c ? 'Clean → payment' : 'Screened', !!c],
      [reviewedDone ? (c.review.decision === 'confirm' ? 'Rejected by reviewer (reason 6)' : 'Reviewed — ' + c.review.decision) : 'Reviewed', !!reviewedDone && (c.review.decision === 'confirm' ? 'bad' : true)],
      ['Valuated', !!paid], ['Paid to facility', !!paid]];
  return <div className="card claimcard">
    <div className="row between"><h4>The claim</h4>{draft?.scheme && <SchemePill s={draft.scheme} />}</div>
    {!person ? <p className="mute small">No patient yet — pick a scenario or build a claim.</p> : <>
      <div className="bold navy" style={{ fontSize: '1.05rem' }}>{c?.person_name || person.name}</div>
      <div className="small mute">{person.sex === 'F' ? 'Female' : 'Male'} · born {person.dob} · {person.district}</div>
      <div style={{ margin: '.45rem 0' }}><Identity p={person} /></div>
      {fac && <div className="kv" style={{ marginTop: '.4rem' }}>
        <b>Facility</b><span>{fac.name} <span className="mute">({fac.district})</span></span>
        {draft.nmc_no && <><b>Doctor</b><span className="mono">{draft.nmc_no}</span></>}
        {dx && <><b>Diagnosis</b><span><span className="mono">{draft.diagnosis}</span> {dx.label}</span></>}
        <b>Care</b><span>{draft.care_type === 'I' ? `Inpatient ${draft.date_from} → ${draft.date_to}` : `Outpatient ${draft.date_from}`}</span>
        <b>Lines</b><span>{(draft.lines || []).length} · {npr(amount)}</span>
        {c?.code && <><b>Claim no.</b><span className="mono">{c.code}</span></>}
        {c?.suspicion > 0 && <><b>Suspicion</b><span className="bold red">{c.suspicion} · {c.rules.join(', ')}</span></>}
      </div>}
      <div className="status-track">
        {track.map(([label, on], i) => <div key={i} className={`st ${on === 'bad' ? 'bad' : on ? 'on' : ''}`}><i />{label}</div>)}
      </div>
    </>}
  </div>;
}
