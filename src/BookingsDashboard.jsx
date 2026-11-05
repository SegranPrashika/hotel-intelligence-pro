import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { DoughnutChart, BarChart, PALETTE } from './charts.jsx';
import { computeKpis, summariseBy, cleanData } from './bookingMetrics.js';

const CSV_URL = '/hotel_bookings.csv';

const int = (v) => Math.round(v).toLocaleString('en-US');
const pct = (v, d = 1) => ((v * 100).toFixed(d)) + '%';
const money = (v) => '$' + Math.round(v).toLocaleString('en-US');

function Kpi({ label, value, sub, tone, delta }) {
  return (
    <div className={'kpi' + (tone ? ' kpi-' + tone : '')}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
      {delta && <span className="kpi-delta">{delta}</span>}
    </div>
  );
}

export default function BookingsDashboard({ onDataLoaded }) {
  const [rawRows, setRawRows] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('starting');
  const [error, setError] = useState(null);
  const [isCleaned, setIsCleaned] = useState(true); // Default to cleaned

  useEffect(() => {
    setStage('Ingesting raw data');
    fetch(CSV_URL)
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        if (!res.body) return res.text();
        const total = Number(res.headers.get('content-length')) || 0;
        const reader = res.body.getReader();
        const chunks = [];
        let received = 0;
        const pump = () => reader.read().then(({ done, value }) => {
          if (done) return chunks;
          chunks.push(value);
          received += value.length;
          if (total) setProgress(received / total);
          return pump();
        });
        return pump().then((cs) => {
          const merged = new Uint8Array(received);
          let off = 0;
          for (const c of cs) { merged.set(c, off); off += c.length; }
          return new TextDecoder('utf-8').decode(merged);
        });
      })
      .then((text) => {
        setStage('Parsing and validating');
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
        if (parsed.errors.length) throw new Error(parsed.errors[0].message);
        setStage('Pipeline complete');
        setRawRows(parsed.data);
        onDataLoaded(parsed.data);
      })
      .catch((err) => setError(String(err)));
  }, [onDataLoaded]);

  const derived = useMemo(() => {
    if (!rawRows) return null;
    
    // Run the pipeline (Ch 6 logic)
    const cleanedRows = cleanData(rawRows);
    const activeRows = isCleaned ? cleanedRows : rawRows;
    
    return {
      rawCount: rawRows.length,
      cleanedCount: cleanedRows.length,
      droppedCount: rawRows.length - cleanedRows.length,
      kpis: computeKpis(activeRows),
      bySegment: summariseBy(activeRows, (r) => r.market_segment).filter((g) => g.bookings >= 50),
      byDeposit: summariseBy(activeRows, (r) => r.deposit_type),
      byCustomer: summariseBy(activeRows, (r) => r.customer_type),
    };
  }, [rawRows, isCleaned]);

  if (error) return (
    <div className="dash">
      <div className="card error-card">
        <h2>Pipeline Failed</h2>
        <p>{error}</p>
      </div>
    </div>
  );

  if (!rawRows || !derived) return (
    <div className="dash">
      <div className="card">
        <h2>Running Data Pipeline...</h2>
        <div className="progress"><div className="progress-fill" style={{ width: (Math.round(progress * 100)) + '%' }} /></div>
        <p className="muted">{Math.round(progress * 100)}% - {stage}</p>
      </div>
    </div>
  );

  const { kpis, bySegment, byDeposit, byCustomer, rawCount, cleanedCount, droppedCount } = derived;

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <h1>Bookings Analytics</h1>
          <p className="muted">Live view of hotel performance and data quality.</p>
        </div>
        <div className="scope-toggle">
          <button className={!isCleaned ? 'on' : ''} onClick={() => setIsCleaned(false)}>Raw Ingest</button>
          <button className={isCleaned ? 'on' : ''} onClick={() => setIsCleaned(true)}>Sanitized Dataset</button>
        </div>
      </header>

      {/* Expert Pipeline Status Bar */}
      <div className="pipeline-bar">
        <div className="pipe-step">
          <span className="pipe-dot active"></span>
          <strong>Ingest:</strong> {int(rawCount)} rows
        </div>
        <div className="pipe-arrow">→</div>
        <div className="pipe-step">
          <span className="pipe-dot active"></span>
          <strong>Clean:</strong> {int(droppedCount)} anomalies removed
        </div>
        <div className="pipe-arrow">→</div>
        <div className="pipe-step">
          <span className="pipe-dot success"></span>
          <strong>Active Dataset:</strong> {int(cleanedCount)} rows
        </div>
      </div>

      <section className="kpi-grid">
        <Kpi 
          label="Bookings Analyzed" 
          value={int(kpis.total)} 
          sub={isCleaned ? 'Cleaned dataset' : 'Raw dataset'} 
          delta={isCleaned ? `-${int(droppedCount)} vs raw` : ''}
        />
        <Kpi label="Cancellation rate" value={pct(kpis.cancellationRate)} sub={int(kpis.canceled) + ' canceled'} tone="neg" />
        <Kpi label="Avg daily rate" value={'$' + kpis.adrMean.toFixed(2)} sub="mean across rows" />
        <Kpi label="Est. revenue" value={money(kpis.revenue)} sub="adr x room nights" tone="pos" />
        <Kpi label="Median lead time" value={int(kpis.leadTimeMedian) + 'd'} sub={'mean ' + kpis.leadTimeMean.toFixed(1) + 'd'} />
        <Kpi label="Repeat guests" value={pct(kpis.repeatedRate, 2)} sub={int(kpis.repeatedGuests) + ' bookings'} />
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>Cancelled vs completed</h3>
          <DoughnutChart
            labels={['Completed', 'Cancelled']}
            values={[kpis.completed, kpis.canceled]}
            colors={[PALETTE.positive, PALETTE.negative]}
            centerValue={pct(kpis.cancellationRate)}
            centerLabel="cancelled"
            height={260}
          />
        </div>
        <div className="card">
          <h3>Cancellation rate by market segment</h3>
          <BarChart
            labels={bySegment.map((g) => g.key)}
            values={bySegment.map((g) => g.cancellationRate)}
            colors={bySegment.map((g) => g.cancellationRate > kpis.cancellationRate ? PALETTE.negative : PALETTE.positive)}
            format={(v) => pct(v, 0)}
            height={260}
          />
        </div>
      </section>

      <section className="grid-3">
        <div className="card">
          <h3>Deposit type</h3>
          <BarChart
            labels={byDeposit.map((g) => g.key)}
            values={byDeposit.map((g) => g.cancellationRate)}
            colors={byDeposit.map(() => PALETTE.warm)}
            format={(v) => pct(v, 0)}
            height={200}
          />
        </div>
        <div className="card">
          <h3>Customer type</h3>
          <BarChart
            labels={byCustomer.map((g) => g.key)}
            values={byCustomer.map((g) => g.cancellationRate)}
            colors={byCustomer.map(() => PALETTE.accent)}
            format={(v) => pct(v, 0)}
            height={200}
          />
        </div>
        <div className="card">
          <h3>Booking volume by segment</h3>
          <BarChart
            labels={bySegment.map((g) => g.key)}
            values={bySegment.map((g) => g.bookings)}
            colors={bySegment.map(() => PALETTE.blue)}
            format={int}
            height={200}
          />
        </div>
      </section>
    </div>
  );
}