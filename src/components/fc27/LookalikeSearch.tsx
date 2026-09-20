import { useState } from 'react';
import { searchLookalikes, type Lookalike } from '../../../shared/data/lookalikes';
import { useLookalikeLookup } from '../../api/fc27';

const fromModel = (entry: Lookalike) => entry.id.startsWith('modele:');

/** Choisir une inspiration remplit le build ; une réponse réseau ne l'applique jamais seule. */
export function LookalikeSearch({ picked, onPick, onClear }: {
  picked: Lookalike | null; onPick: (entry: Lookalike) => void; onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [requested, setRequested] = useState('');
  const lookup = useLookalikeLookup(requested);
  const term = query.trim();
  const curated = searchLookalikes(term);
  // Le résultat reste attaché au nom demandé, même si une ancienne requête finit plus tard.
  const current = requested !== '' && requested === term;
  const response = current ? lookup.data : undefined;
  const pending = current && lookup.isFetching;
  const results = curated.length ? curated : response?.found ? [response.entry] : [];
  const searchable = term.length >= 2 && term.length <= 60;
  const unavailable = response && !response.found ? response.reason : null;
  const message = pending ? 'Recherche du joueur en cours…'
    : current && lookup.isError ? 'La recherche est indisponible. Réessaie ou compose ton joueur ci-dessous.'
    : unavailable === 'not-configured' ? 'La recherche étendue n’est pas disponible pour le moment. Essaie un autre nom ou compose ton joueur ci-dessous.'
    : unavailable === 'failed' ? 'La recherche est temporairement indisponible. Réessaie ou compose ton joueur ci-dessous.'
    : unavailable === 'unknown' ? 'Ce joueur n’a pas pu être identifié avec assez de confiance. Précise son nom ou compose ton joueur ci-dessous.'
    : searchable && results.length === 0 ? 'Ce nom ne figure pas dans notre sélection. Lance une recherche étendue ou compose ton joueur ci-dessous.'
    : '';

  function search() {
    if (!searchable || curated.length || pending) return;
    if (current) void lookup.refetch();
    else setRequested(term);
  }

  if (picked) return <section className="fc27-lookalike fc27-lookalike--picked" aria-labelledby="fc27-lookalike-title">
    <div className="fc27-lookalike-head">
      <p className="fc27-lookalike-kicker" id="fc27-lookalike-title">Ton inspiration</p>
      <button type="button" className="fc27-lookalike-clear" onClick={() => { setQuery(''); setRequested(''); onClear(); }}>Changer</button>
    </div>
    <p className="fc27-lookalike-name"><strong>{picked.name}</strong><span>{picked.era} · {picked.position}</span></p>
    {fromModel(picked) && <p className="fc27-lookalike-source">Suggestion IA · profil approximatif à ajuster</p>}
    <p className="fc27-lookalike-signature">{picked.signature}</p>
    <p className="fc27-lookalike-why"><b>Pourquoi cet archétype :</b> {picked.why}</p>
  </section>;

  return <section className="fc27-lookalike" aria-labelledby="fc27-lookalike-title">
    <p className="fc27-lookalike-kicker" id="fc27-lookalike-title">Tu veux ressembler à quelqu’un ?</p>
    <p className="fc27-lookalike-lead" id="fc27-lookalike-help">Choisis un joueur : poste, archétype, gabarit et ordre de dépense se remplissent. Tu peux ensuite tout ajuster.</p>
    <input type="search" className="fc27-lookalike-input" value={query} autoComplete="off" maxLength={60}
      aria-label="Joueur de référence" aria-describedby="fc27-lookalike-help"
      placeholder="Zidane, Kanté, Ronaldinho…"
      onChange={(event) => { setQuery(event.target.value); setRequested(''); }}
      onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); search(); } }} />
    {results.length > 0 && <ul className="fc27-lookalike-results" aria-label="Joueurs proposés">
      {results.map((entry) => <li key={entry.id}>
        <button type="button" onClick={() => { setQuery(''); setRequested(''); onPick(entry); }}>
          <strong>{entry.name}</strong>
          <span>{entry.position} · {entry.era}{fromModel(entry) ? ' · Suggestion IA' : ''}</span>
          <em>{entry.signature}</em>
        </button>
      </li>)}
    </ul>}
    <div role="status" aria-live="polite">{message && <p className="fc27-lookalike-empty">{message}</p>}</div>
    {searchable && curated.length === 0 && !response?.found && <button type="button" className="fc27-lookalike-search"
      disabled={pending} onClick={search}>{pending ? 'Recherche…' : 'Rechercher ce joueur'}</button>}
  </section>;
}
