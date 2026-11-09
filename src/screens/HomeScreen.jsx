import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { colors, fmtDateTime, levelColor, levelLabel } from "../theme";
import DeviceControl from "../components/DeviceControl";
import DeviceSettings from "../components/DeviceSettings";

// Home shows only what a driver needs before a trip (panel revision,
// Panelist 2): device status with one Start/Stop button, today's alerts,
// whether emergency contacts and location are ready. Charts and details are on
// the Summary and History tabs.

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const LOCATION_TEXT = {
  sharing: "On while this app is open",
  waiting: "Waiting for the phone's location…",
  denied: "Blocked — allow location for this app in the phone's settings",
  unsupported: "Not available on this phone",
  error: "Could not share location",
  idle: "Off",
};

export default function HomeScreen({ user, location, onOpen }) {
  const [loading, setLoading] = useState(true);
  const [device, setDevice] = useState(null);
  const [today, setToday] = useState([]);
  const [contacts, setContacts] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    setErrorMsg("");
    const [deviceRes, todayRes, contactRes] = await Promise.all([
      supabase.from("devices").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("drowsiness_events")
        .select("id, alert_level, created_at")
        .eq("user_id", user.id)
        .neq("alert_level", "NONE")
        .gte("created_at", startOfToday().toISOString())
        .order("created_at", { ascending: false }),
      supabase
        .from("emergency_contacts")
        .select("contact_id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_active", true),
    ]);
    if (deviceRes.error) setErrorMsg(deviceRes.error.message);
    else setDevice(deviceRes.data);
    if (todayRes.error) setErrorMsg((m) => m || todayRes.error.message);
    else setToday(todayRes.data || []);
    if (!contactRes.error) setContacts(contactRes.count || 0);
  }, [user.id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <div className="screen center">
        <div className="spinner" />
      </div>
    );
  }

  const severe = today.filter((e) => e.alert_level === "COMBINED").length;
  const latest = today[0];

  return (
    <div className="screen">
      {errorMsg && <div className="banner error">{errorMsg}</div>}
      {device && contacts === 0 && (
        <button className="banner warn banner-btn" onClick={() => onOpen("contacts")}>
          No emergency contacts yet — nobody will get an SMS on a severe alert. Tap to add one.
        </button>
      )}

      <DeviceControl device={device} />

      <div className="card">
        <div className="card-title">Today</div>
        <div className="stat-row" style={{ marginBottom: 6 }}>
          <div className="stat-card">
            <div className="stat-value">{today.length}</div>
            <div className="stat-label">Alerts</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: severe ? colors.combined : undefined }}>{severe}</div>
            <div className="stat-label">Severe</div>
          </div>
        </div>
        <div className="row">
          <span className="muted">Last alert</span>
          {latest ? (
            <span>
              <span className="pill" style={{ background: levelColor(latest.alert_level) + "33", color: levelColor(latest.alert_level) }}>
                {levelLabel(latest.alert_level)}
              </span>{" "}
              {fmtDateTime(latest.created_at)}
            </span>
          ) : (
            <span>None today</span>
          )}
        </div>
        <button className="link-btn" onClick={() => onOpen("summary")}>See summary and tips →</button>
      </div>

      <div className="card">
        <div className="card-title">Safety network</div>
        <div className="row">
          <span className="muted">Emergency contacts</span>
          <span>{contacts > 0 ? `${contacts} will get an SMS` : "None"}</span>
        </div>
        <div className="row">
          <span className="muted">Location in SMS</span>
          <label className="switch">
            <input type="checkbox" checked={location.enabled} onChange={(e) => location.setEnabled(e.target.checked)} />
            <span>{location.enabled ? "On" : "Off"}</span>
          </label>
        </div>
        <div className="small muted">
          {LOCATION_TEXT[location.status] || ""}
          {location.lastSent ? ` · sent ${fmtDateTime(location.lastSent)}` : ""}. Keep this app open during the trip so
          the SMS can include your location; the device's GPS is used first when fitted.
        </div>
      </div>

      <DeviceSettings device={device} onChange={setDevice} />

      <button className="signout-btn" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </div>
  );
}
