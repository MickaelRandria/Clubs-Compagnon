// Portraits des joueurs : détourés, contour blanc façon sticker, grain (public/joueurs/<pseudo>.webp, 420 px).
// Un joueur sans portrait garde ses initiales sur sa couleur.

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const WITH_PHOTO = new Set(['naaks-75', 'chef695046', 'rina94jjg', 'desparte971', 'willourkt', 'vrymika', 'beeruus-sama']);

/** Photos envoyées depuis l'app (pseudo → URL versionnée) : elles priment sur les portraits fournis. */
let uploaded: Record<string, string> = {};
export const setUploadedPhotos = (map: Record<string, string>) => { uploaded = map; };

/** Le portrait d'un joueur (pseudo EA ou nom affiché), ou null. */
export const photoOf = (name: string) => uploaded[name] ?? (WITH_PHOTO.has(slug(name)) ? `/joueurs/${slug(name)}.webp` : null);

const COLORS = ['#7C8CFF', '#3DDC97', '#FF8FB1', '#C9A7FF', '#FFB547', '#6FC8FF', '#F2F4F8', '#FFD36E'];

/** La couleur d'un joueur, stable d'une soirée à l'autre. */
export const colorOf = (name: string) => COLORS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COLORS.length];

export const initials = (name: string) => name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '?';
