import { Link } from 'react-router';
import type { MatchNote } from '../../../shared/types';
import { timeAgo } from '../../lib/format';
import { Glyph } from '../ui/Glyph';

/** Notes saisies pour un match, des plus récentes aux plus anciennes — bloc Marine. */
export function NoteList({ notes }: { notes: MatchNote[] }) {
  return (
    <section className="fc-block fc-marine fc-notes" aria-labelledby="notes-title" style={{ animationDelay: '80ms' }}>
      <div className="fc-notes-head">
        <h2 id="notes-title" className="fc-title fc-title--md">
          Notes du match
        </h2>
        <span className="fc-muted">
          {notes.length} note{notes.length > 1 ? 's' : ''}
        </span>
      </div>

      {notes.length === 0 ? (
        <p className="fc-notes-empty">Aucune note pour ce match pour l'instant.</p>
      ) : (
        notes.map((note) => (
          <article key={note.id} className="fc-note">
            <div className="fc-note-head">
              <span className="fc-note-author">{note.authorName}</span>
              <span className="fc-muted">{timeAgo(note.createdAt)}</span>
              {note.motm && (
                <Link to="/joueurs" className="fc-motm" title="Voir dans l'effectif">
                  ★ {note.motm.gamertag}
                </Link>
              )}
            </div>
            <p className="fc-note-body">{note.body}</p>
            {(note.tags.length > 0 || note.videoUrl) && (
              <div className="fc-note-foot">
                {note.tags.map((tag) => (
                  <span key={tag} className="fc-note-tag">
                    {tag}
                  </span>
                ))}
                {note.videoUrl && (
                  <a className="fc-note-link" href={note.videoUrl} target="_blank" rel="noopener noreferrer">
                    Voir la vidéo <Glyph name="external" size={14} />
                  </a>
                )}
              </div>
            )}
          </article>
        ))
      )}
    </section>
  );
}
