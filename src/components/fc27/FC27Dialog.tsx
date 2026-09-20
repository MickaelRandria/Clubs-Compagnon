import { useEffect, useId, useRef, type ReactNode } from 'react';

export function FC27Dialog({ title, onClose, children, wide = false, console: consoleStyle = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; console?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className={`fc27-dialog${wide ? ' fc27-dialog--wide' : ''}${consoleStyle ? ' fc27-dialog--console' : ''}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className="fc27-dialog-head">
        <h2 id={titleId} className="fc-title fc-title--lg">{title}</h2>
        <button type="button" className="fc27-close" aria-label="Fermer" onClick={onClose}>×</button>
      </div>
      {children}
    </dialog>
  );
}

export function ActionFeedback({ error, success }: { error?: Error | null; success?: string | false }) {
  return <>
    {error && <p className="fc27-feedback" role="alert">{error.message}</p>}
    {success && <p className="fc27-feedback" role="status">{success}</p>}
  </>;
}
