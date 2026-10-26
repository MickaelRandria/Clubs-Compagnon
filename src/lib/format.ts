export const frNum = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',');

export const pad2 = (n: number) => String(n).padStart(2, '0');

export const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`;

const dayDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * « il y a 12 min », « il y a 5h », puis « hier » et enfin la date (« dim. 19 oct. »).
 * Au-delà d'une journée, « il y a 63h » obligeait à compter : une date se lit d'un coup d'œil.
 */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // Arrondi : un jour de changement d'heure dure 23 ou 25 h.
  if (Math.round((day(new Date(now)) - day(new Date(iso))) / 86_400_000) === 1) return 'hier';
  return dayDate.format(new Date(iso));
}

const matchDate = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

const shortDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** « dim. 25 oct., 12:04 » */
export const formatShortDate = (iso: string) => shortDate.format(new Date(iso));

/** « mardi 16 septembre à 09:12 » */
export const formatMatchDate = (iso: string) => matchDate.format(new Date(iso));

/** Moyenne des valeurs non nulles, ou null s'il n'y en a aucune. */
export function average(values: Array<number | null>) {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((s, v) => s + v, 0) / known.length : null;
}
