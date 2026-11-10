import { useMemo, useState } from 'react';
import { addRiskScores, riskSummary } from './bookingMetrics.js';
import { DoughnutChart, PALETTE } from './charts.jsx';

const int = (v) => Math.round(v).toLocaleString('en-US');
const pct = (v, d = 1) => ((v * 100).toFixed(d)) + '%';
const money = (v) => '$' + Math.round(v).toLocaleString('en-US');

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={'kpi' + (tone ? ' kpi-' + tone : '')}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

export default function RiskDashboard({ bookings }) {
  const [filter, setFilter] = useState('high');

  const scored = useMemo(() => {
    if (!bookings) return null;
    return addRiskScores(bookings);
  }, [bookings]);

  const summary = useMemo(() => (scored ? riskSummary(scored) : null), [scored]);

  if (!bookings) return (
    <div className="dash">
      <div className="card">
        <h2>Waiting for booking data</h2>
        <p className="muted">Open the Bookings Analytics tab first so the CSV loads.</p>
      </div>
    </div>
  );

  const { high, medium, low, total, revenueAtRisk } = summary;

  const filtered = scored.filter((r) => (filter === 'all' ? true : r.risk.level === filter));
  const topRisky = [...filtered].sort((a, b) => b.risk.score - a.risk.score).slice(0, 50);

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <h1>Cancellation Risk Engine</h1>
          <p className="muted">
            Transparent, rule-based scores across {int(total)} bookings. Scores summarize six booking-time signals; they are separate from the trained ML model.
          </p>
        </div>
      </header>

      <section className="kpi-grid kpi-grid-four">
        <Kpi label="High risk" value={int(high)} sub={pct(high / total)} tone="neg" />
        <Kpi label="Medium risk" value={int(medium)} sub={pct(medium / total)} />
        <Kpi label="Low risk" value={int(low)} sub={pct(low / total)} tone="pos" />
        <Kpi label="Historical revenue exposure" value={money(revenueAtRisk)} sub="high-risk, non-canceled records" tone="neg" />
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Risk distribution</h3>
          <div className="seg-toggle">
            {[['high', 'High only'], ['medium', 'Medium'], ['low', 'Low'], ['all', 'All']].map(([k, l]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        <DoughnutChart
          labels={['High', 'Medium', 'Low']}
          values={[high, medium, low]}
          colors={[PALETTE.negative, PALETTE.warm, PALETTE.positive]}
          height={260}
        />
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Top {topRisky.length} bookings - showing {filter}</h3>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Hotel</th>
                <th className="num">Lead</th>
                <th>Segment</th>
                <th>Deposit</th>
                <th className="num">Prev cancels</th>
                <th className="num">Requests</th>
                <th className="num">Risk</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {topRisky.map((r, i) => (
                <tr key={i}>
                  <td>{r.hotel}</td>
                  <td className="num">{r.lead_time}d</td>
                  <td>{r.market_segment}</td>
                  <td>{r.deposit_type}</td>
                  <td className="num">{r.previous_cancellations}</td>
                  <td className="num">{r.total_of_special_requests}</td>
                  <td className="num">
                    <span className={'risk-pill risk-' + r.risk.level}>{r.risk.score}</span>
                  </td>
                  <td className="risk-why">
                    {r.risk.reasons.length ? r.risk.reasons[0] : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
