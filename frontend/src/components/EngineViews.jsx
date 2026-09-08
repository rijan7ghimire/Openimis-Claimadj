import { useEffect, useState } from 'react';
import { Pill, RuleTag } from './ui.jsx';

function useReveal(n, ms = 380) {
  const [k, setK] = useState(0);
  useEffect(() => { setK(0); if (!n) return; let i = 0; const t = setInterval(() => { i++; setK(i); if (i >= n) clearInterval(t); }, ms); return () => clearInterval(t); }, [n, ms]);
  return k;
}
const ICO = { pass: '✓', fail: '✕', disabled: '—', off: '○', skipped: '·' };

/** ENGINE 1 — animated checklist of the real openIMIS edits. */
export function Engine1Checks({ engine1 }) {
  const k = useReveal(engine1?.checks?.length || 0);
  if (!engine1) return null;
  const done = k >= engine1.checks.length;
  return <div className="col">
    <div className="checks">{engine1.checks.slice(0, k).map((c, i) => (
      <div key={i} className={`check ${c.status}`}>
        <div className="ico">{ICO[c.status]}</div>
        <div><div className="name">{c.name} <span className="mono mute">reason {c.code}</span></div><div className="detail">{c.detail}</div></div>
        <div className="tiny mono mute">{c.where}</div>
      </div>))}</div>
    {done && <div className={`note ${engine1.accepted ? '' : 'red'} fade`}>
      <b>{engine1.accepted ? 'ACCEPTED → status Checked (4).' : `REJECTED (1) — reason ${engine1.code} ${engine1.reason}.`}</b> {engine1.because}
      {engine1.accepted && <div className="small mute" style={{ marginTop: '.3rem' }}>Every check looked at this one claim on its own. Nothing here compares it with any other claim — reason 6 is disabled.</div>}
    </div>}
  </div>;
}

/** ENGINE 2 — identity resolution, then the rule cards, then the routing decision. */
export function Engine2Flags({ detail, refData }) {
  const flags = detail?.flags || [];
  const k = useReveal(flags.length + 2, 520);   // identity card, match card, then each flag
  if (!detail) return null;
  const id = detail.identity;
  const done = k >= flags.length + 2;
  return <div className="col">
    {k >= 1 && <div className="card soft fade">
      <h4>1 · Identity resolution</h4>
      <div className="row wrap" style={{ marginTop: '.3rem' }}>
        {id.kind === 'NID' ? <Pill tone="teal">matched on National ID</Pill> : <Pill tone="gold">no National ID → composite key (name + DOB + sex)</Pill>}
        <span className="mono small mute">{id.key}</span>
      </div>
      <p className="small mute" style={{ margin: '.35rem 0 0' }}>The National ID is the only identifier that is the same in HIB and SSF. Without it we can only join on name, date of birth and sex — which fails when a name is spelt differently.</p>
    </div>}
    {k >= 2 && <div className="card soft fade">
      <h4>2 · Match against the claim history &amp; vault</h4>
      <p className="small" style={{ margin: '.3rem 0 0' }}>Found <b>{detail.history_size}</b> earlier claim{detail.history_size === 1 ? '' : 's'} for this identity — across every facility and <b>both schemes</b>. Rules R1–R5 compare the new claim with each of them; STG checks the lines against the treatment protocol.</p>
    </div>}
    {flags.slice(0, Math.max(0, k - 2)).map((f, i) => <div key={i} className={`flag ${f.weight}`}>
      <div className="row between"><div className="row"><RuleTag rule={f.rule} weight={f.weight} /><b>{f.name}</b></div><Pill tone={f.weight === 'high' ? 'red' : 'gold'}>{f.weight} · +{refData?.weights[f.weight]}</Pill></div>
      <div className="because"><b>Because:</b> {f.because}</div>
      <div className="src">source: {f.source}{f.matched && <> · matched claim <span className="mono">{f.matched}</span></>}</div>
    </div>)}
    {done && <div className={`note ${flags.length ? 'gold' : ''} fade`}>
      {flags.length
        ? <><b>Suspicion score {detail.suspicion} → routed to the review queue</b> (review status: Selected). The claim is <b>not</b> rejected — a person decides.</>
        : <><b>No rule fired → clean.</b> The claim goes to the payment queue with nothing added to a reviewer's day.</>}
    </div>}
  </div>;
}
