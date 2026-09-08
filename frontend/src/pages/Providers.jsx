import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, npr, pct } from '../api.js';

/* Providers — where the flags concentrate. Fraud is a property of facilities and doctors more than of claims;
   every claim already carries a facility id and the treating doctor's NMC number, so this view costs nothing new. */
export default function Providers() {
  const [p, setP] = useState(null);
  useEffect(() => { api.providers().then(setP); }, []);
  if (!p) return <div className="page"><p className="mute">Loading…</p></div>;
  return <div className="page plain">
    <div className="center">
      <div className="eyebrow">Provider view · rule R6 · synthetic claim book</div>
      <h1 style={{ fontSize: '1.7rem', marginTop: '.3rem' }}>Facilities and doctors</h1>
      <p className="lead">Claims are flagged one at a time, but fraud clusters. Ranking facilities by their flag rate and doctors by their busiest day turns the same flags into a provider profile — the view HIB's Medical Officers and India's PM-JAY anti-fraud unit actually work from.</p>
    </div>

    <h2>1 · Facilities by flag rate <small>{p.baseline.facilities} facilities in the book · median flag rate {pct(p.baseline.flag_rate_median, 1)} · facilities with fewer than 8 claims hidden</small></h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="params"><thead><tr><th>Facility</th><th>District</th><th className="right">Claims</th><th className="right">Flagged</th><th className="right">Flag rate</th><th>Rules</th><th className="right">Claimed</th></tr></thead>
        <tbody>{p.facilities.map(f => <tr key={f.hf_id}><td>{f.name}</td><td className="small">{f.district}</td><td className="right">{f.claims}</td><td className="right">{f.flagged}</td>
          <td className={`right bold ${f.flag_rate > 3 * p.baseline.flag_rate_median ? 'red' : ''}`}>{pct(f.flag_rate, 1)}</td><td className="mono small">{f.rules}</td><td className="right small">{npr(f.amount)}</td></tr>)}</tbody></table>
    </div>
    <p className="std-note mt">Red = more than three times the median flag rate. In the training book fraud was injected uniformly, so this list is flat; in the validation book it is concentrated in a few facilities, which is what a provider rule would exploit.</p>

    <h2>2 · Doctors by busiest day <small>NMC registration numbers on the claims · {p.baseline.doctors} doctors</small></h2>
    <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="params"><thead><tr><th>NMC no.</th><th className="right">Claims</th><th className="right">Flagged</th><th className="right">Facilities</th><th className="right">Most claims in one day</th><th>On</th><th className="right">Claimed</th></tr></thead>
        <tbody>{p.doctors.map(d => <tr key={d.nmc}><td className="mono">{d.nmc}</td><td className="right">{d.claims}</td><td className="right">{d.flagged}</td><td className="right">{d.facilities}</td>
          <td className={`right bold ${d.max_per_day >= 6 ? 'red' : ''}`}>{d.max_per_day}</td><td className="small mono">{d.busiest_day}</td><td className="right small">{npr(d.amount)}</td></tr>)}</tbody></table>
    </div>
    <p className="std-note mt">A doctor billing at several facilities on the same day, or an implausible number of inpatients at once, is the red flag <span className="mono">rfSameProviderManyFacilities</span> in the ontology — known, not yet a rule.</p>

    <h2>3 · Repeat resubmission gaming <small>facilities with two or more R5 flags</small></h2>
    {p.repeatR5.length ? <div className="card" style={{ padding: 0, overflow: 'auto' }}>
      <table className="params"><thead><tr><th>Facility</th><th>District</th><th className="right">R5 flags</th><th className="right">Claims</th></tr></thead>
        <tbody>{p.repeatR5.map(f => <tr key={f.name}><td>{f.name}</td><td className="small">{f.district}</td><td className="right bold">{f.r5}</td><td className="right">{f.claims}</td></tr>)}</tbody></table>
    </div> : <p className="mute">None in this book.</p>}

    <div className="card teal mt">
      <b className="navy">What R6 would say.</b> <span className="small">IF a facility's flag rate is more than three times the median over the last 90 days, OR one NMC number bills at more than one facility on the same day, THEN raise the weight of every flag from that provider by 1 and put the facility on the audit list — BECAUSE fraud is a repeated behaviour of a few providers, and a provider profile catches what a single claim cannot (ghost visits, phantom re-admissions, within-protocol upcoding). Now implemented as R6 (low weight, judged on the facility's last 100 claims); the doctor signal is R7. See the <Link to="/rules">Rules page</Link>.</span>
    </div>
  </div>;
}
