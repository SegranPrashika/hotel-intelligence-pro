// Generate the reviews bundle from Hotel_Reviews.csv.
//
// Reads the 227 MB CSV as a stream (no full-file load), scores every review text
// with wink-nlp using the same call as the app, and aggregates the results into
// a compact JSON bundle that the browser can fetch in ~50 ms.
//
// Run: node build/bundle.mjs
import { createReadStream, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Papa from 'papaparse';
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, 'public', 'Hotel_Reviews.csv');
const OUT_PATH = join(ROOT, 'public', 'reviews_bundle.json');

if (!existsSync(CSV_PATH)) {
  console.error('Missing CSV: ' + CSV_PATH);
  console.error('Run: python build/download_dataset.py');
  process.exit(1);
}

console.log('Loading wink-nlp model...');
const nlp = winkNLP(model);
const its = nlp.its;

console.log('Warming the model...');
for (let i = 0; i < 200; i++) nlp.readDoc('warm up the sentiment pipeline.').out(its.sentiment);

const SENTINELS = new Set(['', 'no negative', 'no positive', 'no negative review', 'none']);

const hotels = new Map();
const monthly = new Map();
const wordPos = new Map();
const wordNeg = new Map();
const wordDocs = new Map();
const scoreHistogram = new Map();
const agreeBuckets = new Map();
const quotesPos = [];
const quotesNeg = [];

const STOPWORDS = new Set(
  ('a about above after again against all am an and any are as at be because been before being below between both but by can cannot could did do does doing down during each few ' +
   'for from further had has have having he her here hers herself him himself his how i if in into is it its itself me more most my myself no nor not of off on once only or ' +
   'other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up ' +
   'very was we were what when where which while who whom why with would you your yours yourself yourselves also got get just one two three us back even still much many hotel ' +
   'room rooms stay stayed night nights day days time staff place location booked booking really quite bit little lot going go went come came made make').split(/\s+/));

const WORD_RE = /[a-z][a-z']+/g;
const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

let nRows = 0;
let nTexts = 0;
let sumScore = 0;
let scoreCount = 0;
let sumSent = 0;
let sentCount = 0;
let minDate = null;
let maxDate = null;
const t0 = Date.now();

const stream = Papa.parse(Papa.NODE_STREAM_INPUT, { header: true, skipEmptyLines: true });
createReadStream(CSV_PATH).pipe(stream);

stream.on('data', (row) => {
  nRows++;
  if (nRows % 50000 === 0) {
    const dt = ((Date.now() - t0) / 1000).toFixed(0);
    console.log('  ' + nRows.toLocaleString() + ' rows, ' + nTexts.toLocaleString() + ' texts (' + dt + 's)');
  }

  const hotelName = (row['Hotel_Name'] || '').trim() || 'Unknown';
  const scoreRaw = (row['Reviewer_Score'] || '').trim();
  const score = parseFloat(scoreRaw);
  const hasScore = Number.isFinite(score);
  const dateStr = (row['Review_Date'] || '').trim();

  let monthKey = null;
  const dm = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) {
    const m = parseInt(dm[1], 10);
    const y = parseInt(dm[3], 10);
    if (m >= 1 && m <= 12) {
      monthKey = y + '-' + String(m).padStart(2, '0');
      if (minDate === null || monthKey < minDate) minDate = monthKey;
      if (maxDate === null || monthKey > maxDate) maxDate = monthKey;
    }
  }

  if (hasScore) {
    sumScore += score;
    scoreCount++;
    const sk = score.toFixed(1);
    scoreHistogram.set(sk, (scoreHistogram.get(sk) || 0) + 1);
  }

  const rowSentiments = [];
  for (const col of ['Negative_Review', 'Positive_Review']) {
    const text = (row[col] || '').trim();
    if (SENTINELS.has(text.toLowerCase())) continue;
    nTexts++;

    const doc = nlp.readDoc(text);
    const s = doc.out(its.sentiment);
    sumSent += s;
    sentCount++;
    rowSentiments.push(s);

    const bucket = s > 0.2 ? 'pos' : s < -0.2 ? 'neg' : 'neu';

    let h = hotels.get(hotelName);
    if (!h) { h = { n: 0, sumScore: 0, sentN: 0, pos: 0, neg: 0, neu: 0 }; hotels.set(hotelName, h); }
    h.n++; h.sentN++;
    h[bucket]++;
    if (hasScore) h.sumScore += score;

    if (monthKey) {
      let mo = monthly.get(monthKey);
      if (!mo) { mo = { n: 0, sumScore: 0, sentN: 0 }; monthly.set(monthKey, mo); }
      mo.n++; mo.sentN++;
      if (hasScore) mo.sumScore += score;
    }

    const words = text.toLowerCase().match(WORD_RE) || [];
    const seen = new Set();
    for (const w of words) {
      if (w.length < 3 || STOPWORDS.has(w)) continue;
      seen.add(w);
      if (bucket === 'pos') wordPos.set(w, (wordPos.get(w) || 0) + 1);
      else if (bucket === 'neg') wordNeg.set(w, (wordNeg.get(w) || 0) + 1);
    }
    for (const w of seen) wordDocs.set(w, (wordDocs.get(w) || 0) + 1);

    if (s >= 0.75 && text.length >= 40 && text.length <= 220) {
      if (quotesPos.length < 400) quotesPos.push({ text, hotel: hotelName, sentiment: s });
    } else if (s <= -0.75 && text.length >= 40 && text.length <= 220) {
      if (quotesNeg.length < 400) quotesNeg.push({ text, hotel: hotelName, sentiment: s });
    }
  }

  if (hasScore && rowSentiments.length > 0) {
    const avg = rowSentiments.reduce((a, b) => a + b, 0) / rowSentiments.length;
    const rb = score <= 4 ? 'low' : score <= 8 ? 'mid' : 'high';
    const wb = avg < -0.2 ? 'negative' : avg <= 0.2 ? 'neutral' : 'positive';
    const k = rb + '|' + wb;
    agreeBuckets.set(k, (agreeBuckets.get(k) || 0) + 1);
  }
});

stream.on('end', () => {
  console.log('');
  console.log('Parsing done. ' + nRows.toLocaleString() + ' rows, ' + nTexts.toLocaleString() + ' texts in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  console.log('Aggregating bundle...');

  let totalBuckets = 0;
  for (const v of agreeBuckets.values()) totalBuckets += v;

  let matched = 0;
  let highTotal = 0, highPos = 0, lowTotal = 0, lowNeg = 0;
  const winkTotals = { positive: 0, neutral: 0, negative: 0 };
  for (const [k, v] of agreeBuckets) {
    const parts = k.split('|');
    const rb = parts[0], wb = parts[1];
    if ((rb === 'high' && wb === 'positive') || (rb === 'low' && wb === 'negative') || (rb === 'mid' && wb === 'neutral')) matched += v;
    if (rb === 'high') { highTotal += v; if (wb === 'positive') highPos += v; }
    if (rb === 'low') { lowTotal += v; if (wb === 'negative') lowNeg += v; }
    winkTotals[wb] += v;
  }

  const agreementRate = totalBuckets ? matched / totalBuckets : 0;
  const majorityBaseline = totalBuckets ? Math.max(winkTotals.positive, winkTotals.neutral, winkTotals.negative) / totalBuckets : 0;

  const ranked = [];
  for (const [w, docs] of wordDocs) {
    if (docs < 300) continue;
    const p = wordPos.get(w) || 0;
    const n = wordNeg.get(w) || 0;
    const total = p + n;
    if (total < 300) continue;
    ranked.push({ word: w, positive: p, negative: n, documents: docs, posRate: p / total });
  }

  const topPos = ranked.filter((r) => r.posRate > 0.55).sort((a, b) => b.posRate * Math.sqrt(b.positive) - a.posRate * Math.sqrt(a.positive)).slice(0, 80);
  const topNeg = ranked.filter((r) => r.posRate < 0.45).sort((a, b) => a.posRate * Math.sqrt(a.negative) - b.posRate * Math.sqrt(b.negative)).slice(0, 80);

  const hotelsOut = [...hotels.entries()].map(([name, h]) => ({
    name,
    reviews: h.n,
    avgReviewerScore: h.sentN ? h.sumScore / h.sentN : null,
    positive: h.pos,
    neutral: h.neu,
    negative: h.neg,
    positiveShare: h.n ? h.pos / h.n : null,
  })).sort((a, b) => b.reviews - a.reviews);

  const monthlyOut = [...monthly.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, mo]) => {
    const parts = key.split('-');
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    return {
      label: MONTH_LABELS[m - 1] + ' ' + y,
      reviews: mo.n,
      avgReviewerScore: mo.sentN ? mo.sumScore / mo.sentN : null,
    };
  });

  const topQuotesPos = quotesPos.sort((a, b) => b.sentiment - a.sentiment).slice(0, 25);
  const topQuotesNeg = quotesNeg.sort((a, b) => a.sentiment - b.sentiment).slice(0, 25);

  const scoreHistogramOut = [...scoreHistogram.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([s, c]) => ({ score: Number(s), count: c }));

  const bundle = {
    meta: {
      source: 'Hotel_Reviews.csv',
      rows: nRows,
      textsScored: nTexts,
      hotels: hotels.size,
      dateMin: minDate,
      dateMax: maxDate,
      meanReviewerScore: scoreCount ? sumScore / scoreCount : 0,
      meanWinkSentiment: sentCount ? sumSent / sentCount : 0,
    },
    validation: {
      agreementRate,
      majorityBaseline,
      highScorePositiveShare: highTotal ? highPos / highTotal : 0,
      lowScoreNegativeShare: lowTotal ? lowNeg / lowTotal : 0,
      winkBucketCounts: winkTotals,
      totalBuckets,
    },
    scoreHistogram: scoreHistogramOut,
    monthly: monthlyOut,
    hotels: hotelsOut,
    words: {
      positive: topPos.map((r) => ({ word: r.word, documents: r.documents, posRate: r.posRate })),
      negative: topNeg.map((r) => ({ word: r.word, documents: r.documents, posRate: r.posRate })),
    },
    quotes: {
      positive: topQuotesPos,
      negative: topQuotesNeg,
    },
  };

  mkdirSync(join(ROOT, 'public'), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(bundle));
  const size = JSON.stringify(bundle).length;

  console.log('');
  console.log('Wrote ' + OUT_PATH);
  console.log('  Bundle size: ' + (size / 1024).toFixed(1) + ' KB');
  console.log('  Hotels: ' + bundle.meta.hotels.toLocaleString());
  console.log('  Date range: ' + bundle.meta.dateMin + ' to ' + bundle.meta.dateMax);
  console.log('  Mean reviewer score: ' + bundle.meta.meanReviewerScore.toFixed(2) + ' / 10');
  console.log('  Mean wink sentiment: ' + bundle.meta.meanWinkSentiment.toFixed(3));
  console.log('  Agreement rate: ' + (agreementRate * 100).toFixed(1) + '%');
  console.log('  Baseline: ' + (majorityBaseline * 100).toFixed(1) + '%');
  console.log('  Total time: ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
});