/**
 * The rule in three pictures, on the first stage-1 countdowns: find the free space, park straight and still, touch nothing.
 * Two or three words each, readable in the five seconds of the countdown; the controls are shown beside it.
 */
const Card = ({ icon, text, tone }: { icon: React.ReactNode; text: string; tone: string }) => (
  <li className="bg-ink-deep/80 flex w-[5.6rem] flex-col items-center gap-1 px-1.5 py-2 sm:w-32 sm:gap-1.5 sm:py-3">
    <span className={tone}>{icon}</span>
    <span className="text-cream text-[11px] leading-tight font-bold uppercase sm:text-sm">{text}</span>
  </li>
);

const S = 'h-8 w-8 sm:h-11 sm:w-11';

/** A "P" sign with one empty bay. */
const FindIcon = () => (
  <svg viewBox="0 0 48 48" className={S} aria-hidden="true">
    <rect x="4" y="4" width="40" height="40" rx="8" fill="#2c6fd6" />
    <path d="M17 36V12h9a7 7 0 0 1 0 14h-9" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
  </svg>
);

/** A car square between two lines, a stop bar ahead. */
const ParkIcon = () => (
  <svg viewBox="0 0 48 48" className={S} aria-hidden="true">
    <path d="M8 6v36M40 6v36" stroke="#e6ebf5" strokeWidth="3" />
    <path d="M14 6h20" stroke="#3ddc84" strokeWidth="3" />
    <rect x="15" y="12" width="18" height="28" rx="5" fill="#d8222b" />
    <rect x="18" y="17" width="12" height="7" rx="2" fill="#0a0d18" opacity="0.7" />
  </svg>
);

/** Two cars that must not touch. */
const NoTouchIcon = () => (
  <svg viewBox="0 0 48 48" className={S} aria-hidden="true">
    <rect x="4" y="16" width="16" height="22" rx="4" fill="#d8222b" />
    <rect x="28" y="16" width="16" height="22" rx="4" fill="#f2f2ee" />
    <circle cx="24" cy="12" r="9" fill="#ff3d6e" />
    <path d="M19 7l10 10M29 7L19 17" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const Onboarding = ({ touch }: { touch: boolean }) => (
  <div className="flex flex-col items-center gap-1.5 sm:gap-2" style={{ animation: 'fadeIn 0.5s ease-out both' }}>
    <ol className="flex gap-1.5 sm:gap-2" aria-label="How to win">
      <Card icon={<FindIcon />} text="Find the free space" tone="" />
      <Card icon={<ParkIcon />} text="Park straight, stop" tone="" />
      <Card icon={<NoTouchIcon />} text="Touch nothing" tone="" />
    </ol>
    {/* On a keyboard the key strip at the bottom of the screen shows the controls; on a phone, say what the pads do. */}
    {touch && <div className="text-cream/85 bg-ink-deep/70 px-2 py-0.5 text-[11px] sm:text-sm">◀ ▶ steer · GAS · BRAKE (hold to reverse)</div>}
  </div>
);
