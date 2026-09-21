import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAskCoach, type CoachAction } from '../../api/coach';
import { Glyph } from '../ui/Glyph';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: CoachAction | null;
  suggestedQuestions?: string[];
}

const DEFAULT_QUESTIONS = [
  'Comment lier mon compte Discord ?',
  'Comment voter pour le nom FC 27 ?',
  'Qui est notre meilleur buteur ?',
  'Quel est le bilan global du club ?',
  'Où voir les photos de la LAN Playoffs ?',
];

function formatInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="fc-coach-strong">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={idx} className="fc-coach-em">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

function renderCoachFormattedText(content: string) {
  const paragraphs = content.split(/\n\s*\n/);

  return paragraphs.map((para, pIdx) => {
    const lines = para.trim().split('\n');

    const isBulletList = lines.length > 0 && lines.every((l) => /^\s*[-*•]\s+/.test(l));
    if (isBulletList) {
      return (
        <ul key={pIdx} className="fc-coach-bubble-list">
          {lines.map((l, lIdx) => (
            <li key={lIdx}>{formatInlineMarkdown(l.replace(/^\s*[-*•]\s+/, ''))}</li>
          ))}
        </ul>
      );
    }

    const isNumberedList = lines.length > 0 && lines.every((l) => /^\s*\d+[\.)]\s+/.test(l));
    if (isNumberedList) {
      return (
        <ol key={pIdx} className="fc-coach-bubble-list fc-coach-bubble-list--num">
          {lines.map((l, lIdx) => (
            <li key={lIdx}>{formatInlineMarkdown(l.replace(/^\s*\d+[\.)]\s+/, ''))}</li>
          ))}
        </ol>
      );
    }

    return (
      <p key={pIdx} className="fc-coach-bubble-p">
        {lines.map((line, lIdx) => (
          <span key={lIdx}>
            {formatInlineMarkdown(line)}
            {lIdx < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
}

export function CoachModal({
  isOpen,
  onClose,
  defaultQuestion,
}: {
  isOpen: boolean;
  onClose: () => void;
  defaultQuestion: string | null;
}) {
  const navigate = useNavigate();
  const askCoach = useAskCoach();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus et initialisation au déploiement
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => inputRef.current?.focus(), 150);
      if (defaultQuestion && messages.length === 0) {
        handleSendQuestion(defaultQuestion);
      }
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, defaultQuestion]);

  // Scroll automatique au fil de l'eau
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, askCoach.isPending]);

  // Fermeture sur Échap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSendQuestion = (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || askCoach.isPending) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');

    askCoach.mutate(
      {
        question: trimmed,
        history: newHistory.map((m) => ({ role: m.role, content: m.content })),
      },
      {
        onSuccess: (data) => {
          const assistantMsg: Message = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: data.response.reply,
            action: data.response.action,
            suggestedQuestions: data.response.suggestedQuestions,
          };
          setMessages((prev) => [...prev, assistantMsg]);
        },
        onError: () => {
          const errorMsg: Message = {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content:
              'Désolé, une petite coupure technique m’empêche de répondre. Réessaie dans quelques instants ou clique sur les sections de l’app !',
          };
          setMessages((prev) => [...prev, errorMsg]);
        },
      },
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSendQuestion(input);
  };

  const handleActionClick = (action: CoachAction) => {
    onClose();
    navigate(action.to);
  };

  if (!isOpen) return null;

  return (
    <div className="fc-coach-overlay" onClick={onClose} role="presentation">
      <div
        className="fc-coach-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-modal-title"
      >
        <header className="fc-coach-head">
          <div className="fc-coach-brand">
            <div className="fc-coach-avatar">
              <Glyph name="bolt" size={20} />
            </div>
            <div>
              <h2 id="coach-modal-title" className="fc-coach-title">
                COACH IA · ASSISTANT CLUB
              </h2>
              <p className="fc-coach-subtitle">Orientation, vestiaire & statistiques en direct</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="fc-coach-close" aria-label="Fermer le Coach IA">
            ✕
          </button>
        </header>

        <div className="fc-coach-body">
          {messages.length === 0 && (
            <div className="fc-coach-welcome">
              <div className="fc-coach-bubble fc-coach-bubble--intro">
                <p>
                  <strong>Salut l'artiste ! 👋</strong>
                </p>
                <p>
                  Je suis le <strong>Coach IA</strong> de Dommage BJ FC. Je peux t'aider à utiliser l'application,
                  rattacher ton compte Discord, voter pour le futur nom FC 27 ou te renseigner sur les stats du club.
                </p>
                <p>Pose-moi n'importe quelle question ou clique sur une suggestion ci-dessous :</p>
              </div>

              <div className="fc-coach-shortcuts">
                <span className="fc-coach-shortcuts-label">Questions fréquentes :</span>
                <div className="fc-coach-chips">
                  {DEFAULT_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="fc-coach-chip-btn"
                      onClick={() => handleSendQuestion(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`fc-coach-row fc-coach-row--${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="fc-coach-mini-avatar">
                  <Glyph name="bolt" size={14} />
                </div>
              )}
              <div className="fc-coach-msg-container">
                <div className={`fc-coach-bubble fc-coach-bubble--${msg.role}`}>
                  {renderCoachFormattedText(msg.content)}
                </div>

                {msg.action && (
                  <button
                    type="button"
                    className="fc-coach-action-btn"
                    onClick={() => handleActionClick(msg.action!)}
                  >
                    <span>{msg.action.label}</span>
                    <Glyph name="forward" size={14} />
                  </button>
                )}

                {msg.suggestedQuestions && msg.suggestedQuestions.length > 0 && (
                  <div className="fc-coach-followups">
                    {msg.suggestedQuestions.map((sq) => (
                      <button
                        key={sq}
                        type="button"
                        className="fc-coach-followup-chip"
                        onClick={() => handleSendQuestion(sq)}
                      >
                        {sq}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {askCoach.isPending && (
            <div className="fc-coach-row fc-coach-row--assistant">
              <div className="fc-coach-mini-avatar">
                <Glyph name="bolt" size={14} />
              </div>
              <div className="fc-coach-bubble fc-coach-bubble--assistant fc-coach-bubble--typing">
                <span className="fc-coach-dot" />
                <span className="fc-coach-dot" />
                <span className="fc-coach-dot" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form className="fc-coach-foot" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="fc-coach-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pose ta question au Coach…"
            maxLength={500}
            disabled={askCoach.isPending}
          />
          <button
            type="submit"
            className="fc-coach-send"
            disabled={!input.trim() || askCoach.isPending}
            aria-label="Envoyer"
          >
            <Glyph name="forward" size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}

