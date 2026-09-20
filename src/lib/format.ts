export const frNum = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',');

export const pad2 = (n: number) => String(n).padStart(2, '0');

export const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

/** « il y a 12 min », « il y a 5h » (jusqu'à 72 h), puis « il y a 4 j ». */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 72) return `il y a ${hours}h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

const matchDate = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/** « mardi 16 septembre à 09:12 » */
export const formatMatchDate = (iso: string) => matchDate.format(new Date(iso));

/** Moyenne des valeurs non nulles, ou null s'il n'y en a aucune. */
export function average(values: Array<number | null>) {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((s, v) => s + v, 0) / known.length : null;
}
