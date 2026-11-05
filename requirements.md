# Product Requirements

## Purpose

Give hotel revenue managers a decision-support tool that goes beyond aggregate
reporting: predict which bookings will cancel, and correlate cancellations with
guest sentiment patterns.

## User personas

- Revenue manager - needs to know which active bookings to intervene on.
- General manager - needs to see how sentiment trends relate to business outcomes.
- Analyst - needs to trust the numbers, which means the tool must state its own
  limitations.

## Functional requirements

1. Load 119,390 hotel bookings from a static CSV and display 8+ KPIs.
2. Handle the 26.8% duplicate rows transparently with a toggle.
3. Assign every booking a cancellation risk score in [0, 100] with a level.
4. Surface a "Revenue at Risk" figure for active high-risk bookings.
5. Load 515,738 precomputed review summaries.
6. Compute word associations across the review corpus (positive vs negative).
7. Validate sentiment model output against reviewer-provided 0-10 scores.
8. Provide a paste-and-analyze tool for ad-hoc review analysis.

## Non-functional requirements

- All computation runs client-side. No backend.
- Initial page load under 3 seconds on a normal connection.
- The largest CSV (227 MB) must never be sent to the client.
- Every headline number must be independently verifiable via node verify.mjs.
- No silent data decisions: duplicates, missing values, and model limitations are
  surfaced in the UI, not hidden.

## Success criteria

- 16 / 16 verification checks pass against the pandas reference.
- The sentiment model's limitations are stated on the page, not buried in a doc.
- The risk engine's scores are explainable: every score comes with reasons.