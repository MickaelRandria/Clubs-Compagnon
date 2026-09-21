import { useState, type FormEvent } from 'react';
import { NOTE_TAGS, validateNote, type NoteFieldErrors, type NoteTag } from '../../../shared/notes';
import type { Member } from '../../../shared/types';
import { ApiError } from '../../api/client';
import { useMatchDebrief } from '../../api/match-debrief';
import { useAddMatchNote } from '../../api/queries';
import { CornerShardLg } from '../ui/CornerShardLg';
import { Glyph } from '../ui/Glyph';
import { FormField } from './FormField';

const AUTHOR_KEY = 'dommage:note-author';

function readStoredAuthor() {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeAuthor(name: string) {
  try {
    localStorage.setItem(AUTHOR_KEY, name);
  } catch {
    // stockage indisponible : on ne retient simplement pas le pseudo
  }
}

/** Ajout d'une note à un match existant (aucune modification du score ni du match). */
export function NoteForm({ matchId, members }: { matchId: number; members: Member[] }) {
  const addNote = useAddMatchNote(matchId);
  const debriefQuery = useMatchDebrief(matchId);
  const [authorName, setAuthorName] = useState(readStoredAuthor);
  const [body, setBody] = useState('');
  const [motm, setMotm] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [errors, setErrors] = useState<NoteFieldErrors>({});
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const toggleTag = (tag: NoteTag) => setTags((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));

  const handleInspireWithCoach = () => {
    if (!debriefQuery.data?.available) {
      setStatus({
        kind: 'error',
        text: 'Le débrief tactique du Coach n\'est pas disponible pour ce match.',
      });
      return;
    }
    const { debrief } = debriefQuery.data;
    setBody(debrief.suggestedNote);
    if (debrief.suggestedTags.length > 0) {
      setTags(Array.from(new Set([...tags, ...debrief.suggestedTags])));
    }
    if (debrief.suggestedMotm) {
      const matchMember = members.find(
        (m) => m.gamertag.toLowerCase() === debrief.suggestedMotm?.toLowerCase(),
      );
      if (matchMember) {
        setMotm(String(matchMember.id));
      }
    }
    setStatus({
      kind: 'ok',
      text: '✨ Note, tags et joueur pré-remplis avec l\'œil du Coach ! Tu peux les retoucher.',
    });
  };

  const fieldProps = (id: string, error?: string[]) => ({
    id,
    className: 'fc-input',
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    const result = validateNote({
      authorName,
      body,
      motmMemberId: motm ? Number(motm) : null,
      videoUrl: videoUrl.trim() || null,
      tags,
    });
    if (!result.ok) {
      setErrors(result.errors);
      setStatus({ kind: 'error', text: 'Corrige les champs indiqués puis réessaie.' });
      return;
    }
    setErrors({});
    addNote.mutate(result.data, {
      onSuccess: () => {
        storeAuthor(result.data.authorName);
        setBody('');
        setMotm('');
        setVideoUrl('');
        setTags([]);
        setStatus({ kind: 'ok', text: 'Note enregistrée.' });
      },
      onError: (error) => {
        if (error instanceof ApiError && error.details) setErrors(error.details as NoteFieldErrors);
        setStatus({ kind: 'error', text: error.message });
      },
    });
  }

  return (
    <form
      className="fc-block fc-marine fc-note-form"
      onSubmit={submit}
      noValidate
      aria-labelledby="note-form-title"
      style={{ animationDelay: '120ms' }}
    >
      <CornerShardLg />
      <h2 id="note-form-title" className="fc-title fc-title--lg">
        Ajouter une note
      </h2>
      <span className="fc-body">Ce que l'API EA ne dit pas : le contexte, l'homme du match, le clip.</span>

      <FormField id="note-author" label="Ton pseudo" error={errors.authorName?.[0]}>
        <input
          {...fieldProps('note-author', errors.authorName)}
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          maxLength={40}
          autoComplete="nickname"
        />
      </FormField>

      <FormField id="note-motm" label="Homme du match" optional error={errors.motmMemberId?.[0]}>
        <select {...fieldProps('note-motm', errors.motmMemberId)} value={motm} onChange={(e) => setMotm(e.target.value)}>
          <option value="">Personne en particulier</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.gamertag}
            </option>
          ))}
        </select>
      </FormField>

      <fieldset className="fc-field">
        <legend>
          Tags<span className="fc-optional">facultatif</span>
        </legend>
        <div className="fc-tags">
          {NOTE_TAGS.map((tag) => (
            <button key={tag} type="button" className="fc-tag" aria-pressed={tags.includes(tag)} onClick={() => toggleTag(tag)}>
              {tag}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="fc-note-inspire-row">
        <button
          type="button"
          className="fc-note-inspire-btn"
          disabled={debriefQuery.isLoading}
          onClick={handleInspireWithCoach}
        >
          <Glyph name="bolt" size={14} />
          <span>{debriefQuery.isLoading ? 'Le Coach analyse…' : '✨ Inspirer ma note avec le Coach IA'}</span>
        </button>
      </div>

      <FormField id="note-body" label="Note" error={errors.body?.[0]} hint={`${body.length} / 2000`}>
        <textarea
          {...fieldProps('note-body', errors.body)}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          placeholder="Ce qui s'est passé, les temps forts, l'ambiance…"
        />
      </FormField>

      <FormField id="note-video" label="Lien vidéo" optional error={errors.videoUrl?.[0]}>
        <input
          {...fieldProps('note-video', errors.videoUrl)}
          type="url"
          inputMode="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder="https://…"
        />
      </FormField>

      <button type="submit" className="fc-cta" disabled={addNote.isPending}>
        {addNote.isPending ? 'Enregistrement…' : 'Enregistrer la note'}
      </button>
      <p className={`fc-form-status${status ? ` fc-form-status--${status.kind}` : ''}`} role="status" aria-live="polite">
        {status?.text}
      </p>
    </form>
  );
}
