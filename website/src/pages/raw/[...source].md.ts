import type { APIRoute } from 'astro';

import { availabilityMessage, readAvailability } from '../../availability.ts';
import { homeMarkdown, PUBLIC_SOURCES, readPublicBytes } from '../../content/sources.ts';
import { PAGES, SITE } from '../../site.config.ts';

export const getStaticPaths = () =>
  ['index.md', ...PUBLIC_SOURCES.filter((source) => source.endsWith('.md'))].map((source) => ({
    params: { source: source.slice(0, -3) },
    props: { source },
  }));

export const GET: APIRoute = async ({ props }) => {
  const source = props.source as string;
  const availability = readAvailability(import.meta.env.JG_PLANS_AVAILABILITY);
  const page = PAGES.find((entry) => 'source' in entry && entry.source === source);
  const canonical = new URL(source === 'index.md' ? '/' : (page?.path ?? '/examples/'), SITE.url)
    .href;
  const body =
    source === 'index.md' ? homeMarkdown() : (await readPublicBytes(source)).toString('utf8');
  return new Response(
    `${availability.state === 'published' ? 'Verified package release' : 'Development preview'}\n\n${availabilityMessage(availability)}\n\nCanonical page: ${canonical}\n\n---\n\n${body}`,
    { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } },
  );
};
