import { setTimeout as delay } from 'node:timers/promises';

import { PUBLICATION_POLL_MS, PUBLICATION_TIMEOUT_MS, releaseErrors } from './constants.ts';
import { observePublished, qualifyVersion, readLatest } from './registry.ts';
import type { IPublishOptions, IReleaseManifest } from './types.ts';

/**
 * Publish at most once. Any uncertain result is reconciled before a later invocation can retry.
 * @throws
 * - RELEASE_INVALID_INPUT: Invalid release input
 * - RELEASE_REGISTRY_UNAVAILABLE: The registry could not be verified
 * - RELEASE_INTEGRITY_MISMATCH: Release archive integrity does not match
 * - RELEASE_CONTENTS_CHANGED: Shipped contents changed without a new version
 * - RELEASE_VERSION_NOT_HIGHER: A new release version must be higher than the published latest version
 * - RELEASE_PUBLISH_FAILED: Publication did not reach a verified public state; reconcile before retrying
 */
export const publishRelease = async (
  manifest: IReleaseManifest,
  options: IPublishOptions,
): Promise<{ state: 'disabled' | 'published' | 'already-published'; version: string }> => {
  if (!options.ready) return { state: 'disabled', version: manifest.version };
  const timeout = options.timeoutMs ?? PUBLICATION_TIMEOUT_MS;
  const poll = options.pollMs ?? PUBLICATION_POLL_MS;
  if (
    !Number.isSafeInteger(timeout) ||
    timeout <= 0 ||
    timeout > 2_147_483_647 ||
    !Number.isSafeInteger(poll) ||
    poll <= 0 ||
    poll > timeout
  )
    throw releaseErrors.create('invalidInput');
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new DOMException('Publication deadline exceeded', 'TimeoutError')),
    timeout,
  );
  timer.unref();
  try {
    const signal = AbortSignal.any([deadline.signal, ...(options.signal ? [options.signal] : [])]);
    const context = { ...(options.registry ? { registry: options.registry } : {}), signal };
    const comparison = {
      ...context,
      ...(options.candidateArchive ? { candidateArchive: options.candidateArchive } : {}),
    };
    let observed = await qualifyVersion(manifest, comparison);
    const existed = observed.state !== 'missing';
    let publishCause: unknown;
    if (observed.state === 'missing') {
      try {
        await options.publish(signal);
      } catch (cause) {
        publishCause = cause;
      }
    }
    while (!signal.aborted) {
      try {
        observed = await observePublished(manifest, existed ? comparison : context);
        if (observed.state === 'published' && (await readLatest(context)) === manifest.version) {
          await options.verifyProvenance(observed.metadata, observed.bytes, signal);
          return { state: existed ? 'already-published' : 'published', version: manifest.version };
        }
      } catch (cause) {
        // Different bytes are definitive. Transient availability and incomplete provenance may propagate.
        if (
          releaseErrors.is(cause) &&
          ['RELEASE_CONTENTS_CHANGED', 'RELEASE_INTEGRITY_MISMATCH'].includes(cause.code)
        )
          throw cause;
        if (
          !signal.aborted &&
          !(
            releaseErrors.is(cause) &&
            ['RELEASE_REGISTRY_UNAVAILABLE', 'RELEASE_PROVENANCE_MISSING'].includes(cause.code)
          )
        )
          throw cause;
      }
      try {
        await delay(poll, undefined, { signal });
      } catch {
        break;
      }
    }
    throw releaseErrors.create('publishFailed', publishCause ? { cause: publishCause } : {});
  } finally {
    clearTimeout(timer);
  }
};
