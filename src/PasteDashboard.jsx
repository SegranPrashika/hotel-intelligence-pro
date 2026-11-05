import { useState } from 'react';
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
import { DoughnutChart, PALETTE } from './charts.jsx';

const nlp = winkNLP(model);
const its = nlp.its;

const SAMPLE = `The room was clean and spacious. The staff were friendly and helpful.
The bathroom had mold and the air conditioning didn't work at all.
Amazing location, close to everything. Would definitely stay again.
Terrible experience. The front desk was rude and the room was dirty.
Average hotel, nothing special but nothing terrible.
The breakfast buffet was incredible, lots of variety and fresh food.
Wifi was painfully slow and kept disconnecting. Very frustrating.
Beautiful view from the balcony. Would come back just for that.`;

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={'kpi' + (tone ? ' kpi-' + tone : '')}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

function WordCloud({ words, color, max = 40 }) {
  if (!words.length) return <div className="word-cloud"><p className="muted small">No words to display</p></div>;
  const shown = words.slice(0, max);
  const counts = shown.map((w) => w.value);
  const min = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const size = (c) => (maxCount === min ? 18 : 14 + ((c - min) / (maxCount - min)) * 26);
  return (
    <div className="word-cloud">
      {shown.map((w) => (
        <span
          key={w.text}
          className="word"
          style={{ fontSize: size(w.value) + 'px', color }}
          title={w.text + ' - ' + w.value + ' occurrences'}
        >
          {w.text}
        </span>
      ))}
    </div>
  );
}

export default function PasteDashboard() {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const analyze = () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    setTimeout(() => {
      const reviews = text.split('\n').map((r) => r.trim()).filter((r) => r);
      let pos = 0, neg = 0, neu = 0;
      const posWords = {}, negWords = {};
      let sumScore = 0;

      reviews.forEach((review) => {
        const doc = nlp.readDoc(review);
        const s = doc.out(its.sentiment);
        sumScore += s;
        const words = doc.tokens().filter((t) => t.out(its.type) === 'word' && !t.out(its.stopWordFlag)).out();
        if (s > 0.2) {
          pos++;
          words.forEach((w) => (posWords[w] = (posWords[w] || 0) + 1));
        } else if (s < -0.2) {
          neg++;
          words.forEach((w) => (negWords[w] = (negWords[w] || 0) + 1));
        } else {
          neu++;
        }
      });

      const sortWords = (obj) =>
        Object.entries(obj).map(([text, value]) => ({ text, value })).sort((a, b) => b.value - a.value).slice(0, 40);

      setResult({
        total: reviews.length,
        pos, neg, neu,
        avgScore: sumScore / reviews.length,
        posWords: sortWords(posWords),
        negWords: sortWords(negWords),
      });
      setAnalyzing(false);
    }, 200);
  };

  const loadSample = () => setText(SAMPLE);
  const clear = () => { setText(''); setResult(null); };

  const lineCount = text.split('\n').filter((l) => l.trim()).length;

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <h1>Paste & Analyze</h1>
          <p className="muted">
            Paste any hotel reviews (one per line) for instant sentiment analysis. No dataset required.
          </p>
        </div>
      </header>

      <section className="card">
        <div className="card-head">
          <h3>Your reviews</h3>
          <div className="seg-toggle">
            <button onClick={loadSample}>Load sample</button>
            <button onClick={clear}>Clear</button>
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste one review per line. Each line is a separate review."
          rows={8}
          className="paste-textarea"
        />
        <div className="controls-row">
          <button className="btn-primary" onClick={analyze} disabled={analyzing || !text.trim()}>
            {analyzing ? 'Analyzing...' : 'Analyze Reviews'}
          </button>
          <span className="muted small">
            {lineCount} review{lineCount !== 1 ? 's' : ''} ready
          </span>
        </div>
      </section>

      {result && (
        <>
          <section className="kpi-grid">
            <Kpi label="Reviews analyzed" value={result.total} />
            <Kpi label="Positive" value={result.pos} sub={Math.round((result.pos / result.total) * 100) + '%'} tone="pos" />
            <Kpi label="Neutral" value={result.neu} sub={Math.round((result.neu / result.total) * 100) + '%'} />
            <Kpi label="Negative" value={result.neg} sub={Math.round((result.neg / result.total) * 100) + '%'} tone="neg" />
            <Kpi label="Mean sentiment" value={(result.avgScore >= 0 ? '+' : '') + result.avgScore.toFixed(3)} sub="range -1 to +1" />
          </section>

          <section className="grid-2">
            <div className="card">
              <h3>Sentiment distribution</h3>
              <DoughnutChart
                labels={['Positive', 'Neutral', 'Negative']}
                values={[result.pos, result.neu, result.neg]}
                colors={[PALETTE.positive, PALETTE.neutral, PALETTE.negative]}
                height={260}
              />
            </div>
            <div className="card">
              <h3>How the model read your reviews</h3>
              <p className="muted small" style={{ marginBottom: '0.75rem' }}>
                wink-nlp scores each review from -1 to +1. Above +0.2 counts positive, below -0.2 counts negative.
              </p>
              <div className="sentiment-scale">
                <div className="scale-bar">
                  <div className="scale-marker" style={{ left: ((result.avgScore + 1) / 2) * 100 + '%' }}>
                    <span className="scale-marker-value">{(result.avgScore >= 0 ? '+' : '') + result.avgScore.toFixed(2)}</span>
                  </div>
                </div>
                <div className="scale-labels">
                  <span>-1 Negative</span>
                  <span>0 Neutral</span>
                  <span>+1 Positive</span>
                </div>
              </div>
            </div>
          </section>

          <section className="grid-2">
            <div className="card">
              <h3>Positive words</h3>
              <WordCloud words={result.posWords} color={PALETTE.positive} />
            </div>
            <div className="card">
              <h3>Negative words</h3>
              <WordCloud words={result.negWords} color={PALETTE.negative} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}