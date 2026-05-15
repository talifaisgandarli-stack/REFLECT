/**
 * Reflect chameleon mascot — designstyle4 §5.
 * Body: var(--mascot-body) = #0E1611  (ink, monochrome)
 * Eye:  var(--mascot-eye)  = #ADFB49  (Mindaro lime — ONLY colored pixel)
 *
 * Appears in exactly 4 places: sidebar footer (20px), empty state (64px),
 * login page (80px), MIRAI loading (40px). Never decoratively elsewhere.
 */
type Props = {
  size?: number;
  decorative?: boolean;
  label?: string;
  className?: string;
};

export function Mascot({ size = 64, decorative = true, label, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 80 80"
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={!decorative ? label : undefined}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {!decorative && label ? <title>{label}</title> : null}

      {/* ── Body ─────────────────────────────────────────────────── */}
      {/* Torso + neck + limbs — all ink */}
      <g fill="var(--mascot-body)">
        {/* Main body — plump teardrop oval */}
        <ellipse cx="38" cy="46" rx="17" ry="13" />

        {/* Head — round, sits upper-right of body */}
        <ellipse cx="54" cy="30" rx="11" ry="10" />

        {/* Neck connecting head to body */}
        <path d="M44 34 Q42 40 40 43 Q44 42 49 38 Q52 34 54 30 Q50 30 44 34Z" />

        {/* Helmet crest — 3 dorsal spikes on top of head */}
        <path d="M47 22 L49 15 L51 22Z" />
        <path d="M51 21 L54 13 L57 21Z" />
        <path d="M55 22 L58 16 L61 23Z" />

        {/* Eye ring (dark surround makes lime pop) */}
        <circle cx="58" cy="28" r="4.5" />

        {/* Snout — pointed muzzle extending right */}
        <path d="M62 29 Q70 28 72 31 Q70 34 62 32Z" />

        {/* Nostril dot */}
        <circle cx="68" cy="30" r="1" />

        {/* Front leg + clawed foot */}
        <path d="M36 55 Q30 60 26 64 Q28 66 31 64 Q33 66 36 64 Q38 66 40 63 Q40 58 38 55Z" />

        {/* Back leg + clawed foot */}
        <path d="M48 57 Q46 63 43 67 Q45 69 48 67 Q50 69 53 67 Q55 68 56 65 Q54 60 51 57Z" />

        {/* Tail — curling downward-left, characteristic chameleon curl */}
        <path
          d="M22 50 Q14 54 10 60 Q8 66 12 68 Q16 70 18 66 Q16 63 18 60 Q22 58 26 56"
          fill="none"
          stroke="var(--mascot-body)"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* Dorsal ridge along back */}
        <path d="M28 38 Q32 34 36 35 Q38 35 40 37" fill="none" stroke="var(--mascot-body)" strokeWidth="2.5" strokeLinecap="round" />

        {/* Belly texture line (lighter feel) */}
        <ellipse cx="37" cy="49" rx="11" ry="7" fill="var(--mascot-body)" opacity="0.35" />
      </g>

      {/* ── Eye ─────────────────────────────────────────────────── */}
      {/* Mindaro lime — the ONLY colored pixel. designstyle4 rule #2. */}
      <circle cx="58" cy="28" r="2.8" fill="var(--mascot-eye)" />
      {/* Tiny specular dot for life */}
      <circle cx="59.2" cy="26.8" r="0.8" fill="var(--mascot-body)" opacity="0.5" />
    </svg>
  );
}
