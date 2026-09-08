/* Swimlane journey map: one row per owner (organisation / person), one column per hop,
   an orthogonal path that travels from the patient's hand to the payment. Pure SVG. */
const GUT = 150, COL = 68, ROW = 28, LANE_H = 20, TOP = LANE_H + 8, LBL_LINE = 10.5;

export function rowsFor(scheme) {
  return [
    { id: 'patient', org: 'Patient', who: 'member and family' },
    { id: 'facility', org: 'Health facility', who: 'front desk · doctor · claims' },
    { id: 'openimis', org: 'openIMIS', who: `${scheme} instance · validate_claim` },
    { id: 'ours', org: 'Knowledge-based layer', who: 'proposed · identity + rules', proposed: true },
    { id: 'desk', org: `${scheme} claims desk`, who: 'claim officers' },
    { id: 'mo', org: `${scheme} Medical Officers`, who: 'reviewers · random sample today' },
    { id: 'finance', org: `${scheme} accounts & ED`, who: 'accounts · Executive Director' },
  ];
}

export default function JourneyMap({ steps, phases, step, scheme = 'HIB', skipped = () => false, onJump }) {
  const rows = rowsFor(scheme);
  const rowY = (id) => TOP + rows.findIndex(r => r.id === id) * ROW + ROW / 2;
  const cx = (i) => GUT + i * COL + COL / 2;
  const W = GUT + steps.length * COL, rowsBottom = TOP + rows.length * ROW;
  const maxLines = Math.max(...steps.map(s => s.short.length));
  const H = rowsBottom + 13 + maxLines * LBL_LINE + 2;
  const state = (i) => skipped(i) ? 'skip' : i < step ? 'done' : i === step ? 'cur' : 'todo';
  const curPhase = steps[step].phase;

  const seg = (i, j, cls) => {
    const a = { x: cx(i), y: rowY(steps[i].owner) }, b = { x: cx(j), y: rowY(steps[j].owner) };
    const xm = (a.x + b.x) / 2;
    return <path key={`${i}-${j}-${cls}`} d={a.y === b.y ? `M${a.x} ${a.y} H${b.x}` : `M${a.x} ${a.y} H${xm} V${b.y} H${b.x}`} className={`jm-seg ${cls}`} />;
  };
  // the path this claim actually takes (non-skipped hops), plus a faint dashed chain through the hops it skips
  const visited = steps.map((_, i) => i).filter(i => !skipped(i));
  const segs = [
    ...steps.slice(0, -1).map((_, i) => (skipped(i) || skipped(i + 1)) ? seg(i, i + 1, 'skip') : null).filter(Boolean),
    ...visited.slice(0, -1).map((i, k) => seg(i, visited[k + 1], visited[k + 1] <= step ? 'done' : 'todo')),
  ];

  return <svg className="jmap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Claim journey map">
    {/* lanes (HIB's three phases) */}
    {phases.map(p => {
      const first = steps.findIndex(s => s.phase === p.id), last = steps.map(s => s.phase).lastIndexOf(p.id);
      const x = GUT + first * COL + 3, w = (last - first + 1) * COL - 6;
      return <g key={p.id} className={`jm-lane ${p.id === curPhase ? 'cur' : ''}`}>
        <rect x={x} y={0} width={w} height={LANE_H} rx={6} />
        <text x={x + w / 2} y={LANE_H / 2 + 3.5} textAnchor="middle">{p.label.replace('HIB', scheme)}</text>
      </g>;
    })}
    {/* owner rows */}
    {rows.map((r, k) => <g key={r.id} className={`jm-row ${r.proposed ? 'prop' : ''} ${steps[step].owner === r.id ? 'cur' : ''}`}>
      <rect x={0} y={TOP + k * ROW} width={W} height={ROW} rx={r.proposed ? 6 : 0} />
      <text className="org" x={8} y={TOP + k * ROW + 12}>{r.org}</text>
      <text className="who" x={8} y={TOP + k * ROW + 22}>{r.who}</text>
    </g>)}
    {/* where our study adds value: the proposed columns */}
    {steps.map((s, i) => s.proposed && <rect key={'v' + s.key} x={cx(i) - COL / 2 + 2} y={TOP - 3} width={COL - 4} height={H - TOP + 1} rx={7} className="jm-val" />)}
    {/* faint column guides */}
    {steps.map((s, i) => <line key={s.key} x1={cx(i)} x2={cx(i)} y1={TOP} y2={rowsBottom} className="jm-guide" />)}
    {segs}
    {/* nodes */}
    {steps.map((s, i) => {
      const st = state(i), x = cx(i), y = rowY(s.owner);
      return <g key={s.key} className={`jm-node ${st} ${s.proposed ? 'prop' : ''}`} onClick={() => onJump && st !== 'cur' && onJump(i)} style={{ cursor: st === 'cur' ? 'default' : 'pointer' }}>
        <title>{`${i + 1}. ${s.title} — ${s.actor}${s.proposed ? ' (proposed)' : ''}`}</title>
        {st === 'cur' && <circle cx={x} cy={y} r={10} className="jm-pulse" />}
        <circle cx={x} cy={y} r={9} className="jm-dot" />
        <text x={x} y={y + 3} textAnchor="middle" className="jm-n">{i + 1}</text>
        {s.short.map((line, k) => <text key={k} x={x} y={rowsBottom + 13 + k * LBL_LINE} textAnchor="middle" className="jm-lbl">{k === 0 && s.proposed ? '★ ' : ''}{line}</text>)}
      </g>;
    })}
  </svg>;
}
