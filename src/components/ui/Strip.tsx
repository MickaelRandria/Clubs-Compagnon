export type StripOption<T extends string> = readonly [value: T, label: string, count?: number];

/** Bande de filtres — même objet que la barre d'onglets. */
export function Strip<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<StripOption<T>>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="fc-control">
      <span className="fc-kicker">{label}</span>
      <div className="fc-tabs fc-tabs--sm" role="group" aria-label={label}>
        {options.map(([v, l, count]) => (
          <button key={v} type="button" className="fc-tab" aria-pressed={value === v} onClick={() => onChange(v)}>
            {l}
            {count !== undefined && <span className="fc-tab-count">{count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
