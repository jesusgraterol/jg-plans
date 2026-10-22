import { z } from 'zod';

export const ReleaseVersionSchema = z
  .string()
  .max(64)
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const CommitSchema = z.string().regex(/^[a-f0-9]{40}$/);

export const PackageIdentitySchema = z.object({
  name: z.literal('jg-plans'),
  version: ReleaseVersionSchema,
});

/** A receipt for one consumer-tested archive, not a command to rebuild it. */
export const ReleaseManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  name: z.literal('jg-plans'),
  version: ReleaseVersionSchema,
  sourceCommit: CommitSchema,
  sourceDirty: z.boolean(),
  archive: z.string().regex(/^jg-plans-\d+\.\d+\.\d+\.tgz$/),
  sha256: DigestSchema,
  integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/),
  files: z.record(z.string().min(1), DigestSchema),
});
export type IReleaseManifest = z.infer<typeof ReleaseManifestSchema>;

export const RegistryVersionSchema = z.object({
  name: z.literal('jg-plans'),
  version: ReleaseVersionSchema,
  dist: z.object({
    tarball: z.url(),
    integrity: z.string(),
    attestations: z
      .object({ url: z.url(), provenance: z.object({ predicateType: z.string() }).optional() })
      .optional(),
  }),
});
export type IRegistryVersion = z.infer<typeof RegistryVersionSchema>;

/** Validate the package envelope; only the selected version needs release metadata. */
export const RegistryPackageSchema = z.object({
  name: z.literal('jg-plans'),
  versions: z.record(z.string(), z.unknown()),
  'dist-tags': z.object({ latest: z.string().optional() }),
});

export type IRegistryOptions = { registry?: string; signal?: AbortSignal };
export type IPublishedObservation =
  | { state: 'missing' }
  | { state: 'pending'; reason: 'tarball-unavailable' | 'metadata-unavailable' }
  | { state: 'published'; metadata: IRegistryVersion; bytes: Uint8Array };

/** Only the supplied external publication effect is replaceable in orchestration tests. */
export type IPublishOptions = IRegistryOptions & {
  ready: boolean;
  publish: (signal: AbortSignal) => Promise<void>;
  verifyProvenance: (
    metadata: IRegistryVersion,
    bytes: Uint8Array,
    signal: AbortSignal,
  ) => Promise<void>;
  timeoutMs?: number;
  pollMs?: number;
};

export const AttestationsSchema = z.object({
  attestations: z.array(
    z.object({
      predicateType: z.string(),
      bundle: z.object({ dsseEnvelope: z.object({ payload: z.string().max(1024 * 1024) }) }),
    }),
  ),
});

export const ProvenanceStatementSchema = z.object({
  predicateType: z.literal('https://slsa.dev/provenance/v1'),
  subject: z.array(z.object({ name: z.string(), digest: z.object({ sha512: z.string() }) })),
  predicate: z.object({
    buildDefinition: z.object({
      externalParameters: z.object({
        workflow: z.object({
          ref: z.literal('refs/heads/main'),
          repository: z.literal('https://github.com/jesusgraterol/jg-plans'),
          path: z.literal('.github/workflows/check.yml'),
        }),
      }),
      resolvedDependencies: z.array(
        z.object({ uri: z.string(), digest: z.object({ gitCommit: CommitSchema }) }),
      ),
    }),
  }),
});
