// Cueline mark: a speech bubble whose tail becomes a cue line, drawn in the brand gradient.
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="cueline-g" x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#cueline-g)" />
      <path d="M11 14.5c0-1.9 1.6-3.5 3.5-3.5h11c1.9 0 3.5 1.6 3.5 3.5v6c0 1.9-1.6 3.5-3.5 3.5H18l-4.6 3.8c-.5.4-1.2 0-1.2-.6V24c-.7-.6-1.2-1.5-1.2-2.5v-7Z" fill="#06121f" fillOpacity=".86" />
      <path d="M15.5 16h9M15.5 19.5h6" stroke="#8fd6ff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
