/**
 * BESTIE mark — a sharp ink square with the warm-gold B.
 * Matches the ISAACART-style brand block: flat, bold, no gradients.
 */
export function BestieLogo({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <div
      aria-hidden="true"
      role="img"
      className={
        "flex shrink-0 select-none items-center justify-center bg-primary text-primary-foreground " +
        (className ?? "")
      }
      style={{ width: size, height: size }}
    >
      <span
        className="font-display"
        style={{ fontSize: size * 0.64, lineHeight: 1, paddingTop: size * 0.04 }}
      >
        B
      </span>
    </div>
  );
}
