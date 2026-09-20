import type { MatchResult, MatchType, Position } from '../../shared/types';
import { FC } from './tokens';

export const RESULT: Record<MatchResult, { letter: string; word: string; bg: string; fg: string }> = {
  win: { letter: 'V', word: 'Victoire', bg: FC.glacier, fg: FC.marine },
  draw: { letter: 'N', word: 'Nul', bg: FC.acier, fg: FC.marine },
  loss: { letter: 'D', word: 'Défaite', bg: FC.rouge, fg: FC.marine },
};

export const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  league: 'Ligue',
  playoff: 'Playoff',
  friendly: 'Amical',
};

export const POS_LABEL: Record<Position, string> = { FW: 'Attaquant', MF: 'Milieu', DF: 'Défenseur', GK: 'Gardien' };
export const POS_SHORT: Record<Position, string> = { FW: 'ATT', MF: 'MIL', DF: 'DÉF', GK: 'GK' };
