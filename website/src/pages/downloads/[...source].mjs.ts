import type { APIRoute } from 'astro';

import { PUBLIC_SOURCES, readPublicBytes } from '../../content/sources.ts';

export const getStaticPaths = () =>
  PUBLIC_SOURCES.filter((source) => source.endsWith('.mjs')).map((source) => ({
    params: { source: source.slice(0, -4) },
    props: { source },
  }));

export const GET: APIRoute = async ({ props }) =>
  new Response(new Uint8Array(await readPublicBytes(props.source as string)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
