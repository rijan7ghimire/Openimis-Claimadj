import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { pct } from '../api.js';

/* Algorithm — the ranking algorithm on one page: the flowchart, the eight steps, and the readings the program
   (Week 5/ranking_notebook, mirrored in notebook/) produced from the two synthetic books. Figures and numbers come
   from public/algorithm/ (figures + results.json), written by the notebook so app, deck and program stay in sync. */
const B = import.meta.env.BASE_URL + 'algorithm/';
const REPO = 'https://github.com/rijan7ghimire/Openimis-Claimadj/blob/main/notebook/';

const STEPS = [
  ['Engine 1 · openIMIS edits', 'The real validate_claim checks, per claim in isolation: dates (9), coverage (21), price list (2), care type (10), quantity (16). Reason 6 duplicate and reason 8 ICD are commented out in openIMIS. A rejection is stored and still counts as history.', false],
  ['Identity resolution', 'National ID if the person has one, otherwise name + date of birth + sex. The same key is used for HIB and SSF, which is what lets the layer see across schemes.', true],
  ['Claim history + provider context', 'Every earlier claim of that identity (both schemes, all facilities, rejected ones included), the facility\'s flag rate over its last 100 claims, and the treating doctor\'s recent claims by NMC number.', true],
  ['The rules', 'R1–R5 compare the claim with each earlier claim; R8 and STG look at the claim itself; R7 at the doctor; R6 at the facility. Each hit is a flag with a weight (high 3 · medium 2 · low 1) and a "because" sentence.', true],
  ['Scoring', 'An R4 overlap on the same matched claim as an R3 cross-scheme hit is the same event seen twice and gets 0 points. points = learned weight × confidence (R3 on a composite identity counts as medium). suspicion = Σ points.', true],
  ['Routing', 'Any flag → review status Selected. No flag → clean, valuated and paid. The layer never rejects a claim on its own.', true],
  ['Ranking', 'The queue is sorted by suspicion, ties in submission order. The reviewer budget is 5 % of the book — the size of today\'s random sample — and a random slice is kept as a control.', true],
  ['Learning', 'Confirm moves every rule that fired +0.5, clear −0.5, bounded 0.5 … 5; release leaves the weights alone. The next claim is scored with what the reviewers taught.', true],
];

const FIGS = [
  ['fig_precision_at_k.png', 'What a reviewer gets for the same budget', 'Walking down the ranked queue: frauds found after k claims (teal) against the expectation of a random sample (grey). The dashed line is the 5 % budget. On the training book the curve is almost a straight line — nearly every queued claim is a planted fraud; on the validation book it bends after about 250 claims, where the false positives start.'],
  ['fig_rules.png', 'Per rule, and how suspicion separates the two populations', 'Left: precision per rule on both books. Middle: how often each rule fires. Right: the suspicion score — legitimate claims sit at 0 (never enter the queue) or 2 (a lone R2 split-billing flag a reviewer clears); frauds score 2–7.'],
  ['fig_ablation.png', 'Which rules carry the result', 'Recall lost when one rule is switched off and the whole book is re-run. R1, R3 and STG matter most; R4 and R5 about ten points each; R6–R8 add little recall — R6 buys the validation book 3 points of recall at a cost of 12 points of precision.'],
  ['fig_recall_by_type.png', 'Recall by fraud type, both books', 'The training book only contains the fraud the rules were written for. The validation book adds phantom re-admissions (caught by the same-facility R4), ghost visits and within-protocol upcoding — the last two are the misses, and neither is a duplicate problem.'],
  ['fig_weights.png', 'The learning loop, simulated', 'A Medical Officer works through the top 150 of the ranked queue, deciding by ground truth. Rules that keep being confirmed rise to the 5.0 ceiling; R5 and R8, which produced the cleared claims, settle lower. This is the same ±0.5 mechanism the Dashboard shows for your own session.'],
  ['fig_dataset.png', 'The two synthetic books', 'Claims per month, the claimed-amount distribution, the planted fraud by type and identity coverage (43 % with a National ID, 8–9 % enrolled in both schemes). Both books are generated; no real claim or person appears anywhere.'],
];

export default function Algorithm() {
  const [r, setR] = useState(null);
  useEffect(() => { fetch(B + 'results.json').then(x => x.json()).then(setR).catch(() => setR(false)); }, []);
  const A = r?.books?.A, Bk = r?.books?.B;
  return <div className="page plain">
    <div className="center">
      <div className="eyebrow">The algorithm · <span className="std-tag partial">synthetic data — no real claims</span></div>
      <h1 style={{ fontSize: '1.7rem', marginTop: '.3rem' }}>How a claim gets its place in the queue</h1>
      <p className="lead">One claim in, a weighted and explained position in the review queue out. It is a weighted additive rule model — a scorecard — not a trained classifier: every point on a claim traces back to a rule, a matched claim and a sentence. The same code runs here in the browser and, as plain Python, in the notebook that produced the figures below.</p>
    </div>

    <div className="card mt" style={{ padding: '.6rem' }}><img src={B + 'algorithm_flowchart.png'} alt="The ranking algorithm as a flowchart" style={{ width: '100%', display: 'block', borderRadius: 8 }} /></div>

    <h2>1 · In eight steps <small>every claim is processed once, in submission order, then becomes history for the next</small></h2>
    <div className="grid grid-2">
      {STEPS.map(([t, d, ours], i) => <div key={t} className={`card ${ours ? 'teal' : ''}`} style={{ padding: '.8rem 1rem' }}>
        <div className="eyebrow">{i + 1} · {ours ? <span className="prop">this study adds</span> : 'exists today'}</div>
        <b className="navy">{t}</b>
        <p className="small" style={{ margin: '.3rem 0 0' }}>{d}</p>
      </div>)}
    </div>

    <h2>2 · Readings from the program <small>Week 5/ranking_notebook/claim_ranking.ipynb · identical numbers to this app's engine</small></h2>
    {r === false && <p className="mute">results.json not found — run the notebook and copy its figures folder to public/algorithm/.</p>}
    {A && <div className="grid grid-2">
      {[['A · training book (seed 42)', A, 'the book the rules were developed on'], ['B · validation book (seed 2026)', Bk, 'independent, behaviour-based, run unchanged']].map(([t, b, s]) => <div key={t} className="card soft">
        <div className="eyebrow">{t}</div><div className="small mute" style={{ marginBottom: '.5rem' }}>{s}</div>
        <div className="grid grid-4" style={{ gap: '.5rem' }}>
          {[[b.claims.toLocaleString(), 'claims'], [b.frauds, `planted fraud (${pct(b.fraud_rate, 1)})`], [pct(b.precision, 1), 'precision'], [pct(b.recall, 1), 'recall']].map(([v, l]) => <div key={l} className="card" style={{ padding: '.5rem .6rem', textAlign: 'center' }}><b className="navy" style={{ fontSize: '1.25rem' }}>{v}</b><div className="small mute">{l}</div></div>)}
        </div>
        <p className="small" style={{ margin: '.6rem 0 0' }}>Ranked queue: <b>{b.ranked_frauds}</b> frauds in the first {b.budget} claims (precision {pct(b.precision_at_budget, 0)}, {pct(b.precision_top50, 0)} in the top 50). A random 5 % sample: <b>{b.random_mean}</b> on average ({b.random_min}–{b.random_max} over 30 draws). The existing engine rejected {b.existing_rejected.toLocaleString()} claims, {b.existing_rejected_fraud} of them fraud.</p>
      </div>)}
    </div>}

    {FIGS.map(([f, t, c]) => <div key={f} className="card mt" style={{ padding: '.8rem 1rem' }}>
      <b className="navy">{t}</b>
      <img src={B + f} alt={t} style={{ width: '100%', display: 'block', margin: '.5rem 0', borderRadius: 6 }} />
      <p className="small mute" style={{ margin: 0 }}>{c}</p>
    </div>)}

    {r && <>
      <h2>3 · Parameter sensitivity <small>one parameter changed, the whole book re-run · precision % · recall % · frauds reached at the 5 % budget</small></h2>
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="params"><thead><tr><th>Parameter</th><th className="right">Value</th><th className="right">A precision</th><th className="right">A recall</th><th className="right">A @ budget</th><th className="right">B precision</th><th className="right">B recall</th><th className="right">B @ budget</th></tr></thead>
          <tbody>{r.sweeps.map((s, i) => { const isDefault = (s.parameter.startsWith('R3') && s.value === 2) || (s.parameter.startsWith('R1') && s.value === 14) || (s.parameter.startsWith('R5') && s.value === 14) || (s.parameter.startsWith('reviewer') && s.value === 0.05);
            return <tr key={i} className={isDefault ? 'bold' : ''}><td>{s.parameter}</td><td className="right v">{s.value}{isDefault ? ' ★' : ''}</td><td className="right">{s['A precision %']}</td><td className="right">{s['A recall %']}</td><td className="right">{s['A frauds @ budget']}</td><td className="right">{s['B precision %']}</td><td className="right">{s['B recall %']}</td><td className="right">{s['B frauds @ budget']}</td></tr>; })}</tbody></table>
      </div>
      <p className="std-note mt">★ = the value in use. The R3 window trades precision for recall on the validation book (each extra day catches more late cross-scheme claims and more homonyms); the R1 identical-bill window stops paying beyond 7–14 days; a 2 % budget already reaches 184 frauds on the training book because the queue is that clean at the top.</p>

      <h2>4 · Ablation <small>one rule switched off, the whole book re-run</small></h2>
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="params"><thead><tr><th>Rules</th><th className="right">A precision</th><th className="right">A recall</th><th className="right">A @ budget</th><th className="right">B precision</th><th className="right">B recall</th><th className="right">B @ budget</th><th className="right">A Δ recall</th><th className="right">B Δ recall</th></tr></thead>
          <tbody>{r.ablation.map(a => <tr key={a.rules} className={a.rules.startsWith('all') ? 'bold' : ''}><td>{a.rules}</td><td className="right">{a['A precision %']}</td><td className="right">{a['A recall %']}</td><td className="right">{a['A frauds @ budget']}</td><td className="right">{a['B precision %']}</td><td className="right">{a['B recall %']}</td><td className="right">{a['B frauds @ budget']}</td><td className={`right ${a['A Δrecall'] < -5 ? 'red' : ''}`}>{a['A Δrecall']}</td><td className={`right ${a['B Δrecall'] < -5 ? 'red' : ''}`}>{a['B Δrecall']}</td></tr>)}</tbody></table>
      </div>
      <p className="std-note mt">Redundancy read from the table: R7 changes nothing on either book (the synthetic NMC collisions it finds are all legitimate), R8 adds one fraud, and R6 is the only rule whose removal <i>raises</i> precision — it is a nudge, not evidence. The <Link to="/rules">Rules page</Link> carries the reasoning for keeping each of them.</p>

      <h2>5 · Parameters in use <small>Params() in claim_ranking.py = rules.js constants</small></h2>
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="params"><tbody>
          {Object.entries(r.params).filter(([k]) => k !== 'enabled').map(([k, v]) => <tr key={k}><td>{k}</td><td className="v">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td></tr>)}
        </tbody></table>
      </div>
    </>}

    <div className="card teal mt">
      <b className="navy">Reproduce it.</b> <span className="small">The notebook <a href={REPO + 'claim_ranking.ipynb'} target="_blank" rel="noreferrer">claim_ranking.ipynb</a> (with <a href={REPO + 'claim_ranking.py'} target="_blank" rel="noreferrer">claim_ranking.py</a>, the Python port of this app's engine) loads the two synthetic books from <span className="mono">backend/data</span>, runs the engine, and writes every figure and number on this page to <span className="mono">figures/</span>. Change a threshold in <span className="mono">Params()</span> or add a rule in <span className="mono">match_rules</span>, re-run, copy the folder to <span className="mono">frontend/public/algorithm/</span> and this page, the <Link to="/dashboard">Dashboard</Link> and the Week 5 slides tell the same story.{r?.generated_at ? ` Last run: ${r.generated_at}.` : ''}</span>
    </div>
  </div>;
}
