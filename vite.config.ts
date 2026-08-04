// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Node-only packages that must never be pre-bundled for the browser.
// They reach the client module graph transitively via *.server.ts files
// (index.server → postgres, pdf-generate.server → pdfkit, etc.). The
// import-protection plugin mocks *.server.ts at runtime, but Vite's dep
// optimizer (esbuild) scans the graph *before* plugins run and would
// pre-bundle them into shared chunks — causing "Buffer is not defined"
// when the chunk loads in the browser.
//
// `drizzle-orm/postgres-js` is listed because it `import postgres from
// "postgres"` at the top level. Even though `postgres` itself is excluded,
// esbuild pre-bundles `drizzle-orm/postgres-js` and leaves the `postgres`
// import as a bare specifier that Vite serves directly from node_modules —
// where `postgres/src/bytes.js` calls `Buffer.allocUnsafe()` and crashes
// the browser with "Buffer is not defined". Excluding the drizzle subpath
// prevents esbuild from ever creating that pre-bundled chunk.
const nodeOnlyPackages = [
  "postgres",
  "drizzle-orm/postgres-js",
  "pdfkit",
  "nodemailer",
  "sanitize-html",
  "bcryptjs",
  "whatsapp-web.js",
  "qrcode",
  "qrcode-terminal",
  "node-cron",
];

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    // Use "mock" behavior in dev so *.server.ts files are replaced with empty
    // mock modules on the client (instead of "error" which still loads the file
    // for pre-transform resolves). Build stays "error" to catch real violations.
    importProtection: {
      behavior: { dev: "mock", build: "error" },
      client: {
        files: ["**/server/**", "**/*.server.*"],
        specifiers: ["server-only"],
      },
    },
  },
  vite: {
    optimizeDeps: {
      // Prevent esbuild from pre-bundling Node-only packages into browser chunks.
      exclude: nodeOnlyPackages,
    },
    build: {
      rollupOptions: {
        // Node-only packages (see `nodeOnlyPackages` above). Externalizing them
        // keeps Rollup from trying to transform their Node builtins (perf_hooks,
        // net, tls, Buffer, ...) into browser shims, which fails the build. The
        // server still resolves them from node_modules at runtime.
        external: [...nodeOnlyPackages],
      },
    },
  },
});
