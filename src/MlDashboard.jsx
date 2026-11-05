import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { RocChart, PALETTE } from './charts.jsx';

const pct = (v, d = 1) => ((v * 100).toFixed(d)) + '%';

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={'kpi' + (tone ? ' kpi-' + tone : '')}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

export default function MlDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/ml_outputs.json')
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(String(err)));
  }, []);

  if (error) return (
    <div className="dash">
      <div className="card error-card">
        <h2>Could not load ML outputs</h2>
        <p>{error}</p>
      </div>
    </div>
  );

  if (!data) return (
    <div className="dash">
      <div className="card">
        <h2>Loading ML insights...</h2>
      </div>
    </div>
  );

  // ROC Curve Data (using line interpolation for smoothness)
  const rocData = {
    datasets: [
      {
        label: 'XGBoost (AUC: ' + data.metrics.xgb.roc_auc.toFixed(3) + ')',
        data: data.curves.roc_xgb.fpr.map((f, i) => ({ x: f, y: data.curves.roc_xgb.tpr[i] })),
        borderColor: PALETTE.accent, borderWidth: 2.5, pointRadius: 0, showLine: true, tension: 0.3
      },
      {
        label: 'Logistic Reg (AUC: ' + data.metrics.lr.roc_auc.toFixed(3) + ')',
        data: data.curves.roc_lr.fpr.map((f, i) => ({ x: f, y: data.curves.roc_lr.tpr[i] })),
        borderColor: PALETTE.warm, borderWidth: 2.5, pointRadius: 0, showLine: true, tension: 0.3
      },
      {
        label: 'Random Baseline',
        data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        borderColor: '#cbd5e1', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, showLine: true
      },
    ],
  };

  const decileLabels = Object.keys(data.decile_lift);
  const decileValues = Object.values(data.decile_lift);
  const decileData = {
    labels: decileLabels,
    datasets: [{
      label: 'Actual Cancel Rate', data: decileValues,
      backgroundColor: decileValues.map((_, i) => (i >= 8 ? PALETTE.negative : PALETTE.accent)),
      borderRadius: 6,
    }],
  };

  const topFeatures = data.feature_importance.slice(0, 10);
  const featData = {
    labels: topFeatures.map((f) => f.feature.replace(/_/g, ' ')), // Clean up names
    datasets: [{
      label: 'Importance', data: topFeatures.map((f) => f.importance),
      backgroundColor: PALETTE.positive, borderRadius: 6,
    }],
  };

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <h1>Predictive Risk Modeling</h1>
          <p className="muted">Time-split validation, leakage control, and model evaluation.</p>
        </div>
      </header>

      <section className="kpi-grid">
        <Kpi label="XGBoost ROC-AUC" value={data.metrics.xgb.roc_auc.toFixed(3)} sub="Discrimination quality" tone="pos" />
        <Kpi label="XGBoost PR-AUC" value={data.metrics.xgb.pr_auc.toFixed(3)} sub="Practical usefulness" tone="pos" />
        <Kpi label="LR ROC-AUC" value={data.metrics.lr.roc_auc.toFixed(3)} sub="Linear baseline" />
        <Kpi label="LR PR-AUC" value={data.metrics.lr.pr_auc.toFixed(3)} sub="Linear baseline" />
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>ROC Curve</h3>
          <p className="muted small" style={{ marginBottom: '1rem' }}>True Positive Rate vs False Positive Rate.</p>
          <RocChart data={rocData} height={300} />
        </div>

        <div className="card">
          <h3>Decile Lift (Actionability)</h3>
          <p className="muted small" style={{ marginBottom: '1rem' }}>If we target the top 20% riskiest bookings (Deciles 9 & 10), we catch the vast majority of cancellations.</p>
          <div className="chart-box" style={{ height: 300 }}>
            <Bar
              data={decileData}
              options={{
                maintainAspectRatio: false,
                scales: { y: { ticks: { callback: (v) => pct(v, 0) }, grid: { color: 'rgba(226, 232, 240, 0.6)' } }, x: { grid: { display: false } } },
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` Cancel Rate: ${pct(ctx.raw, 1)}` } } },
              }}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <h3>Top 10 Feature Importance (XGBoost)</h3>
        <p className="muted small" style={{ marginBottom: '1rem' }}>Which factors drive the model's predictions.</p>
        <div className="chart-box" style={{ height: 350 }}>
          <Bar
            data={featData}
            options={{
              indexAxis: 'y',
              maintainAspectRatio: false,
              scales: { x: { grid: { color: 'rgba(226, 232, 240, 0.6)' } }, y: { grid: { display: false } } },
              plugins: { legend: { display: false } },
            }}
          />
        </div>
      </section>
    </div>
  );
}