import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, CartesianGrid } from 'recharts';
import { api, pct } from '../api.js';
import { Stat, RuleTag } from '../components/ui.jsx';

const NAVY = '#1f3864', TEAL = '#0f9d8f', GOLD = '#e8a13a', MUTE = '#9ca3af', RED = '#d1495b';

export default function Dashboard() {
  const [m, setM] = useState(null);
  useEffect(() => { api.metrics().then(setM); const t = setInterval(() => api.metrics().then(setM), 5000); return () => clearInterval(t); }, []);
  if (!m) return <div className="page"><p className="mute">Loading…</p></div>;
  const d = m.dataset;
  const caught = [{ name: 'Existing openIMIS engine', v: d.existing_rejected_fraud, c: MUTE }, { name: 'Our added layer', v: d.tp, c: TEAL }];
  const rules = Object.entries(d.byRule).map(([r, x]) => ({ r, precision: x.fraud / x.fired, fired: x.fired, fraud: x.fraud }));
  const triage = [{ name: 'Random 5 % sample', v: d.random.frauds, c: GOLD }, { name: 'Ranked by suspicion', v: d.triage.frauds, c: TEAL }];
  const types = Object.entries(d.byType).sort((a, b) => b[1].planted - a[1].planted);
  return <div className="page">
    <div className="actor">Evaluation · the whole claim book</div>
    <h1>Dashboard</h1>
    <p className="mute">The Nepal synthetic book loaded in this app ({d.claims.toLocaleString()} claims, {d.persons.toLocaleString()} people, {d.dual.toLocaleString()} enrolled in both schemes, {pct(d.with_nid / d.persons)} with a National ID). Ground truth is known, so the run scores itself.</p>
    <div className="grid grid-4 mt">
      <Stat v={d.frauds.toLocaleString()} l="fraudulent claims planted" sub={`${pct(d.fraud_rate, 1)} of the book (HIB estimate ≈ 5.5 %)`} />
      <Stat v={d.existing_rejected_fraud} l="caught by the existing engine" tone="red" sub={`it rejected ${d.existing_rejected.toLocaleString()} claims — all legitimate rule violations`} />
      <Stat v={pct(d.precision, 1)} l="precision of our layer" tone="teal" sub={`${d.flagged} flagged · ${d.fp} false positives`} />
      <Stat v={pct(d.recall, 1)} l="recall of our layer" tone="teal" sub={`${d.tp} of ${d.frauds} caught · ${d.fn} missed`} />
    </div>
    <div className="grid grid-3 mt">
      <div className="card"><h3>Frauds detected (of {d.frauds})</h3>
        <ResponsiveContainer width="100%" height={220}><BarChart data={caught} margin={{ top: 20 }}><CartesianGrid vertical={false} stroke="#eef0f3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis hide /><Tooltip /><Bar dataKey="v" radius={[6, 6, 0, 0]}>{caught.map((e, i) => <Cell key={i} fill={e.c} />)}<LabelList dataKey="v" position="top" style={{ fontWeight: 800, fill: NAVY }} /></Bar></BarChart></ResponsiveContainer></div>
      <div className="card"><h3>Same reviewer budget ({d.budget} claims)</h3>
        <ResponsiveContainer width="100%" height={220}><BarChart data={triage} margin={{ top: 20 }}><CartesianGrid vertical={false} stroke="#eef0f3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis hide /><Tooltip /><Bar dataKey="v" radius={[6, 6, 0, 0]}>{triage.map((e, i) => <Cell key={i} fill={e.c} />)}<LabelList dataKey="v" position="top" style={{ fontWeight: 800, fill: NAVY }} /></Bar></BarChart></ResponsiveContainer>
        <div className="tiny mute center">frauds found — {(d.triage.frauds / Math.max(1, d.random.frauds)).toFixed(0)}× more for the same effort</div></div>
      <div className="card"><h3>Precision by rule</h3>
        <ResponsiveContainer width="100%" height={220}><BarChart data={rules} margin={{ top: 20 }}><CartesianGrid vertical={false} stroke="#eef0f3" /><XAxis dataKey="r" tick={{ fontSize: 11 }} /><YAxis hide domain={[0, 1]} /><Tooltip formatter={(v, n, p) => [`${pct(v)} (${p.payload.fraud}/${p.payload.fired})`, 'precision']} /><Bar dataKey="precision" fill={NAVY} radius={[6, 6, 0, 0]}><LabelList dataKey="precision" position="top" formatter={(v) => pct(v)} style={{ fontSize: 11, fill: NAVY, fontWeight: 700 }} /></Bar></BarChart></ResponsiveContainer></div>
    </div>
    <div className="grid grid-2 mt">
      <div className="card teal row between wrap"><div><b className="navy">Rules &amp; parameters</b><div className="small">Every rule and threshold our layer uses, and the openIMIS edits that already exist.</div></div><Link className="btn navy" to="/rules">Open →</Link></div>
      <div className="card teal row between wrap"><div><b className="navy">Ontology</b><div className="small">The shared vocabulary of a claim, and which coding standards Nepal actually uses.</div></div><Link className="btn navy" to="/ontology">Open →</Link></div>
    </div>
    <div className="grid grid-2 mt">
      <div className="card"><h3>Recall by fraud type</h3>
        <table><thead><tr><th>type</th><th className="right">planted</th><th className="right">caught</th><th className="right">recall</th></tr></thead>
          <tbody>{types.map(([k, x]) => <tr key={k}><td>{k}</td><td className="right">{x.planted}</td><td className="right">{x.caught}</td><td className={`right bold ${x.caught / x.planted < .5 ? 'red' : 'green'}`}>{pct(x.caught / x.planted)}</td></tr>)}</tbody></table>
        <p className="tiny mute mt">The hard cross-scheme cases (no National ID + a differently spelt name) are the identity-resolution ceiling — 0 % by construction. That is the evidence for National-ID linkage.</p></div>
      <div className="card"><h3>Learning loop — this session</h3>
        <div className="grid grid-4" style={{ marginBottom: '.8rem' }}>
          <Stat v={m.session.submitted} l="submitted" /><Stat v={m.session.flagged} l="flagged" tone="teal" /><Stat v={m.session.reviewed} l="reviewed" /><Stat v={m.session.paid} l="paid" />
        </div>
        <table><thead><tr><th>rule</th><th></th><th className="right">fired (book)</th><th className="right">confirmed</th><th className="right">cleared</th><th className="right">released</th></tr></thead>
          <tbody>{Object.entries(m.ruleStats).map(([r, s]) => <tr key={r}><td><RuleTag rule={r} weight={m.rules[r].weight} /></td><td className="small">{m.rules[r].name}</td><td className="right">{s.fired}</td><td className="right green bold">{s.confirmed || ''}</td><td className="right gold bold">{s.cleared || ''}</td><td className="right">{s.released || ''}</td></tr>)}</tbody></table>
        <p className="tiny mute mt">Every reviewer decision is recorded against the rules that fired. Confirmed → weight up; cleared → weight down. (Re-weighting itself is the next build step.)</p></div>
    </div>
  </div>;
}
