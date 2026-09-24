import { z } from 'zod';
import { ARCHETYPE_IDS, ATTRIBUTE_KEYS, archetypeById, LINE_OF_POSITION } from './data/archetypes.js';
import { FEET, POSITION_CODES } from './fc27.js';
import { LIMITS } from './fc27-player.js';

// Le pseudo du joueur reste tel que saisi ; l'identité est celle du compte Discord.
const pseudo = z.string().min(1).max(40).refine((value) => value.trim().length > 0, 'Saisis un pseudo.');
const id = z.number().int().positive().max(2_147_483_647);
const campaign = { campaignId: id };
export const fc27ActionSchema = z.discriminatedUnion('action', [
  // `pseudo` a disparu de ces deux actions : l'auteur et le votant viennent du compte
  // connecté, lu côté serveur. Un pseudo envoyé par le client serait invérifiable.
  z.object({ action: z.literal('propose'), ...campaign, name: z.string().trim().min(1).max(60) }),
  // Le bulletin complet de l'étape ouverte, qui remplace le précédent. Vide = retirer sa voix.
  // Le plafond par étape (3 au premier et au second tour, 1 par duel ensuite) est vérifié en base.
  // `proposalId` seul reste accepté pour les clients d'avant les étapes (PWA en cache).
  z.object({ action: z.literal('vote'), ...campaign, proposalIds: z.array(id).max(3).optional(), proposalId: id.optional() })
    .refine((value) => value.proposalIds !== undefined || value.proposalId !== undefined, 'Choisis au moins un nom.'),
  z.object({ action: z.literal('start'), ...campaign }),
  // Clôt l'étape ouverte. `picks` tranche les égalités qui décident d'une qualification ou du titre.
  z.object({ action: z.literal('advance'), ...campaign, picks: z.array(id).max(10).default([]) }),
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
