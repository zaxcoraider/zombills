// Alpha values for the night scene and the focus styles of the Landing view.

export const SKY_GLOW_ALPHA = 0.09;
export const FOG_DENSITIES = [0.13, 0.11, 0.08] as const;
export const FOCUS_GLOW_ALPHA = 0.35;
export const FOCUS_BAND_ALPHA = 0.7;

// Alphas of the Landing effects, mirrored by `var(--bone) 1.5%`, `var(--ember) 35%` and
// `var(--night) 70%` in `slice/landing/landing-motion.css` (checked in static-checks.test.ts).
export const TITLE_GLOW_ALPHA = 0.015;
export const CANDLE_GLOW_ALPHA = 0.35;
export const CANDLE_BAND_ALPHA = 0.7;
