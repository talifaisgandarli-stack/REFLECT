type Props = {
  size?: number;
  decorative?: boolean;
  label?: string;
  className?: string;
};

export function Mascot({ size = 64, decorative = true, label, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={!decorative ? label : undefined}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {!decorative && label ? <title>{label}</title> : null}
      <path
        fill="var(--mascot-body)"
        d="M14 36c0-9 7-16 17-16 6 0 11 3 14 8 2-2 5-3 8-2 4 1 6 4 5 7-1 2-4 3-6 2-2-1-3-3-2-5l-1 1c2 5 1 11-3 14-3 2-7 3-11 2l-2 6c0 1-1 2-2 2h-2c-1 0-2-1-2-2v-3c-3-1-6-3-8-6-3-2-5-5-5-8zm22-9a3 3 0 100 6 3 3 0 000-6zM10 46c-2 0-3 1-3 3s1 3 3 3h6v-6h-6z"
      />
      <circle className="mascot-eye" cx="36" cy="30" r="2.2" fill="var(--mascot-eye)" />
    </svg>
  );
}
