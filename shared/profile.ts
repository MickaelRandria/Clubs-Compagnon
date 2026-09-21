import { z } from 'zod';
import type { Member, Position } from './types.js';

export type ClaimStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'revoked';
export interface PlayerClaim {
  id: number;
  status: ClaimStatus;
  memberId: number;
  gamertag: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}
export interface AdminClaim extends PlayerClaim {
  accountId: number;
  username: string;
  displayName: string | null;
  discordId: string;
}
export interface ClubProfile {
  club: { id: number; name: string };
  isAdmin: boolean;
  request: PlayerClaim | null;
  player: (Member & { updatedAt: string; isActive: boolean }) | null;
  availablePlayers: { id: number; gamertag: string; position: Position; ovr: number }[];
  /** Uniquement les demandes en attente et les correspondances validées, pour un administrateur. */
  adminClaims: AdminClaim[];
}
const id = z.number().int().positive().max(2_147_483_647);
export const profileActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request'), memberId: id }),
  z.object({ action: z.literal('cancel'), requestId: id }),
  z.object({ action: z.literal('approve'), requestId: id }),
  z.object({ action: z.literal('reject'), requestId: id, note: z.string().trim().max(240).default('') }),
  z.object({ action: z.literal('revoke'), requestId: id, note: z.string().trim().max(240).default('') }),
]);
export type ProfileAction = z.infer<typeof profileActionSchema>;
