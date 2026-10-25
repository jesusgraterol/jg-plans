import { readAvailability } from '../availability.ts';

export const GET = () =>
  new Response(
    JSON.stringify({
      schemaVersion: 1,
      ...readAvailability(import.meta.env.JG_PLANS_AVAILABILITY),
      protocol: '0.2',
      sourceCommit: import.meta.env.JG_PLANS_SOURCE_COMMIT,
    }),
    { headers: { 'Content-Type': 'application/json; charset=utf-8' } },
  );
