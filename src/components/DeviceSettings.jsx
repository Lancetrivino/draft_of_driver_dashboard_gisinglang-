import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Start mode plus the adjustable alert strength (panel revision, Lead
// Panelist item 9). The Pi's start-mode agent reads the levels from Supabase
// within about 20 seconds; the severe (combined) alert always uses full strength.

const LEVELS = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
];

const VIB_HELP = {
  low: "Gentle pulses (about 40% power).",
  medium: "Medium pulses (about 70% power).",
  high: "Strongest pulses (full power).",
};
const SOUND_HELP = {
  low: "One short beep.",
  medium: "One half-second beep.",
  high: "Three quick beeps.",
};

function Segmented({ value, onPick, disabled, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {LEVELS.map((l) => (
        <button
          key={l.key}
          className={value === l.key ? "seg active" : "seg"}
          disabled={disabled}
          onClick={() => value !== l.key && onPick(l.key)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export default function DeviceSettings({ device, onChange }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [dev, setDev] = useState(device);

  useEffect(() => setDev(device), [device]);

  if (!dev) return null;

  async function call(fn, args) {
    setBusy(true);
    setMsg("");
    const { data, error } = await supabase.rpc(fn, args);
    setBusy(false);
    if (error) {
      setMsg(
        /function|schema cache/i.test(error.message)
          ? "This setting needs the latest database update. Ask your administrator to run the migration."
          : error.message,
      );
      return;
    }
    if (data) {
      setDev(data);
      onChange?.(data);
    }
  }

  const mode = dev.start_mode || "auto";
  const vib = dev.vibration_level || "high";
  const sound = dev.buzzer_level || "medium";

  return (
    <div className="card">
      <button className="collapse-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="card-title" style={{ margin: 0 }}>Device settings</span>
        <span className="muted small">{open ? "Hide ▴" : `${mode === "auto" ? "Auto" : "Manual"} · ${vib} vibration ▾`}</span>
      </button>
      {open && (
        <>
          <div className="control-label">Start mode</div>
          <div className="segmented" role="radiogroup" aria-label="Start mode">
            <button className={mode === "auto" ? "seg active" : "seg"} disabled={busy}
              onClick={() => mode !== "auto" && call("set_device_control", { p_start_mode: "auto" })}>Auto</button>
            <button className={mode === "manual" ? "seg active" : "seg"} disabled={busy}
              onClick={() => mode !== "manual" && call("set_device_control", { p_start_mode: "manual" })}>Manual</button>
          </div>
          <div className="small muted">
            {mode === "auto"
              ? "Detection starts by itself when the car (device) is switched on."
              : "Detection waits until you press Start on the Home screen."}
          </div>

          <div className="control-label">Vibration strength</div>
          <Segmented value={vib} label="Vibration strength" disabled={busy}
            onPick={(v) => call("set_alert_levels", { p_vibration: v })} />
          <div className="small muted">{VIB_HELP[vib]}</div>

          <div className="control-label">Sound alert</div>
          <Segmented value={sound} label="Sound alert" disabled={busy}
            onPick={(v) => call("set_alert_levels", { p_buzzer: v })} />
          <div className="small muted">{SOUND_HELP[sound]}</div>

          <div className="small muted" style={{ marginTop: 8 }}>
            Changes reach the device within about 20 seconds. A severe alert (eyes and head together) always uses
            full vibration and a long beep.
          </div>
          {msg && <div className="error-text">{msg}</div>}
        </>
      )}
    </div>
  );
}
