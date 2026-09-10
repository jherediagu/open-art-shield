# Documentation site

[Astro Starlight](https://starlight.astro.build/) site published to GitHub
Pages by `.github/workflows/pages.yml`, with the client-side verifier from
`examples/web-verifier` mounted at `/verify/`.

The repository markdown is the single source of truth: `scripts/sync-docs.mjs`
copies `docs/`, the package readmes, `roadmap.md` and `security.md` into
`src/content/docs/` at build time and rewrites relative links. Edit those
files, not the generated copies. The only hand-written pages are in
`content-src/` (`{{base}}` is replaced with the site base path).

```bash
# Astro 7 needs Node 22+ (the rest of the repo runs on 18+).
pnpm --filter @openartshield/web-verifier... build
pnpm --filter @openartshield/website dev          # http://localhost:4321
BASE_PATH=/open-art-shield pnpm --filter @openartshield/website build:site
```

`BASE_PATH` and `SITE_URL` default to the project-pages values; set the
repository variables of the same name once a custom domain is configured.
