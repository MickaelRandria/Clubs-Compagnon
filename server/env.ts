/** Charge .env.local / .env pour les scripts lancés hors de Vite (migrate, seed). */
export function loadLocalEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(file);
    } catch {
      // fichier absent : on garde l'environnement courant
    }
  }
}
