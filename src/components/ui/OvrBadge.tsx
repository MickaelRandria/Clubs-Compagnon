/** Badge OVR à 4 paliers. */
export function OvrBadge({ ovr }: { ovr: number }) {
  const tier = ovr >= 88 ? ' fc-ovr--elite' : ovr >= 86 ? ' fc-ovr--high' : ovr >= 83 ? ' fc-ovr--good' : '';
  return <span className={`fc-ovr${tier}`}>{ovr}</span>;
}
