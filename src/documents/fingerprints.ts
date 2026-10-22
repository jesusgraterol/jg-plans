import { hashValue } from 'jg-crypto';
import { stringifyJsonDeterministically } from 'jg-utilities';

import { planErrors } from '../errors/index.ts';
import { PlanFingerprintOptionsSchema, type IPlanFingerprintOptions } from '../protocol/index.ts';

import { parsePlan } from './plan.ts';
import type { IParsedPlan, IPlanFingerprint } from './types.ts';
import { diagnostic } from './utilities.ts';

const UNAVAILABLE_CODES = new Set([
  'UNTERMINATED_FRONTMATTER',
  'INVALID_YAML',
  'YAML_WARNING',
  'METADATA_NOT_MAPPING',
  'YAML_VALUE_UNAVAILABLE',
]);

/** Package-private reuse of an existing observation, including absent/unreadable plans. */
export const fingerprintObservation = (
  plan: IParsedPlan | null,
  options: IPlanFingerprintOptions,
): IPlanFingerprint => {
  const parsed = PlanFingerprintOptionsSchema.safeParse(options);
  if (!parsed.success) throw planErrors.create('invalidInput');
  const excludeMetadataKeys = [...new Set(parsed.data.excludeMetadataKeys ?? [])];
  const diagnostics = plan?.diagnostics.filter((item) => UNAVAILABLE_CODES.has(item.code)) ?? [];
  if (plan && !diagnostics.length) {
    try {
      const excluded = new Set(excludeMetadataKeys);
      const metadata = Object.fromEntries(
        Object.entries(
          plan.frontmatter ? (plan.rawMetadata as Record<string, unknown>) : {},
        ).filter(([key]) => !excluded.has(key)),
      );
      const payload = stringifyJsonDeterministically(
        { body: plan.body, metadata },
        { strict: true },
      );
      return { sha256: hashValue(payload), excludeMetadataKeys, diagnostics: [] };
    } catch {
      // Serialization failures may include source values; expose only a safe observation.
    }
  }
  return {
    sha256: null,
    excludeMetadataKeys,
    diagnostics: diagnostics.length
      ? diagnostics
      : [
          diagnostic(
            'plan',
            'FINGERPRINT_UNAVAILABLE',
            'A structural fingerprint is unavailable for this document.',
          ),
        ],
  };
};

/**
 * Hash strict deterministic JSON of the exact body and raw metadata after explicit exclusions.
 * Missing preferred metadata does not prevent hashing. Ambiguous/non-JSON-safe YAML does.
 * The digest is an observation, never an approval or completion decision.
 * @param source Original plan Markdown.
 * @param options Metadata keys to omit; defaults to none and reports unique applied keys.
 * @returns Lowercase SHA-256, or null with diagnostics when the structure is unavailable.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 * @example
 * import { fingerprintPlan } from 'jg-plans';
 * const fingerprint = fingerprintPlan('# Work', { excludeMetadataKeys: ['status'] });
 * console.log(fingerprint.sha256);
 */
export const fingerprintPlan = (
  source: string,
  options: IPlanFingerprintOptions = {},
): IPlanFingerprint => fingerprintObservation(parsePlan(source), options);
