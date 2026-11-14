// Key and display name for merchants that cannot be identified.
// See .kiro/specs/merchant-normalizer/design.md ("Identity builder").

import { PROCESSOR_NAMES } from "./noise-lists.js";
import type { ProcessorId } from "./types.js";

export function unidentifiedKey(processor: ProcessorId | null, residue: string): string {
  return "unidentified:" + (processor ?? "none") + ":" + (residue || "-");
}

export function unidentifiedDisplayName(processor: ProcessorId | null): string {
  if (processor === null) return "Unknown merchant";
  return PROCESSOR_NAMES[processor] + " payment (merchant not shown)";
}
