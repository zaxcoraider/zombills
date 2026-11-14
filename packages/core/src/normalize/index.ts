// Public API of the merchant normalizer.

export type {
  KnownService,
  MerchantIdentity,
  MerchantSource,
  NormalizedTransaction,
  ProcessorId,
  ServiceCategory,
  ServiceVariant,
} from "./types.js";
export { KNOWN_SERVICES, getKnownService } from "./known-services.js";
export { normalizeMerchant } from "./normalize-merchant.js";
