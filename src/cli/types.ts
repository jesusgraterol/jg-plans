import type { IPlanFingerprintOptions } from '../protocol/index.ts';

/** Validated CLI requests; file paths stay explicit. */
export type IArguments = {
  command:
    | 'inspect'
    | 'check'
    | 'create'
    | 'update'
    | 'write'
    | 'remove-milestones'
    | 'overlaps'
    | 'help'
    | 'version';
  directory?: string;
  maxBytes?: number;
  input?: string;
  slug?: string;
  root?: string;
  // the overlaps command's planning roots, in the order given
  roots?: string[];
  includeBody: boolean;
  fingerprint?: IPlanFingerprintOptions;
  json: boolean;
};
