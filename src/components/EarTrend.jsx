// SVG sparkline. Self-scales to the data's own min/max rather than a fixed
// 0-1 EAR range, since a driver's resting EAR (post-calibration) can sit
// anywhere and a fixed axis would flatten the line to nothing.
export default function EarTrend({ data, width = 320, height = 64, color = "#3fb8ff" }) {
  if (!data || data.length < 2) {
    return (
      <div className="trend-empty" style={{ height }}>
        Not enough data yet
      </div>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padY = 6;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = padY + (1 - (d.value - min) / span) * (height - padY * 2);
    return [x, y];
  });

  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = `${path} L${width},${height} L0,${height} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="EAR trend">
      <path d={areaPath} fill={color} opacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}
