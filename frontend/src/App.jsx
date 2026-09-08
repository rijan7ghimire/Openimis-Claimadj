import React from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { RefProvider, useReference } from './context.jsx';
import Journey from './pages/Journey.jsx';
import Queue from './pages/Queue.jsx';
import Review from './pages/Review.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Ontology from './pages/Ontology.jsx';
import Rules from './pages/Rules.jsx';

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() { return this.state.err ? <div className="page"><div className="note red"><b>Something broke while rendering:</b> {String(this.state.err.message || this.state.err)}</div></div> : this.props.children; }
}

function Shell() {
  const { ref, err } = useReference();
  return <>
    <header className="topbar"><div className="inner">
      <div className="brand"><span className="dot" />Claim Journey <span className="mute" style={{ fontWeight: 500, fontSize: '.85rem' }}>· openIMIS HIB / SSF · duplicate &amp; cross-scheme detection</span></div>
      <nav className="nav">
        <NavLink to="/" end>Journey</NavLink><NavLink to="/queue">Review queue</NavLink><NavLink to="/dashboard">Dashboard</NavLink><NavLink to="/rules">Rules</NavLink><NavLink to="/ontology">Ontology</NavLink>
      </nav>
    </div></header>
    {err ? <div className="page"><div className="note red">Backend not reachable ({err}). Start it with <code>npm run dev</code> in <code>mvp/</code>.</div></div>
      : !ref ? <div className="page"><p className="mute">Loading the claim book…</p></div>
      : <ErrorBoundary><Routes>
        <Route path="/" element={<Journey />} />
        <Route path="/queue" element={<Queue />} />
        <Route path="/review/:id" element={<Review />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/ontology" element={<Ontology />} />
        <Route path="/standards" element={<Ontology />} />
      </Routes></ErrorBoundary>}
  </>;
}

export default function App() { return <RefProvider><Shell /></RefProvider>; }
