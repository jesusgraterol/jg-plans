/** Validated CLI requests; file paths stay explicit. */
export type IArguments = {
  command: 'inspect' | 'check' | 'create' | 'update' | 'help' | 'version';
  directory?: string;
  maxBytes?: number;
  input?: string;
  slug?: string;
  root?: string;
  includeBody: boolean;
  fingerprint?: IPlanFingerprintOptions;
  json: boolean;
};
import type { IPlanFingerprintOptions } from '../protocol/index.ts';
