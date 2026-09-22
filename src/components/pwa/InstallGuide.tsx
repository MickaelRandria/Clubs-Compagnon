import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Device = 'ios' | 'android' | 'desktop';
type Step = { title: string; text: string; tip: string; cue: string };
const labels: Record<Device, string> = { ios: 'iPhone / iPad', android: 'Android', desktop: 'Ordinateur' };
const steps: Record<Device, Step[]> = {
  ios: [
    { title: 'Ouvre le site dans Safari', text: 'Safari, c’est l’icône bleue en forme de boussole sur ton iPhone. Ouvre cette même page dedans. Si tu es déjà dans Safari, passe à la suite.', tip: 'Tu arrives de Discord, Instagram ou Facebook ? Copie le lien ci-dessous, ouvre Safari, puis colle-le dans la barre d’adresse.', cue: 'Repère la boussole Safari' },
    { title: 'Repère le bouton Partager', text: 'Dans Safari, touche le carré avec une flèche vers le haut. Selon ta version, ouvre d’abord le menu de la page « … », puis touche « Partager ».', tip: 'Le bouton peut se trouver en haut ou en bas. Touche la barre d’adresse si les commandes du navigateur sont cachées.', cue: 'Le carré avec la flèche vers le haut' },
    { title: 'Ajoute le club à ton accueil', text: 'Fais défiler le menu de partage vers le haut et touche « Sur l’écran d’accueil ». Sur l’écran suivant, laisse « Ouvrir comme app web » activé si proposé, puis touche « Ajouter ».', tip: 'L’option est plus bas dans la liste, sous les contacts. Si elle manque, cherche « Modifier les actions » tout en bas pour l’ajouter.', cue: 'Fais défiler, puis choisis cette ligne' },
    { title: 'Retrouve l’icône du club', text: 'Retourne sur l’écran d’accueil de ton iPhone. Cherche l’icône Dommage FC, puis touche-la pour ouvrir le club comme une app.', tip: 'Elle peut être sur la page suivante : fais glisser ton écran vers la gauche. Tu peux ensuite maintenir l’icône pour la déplacer près de tes apps préférées.', cue: 'Ton nouveau raccourci vers le club' },
  ],
  android: [
    { title: 'Ouvre le site dans Chrome', text: 'Repère l’icône ronde rouge, jaune, verte et bleue de Chrome. Ouvre cette même page dedans. Si tu es déjà dans Chrome, passe à la suite.', tip: 'Tu arrives de Discord, Instagram ou Facebook ? Copie le lien ci-dessous et colle-le dans la barre d’adresse de Chrome.', cue: 'Repère l’icône Google Chrome' },
    { title: 'Ouvre les trois petits points', text: 'Dans Chrome, touche le menu « ⋮ », à droite de la barre d’adresse. Une liste d’options va s’ouvrir.', tip: 'Ce sont les points du navigateur, pas ceux du site. Si tu ne les vois pas, fais légèrement défiler la page vers le haut.', cue: 'Les trois points à droite de l’adresse' },
    { title: 'Confirme l’installation', text: 'Dans le menu, cherche « Installer et créer un raccourci », puis « Installer ». Selon ta version, l’option s’appelle « Installer l’application » ou « Ajouter à l’écran d’accueil ». Confirme ensuite.', tip: 'Si le téléphone te propose de placer l’icône, touche « Ajouter ». Pas besoin de passer par le Play Store.', cue: 'Choisis Installer, puis confirme' },
    { title: 'Retrouve l’icône du club', text: 'Retourne sur l’écran d’accueil et touche l’icône Dommage FC. Le club est désormais à portée de doigt.', tip: 'Tu ne vois pas l’icône ? Fais glisser l’écran vers le haut pour voir toutes tes applications, puis cherche Dommage FC. Maintiens son icône pour l’ajouter à l’accueil.', cue: 'Ton nouveau raccourci vers le club' },
  ],
  desktop: [
    { title: 'Ouvre le site dans Chrome ou Edge', text: 'Sur ordinateur, ouvre cette page dans Chrome ou Edge pour suivre ce guide.', tip: 'Tu souhaites l’installer sur ton téléphone ? Ouvre le site dessus et choisis le parcours iPhone ou Android.', cue: 'Le club dans ton navigateur' },
    { title: 'Repère l’option d’installation', text: 'Cherche le symbole d’installation à droite de l’adresse du site, ou ouvre le menu « … » du navigateur.', tip: 'Dans le menu, cherche une rubrique « Applications » ou « Installer » : son nom varie selon le navigateur.', cue: 'À droite de la barre d’adresse' },
    { title: 'Installe l’application', text: 'Choisis l’installation de Dommage FC, puis confirme dans la fenêtre du navigateur.', tip: 'Si aucune option n’apparaît, vérifie que l’app n’est pas déjà installée et utilise une fenêtre de navigation normale.', cue: 'Confirme dans la fenêtre du navigateur' },
    { title: 'Ouvre le club depuis tes apps', text: 'Retrouve Dommage FC dans les applications de ton ordinateur. Tu peux l’épingler pour y accéder encore plus vite.', tip: 'Sur Windows, cherche Dommage FC dans le menu Démarrer. L’app s’ouvre dans sa propre fenêtre.', cue: 'Le club a sa propre fenêtre' },
  ],
};

function detectDevice(): Device {
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return /Android/.test(navigator.userAgent) ? 'android' : 'desktop';
}

function ShareIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 15V2m-4 4 4-4 4 4M7 9H4v13h16V9h-3" /></svg>;
}

function AppIcon() {
  return <img className="install-app-icon" src="/icons/icon-192.png" alt="" width="64" height="64" />;
}

// Deliberately schematic: browser controls vary by OS version and display settings.
function DevicePicture({ device, step, cue }: { device: Device; step: number; cue: string }) {
  const home = step === 0 || step === 4;
  return <figure className="install-visual" aria-label={cue}>
    <div className={`install-phone ${device === 'desktop' ? 'install-phone--desktop' : ''}`} aria-hidden="true">
      <div className="install-phone-status"><span>9:41</span><span>● ▰</span></div>
      {home ? <div className="install-home">
        <div className="install-home-date">LE CLUB, TOUJOURS AVEC TOI</div>
        <div className="install-home-grid"><i /><i /><i /><i /><div className="install-home-app"><AppIcon /><span>Dommage FC</span><b className="install-pointer">↑</b></div><i /></div>
        <div className="install-home-dock"><i /><i /><i /></div>
      </div> : <>
        <div className="install-address"><span>{window.location.host}</span><b className={step === 2 && device !== 'ios' ? 'install-highlight' : ''}>⋮</b></div>
        <div className="install-mini-site"><AppIcon /><strong>DOMMAGE FC</strong><span>Tout le club.<br />Au même endroit.</span><div className="install-mini-tiles"><i>LE CLUB</i><i>MON PROFIL</i></div></div>
        {step === 1 && <div className="install-browser-card"><div className={`install-browser-logo install-browser-logo--${device === 'ios' ? 'safari' : 'chrome'}`} /><strong>{device === 'ios' ? 'Safari' : device === 'android' ? 'Chrome' : 'Chrome / Edge'}</strong><span>Ouvre le site ici</span></div>}
        {step === 2 && (device === 'ios' ? <div className="install-safari-bar"><span>‹</span><span>›</span><span className="install-highlight"><ShareIcon /><b className="install-pointer">↓</b></span><span>▢</span></div> : <div className="install-menu-preview"><span>Nouvel onglet</span><span>Historique</span><span>Téléchargements</span><strong>Le menu est ici ↑</strong></div>)}
        {step === 3 && <div className="install-sheet"><div className="install-sheet-handle" /><div className="install-sheet-brand"><AppIcon /><strong>Dommage FC</strong></div><span>{device === 'ios' ? 'Copier' : 'Partager'}</span><div className="install-highlight install-menu-choice"><b>⊞</b>{device === 'ios' ? 'Sur l’écran d’accueil' : 'Installer l’application'}<b>←</b></div><div className="install-confirm">{device === 'ios' ? 'Puis « Ajouter »' : 'Puis confirmer « Installer »'} ✓</div></div>}
      </>}
      <div className="install-phone-handle" />
    </div>
    <figcaption><strong>{cue}</strong><span>Illustration simplifiée · l’apparence peut varier</span></figcaption>
  </figure>;
}

interface Props {
  installed: boolean;
  canInstall: boolean;
  onInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  onClose: () => void;
}

export function InstallGuide({ installed, canInstall, onInstall, onClose }: Props) {
  const [device, setDevice] = useState<Device>(detectDevice);
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const currentStep = installed ? 4 : step;
  const current = steps[device][Math.max(0, currentStep - 1)];
  const siteUrl = `${window.location.origin}/`;

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    titleRef.current?.focus({ preventScroll: true });
  }, [currentStep]);

  async function copyLink() {
    try { await navigator.clipboard.writeText(siteUrl); setCopyNotice('Lien copié ! Ouvre le navigateur et colle-le dans la barre d’adresse.'); }
    catch { linkRef.current?.focus(); linkRef.current?.select(); setCopyNotice('Maintiens le lien sélectionné, puis choisis « Copier ».'); }
  }

  async function install() {
    if (pending) return;
    setPending(true);
    setNotice('');
    try {
      const outcome = await onInstall();
      if (outcome === 'accepted') setStep(4);
      else setNotice(outcome === 'dismissed' ? 'Tu as fermé la fenêtre. Aucun souci : tu peux continuer avec le menu du navigateur expliqué ci-dessus.' : 'L’installation directe n’est pas disponible ici. Suis les indications ci-dessus dans le menu du navigateur.');
    } finally { setPending(false); }
  }

  return createPortal(<dialog ref={dialogRef} className="install-guide" aria-labelledby="install-guide-title" onCancel={onClose}>
    <header className="install-guide-header"><span><AppIcon /><strong>DOMMAGE FC <small>LE CLUB DANS TA POCHE</small></strong></span><button className="install-close" type="button" onClick={onClose} aria-label="Fermer le guide">✕</button></header>
    <div className="install-guide-scroll" ref={contentRef}>
      <div className="install-device-picker" role="group" aria-label="Ton appareil">
        {(Object.keys(labels) as Device[]).map(value => <button type="button" key={value} aria-pressed={device === value} onClick={() => { setDevice(value); setStep(0); setNotice(''); setCopyNotice(''); }}>{labels[value]}</button>)}
      </div>
      <div className="install-guide-layout">
        <DevicePicture device={device} step={currentStep} cue={currentStep === 0 ? 'Une icône. Un appui. Tout le club.' : current.cue} />
        <div className="install-guide-copy">
          <p className="install-eyebrow">{currentStep === 0 ? 'GRATUIT · QUELQUES GESTES SUFFISENT' : `TON GUIDE ${labels[device]} · ÉTAPE ${currentStep} SUR 4`}</p>
          <h2 id="install-guide-title" ref={titleRef} tabIndex={-1}>{currentStep === 0 ? <>Le club, à portée<br />de main.</> : installed ? 'L’app est installée !' : current.title}</h2>
          {currentStep === 0 ? <>
            <p className="install-intro">Ajoute Dommage FC à ton écran d’accueil. On t’accompagne, un geste après l’autre. Prends ton temps.</p>
            <ul className="install-benefits">
              <li><b aria-hidden="true">↗</b><div><strong>Fini le lien à retrouver</strong><span>Ouvre le club en un appui, comme tes autres apps.</span></div></li>
              <li><b aria-hidden="true">▣</b><div><strong>Plus confortable au quotidien</strong><span>Ton profil et les stats dans une fenêtre dédiée, sans les onglets du navigateur.</span></div></li>
              <li><b aria-hidden="true">⚽</b><div><strong>Garde le club près de toi</strong><span>Un accès direct pour consulter les nouveautés et participer à la vie du club.</span></div></li>
            </ul>
            <p className="install-reassurance">C’est gratuit et facultatif. Ton compte reste le même ; reconnecte-toi si demandé. Internet reste nécessaire pour les données à jour.</p>
          </> : <>
            <div className="install-progress" aria-label={`Étape ${currentStep} sur 4`}>{[1, 2, 3, 4].map(value => <span key={value} className={value <= currentStep ? 'is-complete' : ''} />)}</div>
            <p className="install-instruction">{current.text}</p>
            <aside className="install-tip"><strong>Un petit coup de pouce</strong><p>{current.tip}</p></aside>
            {currentStep === 1 && <div className="install-copy-link"><label htmlFor="install-site-url">Le lien du club à ouvrir</label><input ref={linkRef} id="install-site-url" value={siteUrl} readOnly onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => void copyLink()}>Copier le lien du club</button><p role="status">{copyNotice}</p></div>}
            {currentStep === 3 && device !== 'ios' && canInstall && <button className="install-primary install-native" type="button" disabled={pending} onClick={() => void install()}>{pending ? 'Confirme dans la fenêtre…' : 'Installer directement sur cet appareil'}</button>}
            {currentStep === 4 && <p className="install-reassurance">Si tu vois l’icône et que l’app s’ouvre, c’est tout bon ! Sinon, reviens à l’étape précédente : tu peux refaire les gestes tranquillement.</p>}
            <p className="install-notice" role="status">{notice}</p>
            <details className="install-help" key={`${device}-${currentStep}`}><summary>Je ne retrouve pas ce qui est montré</summary><p>{device === 'ios' ? 'Vérifie que tu es dans Safari. Selon la version d’iOS, les menus changent de place. Dans le partage, fais bien défiler toute la liste des actions.' : 'Utilise Chrome dans une fenêtre normale, hors navigation privée. Si l’option manque, l’app est peut-être déjà installée : cherche Dommage FC dans tes applications.'}</p><p>Tu peux fermer ce guide à tout moment et le rouvrir avec « Installer l’app ».</p><a href={device === 'ios' ? 'https://support.apple.com/fr-fr/guide/iphone/iphea86e5236/ios' : `https://support.google.com/chrome/answer/9658361?hl=fr&co=GENIE.Platform%3D${device === 'android' ? 'Android' : 'Desktop'}`} target="_blank" rel="noreferrer">Voir l’aide {device === 'ios' ? 'Apple' : 'Google'} (nouvel onglet) ↗</a></details>
          </>}
        </div>
      </div>
    </div>
    <footer className="install-guide-footer"><button type="button" disabled={pending} onClick={() => currentStep === 0 || installed ? onClose() : setStep(currentStep - 1)}>{installed ? 'Fermer' : currentStep === 0 ? 'Plus tard' : '← Retour'}</button><button type="button" className="install-primary" disabled={pending} onClick={() => currentStep === 4 ? onClose() : setStep(currentStep + 1)}>{currentStep === 0 ? 'On commence →' : currentStep === 4 ? 'Terminer le guide' : 'Étape suivante →'}</button></footer>
  </dialog>, document.body);
}
