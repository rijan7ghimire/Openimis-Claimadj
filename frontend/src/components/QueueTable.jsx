import { useState } from 'react';
import { npr } from '../api.js';
import { Pill, SchemePill, RuleTag } from './ui.jsx';

const FRAUD = new Set(['within_dup', 'same_episode', 'cross_scheme', 'impossible_overlap', 'resubmission', 'stg_upcode']);

export default function QueueTable({ data, mode, onMode, highlightId, onOpen, refData }) {
  const [truth, setTruth] = useState(false);
  if (!data) return <p className="mute">Loading queue…</p>;
  const cmp = data.comparison;
  return <div className="col">
    <div className="row between wrap">
      <div className="seg"><button className={mode === 'triage' ? 'on' : ''} onClick={() => onMode('triage')}>Ranked by suspicion (ours)</button><button className={mode === 'random' ? 'on' : ''} onClick={() => onMode('random')}>5 % random sample (today)</button></div>
      <label className="row small mute" style={{ gap: '.4rem' }}><input type="checkbox" style={{ width: 'auto' }} checked={truth} onChange={e => setTruth(e.target.checked)} /> show ground truth (synthetic labels)</label>
    </div>
    <div className="grid grid-2">
      <div className={`card ${mode === 'triage' ? 'teal' : 'soft'}`}><h4>Our ranked queue</h4><div className="row"><span className="score">{cmp.triage.frauds}</span><span className="small">frauds in the top <b>{cmp.triage.reviewed}</b> claims ({data.total_flagged} flagged in total) — every one with a rule and a reason</span></div></div>
      <div className={`card ${mode === 'random' ? 'gold' : 'soft'}`}><h4>Random 5 % sample</h4><div className="row"><span className="score">{cmp.random.frauds}</span><span className="small">frauds among <b>{cmp.random.reviewed}</b> randomly drawn claims — the same reviewer effort, no explanation</span></div></div>
    </div>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table><thead><tr><th>#</th><th>Claim</th><th>Patient</th><th>Scheme</th><th>Facility</th><th>Diagnosis</th><th>Dates</th><th className="right">Claimed</th><th>Rules</th><th className="right">Suspicion</th>{truth && <th>Ground truth</th>}</tr></thead>
        <tbody>{data.items.map((c, i) => <tr key={c.claim_id} className={`click ${c.claim_id === highlightId ? 'sel' : ''}`} onClick={() => onOpen(c.claim_id)}>
          <td className="mute">{i + 1}</td>
          <td><span className="mono">{c.code}</span>{c.session && <Pill tone="blue" title="submitted in this session">yours</Pill>}</td>
          <td><b>{c.person_name}</b><div className="tiny mute">{c.identity === 'NID' ? 'NID' : 'no NID'} · {c.chf_id}</div></td>
          <td><SchemePill s={c.scheme} /></td>
          <td>{c.hf_name}<div className="tiny mute">{c.district}</div></td>
          <td><span className="mono">{c.diagnosis}</span><div className="tiny mute">{c.dx_label}</div></td>
          <td className="small">{c.care_type === 'I' ? 'IPD ' : 'OPD '}{c.date_from}{c.care_type === 'I' ? ' → ' + c.date_to : ''}</td>
          <td className="right">{npr(c.amount)}</td>
          <td>{c.rules.length ? c.rules.map(r => <RuleTag key={r} rule={r} weight={refData?.rules[r]?.weight} />) : <span className="mute">—</span>}</td>
          <td className="right bold">{c.suspicion || '—'}</td>
          {truth && <td>{c.truth === 'unknown' ? <span className="mute">n/a</span> : FRAUD.has(c.truth) ? <Pill tone="red">{c.truth}</Pill> : <Pill tone="green">legitimate</Pill>}</td>}
        </tr>)}</tbody></table>
    </div>
  </div>;
}
