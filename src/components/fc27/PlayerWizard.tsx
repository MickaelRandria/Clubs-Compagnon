import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  ARCHETYPES_SOURCE, ATTRIBUTES, BASE_OVR, LINE_LABELS, LINE_OF_POSITION, MASTERY, MAX_PRIORITIES, MORPHOLOGY, PLAYSTYLE_FAMILIES,
  archetypeById, archetypeImage, archetypesForPosition, attributesForLine, defaultPriorities, formatSignature, masteryBonuses,
  morphologyTendency, resolvePriorities, type Archetype, type AttributeKey,
} from '../../../shared/data/archetypes';
import { CLUBS_SOURCE, FC27_CHANGES } from '../../../shared/data/clubs-fc27';
import type { Lookalike } from '../../../shared/data/lookalikes';
import { LookalikeSearch } from './LookalikeSearch';
import { PlayerGuide } from './PlayerGuide';
import {
  PROFILES_SOURCE, SKILL_TREES, mainOption, profileForPosition, recommendedFor, type BuildOption, type PositionProfile,
} from '../../../shared/data/position-profiles';
import { FEET, POSITION_LABELS, POSITION_LINES, type FC27Player, type FC27Position, type FC27State, type Foot } from '../../../shared/fc27';
import { LIMITS, type Stars } from '../../../shared/fc27-player';
import { useFC27Action } from '../../api/fc27';
import { ActionFeedback, FC27Dialog } from './FC27Dialog';

const STEPS = ['Identité', 'Ton joueur'] as const;
const FOOT_LABEL: Record<Foot, string> = { Droit: 'Droitier', Gauche: 'Gaucher' };

/** Remplissage de la jauge segmentée (taille / poids), en % de la plage autorisée. */
const gaugeFill = (value: number, range: { min: number; max: number }) =>
  ({ '--fill': `${((value - range.min) / (range.max - range.min)) * 100}%` }) as CSSProperties;
const clamp = (value: number, range: { min: number; max: number }) => Math.min(range.max, Math.max(range.min, value));

interface Draft {
  pseudo: string; kitName: string; kitNumber: number | '';
  primary: FC27Position | ''; secondary: FC27Position | ''; archetype: string;
  foot: Foot; height: number; weight: number;
  weakFoot: Stars; skillMoves: Stars; notes: string;
  /** Ordre de dépense des points, du premier financé au dernier. */
  priorities: AttributeKey[];
}

/** Champs du bloc « Affiner » que l'archétype pré-remplit tant que le joueur n'y a pas touché. */
type TunedKey = 'height' | 'weight' | 'weakFoot' | 'skillMoves';
const TUNED_KEYS: TunedKey[] = ['height', 'weight', 'weakFoot', 'skillMoves'];

const EMPTY: Draft = {
  pseudo: '', kitName: '', kitNumber: '', primary: '', secondary: '', archetype: '',
  foot: 'Droit', height: 180, weight: 75, weakFoot: 3, skillMoves: 3, notes: '', priorities: [],
};

function draftFrom(player: FC27Player): Draft {
  const stars = (value: number | null) => (value ?? 3) as Stars;
  const archetype = archetypeById(player.archetype);
  return {
    pseudo: player.pseudo, kitName: player.in_game_name ?? '', kitNumber: player.kit_number ?? '',
    primary: player.primary_position, secondary: player.secondary_positions[0] ?? '',
    archetype: archetype && archetype.line === LINE_OF_POSITION[player.primary_position] ? archetype.id : '',
    foot: player.preferred_foot ?? 'Droit',
    height: clamp(player.height_cm ?? 180, LIMITS.heightCm), weight: clamp(player.weight_kg ?? 75, LIMITS.weightKg),
    weakFoot: stars(player.weak_foot), skillMoves: stars(player.skill_moves), notes: player.notes ?? '',
    priorities: resolvePriorities(archetype, player.attribute_priorities),
  };
}

/** Aperçu du maillot (étape 1) : nom, numéro et général de départ. */
function JerseyPreview({ name, number }: { name: string; number: number | '' }) {
  return <div className="fc27-jersey-card">
    <svg className="fc27-jersey" viewBox="0 0 200 190" aria-hidden="true">
      <path d="M64 12 25 34 5 76l37 20 12-22v106h92V74l12 22 37-20-20-42-39-22c-3 14-17 22-36 22S67 26 64 12Z" fill="#1846F5" stroke="#6FC8FF" strokeWidth="3" />
      <path d="M54 150 146 104v18l-92 46z" fill="#6FC8FF" opacity=".55" />
      <text x="100" y="66" textAnchor="middle" fill="#F2F4F8" fontFamily="Barlow Condensed, Arial Narrow, sans-serif" fontSize="17" fontWeight="800" letterSpacing="2">
        {(name.trim() || 'TON NOM').toUpperCase().slice(0, 14)}
      </text>
      <text x="100" y="134" textAnchor="middle" fill="#F2F4F8" fontFamily="Barlow Condensed, Arial Narrow, sans-serif" fontSize="64" fontWeight="800" fontStyle="italic">
        {number === '' ? '?' : number}
      </text>
    </svg>
    <p className="fc27-ovr"><strong>{BASE_OVR}</strong><span>Général de départ</span></p>
  </div>;
}

function StarsPicker({ legend, value, onChange }: { legend: string; value: Stars; onChange: (value: Stars) => void }) {
  return <fieldset className="fc27-stars">
    <legend>{legend}</legend>
    <div>
      {([1, 2, 3, 4, 5] as Stars[]).map((n) => <label key={n} className={n <= value ? 'is-lit' : undefined}>
        <input type="radio" name={legend} checked={value === n} onChange={() => onChange(n)} aria-label={`${n} étoile${n > 1 ? 's' : ''}`} />
        <span aria-hidden="true">★</span>
      </label>)}
      <output>{value}/5</output>
    </div>
  </fieldset>;
}

/** Position d'une borne sur la jauge, en % de la plage autorisée. */
const at = (value: number, range: { min: number; max: number }) => `${((value - range.min) / (range.max - range.min)) * 100}%`;

function MorphologyGauge({ id, label, unit, value, range, advised, onChange }: {
  id: string; label: string; unit: string; value: number; range: { min: number; max: number };
  /** Fourchette conseillée au poste choisi, matérialisée sur la jauge. */
  advised?: { min: number; max: number }; onChange: (value: number) => void;
}) {
  const inRange = advised && value >= advised.min && value <= advised.max;
  const style = { ...gaugeFill(value, range), ...(advised ? { '--from': at(advised.min, range), '--to': at(advised.max, range) } : {}) } as CSSProperties;
  return <div className={`fc27-slider${advised ? ' fc27-slider--advised' : ''}`} style={style}>
    <span><label htmlFor={id}>{label}</label> <output htmlFor={id}>{value} {unit}</output></span>
    <input id={id} type="range" min={range.min} max={range.max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    {advised && <p className={`fc27-advised${inRange ? ' is-inside' : ''}`}>
      <b>{inRange ? '✓' : '!'}</b>Conseillé au poste : {advised.min}–{advised.max} {unit}
    </p>}
    <small>{morphologyTendency(value, range)}</small>
  </div>;
}

/**
 * Profil conseillé du poste : répartition des points de départ, gabarits et PlayStyles.
 * Tous ces chiffres sont des relevés communautaires — le badge « Non confirmé » ne doit jamais sauter.
 */
function PositionProfileCard({ profile, position, option, onOption }: {
  profile: PositionProfile; position: FC27Position; option: number; onOption: (index: number) => void;
}) {
  const advised = profile.options[option] ?? profile.options[0];
  const suggested = recommendedFor(position);
  return <section className="fc27-profile" aria-labelledby="fc27-profile-title">
    <div className="fc27-profile-head">
      <div>
        <p className="fc27-profile-kicker">{position} · Profil conseillé</p>
        <h4 id="fc27-profile-title">{profile.title}</h4>
      </div>
      <span className="fc27-profile-flag" title={PROFILES_SOURCE.caveat}>Non confirmé</span>
    </div>
    <p className="fc27-profile-intent">{profile.intent}</p>

    <div className="fc27-profile-body">
      <div className="fc27-profile-spend">
        <p className="fc27-report-label">Les {PROFILES_SOURCE.total} points de départ</p>
        <ul>
          {profile.spend.map(({ tree, points, detail }) => <li key={tree}>
            <span className="fc27-tree">
              <strong>{SKILL_TREES[tree].label}</strong>
              <b>{points}</b>
            </span>
            <span className="fc27-tree-bar" aria-hidden="true"><i style={{ width: `${(points / PROFILES_SOURCE.total) * 100}%` }} /></span>
            <small>{detail}</small>
          </li>)}
        </ul>
      </div>

      <div className="fc27-profile-side">
        {profile.options.length > 1 && <div className="fc27-profile-options" role="group" aria-label="Gabarit conseillé">
          {profile.options.map((choice, index) => <button key={choice.label ?? index} type="button"
            className={index === option ? 'is-on' : undefined} aria-pressed={index === option} onClick={() => onOption(index)}>
            {choice.label}
          </button>)}
        </div>}
        <p className="fc27-profile-size">
          <b>{advised.heightCm.min}–{advised.heightCm.max} cm</b>
          <b>{advised.weightKg.min}–{advised.weightKg.max} kg</b>
          <span>{advised.why}</span>
        </p>
        <p className="fc27-profile-styles">
          <i>PlayStyles à viser</i>
          {profile.playStyles.join(' · ')}
        </p>
        {suggested.length > 0 && <p className="fc27-profile-arch">
          <i>Archétypes qui collent</i>
          {suggested.map((id) => archetypeById(id)?.name).filter(Boolean).join(' · ')}
        </p>}
      </div>
    </div>

    {profile.warning && <p className="fc27-profile-warning"><b>!</b>{profile.warning}</p>}
  </section>;
}

/**
 * Ordre de dépense des points : le cœur de la feuille à recopier le jour J.
 * Aucun coût ni budget n'est simulé — EA ne les a pas publiés — seulement l'ordre de priorité.
 */
function SpendOrder({ archetype, priorities, onChange }: {
  archetype: Archetype; priorities: AttributeKey[]; onChange: (next: AttributeKey[]) => void;
}) {
  const pool = attributesForLine(archetype.line);
  const suggested = defaultPriorities(archetype);
  const isCustom = priorities.length !== suggested.length || priorities.some((key, index) => key !== suggested[index]);

  const move = (index: number, delta: number) => {
    const next = [...priorities];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    onChange(next);
  };
  const replace = (index: number, key: AttributeKey) => {
    const next = [...priorities];
    next[index] = key;
    onChange(next);
  };
  const remove = (index: number) => onChange(priorities.filter((_, i) => i !== index));
  const add = () => {
    const free = pool.find((key) => !priorities.includes(key));
    if (free) onChange([...priorities, free]);
  };

  return <div className="fc27-spend">
    <div className="fc27-spend-head">
      <h4>Ordre de dépense des points</h4>
      {isCustom
        ? <button type="button" className="fc27-spend-reset" onClick={() => onChange(suggested)}>Revenir au conseil</button>
        : <span className="fc27-mastery-flag">Ordre conseillé</span>}
    </div>
    <p className="fc27-mastery-lead">
      L’ordre dans lequel tu monteras tes attributs le jour J. Teste des variantes : rien n’est définitif, les resets sont gratuits en FC 27.
    </p>
    <ol className="fc27-spend-list">
      {priorities.map((key, index) => <li key={`${key}-${index}`}>
        <b>{index + 1}</b>
        <span className="fc27-spend-pick">
          <label className="fc27-sr" htmlFor={`fc27-spend-${index}`}>Attribut en position {index + 1}</label>
          <select id={`fc27-spend-${index}`} value={key} onChange={(e) => replace(index, e.target.value as AttributeKey)}>
            {pool.filter((option) => option === key || !priorities.includes(option))
              .map((option) => <option key={option} value={option}>{ATTRIBUTES[option].label}</option>)}
          </select>
          {archetype.keyAttributes.includes(key) && <em title="Attribut clé de ton archétype : il coûte moins cher à monter.">Remisé</em>}
        </span>
        <span className="fc27-spend-moves">
          <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Monter ${ATTRIBUTES[key].label}`}>▲</button>
          <button type="button" disabled={index === priorities.length - 1} onClick={() => move(index, 1)} aria-label={`Descendre ${ATTRIBUTES[key].label}`}>▼</button>
          <button type="button" disabled={priorities.length <= 1} onClick={() => remove(index)} aria-label={`Retirer ${ATTRIBUTES[key].label}`}>✕</button>
        </span>
      </li>)}
    </ol>
    {priorities.length < MAX_PRIORITIES
      && <button type="button" className="fc27-spend-add" onClick={add}>+ Ajouter un attribut ({priorities.length}/{MAX_PRIORITIES})</button>}
  </div>;
}

/** Briefing d'entrée : ce que FC 27 Clubs change par rapport à FC 26, avant de faire ses choix. */
function ClubsBriefing() {
  return <section className="fc27-briefing" aria-labelledby="fc27-briefing-title">
    <div className="fc27-briefing-head">
      <h4 id="fc27-briefing-title">Ce qui change dans FC 27 Clubs</h4>
      <span className="fc27-briefing-meta" title={CLUBS_SOURCE.caveat}>{CLUBS_SOURCE.official}</span>
    </div>
    <ul className="fc27-briefing-list">
      {FC27_CHANGES.map((change) => <li key={change.id}>
        <p className="fc27-briefing-title">
          {change.title}
          {!change.confirmed && <em title="Rapporté par la communauté avant la sortie, pas confirmé par EA.">Non confirmé</em>}
        </p>
        <p className="fc27-briefing-shift">
          <span><i>FC 26</i>{change.before}</span>
          <span><i>FC 27</i>{change.after}</span>
        </p>
        <p className="fc27-briefing-sowhat">{change.soWhat}</p>
      </li>)}
    </ul>
  </section>;
}

/** Récompense de la sélection : PlayStyle signature, attributs clés, ordre de dépense et postes idéaux. */
function ArchetypePayoff({ archetype, position, priorities, onPriorities }: {
  archetype: Archetype; position: FC27Position | ''; priorities: AttributeKey[]; onPriorities: (next: AttributeKey[]) => void;
}) {
  const family = PLAYSTYLE_FAMILIES[archetype.signature.family];
  return <section className="fc27-signature" aria-labelledby="fc27-signature-title">
    <img className="fc27-signature-photo" src={archetypeImage(archetype.id)} alt={`Illustration de l’archétype ${archetype.name}`} width={640} height={640} decoding="async" />
    <div className="fc27-signature-content">
      <div className="fc27-signature-head">
        <p className="fc27-signature-kicker">{archetype.name}{archetype.inspiredBy ? ` · Inspiré de ${archetype.inspiredBy}` : ''}{position ? ` · ${position}` : ''}</p>
        <h4 id="fc27-signature-title">PlayStyle signature</h4>
      </div>
      <div className="fc27-signature-body">
        <img className="fc27-signature-badge" src={family.badge} alt="" width={256} height={256} decoding="async" />
        <div>
          <p className="fc27-signature-family">Famille {family.label}</p>
          <p className="fc27-signature-name"><strong>{formatSignature(archetype).fr}</strong><span>{formatSignature(archetype).en}</span></p>
          <p className="fc27-signature-match"><b>En match :</b> {archetype.signature.inMatch}</p>
        </div>
      </div>

      <div className="fc27-mastery">
        <h4>Attributs clés <span className="fc27-mastery-flag">Remisés</span></h4>
        <p className="fc27-mastery-lead">Ces deux attributs coûtent moins cher à monter que les autres, et ce sont eux que la Maîtrise récompense.</p>
        <div className="fc27-mastery-row">
          <span className="fc27-mastery-level"><i>niveau</i><b>{MASTERY.firstLevel}</b></span>
          <ul className="fc27-mastery-gains">
            {masteryBonuses(archetype).map(({ attribute, gain }) => <li key={attribute}>
              <b>{gain}</b>
              <span>
                <strong>{ATTRIBUTES[attribute].label}</strong>
                {ATTRIBUTES[attribute].hint && <em>{ATTRIBUTES[attribute].hint}</em>}
              </span>
            </li>)}
          </ul>
        </div>
        <p className="fc27-mastery-note"><b>À retenir :</b> {MASTERY.note} {MASTERY.tip}</p>
        <p className="fc27-mastery-later">{MASTERY.later}</p>
      </div>

      <SpendOrder archetype={archetype} priorities={priorities} onChange={onPriorities} />

      <p className="fc27-signature-ideal">Postes où il s’exprime le mieux : <b>{archetype.idealPositions.join(' · ')}</b></p>
    </div>
  </section>;
}

export function PlayerWizard({ state, mode, onClose }: { state: FC27State; mode: 'create' | 'edit'; onClose: () => void }) {
  const mutation = useFC27Action();
  const [profile, setProfile] = useState<FC27Player | null>(null);
  const [lookup, setLookup] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [step, setStep] = useState(0);
  const [guideActive, setGuideActive] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  /** Champs du bloc « Affiner » réglés à la main : l'archétype ne les écrase plus. */
  const tuned = useRef(new Set<TunedKey>());
  /** Gabarit conseillé retenu quand le poste en propose deux (ex. buteur vitesse ou pivot). */
  const [option, setOption] = useState(0);
  /** Joueur de référence choisi, tant que le joueur ne s'en écarte pas à la main. */
  const [lookalike, setLookalike] = useState<Lookalike | null>(null);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (guideActive) return;
    titleRef.current?.focus({ preventScroll: true });
    titleRef.current?.closest('dialog')?.scrollTo({ top: 0 });
  }, [step, guideActive]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  /** Réglage manuel : la valeur est figée, l'archétype suivant ne la remplacera pas. */
  const tune = <K extends TunedKey>(key: K, value: Draft[K]) => { tuned.current.add(key); set(key, value); };
  const others = state.players.filter((p) => p.id !== profile?.id);
  const pseudoTaken = mode === 'create' && draft.pseudo !== '' && state.players.some((p) => p.pseudo === draft.pseudo);
  const numberHolder = draft.kitNumber === '' ? undefined : others.find((p) => p.kit_number === draft.kitNumber);
  const takenNumbers = others.map((p) => p.kit_number).filter((n): n is number => n !== null).sort((a, b) => a - b);
  const archetypes = draft.primary ? archetypesForPosition(draft.primary) : [];
  const chosen = archetypeById(draft.archetype);
  const posProfile = draft.primary ? profileForPosition(draft.primary) : undefined;
  const advised: BuildOption | undefined = posProfile?.options[option] ?? (draft.primary ? mainOption(draft.primary) : undefined);

  /** Basculer entre deux gabarits conseillés recale les jauges non réglées à la main. */
  function applyOption(index: number) {
    setOption(index);
    const choice = posProfile?.options[index];
    if (!choice) return;
    setDraft((d) => ({
      ...d,
      height: tuned.current.has('height') ? d.height : clamp(Math.round((choice.heightCm.min + choice.heightCm.max) / 2), LIMITS.heightCm),
      weight: tuned.current.has('weight') ? d.weight : clamp(Math.round((choice.weightKg.min + choice.weightKg.max) / 2), LIMITS.weightKg),
    }));
  }

  /** Un joueur de référence remplit tout d'un coup : poste, archétype, gabarit, pied, dépenses. */
  function applyLookalike(entry: Lookalike) {
    const archetype = archetypeById(entry.archetype);
    setLookalike(entry);
    setOption(0);
    // Le gabarit vient du joueur réel : il ne doit plus être écrasé par le défaut de l'archétype.
    tuned.current.add('height');
    setDraft((d) => ({
      ...d,
      primary: entry.position,
      secondary: d.secondary === entry.position ? '' : d.secondary,
      archetype: entry.archetype,
      foot: entry.foot,
      height: clamp(entry.heightCm, LIMITS.heightCm),
      weight: tuned.current.has('weight') ? d.weight : clamp(archetype?.defaults.weightKg ?? d.weight, LIMITS.weightKg),
      weakFoot: tuned.current.has('weakFoot') ? d.weakFoot : (archetype?.defaults.weakFootStars ?? d.weakFoot),
      skillMoves: tuned.current.has('skillMoves') ? d.skillMoves : (archetype?.defaults.skillMovesStars ?? d.skillMoves),
      priorities: [...entry.priorities],
    }));
  }

  /** Choisir un archétype pré-remplit le gabarit et les étoiles, sauf ce que le joueur a déjà réglé. */
  function chooseArchetype(id: string) {
    // Choisir soi-même un archétype, c'est s'écarter du joueur de référence.
    if (lookalike && lookalike.archetype !== id) setLookalike(null);
    const archetype = archetypeById(id);
    const defaults = archetype?.defaults;
    setDraft((d) => {
      // L'ordre de dépense suit toujours l'archétype : il n'a aucun sens hors de lui.
      const next = { ...d, archetype: id, priorities: archetype ? defaultPriorities(archetype) : [] };
      if (!defaults) return next;
      if (!tuned.current.has('height')) next.height = clamp(defaults.heightCm, LIMITS.heightCm);
      if (!tuned.current.has('weight')) next.weight = clamp(defaults.weightKg, LIMITS.weightKg);
      if (!tuned.current.has('weakFoot')) next.weakFoot = defaults.weakFootStars;
      if (!tuned.current.has('skillMoves')) next.skillMoves = defaults.skillMovesStars;
      return next;
    });
  }

  function choosePrimary(position: FC27Position) {
    setDraft((d) => {
      // Changer de ligne invalide l'archétype, donc aussi l'ordre de dépense qui en découle.
      const keepsArchetype = archetypeById(d.archetype)?.line === LINE_OF_POSITION[position];
      setOption(0);
      if (lookalike && lookalike.position !== position) setLookalike(null);
      return {
        ...d,
        primary: position,
        secondary: d.secondary === position ? '' : d.secondary,
        archetype: keepsArchetype ? d.archetype : '',
        priorities: keepsArchetype ? d.priorities : [],
      };
    });
  }

  function errorsFor(index: number): string[] {
    const errors: string[] = [];
    if (index === 0) {
      if (!draft.pseudo.trim()) errors.push('Saisis ton pseudo.');
      if (pseudoTaken) errors.push('Ce pseudo possède déjà une fiche. Utilise « Modifier une fiche ».');
      if (!draft.kitName.trim()) errors.push('Indique le nom floqué sur ton maillot.');
      if (draft.kitNumber === '' || !Number.isInteger(draft.kitNumber) || draft.kitNumber < LIMITS.kitNumber.min || draft.kitNumber > LIMITS.kitNumber.max) errors.push('Choisis un numéro entre 1 et 99.');
      if (numberHolder) errors.push(`Le numéro ${draft.kitNumber} est déjà porté par ${numberHolder.in_game_name || numberHolder.pseudo}.`);
    }
    if (index === 1) {
      if (!draft.primary) errors.push('Choisis ton poste principal.');
      else if (!archetypes.some((a) => a.id === draft.archetype)) errors.push('Choisis ton archétype.');
    }
    return errors;
  }

  function findProfile(event: FormEvent) {
    event.preventDefault();
    const found = state.players.find((player) => player.pseudo === lookup);
    if (!found) { setLookupError('Aucune fiche pour ce pseudo exact. Vérifie les majuscules et les espaces.'); return; }
    // Une fiche existante garde ses valeurs : aucun pré-remplissage ne doit les écraser.
    TUNED_KEYS.forEach((key) => tuned.current.add(key));
    setProfile(found); setDraft(draftFrom(found)); setLookupError('');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (guideActive) return;
    if (errorsFor(step).length > 0) { setAttempted(true); return; }
    setAttempted(false);
    if (step < STEPS.length - 1) { setStep(step + 1); return; }
    mutation.mutate({
      action: 'player', campaignId: state.campaign.id, pseudo: draft.pseudo, profileId: profile?.id,
      kitName: draft.kitName, kitNumber: Number(draft.kitNumber), primaryPosition: draft.primary as FC27Position,
      secondaryPosition: draft.secondary || undefined, archetype: draft.archetype,
      preferredFoot: draft.foot, heightCm: draft.height, weightKg: draft.weight,
      weakFootStars: draft.weakFoot, skillMovesStars: draft.skillMoves,
      attributePriorities: draft.priorities, notes: draft.notes,
    }, {
      onSuccess: onClose,
      onError: (error) => { if (/numéro/i.test(error.message)) setStep(0); },
    });
  }

  const title = mode === 'create' ? 'Créer ma fiche' : 'Modifier une fiche';
  if (mode === 'edit' && !profile) {
    return <FC27Dialog title={title} onClose={onClose} console>
      <p className="fc27-muted">Retrouve ta fiche avec ton pseudo exact. Pas de compte : chacun respecte les fiches des autres.</p>
      <form className="fc27-form" onSubmit={findProfile}>
        <label>Pseudo exact de la fiche<input autoFocus required maxLength={40} value={lookup} onChange={(e) => setLookup(e.target.value)} autoComplete="off" /></label>
        {lookupError && <p className="fc27-feedback" role="alert">{lookupError}</p>}
        <button className="fc27-button" disabled={!lookup.trim()}>Retrouver la fiche</button>
      </form>
    </FC27Dialog>;
  }

  const errors = attempted ? errorsFor(step) : [];
  const isLast = step === STEPS.length - 1;
  const line = draft.primary ? LINE_OF_POSITION[draft.primary] : null;

  return <FC27Dialog title={title} onClose={onClose} wide console>
    <ol className="fc27-stepper fc27-stepper--duo" aria-label="Étapes de la fiche">
      {STEPS.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={index < step ? 'is-done' : undefined}>
        <b>{index < step ? '✓' : index + 1}</b><span>{label}</span>
      </li>)}
    </ol>

    <PlayerGuide page={step} advancedOpen={advancedOpen} hasArchetype={!!chosen} invite={mode === 'create'}
      onPageChange={setStep} onAdvancedChange={setAdvancedOpen} onActiveChange={setGuideActive} />

    <form className="fc27-form fc27-wizard" onSubmit={submit} noValidate>
      <h3 ref={titleRef} tabIndex={-1} className="fc27-step-title">{step + 1}. {STEPS[step]}</h3>

      {step === 0 && <div className="fc27-identity-step">
        <div className="fc27-identity-fields" data-player-guide="identity">
          <p className="fc27-step-intro">Ton identité dans le vestiaire : le pseudo qui te représente, le nom et le numéro floqués sur ton maillot.</p>
          <label>Pseudo<input autoFocus={mode === 'create' && !guideActive} maxLength={40} value={draft.pseudo} readOnly={!!profile} onChange={(e) => set('pseudo', e.target.value)} autoComplete="off" /></label>
          {pseudoTaken && <p className="fc27-field-alert" role="alert">Ce pseudo possède déjà une fiche. Utilise « Modifier une fiche ».</p>}
          <label>Nom sur le maillot<input maxLength={LIMITS.kitName} value={draft.kitName} onChange={(e) => set('kitName', e.target.value)} placeholder="Ex. MBAPPÉ" autoComplete="off" /></label>
          <div className="fc27-field-block">
            <label htmlFor="fc27-kit-number">Numéro de maillot</label>
            <span className="fc27-number">
              <button type="button" aria-label="Numéro précédent" onClick={() => set('kitNumber', Math.max(LIMITS.kitNumber.min, (draft.kitNumber || 2) - 1))}>−</button>
              <input id="fc27-kit-number" type="number" inputMode="numeric" min={LIMITS.kitNumber.min} max={LIMITS.kitNumber.max} value={draft.kitNumber}
                onChange={(e) => set('kitNumber', e.target.value === '' ? '' : Math.trunc(Number(e.target.value)))} />
              <button type="button" aria-label="Numéro suivant" onClick={() => set('kitNumber', Math.min(LIMITS.kitNumber.max, (draft.kitNumber || 0) + 1))}>+</button>
            </span>
          </div>
          {numberHolder && <p className="fc27-field-alert" role="alert">Le numéro {draft.kitNumber} est déjà porté par {numberHolder.in_game_name || numberHolder.pseudo}. Choisis-en un autre.</p>}
          <p className="fc27-small fc27-taken">{takenNumbers.length ? `Numéros déjà pris : ${takenNumbers.join(' · ')}` : 'Aucun numéro pris pour le moment.'}</p>
        </div>
        <JerseyPreview name={draft.kitName} number={draft.kitNumber} />
        <ClubsBriefing />
      </div>}

      {step === 1 && <>
        <p className="fc27-step-intro">Deux choix suffisent : ton poste, puis ton archétype. Le reste est pré-rempli et reste modifiable si tu veux affiner.</p>

        <LookalikeSearch picked={lookalike} onPick={applyLookalike} onClear={() => setLookalike(null)} />

        <fieldset className="fc27-picker fc27-picker--positions" data-player-guide="position">
          <legend>Poste principal</legend>
          {POSITION_LINES.map((positionLine) => <div className="fc27-picker-line" key={positionLine.label} role="group" aria-label={`Poste principal · ${positionLine.label}`}>
            <span aria-hidden="true">{positionLine.label}</span>
            <div className="fc27-picker-options">
              {positionLine.positions.map((position) => <label className="fc27-choice" key={position}>
                <input type="radio" name="primary-position" checked={draft.primary === position} onChange={() => choosePrimary(position)} />
                <span><b>{position}</b> {POSITION_LABELS[position]}</span>
              </label>)}
            </div>
          </div>)}
        </fieldset>

        {posProfile && draft.primary
          && <PositionProfileCard profile={posProfile} position={draft.primary} option={option} onOption={applyOption} />}

        <fieldset className="fc27-picker" data-player-guide="archetype">
          <legend>
            Archétype{line && <> · {archetypes.length} archétypes {LINE_LABELS[line].plural}</>}
            <span className="fc27-source" title={ARCHETYPES_SOURCE.status}>FC 27 · lancement</span>
          </legend>
          {!line ? <p className="fc27-archetype-empty">Choisis ton poste principal pour découvrir les archétypes.</p>
            : <div className={`fc27-archetypes fc27-archetypes--${archetypes.length}`}>
              {archetypes.map((archetype) => <label className="fc27-choice fc27-choice--archetype" key={archetype.id}>
                <input type="radio" name="archetype" checked={draft.archetype === archetype.id} onChange={() => chooseArchetype(archetype.id)}
                  aria-describedby={`archetype-${archetype.id}-specialty`} />
                <span>
                  <img className="fc27-archetype-photo" src={archetypeImage(archetype.id)} alt="" width={640} height={640} loading="lazy" decoding="async" />
                  <span className="fc27-archetype-head"><strong>{archetype.name}</strong>{archetype.isNew && <em>Nouveau</em>}</span>
                  <span className="fc27-archetype-inspired">{archetype.inspiredBy ? <>Inspiré de <b>{archetype.inspiredBy}</b></> : 'Sans joueur de référence'}</span>
                  <span className="fc27-archetype-specialty" id={`archetype-${archetype.id}-specialty`}>{archetype.specialty}</span>
                </span>
              </label>)}
            </div>}
        </fieldset>

        {chosen && <ArchetypePayoff archetype={chosen} position={draft.primary}
          priorities={draft.priorities} onPriorities={(next) => set('priorities', next)} />}

        <details className="fc27-advanced" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
          <summary>
            <span className="fc27-advanced-title">Affiner ma fiche</span>
            <span className="fc27-advanced-hint">Poste secondaire · pied · gabarit · étoiles · notes</span>
            <span className="fc27-advanced-state" aria-hidden="true">Facultatif</span>
          </summary>
          <div className="fc27-advanced-body">
            <p className="fc27-advanced-lead">
              {chosen
                ? <>Valeurs de départ typiques d’un <b>{chosen.name}</b>. Change ce qui ne te ressemble pas : ce que tu règles ici ne sera plus écrasé.</>
                : <>Valeurs neutres tant qu’aucun archétype n’est choisi.</>}
            </p>

            <fieldset className="fc27-picker">
              <legend>Poste secondaire <span className="fc27-muted">(facultatif)</span></legend>
              <div className="fc27-picker-options">
                <label className="fc27-choice"><input type="radio" name="secondary-position" checked={draft.secondary === ''} onChange={() => set('secondary', '')} /><span>Aucun</span></label>
                {POSITION_LINES.flatMap((positionLine) => positionLine.positions).filter((position) => position !== draft.primary).map((position) => <label className="fc27-choice fc27-choice--compact" key={position}>
                  <input type="radio" name="secondary-position" checked={draft.secondary === position} onChange={() => set('secondary', position)} aria-label={`${position} ${POSITION_LABELS[position]}`} />
                  <span title={POSITION_LABELS[position]}><b>{position}</b></span>
                </label>)}
              </div>
            </fieldset>

            <fieldset className="fc27-picker">
              <legend>Pied fort</legend>
              <div className="fc27-picker-options">
                {FEET.map((foot) => <label className="fc27-choice" key={foot}>
                  <input type="radio" name="preferred-foot" checked={draft.foot === foot} onChange={() => set('foot', foot)} />
                  <span>{FOOT_LABEL[foot]}</span>
                </label>)}
              </div>
            </fieldset>

            <div className="fc27-morpho" data-player-guide="advanced">
              <MorphologyGauge id="fc27-height" label="Taille" unit="cm" value={draft.height} range={MORPHOLOGY.heightCm}
                advised={advised?.heightCm} onChange={(value) => tune('height', value)} />
              <MorphologyGauge id="fc27-weight" label="Poids" unit="kg" value={draft.weight} range={MORPHOLOGY.weightKg}
                advised={advised?.weightKg} onChange={(value) => tune('weight', value)} />
            </div>
            <p className="fc27-morpho-note">{MORPHOLOGY.note}</p>

            <div className="fc27-morpho">
              <StarsPicker legend="Mauvais pied" value={draft.weakFoot} onChange={(value) => tune('weakFoot', value)} />
              <StarsPicker legend="Gestes techniques" value={draft.skillMoves} onChange={(value) => tune('skillMoves', value)} />
            </div>

            <label>Points forts / notes <span className="fc27-muted">(facultatif)</span><textarea rows={2} maxLength={1000} value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Spécialiste penalty, gros volume de course…" /></label>
          </div>
        </details>
      </>}

      {errors.length > 0 && <ul className="fc27-step-errors" role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
      <ActionFeedback error={mutation.error} />
      <div className="fc27-wizard-actions">
        {step > 0 && <button type="button" className="fc27-button fc27-button--outline" onClick={() => { setAttempted(false); setStep(step - 1); }}>← Retour</button>}
        <button className="fc27-button" data-player-guide="save" disabled={mutation.isPending}>
          {isLast ? (mutation.isPending ? 'Enregistrement…' : 'Valider ma fiche et entrer dans le vestiaire') : 'Suivant →'}
        </button>
      </div>
    </form>
  </FC27Dialog>;
}
