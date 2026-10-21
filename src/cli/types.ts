/** Validated CLI requests; file paths stay explicit. */
export type IArguments = {
  command: 'inspect' | 'check' | 'create' | 'update' | 'help' | 'version';
  directory?: string;
  maxBytes?: number;
  input?: string;
  slug?: string;
  root?: string;
  includeBody: boolean;
  json: boolean;
};
