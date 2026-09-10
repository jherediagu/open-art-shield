// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// BASE_PATH is "/open-art-shield" on project pages and "/" on a custom domain;
// SITE_URL is the origin. Both are set by .github/workflows/pages.yml.
const base = (process.env.BASE_PATH ?? "/").replace(/\/+$/, "") || "/";
const site = process.env.SITE_URL ?? "https://jherediagu.github.io";

export default defineConfig({
  site,
  base,
  trailingSlash: "always",
  integrations: [
    starlight({
      title: "OpenArtShield",
      description:
        "Open-source toolkit to watermark, declare, cloak, and measure how much image protection actually survives.",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/jherediagu/open-art-shield" },
      ],
      editLink: {
        baseUrl: "https://github.com/jherediagu/open-art-shield/edit/main/",
      },
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        { label: "Install", link: "/install/" },
        { label: "Verify an image online", link: "/verify/", attrs: { target: "_self" } },
        { label: "Guides", items: [{ autogenerate: { directory: "guides" } }] },
        { label: "Reference", items: [{ autogenerate: { directory: "reference" } }] },
        { label: "Packages", items: [{ autogenerate: { directory: "packages" } }] },
        { label: "Project", items: [{ autogenerate: { directory: "project" } }] },
      ],
    }),
  ],
});
