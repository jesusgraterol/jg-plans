/** The implemented provisional document protocol, independent of the npm version. */
export const PROTOCOL_VERSION = '0.2';

// supported declarations; unversioned documents use the current protocol too
export const PROTOCOL_VERSIONS = ['0.2'] as const;

// the progress vocabulary of 0.2 plans, milestones, and derived criterion progress
export const PROGRESS_VALUES = ['pending', 'in progress', 'done'] as const;

// the priorities a 0.2 plan can declare
export const PRIORITY_VALUES = ['low', 'medium', 'high', 'hotfix'] as const;

// optional 0.2 plan fields describing its priority and the repositories and error codes it changes
export const SCOPE_METADATA_KEYS = ['priority', 'repositories', 'error_codes'] as const;

// preferred plan fields whose absence is reported; the optional protocol marker is not
export const CORE_METADATA_KEYS = ['id', 'created_at', 'updated_at', 'revision', 'status'] as const;

/** Default per-file bound for selected-directory reads. */
export const DEFAULT_MAX_BYTES = 1024 * 1024;
