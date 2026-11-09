import { useState } from "react";

// In-app help module (panel revision, Lead Panelist item 5).

const SECTIONS = [
  {
    title: "Installing the device",
    body: [
      "Place the GisingLang unit on the dashboard in front of you. Aim the camera on its arm at your face so both eyes are visible, about 40–80 cm away.",
      "Plug the USB car adapter into the 12 V socket and connect it to the unit.",
      "Clip the two vibration pads onto your seatbelt, one at the shoulder and one at the chest. Route the thin wires along the seatbelt and seat edge.",
      "Always wear the seatbelt — the vibration only reaches you through it.",
    ],
  },
  {
    title: "Connecting to your phone",
    body: [
      "Turn on your phone's mobile hotspot. The unit joins it automatically and uses it to send alerts to the cloud.",
      "Open this app, tap Add to Home Screen, and sign in with your driver account.",
      "Your administrator links the unit to your account once. After that, the Home screen shows the device status.",
      "Keep the app open during the trip if you want your location included in the emergency SMS.",
    ],
  },
  {
    title: "Starting a trip and the beeps",
    body: [
      "Auto start: detection starts by itself when the car (unit) is switched on. Manual start: press Start detection on the Home screen.",
      "1 beep: calibration has started — sit normally and look at the road with your eyes open.",
      "2 beeps: calibration is done and GisingLang is watching.",
      "3 beeps: your head moved during calibration, so it starts again. Hold still.",
    ],
  },
  {
    title: "What the alerts mean",
    body: [
      "Buzzer (eye closure): your eyes stayed closed for at least one second.",
      "Seatbelt vibration (head droop): your head dropped or tilted for more than about a second. Checking the mirrors does not trigger it.",
      "Buzzer and vibration together (severe): both signs at once. Your emergency contacts receive an SMS with your location (at most one SMS every 3 minutes).",
      "When you get an alert, stop somewhere safe and rest. Alerts are a warning, not a cure for fatigue.",
    ],
  },
  {
    title: "Changing alert strength",
    body: [
      "Home → Device settings → Vibration strength and Sound alert. Choose Low, Medium or High.",
      "Press Test vibration or Test sound to feel or hear the level right away (the unit must be online).",
      "The unit applies the change within a few seconds. A severe alert always uses full strength.",
    ],
  },
  {
    title: "Emergency contacts",
    body: [
      "Add family members in the Contacts tab with a Philippine mobile number.",
      "The SMS currently reaches Globe and DITO numbers. Smart, TNT and Sun need a registered sender name.",
    ],
  },
  {
    title: "Troubleshooting",
    body: [
      "Device shows Offline: check that the hotspot is on and the unit has power. Alerts still work without internet; events upload later.",
      "No beeps at start: check the power cable and wait up to a minute after switching on.",
      "Too many alerts while looking at the phone or dashboard: looking down can look like closed eyes — keep your eyes on the road.",
      "Dark sunglasses block the camera. Use clear glasses or none.",
      "Location in SMS missing: allow location for this app and keep it open, or ask for the GPS module to be fitted.",
    ],
  },
];

export default function HelpScreen({ onClose }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="screen">
      <div className="help-head">
        <div className="card-title" style={{ margin: 0 }}>Help</div>
        <button className="refresh-btn" onClick={onClose}>Close</button>
      </div>
      {SECTIONS.map((s, i) => (
        <div key={s.title} className="card">
          <button className="collapse-head" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
            <span style={{ fontWeight: 600 }}>{s.title}</span>
            <span className="muted">{open === i ? "▴" : "▾"}</span>
          </button>
          {open === i && (
            <ul className="help-list">
              {s.body.map((b, j) => (
                <li key={j}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
