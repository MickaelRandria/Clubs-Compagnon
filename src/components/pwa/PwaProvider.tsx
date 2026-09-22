import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { InstallGuide } from './InstallGuide';

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
  if (installed && !showHelp) return null;

  async function install() {
    if (!prompt) return 'unavailable' as const;
    try {
      await prompt.prompt();
      return (await prompt.userChoice).outcome;
    } catch { return 'unavailable' as const; }
    finally { clearPrompt(); }
  }

  return <div className="pwa-install">
    <button type="button" aria-haspopup="dialog" aria-expanded={showHelp} onClick={() => setShowHelp(true)}>
      Installer l’app
    </button>
    {showHelp && <InstallGuide installed={installed} canInstall={Boolean(prompt)} onInstall={install} onClose={() => setShowHelp(false)} />}
  </div>;
}
