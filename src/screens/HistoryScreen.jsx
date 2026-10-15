import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { levelColor, levelLabel, fmtDateTime, fmtNum } from "../theme";

const PAGE_LIMIT = 300;

export default function HistoryScreen() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function load() {
    setErrorMsg("");
    const { data, error } = await supabase
      .from("drowsiness_events")
      .select("id, alert_level, ear_value, perclos_value, device_id, sms_sent, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT);
    if (error) setErrorMsg(error.message);
    else setEvents(data || []);
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

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
      {events.length === 0 && !errorMsg && (
        <div className="muted" style={{ padding: 24, textAlign: "center" }}>
          No events yet.
        </div>
      )}
      <div className="event-list">
        {events.map((e) => (
          <div key={e.id} className="event-row" style={{ borderLeftColor: levelColor(e.alert_level) }}>
            <div className="event-row-top">
              <span
                className="pill"
                style={{ background: levelColor(e.alert_level) + "33", color: levelColor(e.alert_level) }}
              >
                {levelLabel(e.alert_level)}
              </span>
              <span className="muted small">{fmtDateTime(e.created_at)}</span>
            </div>
            <div className="event-row-bottom muted small">
              EAR {fmtNum(e.ear_value, 3)} · Eye-closure{" "}
              {e.perclos_value !== null && e.perclos_value !== undefined
                ? `${fmtNum(e.perclos_value * 100, 0)}%`
                : "—"}{" "}
              · {e.device_id}
              {e.sms_sent && <span className="sms-tag"> · SMS sent</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
