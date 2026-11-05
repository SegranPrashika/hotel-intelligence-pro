// Pure analytics functions. No React, no DOM. Testable in Node.

export const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export const isBlank = (v) => {
  if (v === null || v === undefined) return true;
  const t = String(v).trim().toUpperCase();
  return t === '' || t === 'NULL' || t === 'NA';
};

export const isBlankIn = (v, field) => {
  if (field === 'country') {
    if (v === null || v === undefined) return true;
    const t = String(v).trim().toUpperCase();
    return t === '' || t === 'NULL';
  }
  return isBlank(v);
};

// CH 6 CLEANING: Full pipeline (Dedupe + fix children + drop adr <= 0)
export function cleanData(rows) {
  // 1. Drop adr <= 0 (Slide 12 requirement)
  let cleaned = rows.filter(r => num(r.adr) > 0);
  // 2. Fix children NA -> 0
  cleaned = cleaned.map(r => {
    if (r.children === 'NA' || r.children === '' || r.children === undefined) {
      return { ...r, children: '0' };
    }
    return r;
  });
  // 3. Drop duplicates
  return dedupe(cleaned);
}

const PANDAS_NA_TOKENS = new Set([
  '', '#N/A', '#N/A N/A', '#NA', '-1.#IND', '-1.#QNAN', '-NaN', '-nan',
  '1.#IND', '1.#QNAN', '<NA>', 'N/A', 'NA', 'NULL', 'NaN', 'None',
  'n/a', 'nan', 'null',
]);

const normalizeForDedupe = (v) => {
  if (v === null || v === undefined) return '\u0000MISSING\u0000';
  const t = String(v).trim();
  if (PANDAS_NA_TOKENS.has(t)) return '\u0000MISSING\u0000';
  return t;
};

const DEDUPE_COLUMNS = [
  'hotel', 'is_canceled', 'lead_time', 'arrival_date_year', 'arrival_date_month',
  'arrival_date_week_number', 'arrival_date_day_of_month', 'stays_in_weekend_nights',
  'stays_in_week_nights', 'adults', 'children', 'babies', 'meal', 'country',
  'market_segment', 'distribution_channel', 'is_repeated_guest',
  'previous_cancellations', 'previous_bookings_not_canceled', 'reserved_room_type',
  'assigned_room_type', 'booking_changes', 'deposit_type', 'agent', 'company',
  'days_in_waiting_list', 'customer_type', 'adr', 'required_car_parking_spaces',
  'total_of_special_requests', 'reservation_status', 'reservation_status_date',
];

export const dedupeKey = (r) =>
  DEDUPE_COLUMNS.map((c) => normalizeForDedupe(r[c])).join('\u0001');

export function dedupe(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = dedupeKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export function computeKpis(rows) {
  let total = 0, canceled = 0, noShow = 0, roomNights = 0, revenue = 0;
  let adrSum = 0, leadSum = 0, specialSum = 0, repeated = 0;
  const leadTimes = [];

  for (const r of rows) {
    total++;
    const adr = num(r.adr);
    const nights = num(r.stays_in_weekend_nights) + num(r.stays_in_week_nights);
    if (num(r.is_canceled) === 1) canceled++;
    if (r.reservation_status === 'No-Show') noShow++;
    roomNights += nights;
    if (adr > 0) revenue += adr * nights;
    adrSum += adr;
    const lt = num(r.lead_time);
    leadSum += lt;
    leadTimes.push(lt);
    specialSum += num(r.total_of_special_requests);
    if (num(r.is_repeated_guest) === 1) repeated++;
  }

  leadTimes.sort((a, b) => a - b);
  const median = leadTimes.length
    ? leadTimes.length % 2
      ? leadTimes[(leadTimes.length - 1) / 2]
      : (leadTimes[leadTimes.length / 2 - 1] + leadTimes[leadTimes.length / 2]) / 2
    : 0;

  return {
    total, canceled, noShow, completed: total - canceled,
    cancellationRate: total ? canceled / total : 0,
    noShowRate: total ? noShow / total : 0,
    roomNights, revenue, adrMean: total ? adrSum / total : 0,
    leadTimeMean: total ? leadSum / total : 0,
    leadTimeMedian: median,
    specialRequestsPerBooking: total ? specialSum / total : 0,
    repeatedGuests: repeated, repeatedRate: total ? repeated / total : 0,
  };
}

export function groupBy(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

export function summariseBy(rows, keyFn, limit) {
  const groups = groupBy(rows, keyFn).map(([key, bucket]) => {
    const k = computeKpis(bucket);
    return {
      key, bookings: k.total, canceled: k.canceled,
      cancellationRate: k.cancellationRate, adrMean: k.adrMean, revenue: k.revenue,
    };
  });
  return limit ? groups.slice(0, limit) : groups;
}

export const RISK_WEIGHTS = {
  leadTime: 30, deposit: 25, previousCancellations: 15,
  marketSegment: 12, specialRequests: 10, customerType: 8,
};

export function scoreCancellationRisk(booking) {
  const reasons = [];
  let score = 0;
  const lt = num(booking.lead_time);
  let leadPoints = 0;
  if (lt > 180) { leadPoints = 30; reasons.push('Very long lead time (' + lt + 'd) - highest cancellation band'); }
  else if (lt > 90) { leadPoints = 22; reasons.push('Long lead time (' + lt + 'd)'); }
  else if (lt > 30) { leadPoints = 12; reasons.push('Moderate lead time (' + lt + 'd)'); }
  else { leadPoints = 4; }
  score += leadPoints;

  const dep = (booking.deposit_type || '').trim();
  let depPoints = 0;
  if (dep === 'Non Refund') { depPoints = 25; reasons.push('Non-refundable deposit - highest cancellation signal'); }
  else if (dep === 'Refundable') { depPoints = 12; reasons.push('Refundable deposit'); }
  else { depPoints = 6; }
  score += depPoints;

  const pc = num(booking.previous_cancellations);
  const pcPoints = Math.min(pc * 8, 15);
  if (pc > 0) reasons.push(pc + ' previous cancellation' + (pc > 1 ? 's' : '') + ' on record');
  score += pcPoints;

  const seg = (booking.market_segment || '').trim();
  const segPoints = { 'Online TA': 12, 'Offline TA/TO': 10, 'Groups': 11, 'Direct': 3, 'Corporate': 4, 'Complementary': 6, 'Aviation': 5 }[seg] || 5;
  if (seg === 'Online TA' || seg === 'Groups') reasons.push('High-risk segment: ' + seg);
  score += segPoints;

  const sr = num(booking.total_of_special_requests);
  const srPoints = Math.max(0, 10 - sr * 3);
  if (sr >= 2) reasons.push(sr + ' special requests - engaged guest, lower risk');
  score += srPoints;

  const ct = (booking.customer_type || '').trim();
  let ctPoints = 4;
  if (ct === 'Transient') ctPoints = 8;
  else if (ct === 'Transient-Party') ctPoints = 6;
  else if (ct === 'Contract') ctPoints = 4;
  else if (ct === 'Group') ctPoints = 5;
  score += ctPoints;

  const normalised = Math.round(Math.min(100, Math.max(0, score)));
  return { score: normalised, level: normalised >= 65 ? 'high' : normalised >= 40 ? 'medium' : 'low', reasons };
}

export function addRiskScores(rows) {
  return rows.map((r) => ({ ...r, risk: scoreCancellationRisk(r) }));
}

export function riskSummary(rows) {
  let high = 0, medium = 0, low = 0, revenueAtRisk = 0;
  for (const r of rows) {
    if (!r.risk) continue;
    if (r.risk.level === 'high') high++;
    else if (r.risk.level === 'medium') medium++;
    else low++;
    if (r.risk.level === 'high' && num(r.is_canceled) === 0) {
      const nights = num(r.stays_in_weekend_nights) + num(r.stays_in_week_nights);
      const adr = num(r.adr);
      if (adr > 0) revenueAtRisk += adr * nights;
    }
  }
  return { high, medium, low, total: rows.length, revenueAtRisk };
}