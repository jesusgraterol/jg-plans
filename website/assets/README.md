# Sharing image

social.html is the committed 1200 × 630 template. render.ts uses the Chromium bundled with the pinned Playwright 1.64.1 at device scale 1. It embeds only local font/mark bytes, blocks network requests, waits for both declared fonts, checks content bounds, and writes public/social.png atomically.

Run `pnpm --dir website assets:generate`, inspect the PNG, then commit it with manifest.json. `assets:check` verifies the complete source/renderer input receipt, output checksum, renderer pin, and PNG dimensions without rasterizing on another operating system. Source changes or manual output changes make the check fail. Both generation and checking compare the template badge against PROTOCOL_VERSION from the owning protocol source entry, so outdated protocol wording fails before rendering or receipt acceptance. Regenerate with the pinned renderer; do not edit the PNG or receipt.

The unchanged JG mark is the public jg-personal-astro-ui 0.4.0 export under MIT; see ../public/licenses/jg-ui.txt. The unmodified Latin variable font files are Ubuntu Sans and Ubuntu Sans Mono from Fontsource packages 5.3.0 under Ubuntu Font Licence 1.0; see ../public/licenses/ubuntu-fonts.txt. No system or network font substitutes are used.
