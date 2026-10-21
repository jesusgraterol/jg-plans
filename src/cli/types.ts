/** Validated CLI requests; file paths stay explicit. */
export type IArguments = {
  command: 'inspect' | 'check' | 'help' | 'version';
  directory?: string;
  maxBytes?: number;
  includeBody: boolean;
  json: boolean;
};
