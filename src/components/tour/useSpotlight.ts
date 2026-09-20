import { useEffect, useState } from 'react';

export interface Rect { top: number; left: number; width: number; height: number }

/** Marge autour de la cible éclairée, pour que le spot ne colle pas au bord de l'élément. */
export const HALO = 8;

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { top: r.top - HALO, left: r.left - HALO, width: r.width + HALO * 2, height: r.height + HALO * 2 };
};

const same = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

/**
 * Suit la position d'une cible à l'écran.
 *
 * La cible peut arriver en retard : route paresseuse, données en cours de chargement,
 * tuile rendue après coup. On l'attend jusqu'à `timeout`, puis on abandonne.
 * `status` distingue les trois cas que l'appelant doit traiter différemment :
 * en attente, trouvée (avec sa position), ou absente (étape à sauter ou à centrer).
 */
export function useSpotlight(selector: string | undefined, timeout = 4000, bottomInset = 0) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'found' | 'missing'>('idle');

  useEffect(() => {
    if (!selector) { setRect(null); setStatus('idle'); return; }

    setStatus('waiting');
    setRect(null);
    let target: Element | null = null;
    let frame = 0;
    let stop = false;

    const measure = () => {
      if (stop || !target) return;
      // Une cible masquée ou détachée (onglet caché, tuile démontée) n'a pas de boîte.
      const box = target.getBoundingClientRect();
      if (!target.isConnected || !target.checkVisibility() || (box.width === 0 && box.height === 0)) { setStatus('missing'); return; }
      setRect((previous) => (same(previous, rectOf(target!)) ? previous : rectOf(target!)));
    };

    const track = () => {
      measure();
      frame = requestAnimationFrame(track);
    };

    const attach = (el: Element) => {
      target = el;
      // Amener la cible au centre avant de mesurer : sinon le spot se place hors écran.
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      if (bottomInset > 0) {
        // Sur mobile, la bulle occupe le bas : placer la cible dans l'espace encore visible.
        const box = el.getBoundingClientRect();
        const available = Math.max(0, window.innerHeight - bottomInset - 32);
        const desiredTop = 16 + Math.max(0, (available - box.height) / 2);
        let scroller = el.parentElement;
        while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) {
          scroller = scroller.parentElement;
        }
        (scroller ?? window).scrollBy({ top: box.top - desiredTop, behavior: 'instant' });
      }
      setStatus('found');
      frame = requestAnimationFrame(track);
    };

    const findVisible = () => {
      const el = document.querySelector(selector);
      return el?.checkVisibility() && el.getBoundingClientRect().height > 0 ? el : null;
    };
    const existing = findVisible();
    if (existing) {
      attach(existing);
    } else {
      // La cible n'est pas encore là : on guette le DOM jusqu'à expiration.
      const observer = new MutationObserver(() => {
        const found = findVisible();
        if (!found) return;
        observer.disconnect();
        clearTimeout(timer);
        if (!stop) attach(found);
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      const timer = setTimeout(() => {
        observer.disconnect();
        if (!stop) setStatus('missing');
      }, timeout);
      return () => { stop = true; observer.disconnect(); clearTimeout(timer); cancelAnimationFrame(frame); };
    }

    return () => { stop = true; cancelAnimationFrame(frame); };
  }, [selector, timeout, bottomInset]);

  return { rect, status };
}

export interface Placement { top: number; left: number; side: 'top' | 'bottom' | 'left' | 'right' | 'center' }

const GAP = 14;
const EDGE = 12;

/**
 * Place la bulle autour du spot, en retombant sur un autre côté quand la place manque,
 * puis en la ramenant de force dans la fenêtre. Sans cible, elle est centrée.
 */
export function placeBubble(
  rect: Rect | null,
  bubble: { width: number; height: number },
  preferred: 'top' | 'bottom' | 'left' | 'right' = 'bottom',
  viewport = { width: window.innerWidth, height: window.innerHeight },
): Placement {
  if (!rect) {
    return {
      top: Math.max(EDGE, (viewport.height - bubble.height) / 2),
      left: Math.max(EDGE, (viewport.width - bubble.width) / 2),
      side: 'center',
    };
  }

  const room = {
    top: rect.top,
    bottom: viewport.height - (rect.top + rect.height),
    left: rect.left,
    right: viewport.width - (rect.left + rect.width),
  };
  const needed = { top: bubble.height + GAP, bottom: bubble.height + GAP, left: bubble.width + GAP, right: bubble.width + GAP };

  const order = ([preferred, 'bottom', 'top', 'right', 'left'] as const)
    .filter((side, index, all) => all.indexOf(side) === index);
  const side = order.find((candidate) => room[candidate] >= needed[candidate]) ?? preferred;

  let top: number;
  let left: number;
  if (side === 'top') { top = rect.top - bubble.height - GAP; left = rect.left + rect.width / 2 - bubble.width / 2; }
  else if (side === 'bottom') { top = rect.top + rect.height + GAP; left = rect.left + rect.width / 2 - bubble.width / 2; }
  else if (side === 'left') { left = rect.left - bubble.width - GAP; top = rect.top + rect.height / 2 - bubble.height / 2; }
  else { left = rect.left + rect.width + GAP; top = rect.top + rect.height / 2 - bubble.height / 2; }

  const clamp = (value: number, max: number) => Math.max(EDGE, Math.min(value, max - EDGE));
  return { top: clamp(top, viewport.height - bubble.height), left: clamp(left, viewport.width - bubble.width), side };
}
