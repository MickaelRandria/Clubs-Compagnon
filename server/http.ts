export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Exécute un handler et transforme les erreurs en réponses JSON lisibles. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message, details: err.details }, { status: err.status });
    }
    console.error(err);
    return Response.json({ error: 'Erreur serveur. Réessaie dans un instant.' }, { status: 500 });
  }
}

/** Lit l'identifiant qui suit `segment` dans l'URL (ex. /api/matches/12/notes → 12). */
export function idAfter(request: Request, segment: string): number {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const id = Number(parts[parts.indexOf(segment) + 1]);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identifiant invalide.');
  return id;
}
