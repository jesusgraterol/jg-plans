/** The implemented provisional document protocol, independent of the npm version. */
export const PROTOCOL_VERSION = '0.2';

// protocol versions a plan can declare; a plan without a declaration follows 0.1
export const PROTOCOL_VERSIONS = ['0.1', '0.2'] as const;

// the progress vocabulary of 0.2 plans, milestones, and derived criterion progress
export const PROGRESS_VALUES = ['pending', 'in progress', 'done'] as const;

// preferred plan fields whose absence is reported; the optional protocol marker is not
export const CORE_METADATA_KEYS = ['id', 'created_at', 'updated_at', 'revision', 'status'] as const;

/** Default per-file bound for selected-directory reads. */
export const DEFAULT_MAX_BYTES = 1024 * 1024;
