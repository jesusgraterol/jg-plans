import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getErrorCode } from 'jg-exception';

import manifest from '../../package.json' with { type: 'json' };
import { packPackage } from '../../scripts/package/index.ts';
import {
  observePublished,
  readRelease,
  ReleaseVersionSchema,
  writeReleaseManifest,
  type IRegistryOptions,
} from '../../scripts/release/index.ts';
import type { IAvailability } from '../src/availability.ts';

/**
 * Verify an explicitly requested release against the current built package's actual payload.
 * Offline builds perform no registry work. Unknown evidence never becomes proof of absence.
 */
export const verifyAvailability = async (
  requested: string | undefined,
  options: IRegistryOptions = {},
): Promise<IAvailability> => {
  const preview = { state: 'preview' as const, version: manifest.version };
  if (!requested) return { ...preview, reason: 'offline' };
  if (!ReleaseVersionSchema.safeParse(requested).success || requested !== manifest.version)
    return { ...preview, reason: 'version-mismatch' };
  const directory = await mkdtemp(join(tmpdir(), 'jg-plans-site-release-'));
  try {
    const archive = await packPackage(directory, options.signal);
    await writeReleaseManifest(archive, options.signal);
    const release = await readRelease(directory);
    try {
      const observed = await observePublished(release.manifest, {
        ...options,
        candidateArchive: release.bytes,
      });
      return observed.state === 'published'
        ? { state: 'published', version: manifest.version, reason: 'verified' }
        : { ...preview, reason: observed.state };
    } catch (cause) {
      const code = getErrorCode(cause);
      if (code === 'RELEASE_CONTENTS_CHANGED' || code === 'RELEASE_INTEGRITY_MISMATCH')
        return { ...preview, reason: 'contents-differ' };
      if (code === 'RELEASE_REGISTRY_UNAVAILABLE')
        return { state: 'unknown', version: manifest.version, reason: 'registry-unavailable' };
      throw cause;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
