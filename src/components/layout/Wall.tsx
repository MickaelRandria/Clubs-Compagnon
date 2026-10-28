/**
 * Fond de page : un stade flouté, comme derrière les menus FIFA 17. Tout est en dégradés CSS
 * (styles/fifa17.css) : pas d'image à charger, et rien à recalculer pendant le défilement.
 */
export function Wall() {
  return (
    <div className="fc-wall" aria-hidden="true">
      <div className="fc-stadium" />
    </div>
  );
}
