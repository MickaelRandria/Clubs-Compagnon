import { useEffect, useRef, useState } from 'react';
import { useIsMobile } from '../../lib/hooks';
import { archetypeById, archetypeImage, BASE_OVR, formatSignature } from '../../../shared/data/archetypes';
import { CLUB_POLICY, HUMAN_POSITIONS, coveredByAi } from '../../../shared/data/club-policy';
import { BuildSheet } from './BuildSheet';
import { POSITION_CODES, POSITION_LABELS, POSITION_LINES, type FC27Player, type FC27Position } from '../../../shared/fc27';

const stars = (value: number | null) => (value === null ? '—' : '★'.repeat(value) + '☆'.repeat(5 - value));
const shirtName = (player: FC27Player) => player.in_game_name || player.pseudo;

/** Photo de l'archétype, ou maillot floqué du numéro quand la fiche n'a pas encore d'archétype. */
export function PlayerPhoto({ player, className }: { player: FC27Player; className: string }) {
  const archetype = archetypeById(player.archetype);
  if (archetype) return <img className={className} src={archetypeImage(archetype.id)} alt="" width={48} height={48} loading="lazy" decoding="async" />;
  return <svg className={`${className} fc27-photo-shirt`} viewBox="0 0 48 48" aria-hidden="true">
    <path d="M17 6 7 11 2 21l9 5 3-5v23h20V21l3 5 9-5-5-10-10-5c-1 4-4 6-7 6s-6-2-7-6Z" fill="#1846F5" />
    <text x="24" y="35" textAnchor="middle" fill="#F2F4F8" fontFamily="Barlow Condensed, sans-serif" fontSize="15" fontWeight="800">{player.kit_number ?? '?'}</text>
  </svg>;
}

function PlayerDetails({ player, role, onSheet }: { player: FC27Player; role: 'Titulaire' | 'Remplaçant'; onSheet: () => void }) {
  const kit = player.kit_number === null ? '' : `#${player.kit_number} `;
  const archetype = archetypeById(player.archetype);
  return <details className="fc27-player-details"><summary>
    <PlayerPhoto player={player} className="fc27-player-thumb" />
    {player.kit_number !== null && <span className="fc27-sheet-kit">{player.kit_number}</span>}
    <span className="fc27-sheet-name"><strong><bdi>{player.pseudo}</bdi></strong><span>{player.in_game_name || 'Voir la fiche'}{archetype ? ` · ${archetype.name}` : ''}</span></span>
    <span className={`fc27-role-badge fc27-role-badge--${role === 'Titulaire' ? 'starter' : 'sub'}`}>{role}</span>
    <span className="fc27-sheet-toggle" aria-hidden="true">＋</span></summary>
    <dl>
      <div><dt>Maillot</dt><dd>{kit}{shirtName(player)}</dd></div>
      <div><dt>Archétype · général de départ</dt><dd>{archetype ? `${archetype.name}${archetype.inspiredBy ? ` (inspiré de ${archetype.inspiredBy})` : ''}` : 'À compléter'} · OVR {BASE_OVR}</dd></div>
      <div><dt>Poste secondaire</dt><dd>{player.secondary_positions.map((p) => `${p} · ${POSITION_LABELS[p]}`).join(', ') || 'Aucun'}</dd></div>
      <div><dt>Pied fort · gabarit</dt><dd>{player.preferred_foot ?? '—'}{player.height_cm ? ` · ${player.height_cm} cm · ${player.weight_kg} kg` : ''}</dd></div>
      <div><dt>PlayStyle signature</dt><dd>{archetype ? formatSignature(archetype).fr : '—'}</dd></div>
      <div><dt>Mauvais pied · gestes techniques</dt><dd><span aria-label={`Mauvais pied ${player.weak_foot ?? 'non renseigné'} sur 5`}>{stars(player.weak_foot)}</span> · <span aria-label={`Gestes techniques ${player.skill_moves ?? 'non renseignés'} sur 5`}>{stars(player.skill_moves)}</span></dd></div>
      <div><dt>Points forts / notes</dt><dd className="fc27-notes">{player.notes || 'Pas encore de notes.'}</dd></div>
    </dl>
    <button type="button" className="fc27-sheet-open" onClick={onSheet}>
      Ma feuille à recopier <span aria-hidden="true">↗</span>
    </button>
  </details>;
}

/** Ligne tactique : abréviation affichée sur le terrain + gabarit de placement (styles/fc27.css). */
const LINE_META: Record<string, { tag: string; slug: string }> = {
  Attaque: { tag: 'ATT', slug: 'att' },
  Milieu: { tag: 'MIL', slug: 'mil' },
  Défense: { tag: 'DEF', slug: 'def' },
  Gardien: { tag: 'G', slug: 'gk' },
};

/**
 * Couverture d'un poste. Un poste vide que le club laisse à l'IA n'est pas « à couvrir » :
 * c'est le fonctionnement voulu, et l'afficher comme un trou ferait croire à un oubli.
 */
function coverage(count: number, position: FC27Position) {
  if (coveredByAi(position, count)) return { key: 'ai', flag: 'IA', label: CLUB_POLICY.short } as const;
  if (count === 0) return { key: 'empty', flag: 'Vide', label: 'À couvrir' } as const;
  if (count === 1) return { key: 'covered', flag: 'Couvert', label: 'Couvert' } as const;
  return { key: 'contested', flag: 'Disputé', label: 'Disputé' } as const;
}

/** Mini-carte de poste sur le terrain. Le nom accessible reste « poste, effectif, statut » ; la carte visuelle montre le titulaire. */
function PositionCard({ position, occupants, selected, onSelect }: { position: FC27Position; occupants: FC27Player[]; selected: boolean; onSelect: () => void }) {
  const count = occupants.length;
  const state = coverage(count, position);
  const first = occupants[0];
  return <button type="button" style={{ gridArea: position }} className={`fc27-position fc27-position--${state.key}`} aria-pressed={selected} aria-controls="fc27-position-players" onClick={onSelect}>
    <span className="fc27-position-code" aria-hidden="true">{position}</span>
    {first && <span className="fc27-position-photo" aria-hidden="true"><PlayerPhoto player={first} className="fc27-position-img" /></span>}
    {first && <span className="fc27-position-player" aria-hidden="true"><bdi>{shirtName(first)}</bdi></span>}
    {first?.kit_number != null && <span className="fc27-position-kit" aria-hidden="true">#{first.kit_number}</span>}
    {count > 1 && <span className="fc27-position-flag" aria-hidden="true">+{count - 1}</span>}
    {!first && <span className="fc27-position-free" aria-hidden="true">{state.key === 'ai' ? CLUB_POLICY.short : 'Disponible'}</span>}
    <span className="fc27-position-name">{POSITION_LABELS[position]}</span>
    <strong className="fc27-sr">{count}</strong>
    <small className="fc27-sr">{count === 0 ? state.label : count === 1 ? '1 joueur' : `${count} joueurs`}</small>
  </button>;
}

export function PositionOverview({ players }: { players: FC27Player[] }) {
  const [selected, setSelected] = useState<FC27Position>('BU');
  const [sheetFor, setSheetFor] = useState<FC27Player | null>(null);
  const isMobile = useIsMobile();
  // Sur mobile, la feuille de poste n'est plus un second bloc permanent sous le terrain :
  // elle s'ouvre au clic, juste en dessous, et se referme.
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const justOpened = useRef(false);

  useEffect(() => {
    if (!isMobile || !open || !justOpened.current) return;
    justOpened.current = false;
    sheetRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isMobile, open, selected]);

  function pick(position: FC27Position) {
    // Retaper le poste déjà ouvert le referme : le terrain reprend toute la place.
    if (isMobile && position === selected && open) { setOpen(false); return; }
    setSelected(position);
    if (isMobile) { justOpened.current = true; setOpen(true); }
  }
  const byPosition = Object.fromEntries(POSITION_CODES.map((position) => [position, players.filter((p) => p.primary_position === position)])) as Record<FC27Position, FC27Player[]>;
  const principal = byPosition[selected];
  const secondary = players.filter((p) => p.secondary_positions.includes(selected));
  const selectedCoverage = coverage(principal.length, selected);
  const stats = [
    { value: players.length, label: 'Joueurs' },
    // Seuls les postes que le club cherche à pourvoir comptent comme vides.
    { value: HUMAN_POSITIONS.filter((p) => byPosition[p].length === 0).length, label: 'Postes à pourvoir' },
    { value: POSITION_CODES.filter((p) => byPosition[p].length > 1).length, label: 'En doublon' },
  ];
  return <section className="fc-block fc27-roster" aria-labelledby="fc27-roster-title">
    <div className="fc27-section-head"><div><p className="fc27-eyebrow">Le collectif se dessine</p><h2 id="fc27-roster-title" className="fc27-section-title">L’effectif de demain</h2></div>
      <div className="fc27-roster-stats">{stats.map((stat) => <span key={stat.label}><strong>{stat.value.toString().padStart(2, '0')}</strong>{stat.label}</span>)}</div></div>
    <p className="fc27-section-hint">
      {!isMobile && 'Chaque carte montre le titulaire du poste. Sélectionne un poste pour ouvrir sa feuille de match. '}
      <b className="fc27-policy-note">{CLUB_POLICY.label} : ces postes ne sont pas à pourvoir.</b>
    </p>
    <div className="fc27-roster-body">
      <div className="fc27-pitch">
        <span className="fc27-pitch-lines" aria-hidden="true"><i className="fc27-pitch-half" /><i className="fc27-pitch-circle" /><i className="fc27-pitch-box fc27-pitch-box--top" /><i className="fc27-pitch-six fc27-pitch-six--top" /><i className="fc27-pitch-box fc27-pitch-box--bottom" /><i className="fc27-pitch-six fc27-pitch-six--bottom" /></span>
        {POSITION_LINES.map((line) => {
          const meta = LINE_META[line.label];
          return <div className="fc27-position-line" role="group" aria-label={line.label} key={line.label}>
            <span className="fc27-line-tag" aria-hidden="true">{meta?.tag ?? line.label}</span>
            <div className={`fc27-position-grid${meta ? ` fc27-position-grid--${meta.slug}` : ''}`}>
              {line.positions.map((position) => <PositionCard key={position} position={position} occupants={byPosition[position]} selected={selected === position && (!isMobile || open)} onSelect={() => pick(position)} />)}
            </div>
          </div>;
        })}
      </div>
      {(!isMobile || open) && <div ref={sheetRef} className="fc27-position-players" id="fc27-position-players" aria-live="polite">
        <div className="fc27-sheet-head">
          <span className="fc27-selected-code" aria-hidden="true">{selected}</span>
          <div><p className="fc27-sheet-kicker">Poste sélectionné · Feuille de match</p><h3 className="fc27-sheet-title">{POSITION_LABELS[selected]}</h3></div>
          {isMobile && <button type="button" className="fc27-sheet-close" onClick={() => setOpen(false)} aria-label="Refermer la feuille de poste">✕</button>}
        </div>
        <dl className="fc27-selected-stats">
          <div><dt>Titulaires</dt><dd>{principal.length}</dd></div>
          <div><dt>Remplaçants</dt><dd>{secondary.length}</dd></div>
          <div><dt>Statut</dt><dd><span className={`fc27-status fc27-status--${selectedCoverage.key}`}>{selectedCoverage.label}</span></dd></div>
        </dl>
        <h4>Titulaires · {principal.length}</h4>
        {principal.length === 0 ? <p className="fc27-sheet-empty">Personne à ce poste pour le moment.</p> : principal.map((player) => <PlayerDetails key={player.id} player={player} role="Titulaire" onSheet={() => setSheetFor(player)} />)}
        <h4>Remplaçants · {secondary.length}</h4>
        {secondary.length === 0 ? <p className="fc27-sheet-empty">Aucun poste secondaire déclaré ici.</p> : secondary.map((player) => <PlayerDetails key={player.id} player={player} role="Remplaçant" onSheet={() => setSheetFor(player)} />)}
      </div>}
      {isMobile && !open && <p className="fc27-pitch-hint">Touche un poste pour ouvrir sa feuille de match.</p>}
    </div>
    {sheetFor && <BuildSheet player={sheetFor} onClose={() => setSheetFor(null)} />}
  </section>;
}
