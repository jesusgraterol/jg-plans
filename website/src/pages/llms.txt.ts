import { buildLlmsText } from 'jg-site';

import { PAGES, SITE } from '../site.config.ts';

export const GET = () =>
  new Response(
    buildLlmsText({
      name: SITE.name,
      summary: PAGES[0].description,
      details: [
        'Protocol 0.2 is provisional. Pages expose Markdown alternatives through their alternate links. Documents remain useful without the library or CLI.',
      ],
      sections: [
        {
          heading: 'Protocol, documentation, and examples',
          links: PAGES.map((page) => ({
            title: page.label,
            description: page.description,
            url: new URL(page.path, SITE.url).href,
          })),
        },
      ],
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
