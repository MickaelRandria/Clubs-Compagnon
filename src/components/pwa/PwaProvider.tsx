import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallContext = createContext<{
  installed: boolean;
  prompt: InstallPrompt | null;
  clearPrompt: () => void;
}>({ installed: false, prompt: null, clearPrompt: () => {} });

export function PwaProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [installed, setInstalled] = useState(false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [updateError, setUpdateError] = useState(false);
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, value) { registration.current = value; },
    onRegisterError(error) { console.warn('Installation hors connexion indisponible.', error); },
  });

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)');
    const syncInstalled = () => setInstalled(standalone.matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const checkUpdate = () => {
      if (navigator.onLine && document.visibilityState === 'visible') {
        void registration.current?.update().catch(() => { /* Retry when back online. */ });
      }
    };
    const syncOnline = () => { setOnline(navigator.onLine); checkUpdate(); };
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const didInstall = () => { setInstalled(true); setPrompt(null); };
    syncInstalled();
    standalone.addEventListener('change', syncInstalled);
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', didInstall);
    document.addEventListener('visibilitychange', checkUpdate);
    const interval = window.setInterval(checkUpdate, 60 * 60 * 1000);
    return () => {
      standalone.removeEventListener('change', syncInstalled);
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', didInstall);
      document.removeEventListener('visibilitychange', checkUpdate);
      window.clearInterval(interval);
    };
  }, []);

  async function applyUpdate() {
    setUpdateError(false);
    try { await updateServiceWorker(true); }
    catch { setUpdateError(true); }
  }

  return (
    <InstallContext.Provider value={{ installed, prompt, clearPrompt: () => setPrompt(null) }}>
      {!online && <div className="pwa-banner" role="status">
        <strong>Hors connexion</strong>
        <span>L’interface reste accessible. Reconnecte-toi pour charger tes stats, utiliser Discord ou enregistrer des modifications.</span>
      </div>}
      {needRefresh && <div className="pwa-banner" role="status">
        <span>Une nouvelle version est disponible. Termine et enregistre ta saisie avant de l’appliquer.</span>
        <button type="button" disabled={!online} onClick={() => void applyUpdate()}>Mettre à jour</button>
        <button type="button" onClick={() => setNeedRefresh(false)}>Plus tard</button>
        {updateError && <span>La mise à jour a échoué. Réessaie une fois connecté.</span>}
      </div>}
      {children}
    </InstallContext.Provider>
  );
}

export function InstallApp() {
  const { installed, prompt, clearPrompt } = useContext(InstallContext);
  const [showHelp, setShowHelp] = useState(false);
  const [pending, setPending] = useState(false);
  if (installed) return null;

  async function install() {
    if (!prompt) { setShowHelp((value) => !value); return; }
    setPending(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch { setShowHelp(true); }
    finally { clearPrompt(); setPending(false); }
  }

  return <div className="pwa-install">
    <button type="button" disabled={pending} aria-expanded={showHelp} aria-controls="pwa-install-help" onClick={() => void install()}>
      Installer l’app
    </button>
    {showHelp && <div id="pwa-install-help" className="pwa-install-help" role="status">
      <p><strong>iPhone / iPad :</strong> ouvre ce site dans Safari, puis Partager → Sur l’écran d’accueil.</p>
      <p><strong>Android / ordinateur :</strong> dans le menu du navigateur, choisis « Installer l’application » ou « Ajouter à l’écran d’accueil » si proposé.</p>
      <button type="button" onClick={() => setShowHelp(false)}>Fermer</button>
    </div>}
  </div>;
}
