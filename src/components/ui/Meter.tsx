/** Jauge horizontale à bout biseauté (0–100 %). */
export function Meter({ pct }: { pct: number }) {
  return (
    <span className="fc-meter">
      <i style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
    </span>
  );
}
