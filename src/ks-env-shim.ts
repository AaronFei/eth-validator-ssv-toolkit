// ESM replacement for @chainsafe/bls-keystore/lib/env.js.
// That file is CJS and slips past the bundler's commonjs transform, causing
// "exports is not defined" at load. This shim has identical behaviour but as
// ESM, and vite.config redirects the env import here.
export const isNode =
  typeof process !== 'undefined' &&
  (process as any).versions != null &&
  (process as any).versions.node != null;

export const hasWebCrypto =
  typeof globalThis !== 'undefined' &&
  (globalThis as any).crypto != null &&
  (globalThis as any).crypto.subtle != null;

export default { isNode, hasWebCrypto };
