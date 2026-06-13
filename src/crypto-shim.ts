// Surgical crypto shim for the browser bundle.
//
// vite-plugin-node-polyfills routes node `crypto` to unenv's runtime crypto,
// whose createCipheriv/createDecipheriv are throwing stubs ("not implemented").
// Everything else unenv provides (createHash, randomBytes, pbkdf2, scrypt…)
// works, and the keystore KDF already passes. So we keep unenv intact and only
// re-implement the AES cipher functions on top of @noble/ciphers (pure ESM).
//
// vite.config.ts redirects ONLY the SSV SDK's `crypto` import to this file.
import * as unenv from 'unenv/node/crypto';
import { ctr, gcm } from '@noble/ciphers/aes.js';
import { Buffer } from 'buffer';

type Bin = Uint8Array | Buffer | ArrayBuffer | string | null | undefined;

const u8 = (x: Bin): Uint8Array => {
  if (x == null) return new Uint8Array(0);
  if (x instanceof Uint8Array) return x; // Buffer is a Uint8Array
  if (typeof x === 'string') return new Uint8Array(Buffer.from(x));
  return new Uint8Array(x as ArrayBuffer);
};

const concat = (parts: Uint8Array[]): Uint8Array => {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
};

// node createDecipheriv(algo, key, iv).update(ct)+.final() == full plaintext.
// We buffer in update() and do the whole AES op in final(); concat(update,final)
// still yields the right bytes. Supports aes-*-ctr and aes-*-gcm.
function createDecipheriv(algo: string, key: Bin, iv: Bin) {
  const k = u8(key);
  const nonce = u8(iv);
  const gcmMode = /gcm/i.test(algo);
  const chunks: Uint8Array[] = [];
  let tag: Uint8Array | null = null;
  return {
    update(data: Bin) { chunks.push(u8(data)); return Buffer.alloc(0); },
    setAuthTag(t: Bin) { tag = u8(t); return this; },
    setAutoPadding() { return this; },
    final() {
      let ct = concat(chunks);
      if (gcmMode && tag) ct = concat([ct, tag]); // @noble expects ct||tag
      const pt = gcmMode ? gcm(k, nonce).decrypt(ct) : ctr(k, nonce).decrypt(ct);
      return Buffer.from(pt);
    },
  };
}

function createCipheriv(algo: string, key: Bin, iv: Bin) {
  const k = u8(key);
  const nonce = u8(iv);
  const gcmMode = /gcm/i.test(algo);
  const chunks: Uint8Array[] = [];
  let tag: Uint8Array | null = null;
  return {
    update(data: Bin) { chunks.push(u8(data)); return Buffer.alloc(0); },
    setAutoPadding() { return this; },
    getAuthTag() { return tag ? Buffer.from(tag) : Buffer.alloc(0); },
    final() {
      const pt = concat(chunks);
      const out = gcmMode ? gcm(k, nonce).encrypt(pt) : ctr(k, nonce).encrypt(pt);
      if (gcmMode) {
        tag = out.slice(out.length - 16);
        return Buffer.from(out.slice(0, out.length - 16));
      }
      return Buffer.from(out);
    },
  };
}

const base: any = (unenv as any).default ?? unenv;
const patched: any = Object.assign({}, base, { createCipheriv, createDecipheriv });

// Cover default, namespace, and named import styles used by the SDK.
export default patched;
export { createCipheriv, createDecipheriv };
export * from 'unenv/node/crypto';
