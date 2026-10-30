// Cueline mark: a bold "C" whose opening is a cue line, on the violet → blue brand gradient.
export function Logo({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="cueline-g" x1="4" y1="2" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a855f7" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect width="44" height="44" rx="13" fill="url(#cueline-g)" />
      <path d="M29.5 15.2a9.5 9.5 0 1 0 0 13.6" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
      <circle cx="31.4" cy="22" r="2.3" fill="#fff" fillOpacity=".9" />
    </svg>
  );
}
