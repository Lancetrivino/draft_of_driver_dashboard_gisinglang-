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
    <div className="card">
      <div className="card-title">Device</div>
      <div className="row">
        <span className="muted">Unit</span>
        <span>{device.unit_label}</span>
      </div>
      <div className="row">
        <span className="muted">Detection</span>
        <span className={`pill ${st.cls}`}>{st.label}</span>
      </div>
      <div className="row">
        <span className="muted">Last seen</span>
        <span>{fmtDateTime(device.last_seen_at)}</span>
      </div>

      <div className="control-label">Start mode</div>
      <div className="segmented" role="radiogroup" aria-label="Start mode">
        <button
          className={mode === "auto" ? "seg active" : "seg"}
          disabled={busy}
          onClick={() => mode !== "auto" && control({ p_start_mode: "auto" })}
        >
          Auto
        </button>
        <button
          className={mode === "manual" ? "seg active" : "seg"}
          disabled={busy}
          onClick={() => mode !== "manual" && control({ p_start_mode: "manual" })}
        >
          Manual
        </button>
      </div>
      <div className="small muted">
        {mode === "auto"
          ? "Detection starts by itself when the car (device) is switched on."
          : "Detection waits until you press Start below."}
      </div>

      <button
        className={running ? "control-btn stop" : "control-btn start"}
        disabled={busy}
        onClick={() => control({ p_desired_state: running ? "stopped" : "running" })}
      >
        {busy ? "Sending…" : running ? "■ Stop detection" : "▶ Start detection"}
      </button>
      {offline && (
        <div className="small muted">
          The device is offline. Your choice is saved and applied when it connects. Without internet the device uses
          the last saved mode, so alerts still work.
        </div>
      )}
      {msg && <div className="error-text">{msg}</div>}
    </div>
  );
}
