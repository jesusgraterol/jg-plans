import { fileURLToPath } from 'node:url';
import { satteri } from '@astrojs/markdown-satteri';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { codeWindowPlugin } from 'jg-personal-astro-ui/code-window-plugin';
import { externalLinkPlugin } from 'jg-personal-astro-ui/external-link-plugin';
import { SYNTAX_THEME } from 'jg-personal-astro-ui/syntax-theme';

import { documentTitlePlugin, sourceLinksPlugin } from './src/content/index.ts';
import { SITE } from './src/site.config.ts';

export default defineConfig({
  site: SITE.url,
  output: 'static',
  trailingSlash: 'always',
  markdown: {
    shikiConfig: { theme: SYNTAX_THEME },
    processor: satteri({
      hastPlugins: [
        documentTitlePlugin,
        sourceLinksPlugin,
        codeWindowPlugin,
        externalLinkPlugin({ siteUrl: SITE.url }),
      ],
    }),
  },
  vite: {
    plugins: [tailwindcss()],
    define: {
      'import.meta.env.JG_PLANS_SOURCE_ROOT': JSON.stringify(
        fileURLToPath(new URL('../', import.meta.url)),
      ),
    },
  },
});
