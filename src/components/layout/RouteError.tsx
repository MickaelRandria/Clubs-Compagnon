import { useRouteError } from 'react-router';

/**
 * Écran affiché quand une page plante au rendu, à la place de la page développeur de React Router.
 * Le cas typique : un cache gardé sur le téléphone à un ancien format. Recharger en repartant
 * du serveur suffit presque toujours.
 */
export function RouteError() {
  const error = useRouteError();
  console.error('[route]', error);
  const reload = () => {
    try { window.localStorage.removeItem('dommage.query.v1'); } catch { /* stockage refusé */ }
    window.location.reload();
  };
  return (
    <div className="fc-view" style={{ minHeight: '70vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16, padding: 24 }}>
      <h1 className="fc-title fc-title--lg">Oups, cette page a calé</h1>
      <p className="fc-body">Un bug de notre côté. Recharge l'app : elle repartira des dernières données du serveur.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="fc-cta" onClick={reload}>Recharger</button>
        <a className="fc-cta" href="/">Retour à l'accueil</a>
      </div>
    </div>
  );
}
