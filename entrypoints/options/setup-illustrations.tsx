// Small drawings of what each switch in setup's "On web pages" step adds
// to a page, in the theme's colors. Decorative: the text says the same.

const LINE = "setup-art-line";
const ACCENT = "setup-art-accent";

function Page({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="setup-art"
      viewBox="0 0 160 96"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        className="setup-art-page"
        x="1"
        y="1"
        width="158"
        height="94"
        rx="8"
      />
      {children}
    </svg>
  );
}

// A page with the translate button on its edge.
export function TranslateButtonArt() {
  return (
    <Page>
      <rect className={LINE} x="16" y="18" width="88" height="7" rx="3.5" />
      <rect className={LINE} x="16" y="36" width="112" height="5" rx="2.5" />
      <rect className={LINE} x="16" y="48" width="104" height="5" rx="2.5" />
      <rect className={LINE} x="16" y="60" width="96" height="5" rx="2.5" />
      <rect className={ACCENT} x="140" y="38" width="20" height="22" rx="7" />
      <path
        className="setup-art-mark"
        d="M145 44h9M149.5 44v2.5M146.5 47c1.6 3 4.6 5 7.5 5.5M152.5 47c-1 3-3.5 5-6.5 6"
      />
    </Page>
  );
}

// Selected text with the smart bar above it.
export function SmartBarArt() {
  return (
    <Page>
      <rect className={ACCENT} x="34" y="16" width="76" height="18" rx="9" />
      <circle className="setup-art-dot" cx="48" cy="25" r="3" />
      <circle className="setup-art-dot" cx="60" cy="25" r="3" />
      <circle className="setup-art-dot" cx="72" cy="25" r="3" />
      <rect className={LINE} x="16" y="46" width="128" height="5" rx="2.5" />
      <rect
        className="setup-art-selection"
        x="38"
        y="55"
        width="64"
        height="11"
        rx="2"
      />
      <rect className={LINE} x="16" y="58" width="128" height="5" rx="2.5" />
      <rect className={LINE} x="16" y="72" width="92" height="5" rx="2.5" />
    </Page>
  );
}

// A video with a subtitle line and its translation under it.
export function SubtitlesArt() {
  return (
    <Page>
      <rect
        className="setup-art-video"
        x="12"
        y="10"
        width="136"
        height="76"
        rx="5"
      />
      <path className="setup-art-play" d="M73 30v18l15-9z" />
      <rect
        className="setup-art-caption"
        x="36"
        y="60"
        width="88"
        height="6"
        rx="3"
      />
      <rect className={ACCENT} x="44" y="70" width="72" height="6" rx="3" />
    </Page>
  );
}
