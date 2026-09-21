export class ApiError extends Error {
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(status: number, message: string, details?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  } catch {
    throw new ApiError(0, 'Le serveur est injoignable.');
  }
  let data: { error?: string; details?: Record<string, string[]> } | null = null;
  let malformed = false;
  try {
    data = await response.json();
  } catch {
    malformed = true;
  }
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? `Erreur ${response.status}.`, data?.details);
  }
  // Une réponse 200 qui n'est pas du JSON (page d'erreur de la plateforme, coquille du
  // service worker) donnait `null` : la requête passait pour réussie et l'écran devenait
  // blanc au premier accès à la donnée. Mieux vaut une erreur affichée et un bouton Réessayer.
  if (malformed || data === null) {
    throw new ApiError(response.status, 'Réponse inattendue du serveur.');
  }
  return data as T;
}
