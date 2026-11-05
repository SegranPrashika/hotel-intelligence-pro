import { useEffect, useMemo, useState } from 'react';
import { DoughnutChart, BarChart, LineChart, PALETTE } from './charts.jsx';

const BUNDLE_URL = '/reviews_bundle.json';

const int = (v) => Math.round(v).toLocaleString('en-US');
const pct = (v, d = 1) => ((v * 100).toFixed(d)) + '%';
const signed = (v, d = 3) => (v > 0 ? '+' : '') + v.toFixed(d);

function Kpi({ label, value, sub, tone }) {
  return (
    <div className={'kpi' + (tone ? ' kpi-' + tone : '')}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

function WordCloud({ words, color, max = 45 }) {
  const shown = words.slice(0, max);
  if (!shown.length) return null;
  const counts = shown.map((w) => w.documents);
  const min = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const size = (c) => (maxCount === min ? 18 : 12 + ((c - min) / (maxCount - min)) * 26);
  return (
    <div className="word-cloud">
      {shown.map((w) => (
        <span
          key={w.word}
          className="word"
          style={{ fontSize: size(w.documents) + 'px', color }}
          title={w.word + ' - in ' + int(w.documents) + ' reviews (' + pct(w.posRate, 0) + ' positive)'}
        >
          {w.word}
        </span>
      ))}
    </div>
  );
}

export default function ReviewsDashboard() {
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState(null);
  const [minReviews, setMinReviews] = useState(100);
  const [tableSort, setTableSort] = useState('reviews');
  const [cloudSide, setCloudSide] = useState('positive');
  const [trendMetric, setTrendMetric] = useState('score');

  useEffect(() => {
    fetch(BUNDLE_URL)
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then((json) => setBundle(json))
      .catch((err) => setError(String(err)));
  }, []);

  const hotels = useMemo(() => {
    if (!bundle) return [];
    return bundle.hotels.filter((h) => h.reviews >= minReviews);
  }, [bundle, minReviews]);

  const sortedHotels = useMemo(() => {
    const copy = [...hotels];
    if (tableSort === 'score') copy.sort((a, b) => (b.avgReviewerScore || 0) - (a.avgReviewerScore || 0));
    else if (tableSort === 'positiveShare') copy.sort((a, b) => (b.positiveShare || 0) - (a.positiveShare || 0));
    else copy.sort((a, b) => b.reviews - a.reviews);
    return copy;
  }, [hotels, tableSort]);

  if (error) return (
    <div className="dash">
      <div className="card error-card">
        <h2>Could not load the reviews bundle</h2>
        <p>{error}</p>
        <p className="muted">Rebuild it with: node build/bundle.mjs</p>
      </div>
    </div>
  );

  if (!bundle) return (
    <div className="dash">
      <div className="card">
        <h2>Loading reviews...</h2>
        <p className="muted">Fetching the precomputed summary bundle (258 KB).</p>
      </div>
    </div>
  );

  const { meta, validation: v } = bundle;
  const cloudWords = cloudSide === 'positive' ? bundle.words.positive : bundle.words.negative;

  return (
    <div className="dash">
      <header className="dash-head">
        <div>
          <h1>Reviews & Sentiment</h1>
          <p className="muted">
            {int(meta.rows)} reviews - {int(meta.textsScored)} texts scored - {int(meta.hotels)} hotels - {meta.dateMin} to {meta.dateMax}
          </p>
        </div>
      </header>

      <section className="card note-card warn">
        <h3>Read this before trusting the sentiment numbers</h3>
        <p>
          All {int(meta.textsScored)} review texts were scored with wink-nlp using the guide's exact call,
          then checked against each reviewer's own 0-10 score.
        </p>
        <div className="verdict-grid">
          <div className="verdict">
            <span className="verdict-value">{pct(v.agreementRate)}</span>
            <span className="verdict-label">agree with the reviewer's score</span>
          </div>
          <div className="verdict">
            <span className="verdict-value">{pct(v.majorityBaseline)}</span>
            <span className="verdict-label">baseline from always guessing positive</span>
          </div>
          <div className="verdict">
            <span className="verdict-value">{pct(v.highScorePositiveShare)}</span>
            <span className="verdict-label">of 8+ reviews read as positive</span>
          </div>
          <div className="verdict">
            <span className="verdict-value">{pct(v.lowScoreNegativeShare)}</span>
            <span className="verdict-label">of 4- reviews read as negative</span>
          </div>
        </div>
        <p>
          The model effectively matches a coin weighted towards positive: it labels{' '}
          {int(v.winkBucketCounts.positive)} texts positive against only{' '}
          {int(v.winkBucketCounts.negative)} negative. It is useful for ranking the words that separate
          happy from unhappy guests, and unreliable as an absolute satisfaction score.
        </p>
      </section>

      <section className="kpi-grid">
        <Kpi label="Reviews" value={int(meta.rows)} sub={int(meta.hotels) + ' hotels'} />
        <Kpi label="Texts scored" value={int(meta.textsScored)} sub="positive + negative columns" />
        <Kpi label="Mean reviewer score" value={meta.meanReviewerScore.toFixed(2)} sub="out of 10" tone="pos" />
        <Kpi label="Mean wink sentiment" value={signed(meta.meanWinkSentiment)} sub="range -1 to +1" />
        <Kpi label="Read as positive" value={int(v.winkBucketCounts.positive)} sub={pct(v.winkBucketCounts.positive / (v.totalBuckets || 1), 0)} />
        <Kpi label="Read as negative" value={int(v.winkBucketCounts.negative)} sub={pct(v.winkBucketCounts.negative / (v.totalBuckets || 1), 0)} tone="neg" />
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>Reviewer score distribution</h3>
          <BarChart
            labels={bundle.scoreHistogram.map((b) => b.score.toFixed(1))}
            values={bundle.scoreHistogram.map((b) => b.count)}
            horizontal={false}
            colors={bundle.scoreHistogram.map((b) => (b.score >= 8 ? PALETTE.positive : b.score >= 6 ? PALETTE.neutral : PALETTE.negative))}
            format={int}
            height={280}
          />
          <p className="muted small">Most reviews cluster at 8-10, which is why a positive-leaning model can look accurate without adding much information.</p>
        </div>
        <div className="card">
          <h3>Texts read positive / neutral / negative</h3>
          <DoughnutChart
            labels={['Positive', 'Neutral', 'Negative']}
            values={[v.winkBucketCounts.positive, v.winkBucketCounts.neutral, v.winkBucketCounts.negative]}
            colors={[PALETTE.positive, PALETTE.neutral, PALETTE.negative]}
            height={280}
          />
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Monthly trend</h3>
          <div className="seg-toggle">
            {[['score', 'Reviewer score'], ['reviews', 'Reviews per month']].map(([k, l]) => (
              <button key={k} className={trendMetric === k ? 'on' : ''} onClick={() => setTrendMetric(k)}>{l}</button>
            ))}
          </div>
        </div>
        {trendMetric === 'score' && (
          <LineChart
            labels={bundle.monthly.map((m) => m.label)}
            series={[{
              label: 'Mean reviewer score (0-10)',
              values: bundle.monthly.map((m) => m.avgReviewerScore),
              color: PALETTE.positive,
              fill: true,
              format: (x) => x.toFixed(2),
            }]}
            formatLeft={(x) => x.toFixed(1)}
            yMaxLeft={10}
            height={280}
          />
        )}
        {trendMetric === 'reviews' && (
          <LineChart
            labels={bundle.monthly.map((m) => m.label)}
            series={[{
              label: 'Reviews per month',
              values: bundle.monthly.map((m) => m.reviews),
              color: PALETTE.accent,
              fill: true,
              format: int,
            }]}
            formatLeft={int}
            height={280}
          />
        )}
        <p className="muted small">{bundle.monthly.length} months, {bundle.monthly[0].label} to {bundle.monthly[bundle.monthly.length - 1].label}.</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Which words separate happy from unhappy guests?</h3>
          <div className="seg-toggle">
            <button className={cloudSide === 'positive' ? 'on' : ''} onClick={() => setCloudSide('positive')}>Positive words</button>
            <button className={cloudSide === 'negative' ? 'on' : ''} onClick={() => setCloudSide('negative')}>Negative words</button>
          </div>
        </div>
        <WordCloud words={cloudWords} color={cloudSide === 'positive' ? PALETTE.positive : PALETTE.negative} />
        <p className="muted small">
          Ranked by how often each word appears in reviews that scored positive (or negative) versus the other side.
          Size reflects how many reviews contain the word. Stop-words and hotel boilerplate removed.
        </p>
      </section>

      <section className="grid-2">
        <div className="card">
          <h3>Most positive sentences</h3>
          <ul className="quote-list">
            {bundle.quotes.positive.slice(0, 8).map((q, i) => (
              <li key={i}>
                <p className="quote">{q.text}</p>
                <span className="quote-meta">{q.hotel} - {signed(q.sentiment, 2)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>Most negative sentences</h3>
          <ul className="quote-list">
            {bundle.quotes.negative.slice(0, 8).map((q, i) => (
              <li key={i}>
                <p className="quote">{q.text}</p>
                <span className="quote-meta">{q.hotel} - {signed(q.sentiment, 2)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Hotels ({sortedHotels.length} shown)</h3>
          <div className="seg-toggle">
            <button className={tableSort === 'reviews' ? 'on' : ''} onClick={() => setTableSort('reviews')}>Most reviews</button>
            <button className={tableSort === 'score' ? 'on' : ''} onClick={() => setTableSort('score')}>Top score</button>
            <button className={tableSort === 'positiveShare' ? 'on' : ''} onClick={() => setTableSort('positiveShare')}>Most positive</button>
          </div>
        </div>
        <div className="table-scroll tall">
          <table className="data-table">
            <thead>
              <tr>
                <th>Hotel</th>
                <th className="num">Reviews</th>
                <th className="num">Reviewer score</th>
                <th className="num">Positive</th>
                <th className="num">Neutral</th>
                <th className="num">Negative</th>
                <th className="num">Positive share</th>
              </tr>
            </thead>
            <tbody>
              {sortedHotels.slice(0, 60).map((h) => (
                <tr key={h.name}>
                  <td>{h.name}</td>
                  <td className="num">{int(h.reviews)}</td>
                  <td className="num">{h.avgReviewerScore ? h.avgReviewerScore.toFixed(2) : '-'}</td>
                  <td className="num">{int(h.positive)}</td>
                  <td className="num">{int(h.neutral)}</td>
                  <td className="num">{int(h.negative)}</td>
                  <td className="num">{h.positiveShare ? pct(h.positiveShare, 0) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">Showing up to 60 hotels with at least {int(minReviews)} reviews, of {int(meta.hotels)} total.</p>
      </section>
    </div>
  );
}