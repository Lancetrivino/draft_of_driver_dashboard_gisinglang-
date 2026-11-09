import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { fmtDateTime } from "../theme";

// The Pi agent reports a heartbeat every 15 s; older than this = offline.
const ONLINE_WINDOW_MS = 45 * 1000;
const POLL_MS = 5000;

function statusOf(device) {
  const seen = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
  if (!seen || Date.now() - seen > ONLINE_WINDOW_MS) return { label: "Offline", cls: "pill-off" };
  if (device.run_state === "running") return { label: "Detecting", cls: "pill-good" };
  if (device.run_state === "starting") return { label: "Starting…", cls: "pill-warn" };
  return { label: "Stopped", cls: "pill-warn" };
}

export default function DeviceControl({ device: initial }) {
  const [device, setDevice] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => setDevice(initial), [initial]);

  // Poll the device row so the status follows what the Pi reports.
  useEffect(() => {
    if (!initial) return undefined;
    const id = setInterval(async () => {
      const { data } = await supabase.from("devices").select("*").eq("device_id", initial.device_id).maybeSingle();
      if (data) setDevice(data);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [initial]);

  async function control(fields) {
    setBusy(true);
    setMsg("");
    const { data, error } = await supabase.rpc("set_device_control", fields);
    setBusy(false);
    if (error) setMsg(error.message);
    else if (data) setDevice(data);
  }

  if (!device) {
    return (
      <div className="card">
        <div className="card-title">Device</div>
        <div className="muted">No device is registered to your account yet. Ask your administrator to assign one.</div>
      </div>
    );
  }

  const st = statusOf(device);
  const offline = st.label === "Offline";
  const running = device.desired_state === "running";
  const mode = device.start_mode || "auto";

  return (
    <div className="card status-card">
      <div className="status-top">
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>GisingLang device</div>
          <div className="muted small">
            {device.unit_label} · last seen {fmtDateTime(device.last_seen_at)}
          </div>
        </div>
        <span className={`pill big ${st.cls}`}>{st.label}</span>
      </div>

      <button
        className={running ? "control-btn stop" : "control-btn start"}
        disabled={busy}
        onClick={() => control({ p_desired_state: running ? "stopped" : "running" })}
      >
        {busy ? "Sending…" : running ? "■ Stop detection" : "▶ Start detection"}
      </button>
      <div className="small muted">
        {mode === "auto" ? "Auto start is on. " : ""}
        After detection starts, put the phone down and look at the road: one beep = calibrating, two beeps = ready.
      </div>
      {offline && (
        <div className="small muted" style={{ marginTop: 6 }}>
          The device is offline. Your choice is saved and applied when it connects; without internet the device starts
          detection by itself, so alerts still work.
        </div>
      )}
      {msg && <div className="error-text">{msg}</div>}
    </div>
  );
}
