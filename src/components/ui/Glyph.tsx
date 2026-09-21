import type { ReactNode } from 'react';

const GLYPHS = {
  home: (
    <>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </>
  ),
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5c0 3 1.5 4.5 3 5M16 6h3c0 3-1.5 4.5-3 5M12 13v4M8 20h8M9.5 17h5" />
    </>
  ),
  ball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5l4 2.9-1.5 4.6h-5L8 10.4z" />
    </>
  ),
  bars: <path d="M5 20v-8M12 20V5M19 20v-5" />,
  cross: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  forward: <path d="M5 12h14M13 6l6 6-6 6" />,
  // Catégories de PlayStyles (carte joueur FC 27)
  shot: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  pass: <path d="M4 18c3-7 8-10 15-10M15 4l4 4-4 4" />,
  dribble: <path d="M3 18l4-6 4 5 4-7 3 4M19 5h2v2" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  bolt: <path d="M13 3 5 14h6l-1 7 8-11h-6z" />,
  glove: <path d="M7 12V6.5a1.5 1.5 0 0 1 3 0V11M10 10.5V4.5a1.5 1.5 0 0 1 3 0V10.5M13 10.5V5.5a1.5 1.5 0 0 1 3 0V11M16 11.5V8.5a1.5 1.5 0 0 1 3 0V14c0 4-3 7-7 7-3 0-5-1.5-6.5-4.5l-2-4a1.5 1.5 0 0 1 2.6-1.5L7 13" />,
} satisfies Record<string, ReactNode>;

export type GlyphName = keyof typeof GLYPHS;

export function Glyph({ name, size = 16 }: { name: GlyphName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  );
}
