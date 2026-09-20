import { z } from 'zod';
import { ARCHETYPE_IDS, ATTRIBUTE_KEYS, archetypeById, LINE_OF_POSITION } from './data/archetypes.js';
import { FEET, POSITION_CODES } from './fc27.js';
import { LIMITS } from './fc27-player.js';

// Preserve the exact input. Identity is deliberately based on trust, without normalization.
const pseudo = z.string().min(1).max(40).refine((value) => value.trim().length > 0, 'Saisis un pseudo.');
const id = z.number().int().positive().max(2_147_483_647);
const campaign = { campaignId: id };
export const fc27ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('propose'), ...campaign, pseudo, name: z.string().trim().min(1).max(60) }),
  z.object({ action: z.literal('vote'), ...campaign, proposalId: id, pseudo }),
  z.object({ action: z.literal('start'), ...campaign }),
  z.object({ action: z.literal('close'), ...campaign, winnerProposalId: id.optional() }),
  z.object({ action: z.literal('archive'), ...campaign }),
  z.object({ action: z.literal('reset'), ...campaign }),
  z.object({
    action: z.literal('player'), ...campaign, pseudo, profileId: id.optional(),
    kitName: z.string().trim().min(1, 'Indique le nom floqué sur ton maillot.').max(LIMITS.kitName),
    kitNumber: z.number().int().min(LIMITS.kitNumber.min).max(LIMITS.kitNumber.max),
    primaryPosition: z.enum(POSITION_CODES), secondaryPosition: z.enum(POSITION_CODES).optional(),
    archetype: z.enum(ARCHETYPE_IDS),
    preferredFoot: z.enum(FEET),
    heightCm: z.number().int().min(LIMITS.heightCm.min).max(LIMITS.heightCm.max),
    weightKg: z.number().int().min(LIMITS.weightKg.min).max(LIMITS.weightKg.max),
    weakFootStars: z.number().int().min(1).max(5), skillMovesStars: z.number().int().min(1).max(5),
    attributePriorities: z.array(z.enum(ATTRIBUTE_KEYS)).max(5).default([]),
    notes: z.string().trim().max(1000).default(''),
  }).superRefine((value, ctx) => {
    if (value.secondaryPosition === value.primaryPosition) {
      ctx.addIssue({ code: 'custom', path: ['secondaryPosition'], message: 'Le poste secondaire doit être différent du poste principal.' });
    }
    if (new Set(value.attributePriorities).size !== value.attributePriorities.length) {
      ctx.addIssue({ code: 'custom', path: ['attributePriorities'], message: 'Un attribut ne peut apparaître qu’une fois dans l’ordre de dépense.' });
    }
    if (archetypeById(value.archetype)?.line !== LINE_OF_POSITION[value.primaryPosition]) {
      ctx.addIssue({ code: 'custom', path: ['archetype'], message: 'Choisis un archétype de la ligne de ton poste principal.' });
    }
  }),
]);
export type FC27Action = z.infer<typeof fc27ActionSchema>;
