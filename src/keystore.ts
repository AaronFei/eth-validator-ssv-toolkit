// EIP-2335 keystore (create + decrypt) implemented directly on @noble — pure
// ESM, no node:crypto, no CJS. Matches the staking-deposit-cli format (scrypt
// n=262144 / aes-128-ctr / sha256 checksum). Verified to interop with
// deposit-cli keystores (decrypt) and to round-trip.
import { scrypt } from '@noble/hashes/scrypt.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes, bytesToHex, hexToBytes, concatBytes } from '@noble/hashes/utils.js';
import { ctr } from '@noble/ciphers/aes.js';

export interface Eip2335Keystore {
  version: 4;
  uuid: string;
  path: string;
  pubkey: string;
  description: string;
  crypto: any;
}

// EIP-2335: NFKD-normalize the password and strip C0/C1 control chars + DEL.
function passwordBytes(password: string): Uint8Array {
  const norm = password.normalize('NFKD');
  let out = '';
  for (const ch of norm) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x00 && cp <= 0x1f) || (cp >= 0x80 && cp <= 0x9f) || cp === 0x7f) continue;
    out += ch;
  }
  return new TextEncoder().encode(out);
}

function uuidv4(): string {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = bytesToHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function deriveKey(crypto: any, pw: Uint8Array): Uint8Array {
  const salt = hexToBytes(crypto.kdf.params.salt);
  const p = crypto.kdf.params;
  if (crypto.kdf.function === 'scrypt') {
    return scrypt(pw, salt, { N: p.n, r: p.r, p: p.p, dkLen: p.dklen, maxmem: 2 * 1024 * 1024 * 1024 });
  }
  if (crypto.kdf.function === 'pbkdf2') {
    return pbkdf2(sha256, pw, salt, { c: p.c, dkLen: p.dklen });
  }
  throw new Error(`unsupported kdf ${crypto.kdf.function}`);
}

export function createKeystore(password: string, secret: Uint8Array, pubkey: Uint8Array, path: string): Eip2335Keystore {
  const pw = passwordBytes(password);
  const salt = randomBytes(32);
  const N = 262144, r = 8, p = 1, dklen = 32;
  const dk = scrypt(pw, salt, { N, r, p, dkLen: dklen, maxmem: 2 * 1024 * 1024 * 1024 });
  const iv = randomBytes(16);
  const cipherText = ctr(dk.slice(0, 16), iv).encrypt(secret);
  const checksum = sha256(concatBytes(dk.slice(16, 32), cipherText));
  return {
    version: 4,
    uuid: uuidv4(),
    path,
    pubkey: bytesToHex(pubkey),
    description: '',
    crypto: {
      kdf: { function: 'scrypt', params: { dklen, n: N, r, p, salt: bytesToHex(salt) }, message: '' },
      checksum: { function: 'sha256', params: {}, message: bytesToHex(checksum) },
      cipher: { function: 'aes-128-ctr', params: { iv: bytesToHex(iv) }, message: bytesToHex(cipherText) },
    },
  };
}

export function decryptKeystore(ks: Eip2335Keystore, password: string): Uint8Array {
  const pw = passwordBytes(password);
  const dk = deriveKey(ks.crypto, pw);
  const cipherText = hexToBytes(ks.crypto.cipher.message);
  const checksum = sha256(concatBytes(dk.slice(16, 32), cipherText));
  if (bytesToHex(checksum) !== ks.crypto.checksum.message.toLowerCase()) {
    throw new Error('invalid password (checksum mismatch)');
  }
  const iv = hexToBytes(ks.crypto.cipher.params.iv);
  return ctr(dk.slice(0, 16), iv).decrypt(cipherText);
}
