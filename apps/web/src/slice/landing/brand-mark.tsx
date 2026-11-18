import { useId } from "react";

/**
 * The Zombills brand mark: a tombstone with a Z, a moon and two grass tufts. Decorative: the
 * h1 beside it carries the name, so the mark is hidden from assistive technology, is not
 * focusable and has no text. Its only `url()` values point at its own ids; it has no external
 * reference. The colours are the mark's own, drawn once and not themed.
 *
 * With no `size` the mark is 56 px on phones and 72 px from `sm` (the Landing title); with a
 * `size` it is that many pixels square (the Home control passes 40, pro-polish Req 1.2).
 */
export interface BrandMarkProps {
  size?: number;
}

export function BrandMark({ size }: BrandMarkProps = {}) {
  const id = useId();
  const clipId = `${id}-clip`;
  const glowId = `${id}-glow`;
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      data-brand-mark=""
      width={size}
      height={size}
      className={size === undefined ? "size-14 shrink-0 sm:size-[4.5rem]" : "shrink-0"}
    >
      <defs>
        <clipPath id={clipId}>
          <rect width="512" height="512" rx="112" />
        </clipPath>
        <filter id={glowId} x="-40%" y="-200%" width="180%" height="500%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="512" height="512" fill="#0B0D12" />
        <circle cx="388" cy="124" r="98" fill="#ECE6D6" opacity="0.06" />
        <circle cx="388" cy="124" r="54" fill="#ECE6D6" opacity="0.92" />
        <path d="M146 448 V228 A110 110 0 0 1 366 228 V448 Z" fill="#ECE6D6" />
        <path
          d="M180 196 L198 222 L188 244"
          fill="none"
          stroke="#0B0D12"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
        />
        <path
          d="M204 220 H308 L204 356 H308"
          fill="none"
          stroke="#0B0D12"
          strokeWidth="32"
          strokeLinejoin="miter"
        />
        <path
          d="M190 288 H322"
          stroke="#8FD694"
          strokeWidth="22"
          strokeLinecap="round"
          filter={`url(#${glowId})`}
          opacity="0.9"
        />
        <path d="M190 288 H322" stroke="#8FD694" strokeWidth="18" strokeLinecap="round" />
        <path d="M128 428 L138 398 L146 422 L156 404 L164 428 Z" fill="#8FD694" />
        <path d="M350 428 L358 404 L366 422 L376 396 L386 428 Z" fill="#8FD694" />
      </g>
    </svg>
  );
}
