# SSV KeyShare Splitter (client-side)

**Live:** https://aaronfei.github.io/ssv-web-splitter/ (中文 / English toggle, top-right)

A fully **client-side** tool to split an Ethereum validator keystore into SSV
KeyShares. The keystore and the decrypted private key are processed **in the
browser tab only** — nothing is uploaded, nothing is written to
`localStorage`/`IndexedDB`. Only the (already operator-encrypted)
`keyshares.json` is offered as a download.

It uses the official [`@ssv-labs/ssv-sdk`](https://www.npmjs.com/package/@ssv-labs/ssv-sdk)
for the actual cryptography (same as app.ssv.network).

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
