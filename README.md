# ETH Validator + SSV Toolkit (client-side)

**Live:** https://aaronfei.github.io/eth-validator-ssv-toolkit/ (8 languages — English · 繁體中文 · 简体中文 · 日本語 · 한국어 · Русский · Deutsch · Español — selector top-right)

A fully **client-side** toolkit for Ethereum validator keys, in three tabs:
**① Generate** (BIP-39 mnemonic → EIP-2335 keystores + `deposit_data`),
**② Top-up** (add ETH to an existing 0x02 validator → `deposit_data` only), and
**③ Split** (keystore → SSV KeyShares). All key material — mnemonic, private
key, keystore, password — is processed **in the browser tab only**: nothing is
uploaded, nothing is written to `localStorage`/`IndexedDB` (only your UI
language is stored). Outputs are delivered as in-browser downloads. The
generated `deposit_data` is **verified byte-identical to the official deposit
CLI** — see **Sources & verification** below.

## Use it

1. Paste the command app.ssv.network generates after selecting operators → it
   fills the operator keys / owner / nonce.
2. Pick your keystore file(s) + enter the password.
3. **Generate** → click the green download button to save `keyshares.json`.
4. Upload that `keyshares.json` to app.ssv.network to register (only after you
   have stopped the validator running anywhere else — see safety note).

## ⚠️ Security

This handles keys that control real ETH. Even though it's client-side:

- **Prefer running it locally / offline for real keys.** Build, then open
  `docs/index.html` directly (file://) or serve on localhost / your own
  Tailscale — and **disconnect from the network before entering a real
  keystore**. The split needs no network; offline means even a tampered build
  can't exfiltrate anything.
- A public deployment (GitHub Pages) is loaded fresh each visit, so its safety
  depends on the deployed build not being tampered with (keep 2FA on your
  GitHub account; verify the source/commit).
- **Never** commit real keystores. `.gitignore` blocks `keystore-m_*.json`,
  `keyshares*.json`, `deposit_data*.json`, `keystores/`, `shares/`.
- Avoid double-signing: do not register on SSV while the same validator is still
  running on another host. Stop it first and wait for 2 consecutive missed
  attestations (beaconcha.in) before registering.

## Dev

```bash
pnpm install
pnpm build          # outputs static site to docs/ (served by GitHub Pages)
pnpm preview        # serve docs/ on 127.0.0.1
pnpm preview --host <your-tailscale-ip>   # serve over your own Tailscale only
```

`test.keystore.json` (password `testtest`) is the public SSV test key, for
verifying the tool before using real keys.

```bash
pnpm test          # OFFLINE self-test: fixed-vector deposit_data + keystore round-trip + sign→verify
pnpm verify:cli    # diff this toolkit's deposit_data vs the official deposit-cli (needs the Python CLI)
```

CI (`.github/workflows/verify-bundle.yml`) re-runs `pnpm test` and fails if the
committed `docs/` is not byte-identical to a fresh build from the lockfile — so
a tampered committed bundle is detectable automatically.

---

## Sources & verification / 來源與驗證

This toolkit handles validator keys entirely in your browser. The sections below let you independently confirm that (a) it follows the official Ethereum standards, (b) it uses only audited crypto libraries, (c) its output is byte-identical to the official deposit CLI, and (d) secrets never leave the tab.

本工具在您的瀏覽器內完成所有金鑰運算。以下說明讓您可以自行驗證:(a) 遵循官方標準、(b) 僅使用經審計的密碼學函式庫、(c) 產出與官方 deposit CLI 位元組一致、(d) 機密永不離開分頁。

### Standards implemented / 採用的標準
- **BIP-39** mnemonic (24 words / 256-bit entropy) — https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
- **EIP-2333** BLS12-381 key derivation (master key) — https://eips.ethereum.org/EIPS/eip-2333
- **EIP-2334** derivation paths `m/12381/3600/<index>/0/0` — https://eips.ethereum.org/EIPS/eip-2334
- **EIP-2335** BLS keystore (scrypt + AES-128-CTR + SHA-256 checksum) — https://eips.ethereum.org/EIPS/eip-2335
- **EIP-7251** compounding (0x02) withdrawal credentials, 32–2048 ETH — https://eips.ethereum.org/EIPS/eip-7251
- **EIP-55** mixed-case address checksum (withdrawal-address typo guard) — https://eips.ethereum.org/EIPS/eip-55
- **Deposit domain** `compute_domain(DOMAIN_DEPOSIT=0x03000000, GENESIS_FORK_VERSION, genesis_validators_root=0x00…00)` per the consensus specs — https://github.com/ethereum/consensus-specs/blob/master/specs/phase0/beacon-chain.md

### Audited libraries / 使用的函式庫 (pinned via `pnpm-lock.yaml`)
- `@noble/hashes`, `@noble/ciphers` — scrypt/pbkdf2/SHA-256/keccak + AES, and the Web Crypto CSPRNG (`crypto.getRandomValues`) for every secret value (mnemonic, salt, IV, UUID). No `Math.random` in the secret path.
- `@scure/bip39` — BIP-39 mnemonic generation/validation.
- `@chainsafe/bls` (herumi backend) + `@chainsafe/bls-keygen` — BLS signing/verify and EIP-2333/2334 derivation. The BLS WASM is **inlined as base64** in the bundle, so it runs with the network physically off (no CDN).
- `@lodestar/types` — canonical SSZ containers (DepositMessage, DepositData, ForkData, SigningData) for hash-tree-root / signing-root.
- `@ssv-labs/ssv-sdk` (`SSVKeys`, `KeyShares`, `KeySharesItem`) — Split tab only; local keystore decrypt + Shamir split + RSA encryption of shares to operator public keys. No network on this path.
- **EIP-2335 keystore create/decrypt is implemented in this repo** (`src/keystore.ts`) on top of `@noble` primitives — a composition of audited primitives, not a hand-rolled cipher — and is interop-verified with deposit-cli in both directions. `@chainsafe/bls-keystore` enters only transitively via the SSV SDK (its `src/ks-env-shim.ts` ESM shim is load-bearing for the browser build).

### Cross-verification vs ethstaker-deposit-cli / 與官方 deposit CLI 的交叉驗證
The generated `deposit_data` was confirmed **byte-identical** to ethstaker-deposit-cli (https://github.com/eth-educators/ethstaker-deposit-cli) for **pubkey, signature, deposit_message_root, and deposit_data_root**, across: 0x01 credentials, 0x02 (compounding) credentials, non-integer ETH amounts, and the top-up case. The EIP-2335 keystore interoperates with deposit-cli in **both** directions. Reproduce with `pnpm verify:cli`. 產出的 `deposit_data` 四個欄位與官方 CLI 位元組一致;keystore 雙向互通。

### Offline / online boundary / 離線與連網界線
- **Offline (no network):** Generate, Top-up, and Split — all key handling, signing, keystore encryption/decryption, keyshare splitting. Recommended for real keys.
- **Online (network), all OPTIONAL and 🌐-marked, PUBLIC data only:**
  - 🌐 Detect next free index → beacon API, sends only your **derived public keys**.
  - 🌐 Fetch operator keys → SSV API, sends only a **public operator ID**.
  - 🌐 Connect wallet → reads only your **public address** (no signing, no transaction).
- The only persisted value is your **UI language** (`localStorage['toolkitLang']`). No mnemonic/key/password/keystore is ever stored or transmitted.
- 機密路徑零連網;僅三個 🌐 按鈕需連網,且只送公開資料。除 UI 語言外不儲存任何資料。

### How to verify it yourself / 如何自行驗證
1. **Run offline (strongest):** clone, then open `docs/index.html` via `file://`, or `git checkout <commit> && pnpm install --frozen-lockfile && pnpm build`, with your machine disconnected. Even a tampered build cannot exfiltrate with the network off. 離線使用,即使被竄改也無法外洩。
2. **Reproduce the deployed bundle:** on the pinned toolchain (`.nvmrc` + `packageManager`), `pnpm install --frozen-lockfile && pnpm build` reproduces `docs/assets/index-*.js` byte-for-byte; `git status` is clean afterwards (CI enforces this). 重建後 bundle 位元組一致。
3. **Offline self-test:** `pnpm test` asserts the crypto against fixed vectors with no network. **Diff vs deposit-cli:** `pnpm verify:cli`. 自帶離線自我測試與官方 CLI 比對。
4. **Watch DevTools → Network:** Generate/Top-up/Split issue **no** requests; the only requests ever come from the three 🌐 buttons. 在 DevTools 確認核心操作零請求。
5. **Deposit via the official launchpad**, which re-validates `deposit_data` (fork/network/signature) before any ETH moves. 透過官方 launchpad 入金,它會再次驗證。

## Independent reviews & contributors / 獨立審查與貢獻者

Trust shouldn't rest on a single reviewer — including the author. Security reviews
(by AI agents from different vendors, and by humans) are recorded under
[`audits/`](audits/), each **pinned to a commit** and independently reproducible
(`pnpm test` · `pnpm verify:cli` · reproducible build · DevTools Network). See
[audits/README.md](audits/README.md) for how to add one.

- **Claude (Anthropic)** — adversarial multi-agent security review + implementation → [review](audits/2026-06-13-claude-adversarial.md)
- **Grok (xAI)** — security review via `grok build` (core crypto, SSV split, shims, CSP, build reproducibility, dependency audit, offline guarantees) → [review](audits/2026-06-13-grok-review.md)

信任不應依賴單一審查者(包括作者本人)。不同廠商的 AI 與人類所做的安全審查都記錄在
[`audits/`](audits/),每份皆**釘選到特定 commit**且可獨立重現。貢獻者:**Claude(Anthropic)**、**Grok(xAI)**（已完成獨立安全審查並新增至 audits/）。

## License / 授權

Released under the **[MIT License](LICENSE)** — free to use, fork, modify, and self-host; keep the copyright notice. Provided **"AS IS", without warranty of any kind**: this tool handles real private keys and funds — verify everything yourself and use at your own risk. Nothing here is financial advice.

本專案以 **MIT 授權**釋出:可自由使用、fork、修改、自架,保留著作權聲明即可。軟體**「按現狀」提供、不負任何擔保**——本工具會處理真實私鑰與資金,請自行驗證、自負風險;內容不構成投資建議。

Bundled dependencies are all permissive (`@noble`/`@scure` MIT, `@chainsafe/*` Apache-2.0/ISC, herumi `bls-eth-wasm` BSD-3-Clause, `@ssv-labs/ssv-sdk` MIT, Vite MIT) and compatible with MIT redistribution.
