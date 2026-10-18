import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { colors, levelColor, levelLabel, fmtDateTime, fmtNum } from "../theme";
import EarTrend from "../components/EarTrend";
import DeviceControl from "../components/DeviceControl";

const DAY_MS = 24 * 60 * 60 * 1000;

export default function HomeScreen({ user }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [device, setDevice] = useState(null);
  const [events24h, setEvents24h] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setErrorMsg("");
    const since = new Date(Date.now() - DAY_MS).toISOString();

    const [deviceRes, events24hRes, recentRes] = await Promise.all([
      supabase.from("devices").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("drowsiness_events")
        .select("id, alert_level, created_at")
        .eq("user_id", user.id)
        .gte("created_at", since),
      supabase
        .from("drowsiness_events")
        .select("id, alert_level, ear_value, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

    if (deviceRes.error) setErrorMsg(deviceRes.error.message);
    else setDevice(deviceRes.data);

    if (events24hRes.error) setErrorMsg((m) => m || events24hRes.error.message);
    else setEvents24h(events24hRes.data || []);

    if (recentRes.error) setErrorMsg((m) => m || recentRes.error.message);
    else setRecentEvents(recentRes.data || []);
  }, [user.id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const severeCount = events24h.filter((e) => e.alert_level === "COMBINED").length;
  const alertCount = events24h.filter((e) => e.alert_level !== "NONE").length;

  const trendData = [...recentEvents]
    .filter((e) => e.ear_value !== null && e.ear_value !== undefined)
    .reverse()
    .map((e) => ({ value: Number(e.ear_value) }));

  const latest = recentEvents[0];

  if (loading) {
    return (
      <div className="screen center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="pull-refresh">
        <button className="refresh-btn" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "⟳ Refresh"}
        </button>
      </div>

      {errorMsg && <div className="banner error">{errorMsg}</div>}

      <DeviceControl device={device} />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-value">{alertCount}</div>
          <div className="stat-label">Alerts, 24h</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: colors.combined }}>
            {severeCount}
          </div>
          <div className="stat-label">Severe, 24h</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Eye-openness trend (last {trendData.length} readings)</div>
        <EarTrend data={trendData} color={colors.accent} />
      </div>

      {latest && (
        <div className="card">
          <div className="card-title">Latest reading</div>
          <div className="row">
            <span className="muted">Level</span>
            <span
              className="pill"
              style={{ background: levelColor(latest.alert_level) + "33", color: levelColor(latest.alert_level) }}
            >
              {levelLabel(latest.alert_level)}
            </span>
          </div>
          <div className="row">
            <span className="muted">EAR</span>
            <span>{fmtNum(latest.ear_value, 3)}</span>
          </div>
          <div className="row">
            <span className="muted">When</span>
            <span>{fmtDateTime(latest.created_at)}</span>
          </div>
        </div>
      )}

      <button className="signout-btn" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </div>
  );
}
