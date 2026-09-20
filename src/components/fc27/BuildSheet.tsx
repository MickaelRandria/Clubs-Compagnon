import { useState } from 'react';
import {
  ATTRIBUTES, BASE_OVR, MASTERY, archetypeById, formatSignature, masteryBonuses, resolvePriorities,
} from '../../../shared/data/archetypes';
import { POSITION_LABELS, type FC27Player } from '../../../shared/fc27';
import { FC27Dialog } from './FC27Dialog';

const FOOT_LABEL: Record<string, string> = { Droit: 'Droitier', Gauche: 'Gaucher' };
const stars = (value: number | null) => (value === null ? '—' : `${value}/5`);

/** Les lignes de la feuille, dans l'ordre où le jeu les demande à la création du joueur. */
function sheetRows(player: FC27Player) {
  const archetype = archetypeById(player.archetype);
  const secondary = player.secondary_positions.map((p) => `${p} · ${POSITION_LABELS[p]}`).join(', ');
  return [
    { step: 'Nom & numéro', value: `${player.in_game_name || player.pseudo} · #${player.kit_number ?? '—'}` },
    { step: 'Poste principal', value: `${player.primary_position} · ${POSITION_LABELS[player.primary_position]}` },
    { step: 'Poste secondaire', value: secondary || 'Aucun' },
    { step: 'Archétype', value: archetype ? archetype.name : 'À choisir' },
    { step: 'Taille & poids', value: player.height_cm ? `${player.height_cm} cm · ${player.weight_kg} kg` : 'À régler' },
    { step: 'Pied fort', value: player.preferred_foot ? FOOT_LABEL[player.preferred_foot] ?? player.preferred_foot : 'À régler' },
    { step: 'Mauvais pied', value: stars(player.weak_foot) },
    { step: 'Gestes techniques', value: stars(player.skill_moves) },
  ];
}

/** Version texte de la feuille, pour le presse-papiers : lisible tel quel à côté de la console. */
function asText(player: FC27Player) {
  const archetype = archetypeById(player.archetype);
  const priorities = resolvePriorities(archetype, player.attribute_priorities);
  const lines = [
    `FEUILLE À RECOPIER — ${(player.in_game_name || player.pseudo).toUpperCase()}`,
    '',
    ...sheetRows(player).map((row, index) => `${index + 1}. ${row.step} : ${row.value}`),
    '',
    'ORDRE DE DÉPENSE DES POINTS',
    ...priorities.map((key, index) => {
      const discounted = archetype?.keyAttributes.includes(key) ? '  (remisé)' : '';
      return `  ${index + 1}. ${ATTRIBUTES[key].label}${discounted}`;
    }),
  ];
  if (archetype) {
    lines.push('', `MAÎTRISE — niveau ${MASTERY.firstLevel} avec ${archetype.name}`,
      ...masteryBonuses(archetype).map(({ attribute, gain }) => `  ${gain} ${ATTRIBUTES[attribute].label}`));
    lines.push('', `PLAYSTYLE SIGNATURE : ${formatSignature(archetype).fr} (${formatSignature(archetype).en})`);
  }
  return lines.join('\n');
}

/** Feuille personnelle à recopier écran par écran le jour de la création du joueur en jeu. */
export function BuildSheet({ player, onClose }: { player: FC27Player; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const archetype = archetypeById(player.archetype);
  const priorities = resolvePriorities(archetype, player.attribute_priorities);
  const chosenOrder = (player.attribute_priorities ?? []).length > 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText(player));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return <FC27Dialog title="Ma feuille à recopier" onClose={onClose} wide console>
    <p className="fc27-step-intro">
      Le jour où tu crées ton joueur dans FC 27, garde cet écran ouvert et recopie ligne par ligne. Rien à retenir.
    </p>

    <div className="fc27-sheet-grid">
      <ol className="fc27-sheet-steps">
        {sheetRows(player).map((row) => <li key={row.step}>
          <span className="fc27-sheet-step">{row.step}</span>
          <strong className="fc27-sheet-value"><bdi>{row.value}</bdi></strong>
        </li>)}
      </ol>

      <div className="fc27-sheet-side">
        <div className="fc27-sheet-card">
          <p className="fc27-report-label">Ordre de dépense{!chosenOrder && <b>Conseil</b>}</p>
          {priorities.length === 0
            ? <p className="fc27-sheet-empty">Choisis un archétype pour obtenir un ordre de dépense.</p>
            : <ol className="fc27-sheet-order">
              {priorities.map((key) => <li key={key}>
                <strong>{ATTRIBUTES[key].label}</strong>
                {archetype?.keyAttributes.includes(key) && <em>Remisé</em>}
              </li>)}
            </ol>}
          {!chosenOrder && priorities.length > 0
            && <p className="fc27-sheet-note">Ordre conseillé par défaut. Le propriétaire peut le réorganiser depuis « Modifier ma fiche ».</p>}
        </div>

        {archetype && <div className="fc27-sheet-card">
          <p className="fc27-report-label">Maîtrise à viser</p>
          <p className="fc27-sheet-mastery">
            Niveau <b>{MASTERY.firstLevel}</b> avec <b>{archetype.name}</b> :
            {' '}{masteryBonuses(archetype).map(({ attribute, gain }) => `${gain} ${ATTRIBUTES[attribute].label}`).join(', ')}.
          </p>
          <p className="fc27-sheet-note">{MASTERY.tip}</p>
        </div>}

        <div className="fc27-sheet-card">
          <p className="fc27-report-label">Général de départ</p>
          <p className="fc27-ovr"><strong>{BASE_OVR}</strong><span>au premier match</span></p>
        </div>
      </div>
    </div>

    <div className="fc27-wizard-actions">
      <button type="button" className="fc27-button fc27-button--outline" onClick={onClose}>Fermer</button>
      <button type="button" className="fc27-button" onClick={copy}>
        {copied ? 'Copié ✓' : 'Copier la feuille en texte'}
      </button>
    </div>
  </FC27Dialog>;
}
