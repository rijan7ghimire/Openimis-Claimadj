import { npr } from '../api.js';

export const Pill = ({ tone = 'gray', children, title }) => <span className={`pill ${tone}`} title={title}>{children}</span>;
export const SchemePill = ({ s }) => <span className={`pill scheme-${s}`}>{s}</span>;
export const RuleTag = ({ rule, weight = 'medium' }) => <span className={`rule ${weight}`}>{rule}</span>;
export const Spinner = () => <span className="spin" />;

const STATUS_TONE = { Rejected: 'red', Entered: 'gray', Checked: 'blue', Processed: 'teal', Valuated: 'green' };
export function StatusPill({ status_name, review_name, paid }) {
  if (paid) return <Pill tone="green">Paid</Pill>;
  return <span className="row" style={{ gap: '.3rem' }}>
    <Pill tone={STATUS_TONE[status_name] || 'gray'}>{status_name}</Pill>
    {review_name && review_name !== 'Idle' && <Pill tone={review_name === 'Selected' ? 'gold' : 'outline'}>review: {review_name.toLowerCase()}</Pill>}
  </span>;
}

export const Stat = ({ v, l, tone = '', sub }) => (
  <div className={`stat ${tone}`}><div className="v">{v}</div><div className="l">{l}</div>{sub && <div className="tiny mute" style={{ marginTop: '.2rem' }}>{sub}</div>}</div>
);

export function Timeline({ events = [] }) {
  return <div className="tl">{events.map((e, i) => (
    <div key={i} className={`ev ${e.status === 'Rejected' ? 'bad' : ''} ${e.status === 'Paid' ? 'paid' : ''}`}>
      <div className="hop">{e.hop} {e.status && <Pill tone={e.status === 'Rejected' ? 'red' : e.status === 'Paid' ? 'green' : e.status === 'Selected for review' ? 'gold' : 'outline'}>{e.status}</Pill>}</div>
      <div className="d">{e.detail}</div>
    </div>))}</div>;
}

export function Lines({ lines = [], priceList = {}, highlight = new Set() }) {
  const total = lines.reduce((s, l) => s + (priceList[l.code] || 0) * l.qty, 0);
  return <div className="lines">
    {lines.map((l, i) => <div key={i} className={`line ${highlight.has(l.code) ? 'hl' : ''}`}>
      <span className="mono">{l.code}{!(l.code in priceList) && <span className="red"> · not priced</span>}</span>
      <span className="mute">× {l.qty}</span><span className="right">{npr((priceList[l.code] || 0) * l.qty)}</span></div>)}
    <div className="line" style={{ background: 'var(--bg-2)', fontWeight: 700 }}><span>Total claimed</span><span /><span className="right">{npr(total)}</span></div>
  </div>;
}

export const Identity = ({ p }) => (
  <div className="row wrap" style={{ gap: '.4rem' }}>
    {p.national_id ? <Pill tone="teal">National ID · {p.national_id}</Pill> : <Pill tone="gold">no National ID</Pill>}
    {p.hib_id && <Pill tone="navy">HIB · {p.hib_id}</Pill>}
    {p.ssf_id && <Pill tone="teal">SSF · {p.ssf_id}</Pill>}
    {p.hib_id && p.ssf_id && <Pill tone="red">dual-enrolled</Pill>}
    {p.hib_id && p.hib_policy_active === false && <Pill tone="red">HIB policy lapsed</Pill>}
  </div>
);
