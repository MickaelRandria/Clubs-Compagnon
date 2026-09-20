import type { ReactNode } from 'react';
import { ErrorBlock } from './ErrorBlock';

type QueryLike = { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };

/** Affiche le squelette pendant le chargement, un bloc d'erreur en cas d'échec, sinon le contenu. */
export function DataGate({ queries, skeleton, children }: { queries: QueryLike[]; skeleton: ReactNode; children: () => ReactNode }) {
  const failed = queries.find((q) => q.isError);
  if (failed) {
    return (
      <ErrorBlock
        message={failed.error instanceof Error ? failed.error.message : undefined}
        onRetry={() => queries.filter((q) => q.isError).forEach((q) => q.refetch())}
      />
    );
  }
  if (queries.some((q) => q.isPending)) return <>{skeleton}</>;
  return <>{children()}</>;
}
