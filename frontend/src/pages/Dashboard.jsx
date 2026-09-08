import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList, CartesianGrid } from 'recharts';
import { api, pct } from '../api.js';
import { Stat, RuleTag } from '../components/ui.jsx';

const NAVY = '#1f3864', TEAL = '#0f9d8f', GOLD = '#e8a13a', MUTE = '#9ca3af', RED = '#d1495b';
const WHY_B = { within_dup: 're-billed days later, not the same day', same_episode: 'split across two days as well', cross_scheme: 'lags up to 10 days, 30 % name variants', resubmission: 'lags up to 14 days (R5 looks back 7)', phantom_readmission: 'same facility — R4 needs two facilities', upcode_within_protocol: 'the dearer item is still allowed — STG cannot see it', phantom_visit: 'nothing on the claim distinguishes it', stg_upcode: 'off-protocol item or over-long stay', impossible_overlap: 'training book only' };

export default function Dashboard() {
  const [m, setM] = useState(null);
  const [ev, setEv] = useState(null);
  useEffect(() => { api.metrics().then(setM); api.evaluation().then(setEv).catch(() => setEv({ books: [] })); const t = setInterval(() => api.metrics().then(setM), 5000); return () => clearInterval(t); }, []);
  if (!m) return <div className="page"><p className="mute">Loading…</p></div>;
  const d = m.dataset;
  const caught = [{ name: 'Existing openIMIS engine', v: d.existing_rejected_fraud, c: MUTE }, { name: 'Our added layer', v: d.tp, c: TEAL }];
  const rules = Object.entries(d.byRule).map(([r, x]) => ({ r, precision: x.fraud / x.fired, fired: x.fired, fraud: x.fraud }));
  const triage = [{ name: 'Random 5 % sample', v: d.random.frauds, c: GOLD }, { name: 'Ranked by suspicion', v: d.triage.frauds, c: TEAL }];
  const types = Object.entries(d.byType).sort((a, b) => b[1].planted - a[1].planted);
  const A = ev?.books?.[0], B = ev?.books?.[1];
  return <div className="page">
    <div className="actor">Evaluation · the whole claim book</div>
    <h1>Dashboard</h1>
    <p className="mute">The Nepal synthetic book loaded in this app ({d.claims.toLocaleString()} claims, {d.persons.toLocaleString()} people, {d.dual.toLocaleString()} enrolled in both schemes, {pct(d.with_nid / d.persons)} with a National ID). Ground truth is known, so the run scores itself — <b>on the book the rules were tuned on</b>. The honest number is further down.</p>
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
        <div className="tiny mute center">one random draw; over 30 draws the sample finds {A ? `${A.random.min}–${A.random.max} (mean ${A.random.mean.toFixed(0)})` : '…'} — see below</div></div>
      <div className="card"><h3>Precision by rule</h3>
        <ResponsiveContainer width="100%" height={220}><BarChart data={rules} margin={{ top: 20 }}><CartesianGrid vertical={false} stroke="#eef0f3" /><XAxis dataKey="r" tick={{ fontSize: 11 }} /><YAxis hide domain={[0, 1]} /><Tooltip formatter={(v, n, p) => [`${pct(v)} (${p.payload.fraud}/${p.payload.fired})`, 'precision']} /><Bar dataKey="precision" fill={NAVY} radius={[6, 6, 0, 0]}><LabelList dataKey="precision" position="top" formatter={(v) => pct(v)} style={{ fontSize: 11, fill: NAVY, fontWeight: 700 }} /></Bar></BarChart></ResponsiveContainer></div>
    </div>

    {/* ---------------- honest evaluation ---------------- */}
    <div className="card mt" style={{ borderColor: '#efd9ad', background: 'linear-gradient(180deg, #fbf0da, #fff 30%)' }}>
      <div className="actor" style={{ color: '#b8791f' }}>Honest evaluation · how much of the score is ours to claim</div>
      <h2 style={{ marginTop: '.2rem' }}>The rules were tested on a book we also wrote</h2>
      <p className="small">{ev?.coupling || 'Loading…'}</p>
      {A && B && <>
        <div className="grid grid-2 mt">
          {[A, B].map((b, i) => <div key={b.name} className={`card ${i ? 'gold' : 'soft'}`}>
            <h3>{i ? 'B · ' : 'A · '}{b.name}</h3><p className="tiny mute" style={{ marginTop: '-.2rem' }}>{b.note}</p>
            <div className="grid grid-4" style={{ gap: '.5rem' }}>
              <Stat v={b.claims.toLocaleString()} l="claims" /><Stat v={b.frauds} l={`fraud (${pct(b.fraud_rate, 1)})`} /><Stat v={pct(b.precision)} l="precision" tone={i ? 'gold' : 'teal'} /><Stat v={pct(b.recall)} l="recall" tone={i ? 'gold' : 'teal'} />
            </div>
            <p className="small" style={{ marginTop: '.6rem' }}>Ranked queue finds <b>{b.ranked_frauds}</b> frauds in {b.budget} claims; a random 5 % sample finds <b>{b.random.mean.toFixed(0)}</b> on average ({b.random.min}–{b.random.max} over {b.random.draws} draws). The existing engine rejected {b.existing.rejected} claims, {b.existing.rejected_fraud} of them fraud.</p>
          </div>)}
        </div>
        <div className="grid grid-2 mt">
          <div className="card"><h3>Recall by fraud type — A vs B</h3>
            <table><thead><tr><th>type</th><th className="right">A</th><th className="right">B</th><th>what B did differently</th></tr></thead><tbody>
              {[...new Set([...Object.keys(A.byType), ...Object.keys(B.byType)])].map(k => {
                const a = A.byType[k], b = B.byType[k];
                return <tr key={k}><td className="small">{k}</td><td className={`right bold ${a ? (a.caught / a.planted < .5 ? 'red' : 'green') : 'mute'}`}>{a ? `${pct(a.caught / a.planted)} (${a.caught}/${a.planted})` : '—'}</td><td className={`right bold ${b ? (b.caught / b.planted < .5 ? 'red' : 'green') : 'mute'}`}>{b ? `${pct(b.caught / b.planted)} (${b.caught}/${b.planted})` : '—'}</td><td className="tiny mute">{WHY_B[k.split(' ')[0]] || ''}</td></tr>;
              })}</tbody></table></div>
          <div className="card"><h3>Why B's false positives happen</h3>
            <table><thead><tr><th>the claim was actually…</th><th className="right">n</th><th>rule that fired</th></tr></thead><tbody>
              {B.fp_causes.slice(0, 8).map(c => <tr key={c.cause}><td className="small">{c.cause}</td><td className="right bold">{c.n}</td><td className="mono small">{c.rules}</td></tr>)}</tbody></table>
            <h3 className="mt">Why B's misses happen</h3>
            <table><tbody>{B.miss_causes.slice(0, 7).map(c => <tr key={c.cause}><td className="small">{c.cause}</td><td className="right bold">{c.n}</td></tr>)}</tbody></table>
          </div>
        </div>
        <div className="card teal mt">
          <b className="navy">What the drop teaches.</b> <span className="small">On the training book the layer looks near-perfect because the fraud was injected the way the rules look for it. On the independent book precision falls to about {pct(B.precision)} and recall to about {pct(B.recall)}: transfers between hospitals trip R4, homonyms without a National ID trip R3, honest corrections after a rejection trip R5, and four fraud behaviours are simply invisible to claim-pair rules. The ranked queue still beats the random sample by about {(B.ranked_frauds / Math.max(1, B.random.mean)).toFixed(0)}× on B, which is the claim we can defend. The fixes are specific: a transfer exception for R4 (discharge day = admission day), a homonym guard for R3 (require a shared facility or a second identifier), R5 limited to code swaps that keep the same items, a wider R1 window, and the provider profile for what claim pairs cannot see.</span>
        </div>
      </>}
      {ev && !B && <p className="small mute mt">No validation book yet — run <span className="mono">python synthetic_data/nepal_validation_book.py</span>, copy it to <span className="mono">backend/data/validation.json</span> and <span className="mono">node backend/evaluate.js</span>.</p>}
      <p className="tiny mute mt">External data we could not get: there is no public Nepal claims dataset. Two usable outside sets are the openIMIS demo database (real openIMIS shape, no fraud labels — a structural test) and the US CMS Medicare Part B + OIG LEIE exclusion list (provider-level fraud labels — a test for the provider rule, not for Nepal's benefit package). Real HIB claims need NHRC ethics approval, as planned in Week 2.</p>
    </div>

    <div className="grid grid-2 mt">
      <div className="card teal row between wrap"><div><b className="navy">Rules &amp; parameters</b><div className="small">Every rule and threshold, where each rule came from, and the red flags we know but have not encoded.</div></div><Link className="btn navy" to="/rules">Open →</Link></div>
      <div className="card teal row between wrap"><div><b className="navy">Providers</b><div className="small">Facilities by flag rate and doctors by busiest day — the view a provider rule (R6) would use.</div></div><Link className="btn navy" to="/providers">Open →</Link></div>
    </div>
    <div className="grid grid-2 mt">
      <div className="card"><h3>Recall by fraud type (this book)</h3>
        <table><thead><tr><th>type</th><th className="right">planted</th><th className="right">caught</th><th className="right">recall</th></tr></thead>
          <tbody>{types.map(([k, x]) => <tr key={k}><td>{k}</td><td className="right">{x.planted}</td><td className="right">{x.caught}</td><td className={`right bold ${x.caught / x.planted < .5 ? 'red' : 'green'}`}>{pct(x.caught / x.planted)}</td></tr>)}</tbody></table>
        <p className="tiny mute mt">The hard cross-scheme cases (no National ID + a differently spelt name) are the identity-resolution ceiling — 0 % by construction. That is the evidence for National-ID linkage.</p></div>
      <div className="card"><h3>Learning loop — this session</h3>
        <div className="grid grid-4" style={{ marginBottom: '.8rem' }}>
          <Stat v={m.session.submitted} l="submitted" /><Stat v={m.session.flagged} l="flagged" tone="teal" /><Stat v={m.session.reviewed} l="reviewed" /><Stat v={m.session.paid} l="paid" />
        </div>
        <table><thead><tr><th>rule</th><th></th><th className="right">weight now</th><th className="right">start</th><th className="right">confirmed</th><th className="right">cleared</th><th className="right">released</th></tr></thead>
          <tbody>{Object.entries(m.ruleStats).map(([r, s]) => { const w = m.ruleWeight?.[r], w0 = m.weights[m.rules[r].weight]; return <tr key={r}><td><RuleTag rule={r} weight={m.rules[r].weight} /></td><td className="small">{m.rules[r].name}</td><td className={`right bold ${w > w0 ? 'green' : w < w0 ? 'gold' : ''}`}>{w}</td><td className="right mute">{w0}</td><td className="right green bold">{s.confirmed || ''}</td><td className="right gold bold">{s.cleared || ''}</td><td className="right">{s.released || ''}</td></tr>; })}</tbody></table>
        <p className="tiny mute mt">Every reviewer decision moves the weight of the rules that fired: confirm +0.5, clear −0.5, release unchanged, bounded between 0.5 and 5. New claims are scored with the current weights; the book's evaluation above uses the starting weights.</p>
        {m.weightLog?.length > 0 && <div className="small mt"><b>Weight changes this session:</b> {m.weightLog.slice(-6).map((w, i) => <span key={i} className="mono" style={{ marginRight: '.6rem' }}>{w.rule} {w.from}→{w.to} ({w.decision})</span>)}</div>}
      </div>
    </div>
  </div>;
}
