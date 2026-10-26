import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { UI_IMAGES } from '../../shared/data/archetypes';
import type { FC27State } from '../../shared/fc27';
import { useFC27 } from '../api/fc27';
import { useIsAdmin } from '../api/profile';
import { BetsTeaser } from '../components/bets/BetsTeaser';
import { FC27Backdrop } from '../components/fc27/FC27Decor';
import { FC27Settings } from '../components/fc27/FC27Settings';
import { PlayerWizard } from '../components/fc27/PlayerWizard';
import { PositionOverview } from '../components/fc27/PlayersPreparation';
import { SeasonTile } from '../components/fc27/SeasonTile';
import { TacticalReport } from '../components/fc27/TacticalReport';
import { AccountChip, SignInButton, SignInNotice, SignedInAs, useMyProfile } from '../components/fc27/SignIn';
import { SectionTabs, useSection } from '../components/fc27/sections';
import { useTour } from '../components/tour/TourHost';
import { DataGate } from '../components/ui/DataGate';
import { Skeleton } from '../components/ui/Skeleton';
import { usePageTitle } from '../lib/hooks';

function Preparation({ state }: { state: FC27State }) {
  const [dialog, setDialog] = useState<'settings' | 'create' | 'edit' | null>(null);
  const section = useSection();
  const tour = useTour();
  const [params] = useSearchParams();
  const me = useMyProfile(state.players);
  const isAdmin = useIsAdmin();
  const archived = state.campaign.status === 'archived';
  const count = state.players.length;

  /**
   * Action principale de la section courante, reprise dans la barre collante du bas.
   * Une seule action à l'écran à la fois : c'est ce qui remplace les boutons éparpillés
   * tout au long du scroll.
   */
  const primary = (() => {
    if (section.current === 'fiche' && !archived && me.account) {
      return me.profile
        ? { label: 'Modifier ma fiche', run: () => setDialog('edit') }
        : { label: count > 0 ? 'Créer ma fiche' : 'Créer la première fiche', run: () => setDialog('create') };
    }
    if (section.next) return { label: `${section.next.label} →`, run: () => section.go(section.next!.id) };
    // Dernière section : on laisse un chemin de retour explicite plutôt qu'une barre vide.
    if (section.previous) return { label: `← ${section.previous.label}`, run: () => section.go(section.previous!.id), back: true };
    return null;
  })();

  return <div className={`fc27${section.isMobile ? ' fc27--sectioned' : ''}`}>
    <div className="fc27-banner"><span className="fc27-phase">{archived ? 'Préparation archivée' : 'Saison en cours'}</span><span className="fc27-banner-text">{archived ? 'Les choix du collectif, conservés en lecture seule.' : 'Les stats arrivent d’EA ; fiches et rapport du staff restent ouverts.'}</span>
      <AccountChip />
      {isAdmin && <button className="fc27-text-button" onClick={() => setDialog('settings')}>Réglages FC 27 ↗</button>}</div>
    {/*
      Sur mobile, le grand titre n'est affiché qu'à la première section. Répété sur les
      quatre, il reprenait 138 px à chaque changement d'étape pour une information déjà
      lue. Le titre compact garde un h1 — la page ne doit pas se retrouver sans titre —
      mais tient sur une ligne. Sur grand écran, rien ne change.
    */}
    {section.isMobile && section.current !== 'saison'
      ? <div className="fc27-heading fc27-heading--compact"><h1 className="fc-title">Cap sur <span className="fc27-heading-accent">FC 27</span></h1></div>
      : <div className="fc27-heading"><div><p className="fc27-eyebrow">FoodBall Club · Saison FC 27</p><h1 className="fc-title">Cap sur <span className="fc27-heading-accent">FC 27</span></h1></div><span className="fc27-season">Le même collectif.<br />Une nouvelle saison.</span></div>}
    {section.isMobile && <SectionTabs current={section.current} onSelect={section.go} />}
    <SignInNotice reason={params.get('connexion')} />
    {archived && <p className="fc27-archive-link">Lien de l’archive : <Link to={`/fc27?campagne=${state.campaign.id}`}>Campagne {state.campaign.id}</Link> · <Link to="/fc27">Préparation la plus récente</Link></p>}
    <div className="fc27-top-grid">
      {section.shows('saison') && <SeasonTile />}
      {section.shows('fiche') && <section className="fc-block fc27-player-tile" aria-labelledby="fc27-player-title">
        <img className="fc27-player-cutout" src={UI_IMAGES.playerCutout} alt="" width={600} height={708} decoding="async" />
        <div className="fc27-player-copy">
          <p className="fc27-tag fc27-tag--light">Prépare ton entrée</p>
          <h2 id="fc27-player-title" className="fc27-player-title">Ton joueur.<br />Ta place dans<br />le collectif.</h2>
          <p className="fc27-player-lead">Ton poste, tes alternatives, tes points forts. Tout commence ici.</p>
        </div>
        <div className="fc27-player-count"><strong>{count.toString().padStart(2, '0')}</strong><span>Fiche{count > 1 ? 's' : ''} dans le vestiaire</span></div>
        <SignedInAs />
        {!archived && <div className={`fc27-player-actions${me.account ? '' : ' fc27-player-actions--signin'}`}>
          {me.loading ? <span className="fc27-pad fc27-pad--waiting">…</span>
            : !me.account ? <SignInButton />
            : me.profile
              ? <button className="fc27-pad fc27-pad--primary" onClick={() => setDialog('edit')}>Modifier ma fiche <span aria-hidden="true">→</span></button>
              : <button className="fc27-pad fc27-pad--primary" onClick={() => setDialog('create')}>Créer ma fiche <span aria-hidden="true">→</span></button>}
        </div>}
        <p className="fc27-small">{me.account ? 'Ta fiche n’appartient qu’à toi' : 'Une connexion Discord, une fiche'}</p>
      </section>}</div>
    {section.shows('saison') && <BetsTeaser />}
    {section.shows('effectif') && <PositionOverview players={state.players} />}
    {section.shows('rapport') && <TacticalReport players={state.players} campaignId={state.campaign.id} />}

    {/* Barre d'action collante : masquée pendant le guide, qui occupe déjà le bas de l'écran. */}
    {section.isMobile && primary && !tour.running && <div className="fc27-actionbar">
      {section.previous && !('back' in primary) && <button type="button" className="fc27-actionbar-back"
        aria-label={`Revenir à ${section.previous.label}`} onClick={() => section.go(section.previous!.id)}>←</button>}
      {section.current === 'fiche' && !archived && !me.account
        ? <SignInButton className="fc27-actionbar-go" />
        : <button type="button" className="fc27-actionbar-go" onClick={primary.run}>{primary.label}</button>}
    </div>}
    {isAdmin && dialog === 'settings' && <FC27Settings state={state} onClose={() => setDialog(null)} />}
    {!archived && me.account && (dialog === 'create' || dialog === 'edit') && <PlayerWizard key={me.account.id} state={state} mode={dialog} myProfile={me.profile} onClose={() => setDialog(null)} />}
  </div>;
}

export function FC27View() {
  usePageTitle('FC 27 · Préparation');
  const [params] = useSearchParams();
  const campaignId = params.has('campagne') ? Number(params.get('campagne')) : undefined;
  const query = useFC27(campaignId);
  return <div className="fc-view fc-view--fc27"><FC27Backdrop /><DataGate queries={[query]} skeleton={<Skeleton rows={[[[1.55, 1], 440], [[1], 400]]} />}>
    {() => <Preparation key={query.data!.campaign.id} state={query.data!} />}
  </DataGate></div>;
}
