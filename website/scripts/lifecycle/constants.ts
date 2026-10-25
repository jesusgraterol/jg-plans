// These administrative exclusions belong to the example consumer, not the protocol.
export const ADMINISTRATIVE_KEYS = ['created_at', 'updated_at', 'revision', 'status'];

// the criterion the revision appends before any milestone delivers it
export const REVISED_CRITERION = '- AC-04: Search suggests spelling corrections.\n';

export const INITIAL_BODY =
  '# Search feedback\n\nExplain empty search results and give people a useful next action.\n\n## Acceptance criteria\n\n- AC-01: Empty search results explain why nothing matched.\n- AC-02: The empty state offers one next action, such as clearing the active filters.\n- AC-03: The explanation and the action work with a keyboard and a screen reader.\n';
