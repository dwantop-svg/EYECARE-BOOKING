export function GlassesIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="9" cy="18" r="5.5" />
      <circle cx="23" cy="18" r="5.5" />
      <path d="M14.5 18c1-1.2 2-1.2 3 0M3.5 18 2 10.5M28.5 18 30 10.5" />
    </svg>
  );
}
export function Brand({ name }: { name: string }) {
  return (
    <div className="brand">
      <GlassesIcon />
      <div>
        <div className="brand-name">{name}</div>
        <div className="muted small">จองคิวออนไลน์</div>
      </div>
    </div>
  );
}
