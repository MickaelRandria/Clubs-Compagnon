import { z } from 'zod';

// Validation d'une note de match — partagée entre le formulaire et l'API.

export const NOTE_TAGS = ['Remontada', 'Lag', 'Carton rouge', 'But de la semaine', 'Arbitrage', 'Clean sheet'] as const;
export type NoteTag = (typeof NOTE_TAGS)[number];

export const newMatchNoteSchema = z.object({
  authorName: z.string().trim().min(1, 'Indique ton pseudo.').max(40, '40 caractères maximum.'),
  body: z.string().trim().min(1, 'Écris quelques mots sur le match.').max(2000, '2000 caractères maximum.'),
  motmMemberId: z.number().int().positive().nullable(),
  videoUrl: z
    .string()
    .trim()
    .max(500, '500 caractères maximum.')
    .regex(/^https?:\/\//, 'Le lien doit commencer par http:// ou https://')
    .nullable(),
  tags: z.array(z.enum(NOTE_TAGS)).max(NOTE_TAGS.length),
});

export type NewMatchNote = z.infer<typeof newMatchNoteSchema>;
export type NoteFieldErrors = Partial<Record<keyof NewMatchNote, string[]>>;

export function validateNote(input: unknown):
  | { ok: true; data: NewMatchNote }
  | { ok: false; errors: NoteFieldErrors } {
  const result = newMatchNoteSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: z.flattenError(result.error).fieldErrors as NoteFieldErrors };
}
