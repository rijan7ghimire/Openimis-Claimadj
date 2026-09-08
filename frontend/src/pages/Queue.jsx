import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useReference } from '../context.jsx';
import QueueTable from '../components/QueueTable.jsx';

export default function Queue() {
  const { ref } = useReference();
  const nav = useNavigate();
  const [mode, setMode] = useState('triage');
  const [data, setData] = useState(null);
  useEffect(() => { setData(null); api.queue(mode, 80).then(setData); }, [mode]);
  return <div className="page">
    <div className="row between top mb">
      <div><div className="actor">Reviewer · worklist</div><h1>Review queue</h1><p className="mute">The claims waiting for a Medical Officer. Today HIB picks a random 5 % sample; our layer ranks by suspicion and says why. Click a row to review it.</p></div>
    </div>
    <QueueTable data={data} mode={mode} onMode={setMode} onOpen={(id) => nav('/review/' + id)} refData={ref} />
  </div>;
}
