import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useReference } from '../context.jsx';
import ReviewPanel from '../components/ReviewPanel.jsx';
import { Timeline } from '../components/ui.jsx';

export default function Review() {
  const { id } = useParams();
  const { ref } = useReference();
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { setDetail(null); api.claim(id).then(setDetail).catch(e => setErr(e.message)); }, [id]);
  if (err) return <div className="page"><p className="red">{err}</p></div>;
  if (!detail || !ref) return <div className="page"><p className="mute">Loading…</p></div>;
  return <div className="page">
    <div className="row between top mb">
      <div><div className="actor">Medical Officer · review screen</div><h1>Review · <span className="mono">{detail.code}</span></h1><p className="mute">{detail.person_name} · {detail.hf_name} · {detail.date_from}</p></div>
      <Link className="btn" to="/queue">← back to queue</Link>
    </div>
    <div className="grid" style={{ gridTemplateColumns: '1fr 320px' }}>
      <ReviewPanel detail={detail} refData={ref} onDecided={setDetail} />
      <div className="card"><h4>What has happened to this claim</h4><div className="mt"><Timeline events={detail.timeline} /></div></div>
    </div>
  </div>;
}
