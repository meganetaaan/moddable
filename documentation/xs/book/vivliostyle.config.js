// @ts-check
import { defineConfig } from "@vivliostyle/cli";

export default defineConfig({
  title: "詳解xs",
  author: "OpenAI Codex",
  language: "ja",
  size: "A5",
  readingProgression: "ltr",
  workspaceDir: ".vivliostyle",
  theme: [
    "@vivliostyle/theme-techbook",
    "./theme/book.css"
  ],
  browser: "chrome@145.0.7632.26",
  image: "ghcr.io/vivliostyle/cli:10.3.1",
  toc: {
    title: "目次",
    sectionDepth: 2
  },
  output: [
    "output/detail-xs.pdf",
    {
      path: "output/webpub",
      format: "webpub"
    }
  ],
  entry: [
    "manuscript/00-cover.md",
    "manuscript/01-preface.md",
    "manuscript/02-constraints.md",
    "manuscript/03-engine-basics.md",
    "manuscript/04-toolchain.md",
    "manuscript/05-runtime-structures.md",
    "manuscript/06-execution-model.md",
    "manuscript/07-memory-management.md",
    "manuscript/08-rom-preload.md",
    "manuscript/09-host-integration.md",
    "manuscript/10-async-modules-security.md",
    "manuscript/11-debugging-observability.md",
    "manuscript/12-best-practices.md",
    "manuscript/13-case-study.md",
    "manuscript/14-why-xs.md",
    "manuscript/15-appendix.md"
  ]
});
