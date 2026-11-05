# Architecture

## High-level shape

A single-page React app with hash-based routing across four tabs. No backend.
All heavy computation is either done offline (the reviews pipeline) or streamed
in the browser (the bookings CSV).

## Data flow

    Kaggle CSV              Build step (offline)                    Browser
    Hotel_Reviews.csv   ->  build/bundle.mjs (Node + wink-nlp)  ->  reviews_bundle.json (258 KB)
    227 MB, 515K rows       about 56 seconds                        fetches in about 50 ms

    hotel_bookings.csv  ->  (streamed via PapaParse in browser)  ->  119,390 parsed rows
    17 MB, 119K rows                                                analytics computed live

## Why two different strategies

- Reviews (227 MB): too large to parse in the browser. Precompute everything into
  a bundle containing aggregated counts, monthly series, word associations, and quotes.
  The 865,067 individual review texts never reach the client.
- Bookings (17 MB): small enough to stream in about 2 seconds. PapaParse parses in the
  browser, and analytics run on the full row set. Preserves interactive filter and
  sort behaviour that precomputation would make harder.

## Analytics core

All arithmetic lives in src/bookingMetrics.js as pure functions with no React or DOM
imports. This is what makes the verification script possible - it imports the same
module under Node and compares outputs against a pandas reference.

## Verification finding

verify.mjs recomputes 16 headline numbers from the raw CSV using the app's own
bookingMetrics.js. One notable finding: the original published reference says
unique.canceled = 24,021, but modern pandas (3.0.6) computes 24,025 on the same
file because pandas changed how it normalises the string "NA" in the children
column. The script documents this rather than hiding it.

## Risk engine

scoreCancellationRisk() is a transparent weighted model, not a black-box ML
classifier. Six predictors (lead time, deposit, prior cancellations, segment,
special requests, customer type) contribute to a 0-100 score. Every score comes
with a list of human-readable reasons, which the UI surfaces in a "Why" column.