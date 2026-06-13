import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { fileURLToPath } from 'node:url';

const CRYPTO_SHIM = fileURLToPath(new URL('./src/crypto-shim.ts', import.meta.url));
const KS_ENV_SHIM = fileURLToPath(new URL('./src/ks-env-shim.ts', import.meta.url));

// Redirect ONLY the SSV SDK's `crypto` import to our shim (= unenv crypto with
// working AES ciphers from @noble/ciphers). vite-plugin-node-polyfills has
// already rewritten `crypto` to the absolute unenv runtime path by the time
// this runs, so we also match that path. Scoping to @ssv-labs avoids touching
// anyone else's crypto (and avoids loops with the shim's own unenv import).
function sdkCryptoShim() {
  return {
    name: 'sdk-crypto-shim',
    enforce: 'pre',
    resolveId(source, importer) {
      const norm = typeof source === 'string' ? source.replace(/\\/g, '/') : '';
      const imp = typeof importer === 'string' ? importer.replace(/\\/g, '/') : '';
      const isCrypto =
        source === 'crypto' ||
        source === 'node:crypto' ||
        norm.endsWith('/unenv/dist/runtime/node/crypto.mjs');
      if (isCrypto && imp.includes('@ssv-labs')) return CRYPTO_SHIM;
      // @chainsafe/bls-keystore's CJS env.js escapes the commonjs transform
      // ("exports is not defined"). Its sub-modules import it as "../env";
      // redirect to an ESM shim (also forces hasWebCrypto=true → browser path).
      if (
        imp.includes('bls-keystore') &&
        (/(^|\/)\.\.?\/env(\.js)?$/.test(source) || norm.endsWith('/@chainsafe/bls-keystore/lib/env.js'))
      ) {
        return KS_ENV_SHIM;
      }
      return null;
    },
  };
}

// SECURITY: bind to loopback only. To reach it from your own Tailscale devices,
// run `pnpm preview --host <your-tailscale-ip>` instead. Never bind 0.0.0.0 / the
// LAN / a public tunnel for a tool that touches keys.
export default defineConfig({
  // Relative base so it works on GitHub Pages (served under /<repo>/) AND when
  // opened directly from disk via file://.
  base: './',
  // Build into docs/ so GitHub Pages can serve from `main` branch /docs (no CI,
  // so the deployed code is exactly this locally-built, reviewable bundle).
  // transformMixedEsModules: some generate deps are CommonJS (use exports/require);
  // convert them so they don't blow up with "exports is not defined" in the browser.
  build: {
    outDir: 'docs',
    emptyOutDir: true,
    // strictRequires forces every CJS module to be wrapped (fixes
    // "exports is not defined" from e.g. @chainsafe/bls-keystore/lib/env.js).
    commonjsOptions: { transformMixedEsModules: true, strictRequires: true },
  },
  plugins: [
    sdkCryptoShim(),
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  server: { host: '127.0.0.1', port: 5599, strictPort: true },
  preview: { host: '127.0.0.1', port: 5599, strictPort: true },
});
