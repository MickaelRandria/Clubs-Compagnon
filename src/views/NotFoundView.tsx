import { NotFoundBlock } from '../components/ui/NotFoundBlock';
import { usePageTitle } from '../lib/hooks';

export function NotFoundView() {
  usePageTitle('Page introuvable');
  return (
    <NotFoundBlock
      title="Page introuvable"
      text="Cette adresse ne correspond à aucune page du club."
      to="/"
      cta="Retour au Dashboard"
    />
  );
}
