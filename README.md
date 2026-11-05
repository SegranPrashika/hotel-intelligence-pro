# Hotel Intelligence Pro

An advanced hotel analytics dashboard built on two real, publicly available datasets:
119,390 hotel bookings and 515,738 hotel reviews. Verified: the analytics engine is
cross-checked against a pandas reference and every headline number is provably correct.

## What it does

Four tabs:

1. **Bookings Analytics** - 119,390 bookings with KPIs, segment/deposit/customer breakdowns,
   and a transparency banner about the 31,994 duplicate rows the dataset contains.
2. **Cancellation Risk** - a transparent, explainable scoring engine that assigns every
   booking a 0-100 cancellation risk with a list of reasons ("very long lead time",
   "non-refundable deposit", "3 previous cancellations"). Includes an estimated
   "Revenue at Risk" figure for the active portfolio.
3. **Reviews & Sentiment** - 515,738 Booking.com reviews scored with wink-nlp against
   each reviewer's own 0-10 score. Publishes the honest finding: 62.1% agreement
   against a 62.3% baseline (always guess positive).
4. **Paste & Analyze** - a live tool for pasting arbitrary reviews and getting instant
   word clouds and a sentiment score.

## Tech stack

- React 19 + Vite 6
- Chart.js 4 + react-chartjs-2
- wink-nlp + wink-eng-lite-web-model (browser-side NLP)
- PapaParse (streaming CSV parser)

## Data pipeline

The 227 MB reviews CSV is never sent to the browser. Instead, build/bundle.mjs
streams it through wink-nlp once and writes a 258 KB JSON bundle that the app fetches
in about 50 ms. The 17 MB bookings CSV streams directly into the browser with a
progress bar.

## Run it locally

    npm install
    npm run dev

Open http://localhost:5173/

## Verify the numbers

    node verify.mjs

Expected output: VERIFICATION: 16 / 16 checks passed.

## Rebuild the reviews bundle

    python build/download_dataset.py
    node build/bundle.mjs

Takes about 2 minutes to score 865,067 review texts.

## Deploy

    npm run build

Then drag the dist/ folder onto https://app.netlify.com/drop