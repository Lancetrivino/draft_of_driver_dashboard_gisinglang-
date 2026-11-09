import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { colors, fmtDateTime, levelLabel } from "../theme";
import { computeSummary, suggestions, TIME_BUCKETS } from "../lib/summary";
import EarTrend from "../components/EarTrend";

// Incident summary with suggestions to prevent future incidents (panel
// revision, Panelist 3 item 4). Rules are in lib/summary.js.

const DAY_MS = 24 * 60 * 60 * 1000;
const TONE = { bad: colors.combined, warn: colors.warn, good: colors.good, info: colors.accent };

function Bars({ items, height = 90 }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="bars" style={{ height }}>
      {items.map((i) => (
        <div key={i.key} className="bar-col" title={`${i.label}: ${i.value}`}>
          <div className="bar-val small">{i.value || ""}</div>
          <div className="bar" style={{ height: `${(i.value / max) * (height - 34)}px`, background: i.color || colors.accent }} />
          <div className="bar-label small muted">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function SummaryScreen({ user }) {
  const [days, setDays] = useState(7);
  const [events, setEvents] = useState([]);
  const [ears, setEars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    const since = new Date(Date.now() - 2 * 30 * DAY_MS).toISOString(); // current + previous period
    Promise.all([
      supabase.from("drowsiness_events").select("alert_level, created_at").eq("user_id", user.id)
        .gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
      supabase.from("drowsiness_events").select("ear_value, created_at").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(40),
    ]).then(([evRes, earRes]) => {
      if (!active) return;
      if (evRes.error) setErrorMsg(evRes.error.message);
      else setEvents(evRes.data || []);
      if (!earRes.error) setEars((earRes.data || []).filter((e) => e.ear_value != null).reverse().map((e) => ({ value: Number(e.ear_value) })));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user.id]);

  const s = useMemo(() => computeSummary(events, days), [events, days]);
  const tips = useMemo(() => suggestions(s), [s]);

  if (loading) {
    return (
      <div className="screen center">
        <div className="spinner" />
      </div>
    );
  }

  const dayItems = s.perDay.map((d) => {
    const dt = new Date(d.date + "T00:00:00");
    const label = days <= 7 ? dt.toLocaleDateString(undefined, { weekday: "short" }) : String(dt.getDate());
    return { key: d.date, label, value: d.count };
  });
  const bucketItems = TIME_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label.split(" (")[0],
    value: s.byBucket[b.key],
    color: b.key === "night" ? colors.layer2 : colors.accent,
  }));

  return (
    <div className="screen">
      <div className="segmented" role="radiogroup" aria-label="Period" style={{ marginBottom: 14 }}>
        {[7, 30].map((d) => (
          <button key={d} className={days === d ? "seg active" : "seg"} onClick={() => setDays(d)}>
            Last {d} days
          </button>
        ))}
      </div>
      {errorMsg && <div className="banner error">{errorMsg}</div>}

      <div className="card">
        <div className="card-title">Suggestions</div>
        {tips.map((t, i) => (
          <div key={i} className="tip" style={{ borderLeftColor: TONE[t.tone] }}>
            {t.text}
          </div>
        ))}
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value">{s.total}</div>
          <div className="stat-label">Alerts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: s.byLevel.COMBINED ? colors.combined : undefined }}>{s.byLevel.COMBINED}</div>
          <div className="stat-label">Severe</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{s.clusters}</div>
          <div className="stat-label">Repeated</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Alerts per day</div>
        <Bars items={dayItems} />
      </div>

      <div className="card">
        <div className="card-title">Time of day</div>
        <Bars items={bucketItems} />
      </div>

      <div className="card">
        <div className="card-title">By type</div>
        {["LAYER1", "LAYER2", "COMBINED"].map((l) => (
          <div key={l} className="row">
            <span className="muted">{levelLabel(l)}</span>
            <span>{s.byLevel[l]}</span>
          </div>
        ))}
        <div className="row">
          <span className="muted">Riskiest day</span>
          <span>{s.riskiestDay || "—"}</span>
        </div>
        <div className="row">
          <span className="muted">Last alert</span>
          <span>{s.lastAlert ? fmtDateTime(s.lastAlert) : "—"}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Eye-openness trend (last {ears.length} readings)</div>
        <EarTrend data={ears} color={colors.accent} />
      </div>
    </div>
  );
}
