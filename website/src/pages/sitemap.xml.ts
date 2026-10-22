import { PAGES, SITE } from '../site.config.ts';

export const GET = () =>
  new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${PAGES.map((page) => `<url><loc>${new URL(page.path, SITE.url).href}</loc></url>`).join('')}</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
