import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

// Shares the phone's location with Supabase while the app is open, so the
// emergency SMS can include a map link when the Pi has no GPS fix (panel
// revision: "notifications must include the driver's location").
//
// A web app cannot track location in the background: phones pause it when the
// app is closed or the screen is off. The database therefore only uses a phone
// location that is less than 30 minutes old, and the SMS labels an older one as
// "last known". The GPS module on the Pi, when fitted, is used first.

const PREF_KEY = "gisinglang_share_location";
const MIN_INTERVAL_MS = 60 * 1000;   // send at most once a minute...
const MIN_MOVE_M = 100;              // ...unless the phone moved this far

function distanceM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function readPref() {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export default function useLocationSharing(signedIn) {
  const [enabled, setEnabledState] = useState(readPref);
  const [status, setStatus] = useState("idle"); // idle | waiting | sharing | denied | unsupported | error
  const [lastSent, setLastSent] = useState(null);
  const [error, setError] = useState("");
  const last = useRef(null);

  function setEnabled(on) {
    try {
      localStorage.setItem(PREF_KEY, on ? "on" : "off");
    } catch {
      /* private mode: keep in memory only */
    }
    setEnabledState(on);
  }

  useEffect(() => {
    if (!signedIn || !enabled) {
      setStatus("idle");
      return undefined;
    }
    if (!("geolocation" in navigator)) {
      setStatus("unsupported");
      return undefined;
    }
    setStatus("waiting");
    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const now = Date.now();
        const prev = last.current;
        if (prev && now - prev.t < MIN_INTERVAL_MS && distanceM(prev, here) < MIN_MOVE_M) return;
        last.current = { ...here, t: now };
        const { error: rpcError } = await supabase.rpc("update_phone_location", {
          p_lat: here.lat,
          p_lng: here.lng,
          p_accuracy: pos.coords.accuracy ?? null,
        });
        if (rpcError) {
          setStatus("error");
          setError(rpcError.message);
        } else {
          setStatus("sharing");
          setError("");
          setLastSent(new Date(now));
        }
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
        setError(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [signedIn, enabled]);

  return { enabled, setEnabled, status, lastSent, error };
}
