// Contenu éditorial de la nuit des Playoffs — statique (hors base pour l'instant).

export const PLAYOFF_NIGHT = {
  season: 2026,
  division: 3,
  host: 'Rina',
  wins: 9,
  losses: 1,
  mvp: 'Ndombolo',
  story:
    "On s'est réunis chez Rina pour les Playoffs de Division 3. Toute la squad en inhouse, " +
    'setup gaming au salon, bouffe sur le comptoir. Résultat : une campagne presque parfaite — ' +
    '9 victoires pour une seule défaite. Ndombolo a dominé du début à la fin, ' +
    "performance après performance, méritant amplement le titre d'homme des Playoffs.",
  photos: [
    { src: '/inhouse.jpg', caption: "Vue d'ensemble — setup LAN chez Rina", position: 'center 40%' },
    { src: '/inhouse2.jpg', caption: 'À la cuisine — ambiance du soir', position: 'center 30%' },
    { src: '/inhouse3.jpg', caption: "Focus gaming — l'homme des Playoffs au poste", position: 'center 30%' },
  ],
} as const;
