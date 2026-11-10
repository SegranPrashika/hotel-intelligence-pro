import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { DoughnutChart, BarChart, PALETTE } from './charts.jsx';
import { computeKpis, summariseBy } from './bookingMetrics.js';
import cleanedCsvUrl from '../hotel_bookings_cleaned.csv?url';

const CSV_URL = '/hotel_bookings.csv';
const EXPECTED_CLEANED_ROWS = 87388;
const EXPECTED_CLEANED_COLUMNS = 29;

const int = (v) => Math.round(v).toLocaleString('en-US');
const pct = (v, d = 1) => ((v * 100).toFixed(d)) + '%';
const money = (v) => '$' + Math.round(v).toLocaleString('en-US');

async function loadCsv(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  if (!res.body) return res.text().then(parseCsv);

  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(received / total);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return parseCsv(new TextDecoder('utf-8').decode(merged));
}

function parseCsv(text) {
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  if (parsed.errors.length) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

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
  const [cleanedRows, setCleanedRows] = useState(null);
  const [rawRows, setRawRows] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('starting');
  const [error, setError] = useState(null);
  const [rawError, setRawError] = useState(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [datasetScope, setDatasetScope] = useState('cleaned');

  useEffect(() => {
    setStage('Loading cleaned booking dataset');
    loadCsv(cleanedCsvUrl, setProgress)
      .then((rows) => {
        const columnCount = rows.length ? Object.keys(rows[0]).length : 0;
        if (rows.length !== EXPECTED_CLEANED_ROWS || columnCount !== EXPECTED_CLEANED_COLUMNS) {
          throw new Error(
            `Expected the cleaned booking dataset (${EXPECTED_CLEANED_ROWS} rows × ${EXPECTED_CLEANED_COLUMNS} columns); received ${rows.length} rows × ${columnCount} columns.`,
          );
        }
        setStage('Sample validated');
        setCleanedRows(rows);
        onDataLoaded(rows);
      })
      .catch((err) => setError(String(err)));
  }, [onDataLoaded]);

  const selectScope = (scope) => {
    setDatasetScope(scope);
    if (scope !== 'raw' || rawRows || rawLoading) return;
    setRawLoading(true);
    setRawError(null);
    loadCsv(CSV_URL, setProgress)
      .then(setRawRows)
      .catch((err) => setRawError(String(err)))
      .finally(() => setRawLoading(false));
  };

  const derived = useMemo(() => {
    if (!cleanedRows || (datasetScope === 'raw' && !rawRows)) return null;
    const activeRows = datasetScope === 'raw' ? rawRows : cleanedRows;
    
    return {
      rawCount: rawRows ? rawRows.length : 119390,
      cleanedCount: cleanedRows.length,
      activeColumnCount: datasetScope === 'raw' ? 32 : 29,
      kpis: computeKpis(activeRows),
      bySegment: summariseBy(activeRows, (r) => r.market_segment).filter((g) => g.bookings >= 50),
      byDeposit: summariseBy(activeRows, (r) => r.deposit_type),
      byCustomer: summariseBy(activeRows, (r) => r.customer_type),
    };
  }, [cleanedRows, rawRows, datasetScope]);

  if (error) return (
    <div className="dash">
      <div className="card error-card">
        <h2>Pipeline Failed</h2>
        <p>{error}</p>
      </div>
    </div>
  );

  if (!cleanedRows || !derived) return (
    <div className="dash">
      <div className="card">
        <h2>{datasetScope === 'raw' ? 'Loading raw source...' : 'Loading cleaned booking dataset...'}</h2>
        <div className="progress"><div className="progress-fill" style={{ width: (Math.round(progress * 100)) + '%' }} /></div>
        <p className="muted">{Math.round(progress * 100)}% - {datasetScope === 'raw' ? (rawLoading ? 'Loading raw source' : rawError || 'Waiting for raw source') : stage}</p>
      </div>
    </div>
  );

  const {
    kpis, bySegment, byDeposit, byCustomer,
    rawCount, cleanedCount, activeColumnCount,
  } = derived;

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <h1>Bookings Analytics</h1>
          <p className="muted">Live view of hotel performance and data quality.</p>
        </div>
        <div className="scope-toggle">
          <button className={datasetScope === 'raw' ? 'on' : ''} onClick={() => selectScope('raw')}>Raw Ingest</button>
          <button className={datasetScope === 'cleaned' ? 'on' : ''} onClick={() => selectScope('cleaned')}>Sanitized Dataset</button>
        </div>
      </header>

      <div className="pipeline-bar">
        <div className="pipe-step">
          <span className="pipe-dot active"></span>
          <strong>Ingest:</strong> {int(rawCount)} rows
        </div>
        <div className="pipe-arrow">→</div>
        <div className="pipe-step">
          <span className="pipe-dot active"></span>
          <strong>Cleaned dataset:</strong> {int(cleanedCount)} rows × 29 columns
        </div>
        <div className="pipe-arrow">→</div>
        <div className="pipe-step">
          <span className="pipe-dot success"></span>
          <strong>Metrics:</strong> calculated from all selected records
        </div>
      </div>

      {rawError && datasetScope === 'raw' && <div className="card error-card"><p>{rawError}</p></div>}

      <div className="dataset-note">
        <strong>Hotel Booking Demand:</strong> two hotels · arrivals July 2015–August 2017 ·
        <code>is_canceled</code>: 0 = fulfilled stay; 1 = canceled or no-show.
      </div>

      <section className="kpi-grid">
        <Kpi
          label="Bookings Analyzed"
          value={int(kpis.total)}
          sub={`${activeColumnCount} columns · ${datasetScope === 'raw' ? 'raw source' : 'cleaned dataset'}`}
          delta={datasetScope === 'cleaned' ? `-${int(rawCount - cleanedCount)} vs raw` : ''}
        />
        <Kpi label="Canceled / no-show rate" value={pct(kpis.cancellationRate)} sub={int(kpis.canceled) + ' label-1 bookings'} tone="neg" />
        <Kpi label="Avg daily rate" value={'$' + kpis.adrMean.toFixed(2)} sub="mean across rows" />
        <Kpi label="Booked room value" value={money(kpis.revenue)} sub="Positive ADR × room nights" tone="pos" />
        <Kpi label="Median lead time" value={int(kpis.leadTimeMedian) + 'd'} sub={'mean ' + kpis.leadTimeMean.toFixed(1) + 'd'} />
        <Kpi label="Repeat guests" value={pct(kpis.repeatedRate, 2)} sub={int(kpis.repeatedGuests) + ' bookings'} />
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>Fulfilled vs canceled / no-show</h3>
          <DoughnutChart
            labels={['Fulfilled stay', 'Canceled / no-show']}
            values={[kpis.completed, kpis.canceled]}
            colors={[PALETTE.positive, PALETTE.negative]}
            centerValue={pct(kpis.cancellationRate)}
            centerLabel="is_canceled = 1"
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