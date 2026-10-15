export const colors = {
  bg: "#0b0f14",
  panel: "#131a22",
  panelAlt: "#1a232e",
  line: "#233040",
  text: "#e8edf3",
  muted: "#8697a8",
  accent: "#3fb8ff",
  none: "#3a4a5a",
  layer1: "#f2a93c",
  layer2: "#8a6bf0",
  combined: "#ef4444",
  good: "#2fbf71",
  warn: "#f2a93c",
};

export function levelColor(level) {
  switch (level) {
    case "LAYER1":
      return colors.layer1;
    case "LAYER2":
      return colors.layer2;
    case "COMBINED":
      return colors.combined;
    default:
      return colors.none;
  }
}

export function levelLabel(level) {
  switch (level) {
    case "LAYER1":
      return "Eye closure";
    case "LAYER2":
      return "Head droop";
    case "COMBINED":
      return "Combined";
    default:
      return "Normal";
  }
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtNum(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toFixed(digits);
}

// Philippine mobile numbers, normalized to 09xxxxxxxxx. The SMS gateway
// (Semaphore) silently fails to deliver anything else, so this is validated
// client-side before the row is ever written.
export function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("09")) return digits;
  if (digits.length === 12 && digits.startsWith("639")) return "0" + digits.slice(2);
  if (digits.length === 10 && digits.startsWith("9")) return "0" + digits;
  return null;
}
