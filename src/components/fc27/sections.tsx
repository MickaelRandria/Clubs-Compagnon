import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useIsMobile } from '../../lib/hooks';

// Découpage mobile de la page FC 27.
//
// Sur petit écran, la page entière fait plus de sept écrans de haut : tout est empilé,
// le bouton « Créer ma fiche » arrive après 1 400 px et on ne sait plus où on en est.
// On affiche donc une section à la fois, pilotée par `?vue=` pour que l'URL reste
// partageable et que le guide pas à pas puisse ouvrir la bonne section.
//
// Sur grand écran rien ne change : la page reste d'un seul tenant.

export const SECTION_IDS = ['nom', 'fiche', 'effectif', 'rapport'] as const;
export type SectionId = typeof SECTION_IDS[number];

export const SECTIONS: { id: SectionId; step: number; label: string; short: string }[] = [
  { id: 'nom', step: 1, label: 'Le nom du club', short: 'Nom' },
  { id: 'fiche', step: 2, label: 'Ta fiche joueur', short: 'Fiche' },
  { id: 'effectif', step: 3, label: 'L’effectif', short: 'Effectif' },
  { id: 'rapport', step: 4, label: 'Le rapport', short: 'Rapport' },
];

const isSection = (value: string | null): value is SectionId =>
  value !== null && (SECTION_IDS as readonly string[]).includes(value);

/**
 * Section active et navigation. Sur grand écran, `active` vaut null : tout est affiché.
 * Le paramètre `vue` est conservé dans l'URL même sur desktop, pour qu'un lien reçu
 * sur mobile ouvre la bonne section.
 */
export function useSection() {
  const [params, setParams] = useSearchParams();
  const isMobile = useIsMobile();
  const raw = params.get('vue');
  const current: SectionId = isSection(raw) ? raw : 'nom';
  const index = SECTIONS.findIndex((s) => s.id === current);

  const go = (id: SectionId) => {
    const next = new URLSearchParams(params);
    next.set('vue', id);
    // `replace` : les sections ne doivent pas remplir l'historique du navigateur.
    setParams(next, { replace: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return {
    isMobile,
    current,
    index,
    /** null sur grand écran : aucune section n'est masquée. */
    active: isMobile ? current : null,
    next: index < SECTIONS.length - 1 ? SECTIONS[index + 1] : null,
    previous: index > 0 ? SECTIONS[index - 1] : null,
    go,
    /** Une section est-elle visible dans le rendu courant ? */
    shows: (id: SectionId) => !isMobile || current === id,
  };
}

/** Bande d'étapes collante, en haut de la page sur mobile. */
export function SectionTabs({ current, onSelect }: { current: SectionId; onSelect: (id: SectionId) => void }) {
  return <nav className="fc27-steps" aria-label="Étapes de la préparation">
    {SECTIONS.map((section) => <button key={section.id} type="button" className="fc27-step-tab"
      aria-current={section.id === current ? 'step' : undefined} onClick={() => onSelect(section.id)}>
      <b>{section.step}</b><span>{section.short}</span>
    </button>)}
  </nav>;
}

/**
 * Bloc repliable sur mobile uniquement. Sur grand écran le contenu reste ouvert,
 * sans résumé ni chevron : on ne masque rien là où la place ne manque pas.
 */
export function Fold({ title, count, children, open = false }: {
  title: string; count?: number; children: ReactNode; open?: boolean;
}) {
  const isMobile = useIsMobile();
  // `key` force un remontage au changement de largeur : un <details> ne doit pas
  // garder un état replié quand il redevient un simple bloc.
  const key = useMemo(() => (isMobile ? 'mobile' : 'desktop'), [isMobile]);
  if (!isMobile) return <div className="fc27-fold fc27-fold--open">{children}</div>;
  return <details key={key} className="fc27-fold" open={open}>
    <summary>
      <span>{title}</span>
      {count !== undefined && <b>{count}</b>}
      <i aria-hidden="true" />
    </summary>
    <div className="fc27-fold-body">{children}</div>
  </details>;
}
