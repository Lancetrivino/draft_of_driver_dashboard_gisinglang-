// Incident summary and prevention suggestions (panel revision, Panelist 3).
// Pure functions so the rules can be tested without the app.

export const TIME_BUCKETS = [
  { key: "morning", label: "Morning (5 AM–11 AM)", from: 5, to: 11 },
  { key: "afternoon", label: "Afternoon (11 AM–5 PM)", from: 11, to: 17 },
  { key: "evening", label: "Evening (5 PM–10 PM)", from: 17, to: 22 },
  { key: "night", label: "Night (10 PM–5 AM)", from: 22, to: 5 },
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_MS = 24 * 60 * 60 * 1000;
export const CLUSTER_WINDOW_MS = 30 * 60 * 1000; // 3+ alerts within 30 minutes
export const CLUSTER_SIZE = 3;

function bucketOf(date) {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Counts "clusters": runs where CLUSTER_SIZE alerts fall within CLUSTER_WINDOW_MS. */
export function countClusters(times) {
  const t = [...times].sort((a, b) => a - b);
  let clusters = 0;
  let i = 0;
  while (i < t.length) {
    let j = i;
    while (j + 1 < t.length && t[j + 1] - t[i] <= CLUSTER_WINDOW_MS) j++;
    if (j - i + 1 >= CLUSTER_SIZE) {
      clusters++;
      i = j + 1;
    } else {
      i++;
    }
  }
  return clusters;
}

/**
 * events: [{alert_level, created_at}] (any order). Returns counts for the last
 * `days` days ending at `now`, plus the previous period for the trend.
 */
export function computeSummary(events, days = 7, now = new Date()) {
  const end = now.getTime();
  const start = end - days * DAY_MS;
  const prevStart = start - days * DAY_MS;
  const alerts = events
    .filter((e) => e.alert_level && e.alert_level !== "NONE")
    .map((e) => ({ level: e.alert_level, t: new Date(e.created_at) }))
    .filter((e) => !Number.isNaN(e.t.getTime()));

  const current = alerts.filter((e) => e.t.getTime() > start && e.t.getTime() <= end);
  const previous = alerts.filter((e) => e.t.getTime() > prevStart && e.t.getTime() <= start);

  const byLevel = { LAYER1: 0, LAYER2: 0, COMBINED: 0 };
  const byBucket = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const byWeekday = Array(7).fill(0);
  const perDay = {};
  for (let d = days - 1; d >= 0; d--) perDay[dayKey(new Date(end - d * DAY_MS))] = 0;

  for (const e of current) {
    if (byLevel[e.level] !== undefined) byLevel[e.level]++;
    byBucket[bucketOf(e.t)]++;
    byWeekday[e.t.getDay()]++;
    const k = dayKey(e.t);
    if (perDay[k] !== undefined) perDay[k]++;
  }

  const total = current.length;
  let riskiestDay = null;
  const maxDay = Math.max(...byWeekday);
  if (total > 0 && maxDay > 0) riskiestDay = WEEKDAYS[byWeekday.indexOf(maxDay)];
  let topBucket = null;
  for (const b of TIME_BUCKETS) if (!topBucket || byBucket[b.key] > byBucket[topBucket]) topBucket = b.key;

  return {
    days,
    total,
    previousTotal: previous.length,
    byLevel,
    byBucket,
    topBucket: total > 0 ? topBucket : null,
    riskiestDay,
    clusters: countClusters(current.map((e) => e.t.getTime())),
    perDay: Object.entries(perDay).map(([date, count]) => ({ date, count })),
    lastAlert: current.length ? new Date(Math.max(...current.map((e) => e.t.getTime()))) : null,
  };
}

/** Rule-based suggestions, most important first. */
export function suggestions(s) {
  const out = [];
  if (s.total === 0) {
    out.push({
      tone: "good",
      text: `No drowsiness alerts in the last ${s.days} days. Keep getting enough sleep before you drive.`,
    });
    return out;
  }
  if (s.byLevel.COMBINED > 0) {
    out.push({
      tone: "bad",
      text: `${s.byLevel.COMBINED} severe alert${s.byLevel.COMBINED > 1 ? "s" : ""} (eyes and head together at the same time). These are the most serious — avoid driving alone when you already feel tired.`,
    });
  }
  if (s.clusters > 0) {
    out.push({
      tone: "bad",
      text: `${s.clusters} time${s.clusters > 1 ? "s" : ""} you had ${CLUSTER_SIZE} or more alerts within 30 minutes. When alerts repeat, stop somewhere safe and rest for 15–20 minutes before continuing.`,
    });
  }
  const nightShare = s.byBucket.night / s.total;
  if (s.total >= 3 && nightShare >= 0.4) {
    out.push({
      tone: "warn",
      text: `${Math.round(nightShare * 100)}% of your alerts happened between 10 PM and 5 AM. Avoid long drives late at night, or plan a rest stop before leaving.`,
    });
  } else if (s.total >= 3 && s.topBucket && s.byBucket[s.topBucket] / s.total >= 0.5) {
    const label = TIME_BUCKETS.find((b) => b.key === s.topBucket).label.split(" (")[0].toLowerCase();
    out.push({
      tone: "warn",
      text: `Most of your alerts happen in the ${label}. Take a short break or a light snack before driving at that time.`,
    });
  }
  if (s.previousTotal > 0 && s.total > s.previousTotal) {
    out.push({
      tone: "warn",
      text: `Alerts went up from ${s.previousTotal} to ${s.total} compared with the previous ${s.days} days. Check how much sleep you get before trips.`,
    });
  } else if (s.previousTotal > s.total) {
    out.push({
      tone: "good",
      text: `Alerts went down from ${s.previousTotal} to ${s.total} compared with the previous ${s.days} days. Keep it up.`,
    });
  }
  if (s.riskiestDay && s.total >= 3) {
    out.push({ tone: "info", text: `${s.riskiestDay} had the most alerts. Plan lighter driving or more rest on that day.` });
  }
  return out;
}
