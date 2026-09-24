import type { FC27Stage, FC27StageEntry, FC27StageKind } from './fc27.js';

// Enchaînement des étapes du vote du nom. La règle qui fait foi est `fc27_advance_stage`
// (migration 0014) ; ce module la reproduit pour l'aperçu de l'admin avant clôture.
// Toute modification doit être faite des deux côtés (tests/fc27.test.ts les compare).

export const STAGE_LABELS: Record<FC27StageKind, string> = {
  qualif: 'Premier tour', repechage: 'Second tour', semis: 'Demi-finales', final: 'Finale', podium: 'Podium',
};
/** Nombre de noms retenus pour les demi-finales. */
export const FINALISTS = 4;

/** Égalité à trancher par l'admin : `need` noms à choisir parmi `among` (ordre du classement). */
export interface TieGroup { among: number[]; need: number; duel?: 1 | 2 }
export interface AdvancePlan {
  /** Aucune voix dans l'étape : impossible de la clore. */
  empty: boolean;
  ties: TieGroup[];
  /** Toutes les égalités sont tranchées par `picks`, et aucun choix superflu n'a été fourni. */
  ready: boolean;
  next: FC27StageKind | 'done';
  /** Noms qualifiés pour l'étape suivante, dans l'ordre des têtes de série. */
  qualified: number[];
  /** Classement final quand `next === 'done'` : vainqueur, puis deuxième, puis troisième. */
  podium: number[];
}

/** Voix décroissantes, puis rang d'entrée : même ordre que la fonction SQL. */
export function rankEntries(entries: FC27StageEntry[]): FC27StageEntry[] {
  return [...entries].sort((a, b) => b.votes - a.votes || a.seed - b.seed);
}

/** Étape suivante selon le nombre de noms encore en course. */
function nextFor(count: number): FC27StageKind | 'done' {
  return count >= FINALISTS ? 'semis' : count === 3 ? 'podium' : count === 2 ? 'final' : 'done';
}

export function planAdvance(stage: FC27Stage, picks: number[] = []): AdvancePlan {
  const order = rankEntries(stage.entries);
  const empty = order.every((entry) => entry.votes === 0);
  const ties: TieGroup[] = [];
  let resolved = true;
  const ids = (list: FC27StageEntry[]) => list.map((entry) => entry.proposal_id);
  // Noms retenus par l'admin dans une égalité, dans l'ordre du classement.
  const pick = (group: FC27StageEntry[], need: number, duel?: 1 | 2) => {
    ties.push({ among: ids(group), need, ...(duel ? { duel } : {}) });
    const chosen = ids(group).filter((id) => picks.includes(id));
    if (chosen.length !== need) { resolved = false; return []; }
    return chosen;
  };
  let next: AdvancePlan['next'] = 'done';
  let qualified: number[] = [];
  let podium: number[] = [];
  if (!empty) {
    if (stage.kind === 'qualif' || stage.kind === 'repechage') {
      const voted = order.filter((entry) => entry.votes > 0);
      if (voted.length > FINALISTS && stage.kind === 'qualif') {
        qualified = ids(voted); next = 'repechage';
      } else if (voted.length > FINALISTS) {
        const cut = voted[FINALISTS - 1].votes;
        const above = voted.filter((entry) => entry.votes > cut);
        const tied = voted.filter((entry) => entry.votes === cut);
        const need = FINALISTS - above.length;
        qualified = [...ids(above), ...(tied.length > need ? pick(tied, need) : ids(tied))];
        next = 'semis';
      } else {
        qualified = ids(voted); next = nextFor(voted.length);
        if (next === 'done') podium = qualified;
      }
    } else if (stage.kind === 'semis') {
      for (const duel of [1, 2] as const) {
        const [first, second] = rankEntries(stage.entries.filter((entry) => entry.duel === duel));
        qualified.push(...(first.votes > second.votes ? [first.proposal_id] : pick([first, second], 1, duel)));
      }
      next = 'final';
    } else {
      const leaders = order.filter((entry) => entry.votes === order[0].votes);
      const winner = leaders.length > 1 ? pick(leaders, 1)[0] : order[0].proposal_id;
      if (winner !== undefined) podium = [winner, ...ids(order).filter((id) => id !== winner)];
    }
  }
  const stray = picks.some((id) => !ties.some((tie) => tie.among.includes(id)));
  return { empty, ties, ready: !empty && resolved && !stray, next, qualified, podium };
}

/** Étape ouverte, s'il y en a une. */
export const openStage = (stages: FC27Stage[]) => stages.find((stage) => stage.closed_at === null) ?? null;
