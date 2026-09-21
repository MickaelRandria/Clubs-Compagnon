import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TOUR_STEPS } from '../src/lib/tour.js';
import { placeBubble } from '../src/components/tour/useSpotlight.js';

const VIEW = { width: 1440, height: 900 };
const BUBBLE = { width: 360, height: 220 };
const EDGE = 12;

const inside = (p: { top: number; left: number }) =>
  p.left >= EDGE && p.top >= EDGE
  && p.left + BUBBLE.width <= VIEW.width - EDGE + 1
  && p.top + BUBBLE.height <= VIEW.height - EDGE + 1;

test('sans cible, la bulle est centrée', () => {
  const place = placeBubble(null, BUBBLE, 'bottom', VIEW);
  assert.equal(place.side, 'center');
  assert.equal(place.left, (VIEW.width - BUBBLE.width) / 2);
  assert.ok(inside(place));
});

test('la bulle prend le côté demandé quand la place existe', () => {
  const rect = { top: 300, left: 600, width: 200, height: 80 };
  assert.equal(placeBubble(rect, BUBBLE, 'bottom', VIEW).side, 'bottom');
  assert.equal(placeBubble(rect, BUBBLE, 'top', VIEW).side, 'top');
  assert.equal(placeBubble(rect, BUBBLE, 'left', VIEW).side, 'left');
  assert.equal(placeBubble(rect, BUBBLE, 'right', VIEW).side, 'right');
});

test('la bulle bascule de côté quand la place manque', () => {
  // Cible collée en haut : « top » est impossible, il reste « bottom ».
  const haut = { top: 4, left: 600, width: 200, height: 60 };
  assert.equal(placeBubble(haut, BUBBLE, 'top', VIEW).side, 'bottom');
  // Cible collée à gauche : « left » est impossible.
  const gauche = { top: 400, left: 0, width: 120, height: 60 };
  assert.notEqual(placeBubble(gauche, BUBBLE, 'left', VIEW).side, 'left');
});

test('la bulle reste dans la fenêtre, même sur une cible dans un coin', () => {
  const corners = [
    { top: 0, left: 0, width: 80, height: 40 },
    { top: 0, left: VIEW.width - 80, width: 80, height: 40 },
    { top: VIEW.height - 40, left: 0, width: 80, height: 40 },
    { top: VIEW.height - 40, left: VIEW.width - 80, width: 80, height: 40 },
  ];
  for (const rect of corners) {
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      const place = placeBubble(rect, BUBBLE, side, VIEW);
      assert.ok(inside(place), `Bulle hors de la fenêtre pour ${JSON.stringify(rect)} côté ${side}.`);
    }
  }
});

test('une cible plus grande que la fenêtre ne fait pas sortir la bulle', () => {
  const huge = { top: -200, left: -100, width: VIEW.width + 400, height: VIEW.height + 400 };
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    assert.ok(inside(placeBubble(huge, BUBBLE, side, VIEW)));
  }
});

test('les étapes du guide sont cohérentes', () => {
  const ids = TOUR_STEPS.map((step) => step.id);
  assert.equal(new Set(ids).size, ids.length, 'deux étapes portent le même identifiant');
  assert.ok(TOUR_STEPS.length >= 5, 'un guide trop court ne répartit rien');
  assert.equal(TOUR_STEPS[0].route, '/', 'le guide doit commencer sur l’accueil');
  for (const step of TOUR_STEPS) {
    assert.ok(step.route.startsWith('/'), `${step.id} : route invalide`);
    assert.ok(step.title.trim() && step.body.trim(), `${step.id} : titre ou texte vide`);
    // Une étape sans cible est forcément centrée : la marquer facultative n'aurait pas de sens.
    if (!step.target) assert.ok(!step.optional, `${step.id} : une étape centrée ne peut pas être facultative`);
  }
  // Le guide ne doit pas faire d'aller-retour entre les pages.
  const routes = TOUR_STEPS.map((step) => step.route);
  const changes = routes.filter((route, i) => i > 0 && route !== routes[i - 1]);
  assert.equal(new Set(changes).size, changes.length, 'le guide revient sur une page déjà quittée');
});

test('toute étape FC 27 ancrée déclare la section qui la contient', () => {
  // Sur mobile une seule section est montée : une étape ancrée sans `section` chercherait
  // une cible absente et s'afficherait sans spot. Le cas est passé inaperçu une fois.
  const sections = ['nom', 'fiche', 'effectif', 'rapport'];
  for (const step of TOUR_STEPS) {
    if (step.section !== undefined) {
      assert.ok(sections.includes(step.section), `${step.id} : section « ${step.section} » inconnue`);
      assert.equal(step.route, '/fc27', `${step.id} : une section n'existe que sur /fc27`);
    }
    // Le bandeau de phase est rendu au-dessus des sections : il reste visible quelle que
    // soit la section ouverte, donc ses cibles n'ont pas de section à déclarer.
    const horsSections = ['.fc27-account', '.fc27-banner', '.fc27-steps'];
    if (step.route === '/fc27' && step.target && !horsSections.includes(step.target)) {
      assert.ok(step.section, `${step.id} : étape ancrée sur /fc27 sans section déclarée`);
    }
  }
});
