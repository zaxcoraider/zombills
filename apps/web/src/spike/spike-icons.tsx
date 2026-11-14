// Original line icons, drawn for this project. Stroke uses currentColor.

import type { ReactNode } from "react";

type IconProps = { className?: string | undefined };

function Icon({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Undead: eyes open, restless. */
export function EyeOpenIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M2.5 12C5 7.5 8.5 5.5 12 5.5S19 7.5 21.5 12C19 16.5 15.5 18.5 12 18.5S5 16.5 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** Resting: eyes closed. */
export function EyeClosedIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M3 10.5C5.5 14 8.5 15.5 12 15.5S18.5 14 21 10.5" />
      <path d="M6.2 13.7 4.8 15.7M10 15.3l-.5 2.3M14 15.3l.5 2.3M17.8 13.7l1.4 2" />
    </Icon>
  );
}

/** Zombie: marked for the shovel. */
export function ShovelIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M15.5 3.5l5 5M18 6l-8 8" />
      <path d="M8.2 12.2l3.6 3.6-3.2 3.2a2.5 2.5 0 0 1-3.5 0l-.1-.1a2.5 2.5 0 0 1 0-3.5Z" />
    </Icon>
  );
}

export function ReplayIcon({ className }: IconProps) {
  return (
    <Icon className={className}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 8.9" />
      <path d="M4.5 4.5v4.4h4.4" />
    </Icon>
  );
}
