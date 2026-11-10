import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { RocChart, PALETTE } from './charts.jsx';

const pct = (v, d = 1) => ((v * 100).toFixed(d)) + '%';
const int = (v) => Math.round(v).toLocaleString('en-US');

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={'kpi' + (tone ? ' kpi-' + tone : '')}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

function ConfusionMatrix({ matrix }) {
  return (
    <div className="table-wrapper">
      <table className="data-table confusion-table">
        <thead>
          <tr>
            <th>Actual / Predicted</th>
            <th>Not canceled</th>
            <th>Canceled</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Not canceled</th>
            <td>{int(matrix[0][0])}</td>
            <td>{int(matrix[0][1])}</td>
          </tr>
          <tr>
            <th>Canceled</th>
            <td>{int(matrix[1][0])}</td>
            <td>{int(matrix[1][1])}</td>
          </tr>
        </tbody>
      </table>
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

  const rocData = {
    datasets: [
      {
        label: `XGBoost (AUC: ${data.metrics.xgb.roc_auc.toFixed(3)})`,
        data: data.curves.roc_xgb.fpr.map((fpr, i) => ({ x: fpr, y: data.curves.roc_xgb.tpr[i] })),
        borderColor: PALETTE.accent, borderWidth: 2.5, pointRadius: 0, showLine: true,
      },
      {
        label: `Logistic Regression (AUC: ${data.metrics.lr.roc_auc.toFixed(3)})`,
        data: data.curves.roc_lr.fpr.map((fpr, i) => ({ x: fpr, y: data.curves.roc_lr.tpr[i] })),
        borderColor: PALETTE.warm, borderWidth: 2.5, pointRadius: 0, showLine: true,
      },
      {
        label: 'Random baseline',
        data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        borderColor: '#cbd5e1', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, showLine: true,
      },
    ],
  };
  const prData = {
    datasets: [
      {
        label: `XGBoost (PR-AUC: ${data.metrics.xgb.pr_auc.toFixed(3)})`,
        data: data.curves.pr_xgb.recall.map((recall, i) => ({ x: recall, y: data.curves.pr_xgb.precision[i] })),
        borderColor: PALETTE.accent, borderWidth: 2.5, pointRadius: 0, showLine: true,
      },
      {
        label: `Logistic Regression (PR-AUC: ${data.metrics.lr.pr_auc.toFixed(3)})`,
        data: data.curves.pr_lr.recall.map((recall, i) => ({ x: recall, y: data.curves.pr_lr.precision[i] })),
        borderColor: PALETTE.warm, borderWidth: 2.5, pointRadius: 0, showLine: true,
      },
      {
        label: `Random baseline (${pct(data.meta.cancel_rate_test)})`,
        data: [{ x: 0, y: data.meta.cancel_rate_test }, { x: 1, y: data.meta.cancel_rate_test }],
        borderColor: '#cbd5e1', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, showLine: true,
      },
    ],
  };

  const decileEntries = Object.entries(data.decile_lift).sort((a, b) => Number(a[0]) - Number(b[0]));
  const topDecileRate = decileEntries.length ? decileEntries[decileEntries.length - 1][1] : 0;
  const decileData = {
    labels: decileEntries.map(([decile]) => 'D' + decile),
    datasets: [{
      label: 'Actual cancellation rate',
      data: decileEntries.map(([, rate]) => rate),
      backgroundColor: decileEntries.map((_, i) => (i >= 8 ? PALETTE.negative : PALETTE.accent)),
      borderRadius: 6,
    }],
  };

  const topFeatures = data.feature_importance.slice(0, 15);
  const importanceData = {
    labels: topFeatures.map((feature) => feature.feature.replace(/_/g, ' ')),
    datasets: [{
      label: 'Importance',
      data: topFeatures.map((feature) => feature.importance),
      backgroundColor: PALETTE.accent,
      borderRadius: 5,
    }],
  };

  const coefficients = data.feature_coefficients;
  const coefficientData = {
    labels: coefficients.map((feature) => feature.feature.replace(/_/g, ' ')),
    datasets: [{
      label: 'LR coefficient',
      data: coefficients.map((feature) => feature.coefficient),
      backgroundColor: coefficients.map((feature) => feature.coefficient > 0 ? PALETTE.negative : PALETTE.positive),
      borderRadius: 5,
    }],
  };
  const coefficientMin = Math.min(0, ...coefficients.map((feature) => feature.coefficient));
  const coefficientMax = Math.max(0, ...coefficients.map((feature) => feature.coefficient));

  const modelRows = [
    ['Logistic Regression', data.metrics.lr],
    ['XGBoost', data.metrics.xgb],
  ];
  const ablationRows = [
    ['LR', data.ablations.with_deposit.lr, data.ablations.without_deposit.lr],
    ['XGBoost', data.ablations.with_deposit.xgb, data.ablations.without_deposit.xgb],
  ];

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <h1>Predictive Risk Modeling</h1>
          <p className="muted">Booking-time features · chronological holdout · threshold metrics at 0.5.</p>
        </div>
      </header>

      <div className="dataset-note">
        <strong>Evaluation:</strong> The complete cleaned booking dataset is split chronologically.
        Training uses arrivals through {data.meta.train_end} ({int(data.meta.train_size)} bookings);
        the holdout covers arrivals from {data.meta.test_start} ({int(data.meta.test_size)} bookings,
        {' '}{pct(data.meta.cancel_rate_test)} canceled). Metrics below are recomputed from this dataset.
      </div>

      <section className="kpi-grid">
        <Kpi label="XGBoost ROC-AUC" value={data.metrics.xgb.roc_auc.toFixed(3)} sub="Discrimination" tone="pos" />
        <Kpi label="XGBoost PR-AUC" value={data.metrics.xgb.pr_auc.toFixed(3)} sub="Above the cancellation-rate baseline" tone="pos" />
        <Kpi label="LR ROC-AUC" value={data.metrics.lr.roc_auc.toFixed(3)} sub="Linear baseline" />
        <Kpi label="LR PR-AUC" value={data.metrics.lr.pr_auc.toFixed(3)} sub="Linear baseline" />
        <Kpi label="Top-decile cancel rate" value={pct(topDecileRate)} sub={`${(topDecileRate / data.meta.cancel_rate_test).toFixed(1)}× test-set average`} tone="neg" />
      </section>

      <section className="card">
        <h3>Model comparison · 2017 chronological test set</h3>
        <p className="muted small">ROC-AUC and PR-AUC evaluate ranking; threshold metrics use a 0.5 cutoff.</p>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th>Model</th><th>ROC-AUC</th><th>PR-AUC</th><th>Accuracy</th><th>F1</th><th>Precision</th><th>Recall</th></tr>
            </thead>
            <tbody>
              {modelRows.map(([name, metrics]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{metrics.roc_auc.toFixed(3)}</td>
                  <td>{metrics.pr_auc.toFixed(3)}</td>
                  <td>{pct(metrics.accuracy)}</td>
                  <td>{metrics.f1.toFixed(3)}</td>
                  <td>{pct(metrics.precision)}</td>
                  <td>{pct(metrics.recall)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>ROC curves</h3>
          <p className="muted small">Discrimination across classification thresholds.</p>
          <RocChart data={rocData} height={300} />
        </div>
        <div className="card">
          <h3>Precision–recall curves</h3>
          <p className="muted small">The dashed baseline is the test-set cancellation rate.</p>
          <RocChart data={prData} height={300} xTitle="Recall" yTitle="Precision" />
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>Logistic Regression · confusion matrix</h3>
          <p className="muted small">Rows are actual labels; columns are predictions at threshold 0.5.</p>
          <ConfusionMatrix matrix={data.confusion_matrices.lr} />
        </div>
        <div className="card">
          <h3>XGBoost · confusion matrix</h3>
          <p className="muted small">Rows are actual labels; columns are predictions at threshold 0.5.</p>
          <ConfusionMatrix matrix={data.confusion_matrices.xgb} />
        </div>
      </section>

      <section className="card">
        <h3>Deposit ablation</h3>
        <p className="muted small">Same chronological split and model settings; the no-deposit model removes only <code>deposit_type</code>.</p>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr><th>Model</th><th>With deposit ROC-AUC</th><th>No deposit ROC-AUC</th><th>Δ ROC-AUC</th><th>With deposit PR-AUC</th><th>No deposit PR-AUC</th></tr>
            </thead>
            <tbody>
              {ablationRows.map(([name, withDeposit, withoutDeposit]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{withDeposit.roc_auc.toFixed(3)}</td>
                  <td>{withoutDeposit.roc_auc.toFixed(3)}</td>
                  <td>{(withoutDeposit.roc_auc - withDeposit.roc_auc >= 0 ? '+' : '') + (withoutDeposit.roc_auc - withDeposit.roc_auc).toFixed(3)}</td>
                  <td>{withDeposit.pr_auc.toFixed(3)}</td>
                  <td>{withoutDeposit.pr_auc.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>Decile lift · actual cancellation rate</h3>
          <p className="muted small">D1 is the lowest predicted-risk group; D10 is the highest.</p>
          <div className="chart-box" style={{ height: 300 }}>
            <Bar
              data={decileData}
              options={{
                maintainAspectRatio: false,
                scales: {
                  y: { min: 0, max: 1, ticks: { callback: (value) => pct(value, 0) } },
                  x: { grid: { display: false } },
                },
                plugins: {
                  legend: { display: false },
                  tooltip: { callbacks: { label: (ctx) => ` Cancellation rate: ${pct(ctx.raw, 1)}` } },
                },
              }}
            />
          </div>
        </div>
        <div className="card">
          <h3>XGBoost · top 15 feature importance</h3>
          <p className="muted small">Importance ranks contribution to prediction; it does not show direction or causality.</p>
          <div className="chart-box" style={{ height: 300 }}>
            <Bar
              data={importanceData}
              options={{
                indexAxis: 'y',
                maintainAspectRatio: false,
                scales: { x: { beginAtZero: true }, y: { grid: { display: false } } },
                plugins: { legend: { display: false } },
              }}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <h3>Logistic Regression · signed coefficients</h3>
        <p className="muted small">Red coefficients are associated with higher predicted cancellation odds; green with lower odds. These are associations, not causal effects.</p>
        <div className="chart-box" style={{ height: 420 }}>
          <Bar
            data={coefficientData}
            options={{
              indexAxis: 'y',
              maintainAspectRatio: false,
              scales: {
                x: { min: coefficientMin, max: coefficientMax, grid: { color: 'rgba(226, 232, 240, 0.6)' } },
                y: { grid: { display: false } },
              },
              plugins: { legend: { display: false } },
            }}
          />
        </div>
      </section>

      <div className="dataset-note">
        <strong>Interpretation guardrail:</strong> feature importance and coefficients describe model associations.
        In particular, do not claim that deposit policy causes cancellations; deposit type can flag demand that was
        already considered risky. Use risk tiers for operational review, then validate policy changes experimentally.
      </div>
    </div>
  );
}
