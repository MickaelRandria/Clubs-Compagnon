import { AI_LINES } from './data/club-policy.js';
import type { FC27Player } from './fc27.js';

// Empreinte d'un effectif, isolée volontairement dans son propre module.
//
// Elle est utilisée par le navigateur (pour savoir quand redemander l'analyse) et par le
// serveur (pour la clé de cache). Le module qui porte le schéma de l'analyse importe zod ;
// laisser cette fonction là-bas embarquait toute la bibliothèque dans le bundle client
// pour trois lignes de calcul.

/**
 * Tout ce qui change l'analyse, et rien d'autre.
 * Deux effectifs identiques donnent la même empreinte, donc la même analyse en cache ;
 * la moindre fiche modifiée ou ajoutée en produit une nouvelle.
 */
export function squadFingerprint(players: FC27Player[]): string {
  const rows = players
    .map((p) => [
      p.id, p.pseudo, p.in_game_name ?? '', p.primary_position, [...p.secondary_positions].sort().join('+'),
      p.archetype ?? '', p.height_cm ?? '', p.weight_kg ?? '', p.preferred_foot ?? '',
      p.weak_foot ?? '', p.skill_moves ?? '', (p.attribute_priorities ?? []).join('>'), p.notes ?? '',
    ].join('|'))
    .sort();
  // djb2 : suffisant pour une clé de cache, jamais utilisé pour de la sécurité.
  let hash = 5381;
  // Invalide aussi les rapports antérieurs à la politique de club, à effectif identique.
  const text = ['staff-v2', [...AI_LINES].sort().join(','), ...rows].join('\n');
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${players.length}-${hash.toString(36)}`;
}
