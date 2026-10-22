import { parseStrictArgs } from 'jg-process';

import { planErrors } from '../errors/index.ts';
import {
  PlanFingerprintOptionsSchema,
  ReadOptionsSchema,
  type IPlanFingerprintOptions,
} from '../protocol/index.ts';

import type { IArguments } from './types.ts';

/**
 * Validate a single CLI request before reading documents.
 * @throws
 * - JG_PLANS_INVALID_INPUT: Invalid jg-plans input
 */
export const parseArguments = (args: string[]): IArguments => {
  const [first, ...tail] = args;
  const isCommand = Boolean(first && !first.startsWith('-'));
  let flags;
  try {
    flags = parseStrictArgs(isCommand ? tail : args, {
      directory: { type: 'string' },
      input: { type: 'string' },
      slug: { type: 'string' },
      root: { type: 'string' },
      'max-bytes': { type: 'string' },
      'include-body': { type: 'boolean' },
      'fingerprint-exclude': { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    });
  } catch (cause) {
    // Argument errors may include supplied values; keep the public message stable.
    throw planErrors.create('invalidInput', { cause });
  }
  if (flags.help && flags.version) throw planErrors.create('invalidInput');
  if (flags.help || args.length === 0)
    return { command: 'help', json: flags.json, includeBody: false };
  if (flags.version) return { command: 'version', json: flags.json, includeBody: false };
  if (first !== 'inspect' && first !== 'check' && first !== 'create' && first !== 'update')
    throw planErrors.create('invalidInput');
  let fingerprint: IPlanFingerprintOptions | undefined;
  if (flags['fingerprint-exclude'] !== undefined) {
    if (first !== 'inspect') throw planErrors.create('invalidInput');
    try {
      fingerprint = PlanFingerprintOptionsSchema.parse({
        excludeMetadataKeys: JSON.parse(flags['fingerprint-exclude']) as unknown,
      });
    } catch {
      throw planErrors.create('invalidInput');
    }
  }
  if (first === 'create') {
    if (!flags.slug || !flags.input || flags.directory || flags['include-body'])
      throw planErrors.create('invalidInput');
  } else {
    if (!flags.directory || flags.root || flags.slug) throw planErrors.create('invalidInput');
    if (
      first === 'update'
        ? !flags.input || flags['include-body']
        : Boolean(flags.input) || (first === 'check' && flags['include-body'])
    )
      throw planErrors.create('invalidInput');
  }
  const maximum = flags['max-bytes'];
  if (maximum !== undefined && !/^[1-9]\d*$/.test(maximum)) throw planErrors.create('invalidInput');
  const maxBytes = maximum === undefined ? undefined : Number(maximum);
  if (!ReadOptionsSchema.safeParse({ maxBytes }).success) throw planErrors.create('invalidInput');
  return {
    command: first,
    ...(flags.directory ? { directory: flags.directory } : {}),
    ...(flags.input ? { input: flags.input } : {}),
    ...(flags.slug ? { slug: flags.slug } : {}),
    ...(flags.root ? { root: flags.root } : {}),
    includeBody: flags['include-body'],
    ...(fingerprint ? { fingerprint } : {}),
    json: flags.json,
    ...(maxBytes === undefined ? {} : { maxBytes }),
  };
};
