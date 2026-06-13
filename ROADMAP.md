# Roadmap — one-stop offline validator key tool

Forward-looking design (not built yet). Grows this repo from "SSV keyshare
splitter" into a full, client-side, **mostly-offline** validator key toolkit, so
the whole lifecycle lives in one page instead of scattered CLI tools.

## Scope (full lifecycle, all client-side)

```
mnemonic (NEW or import)
  → derive validator keys (EIP-2333/2334)
  → keystores (EIP-2335)
  → deposit_data.json
  → (optional) SSV keyshares      ← existing feature
```

The **deposit itself is NOT in the tool** — it links out to the official
launchpad (its upload-time validation is the real safety net before you send
ETH).

## Two mnemonic modes

- **Generate a NEW 24-word mnemonic** (offline; `crypto.getRandomValues` via
  `@scure/bip39`). Force a backup + re-enter confirmation before continuing.
- **Import an EXISTING mnemonic** (derive more validators / recover).

Generating a mnemonic needs no network.

## Offline / online boundary

Everything that touches a secret is **offline**. Only a few helpers need
network, and they send **no secret** — only public keys / addresses:

| Operation | Network? | Notes |
|---|---|---|
| Generate / import mnemonic | Offline | |
| Derive keys → keystores → deposit_data | Offline | |
| Split SSV keyshares | Offline | |
| Self-verify (re-decrypt, sign/verify) | Offline | |
| 🌐 Auto-detect next free index | **Online** | derives pubkeys locally, queries beacon chain / deposit contract; sends only pubkeys (reveals which validators are yours to that API) |
| 🌐 Fetch SSV operator public keys | Online | SSV API, public data |
| 🌐 Connect wallet / read nonce | Online | reads chain, public |

**Recommended flow:** do the 🌐 helpers first (online) → **disconnect** → then do
all key generation / splitting offline. UI marks the 🌐 buttons clearly.

## Index handling

- **Derivation index** = the `X` in the keystore filename
  `keystore-m_12381_3600_X_0_0...` (what you pick when generating). The
  **beacon-chain index** (e.g. 12345) is a different, chain-assigned number.
- Finding the next derivation index, two ways:
  - **Offline:** read existing keystore filenames; next = highest `X` + 1.
  - **🌐 Online:** auto-detect by deriving pubkeys and checking which already
    exist on-chain (for when only the mnemonic is left).
- Reusing an index regenerates the SAME validator key — always use the next
  unused index. A different mnemonic has its own index space (starts at 0).

## Verification / safety layer

- Re-decrypt each keystore with the password (confirms it opens).
- BLS sign→verify roundtrip + recompute `deposit_data_root`.
- EIP-55 withdrawal-address display + re-confirm (the launchpad can't catch a
  valid-but-wrong address — that's a human error in any tool).
- Explicit **network selector** (wrong fork version = invalid deposit).
- Force mnemonic backup confirmation; never persist/transmit the mnemonic.
- Deposit discipline: ALWAYS validate via the official launchpad before sending;
  test 1 validator first.

## Deposit (official, not in-tool)

- Mainnet: https://launchpad.ethereum.org
- Testnet: the matching launchpad subdomain (verify the current testnet first).
- The tool just shows the correct launchpad link for the selected network.

## Tech stack (audited JS primitives; EIP-2335 keystore composed in-repo on @noble)

> Note: the EIP-2335 keystore is implemented in this repo (`src/keystore.ts`) as a
> composition of audited `@noble` primitives (scrypt/aes-128-ctr/sha256), not a
> third-party keystore lib — it is interop-verified with deposit-cli both ways.


`@scure/bip39` · `@chainsafe/bls-keygen` · `@chainsafe/bls` (browser:
`bls-eth-wasm`) · `@chainsafe/bls-keystore` · `@chainsafe/ssz` +
`@lodestar/types` (deposit hashing / domain) · `viem` (EIP-55) ·
`@noble/ciphers` (the existing AES shim).

## Deployment

Extend this repo as tabs: **① Generate · ② Split**. Reuse the existing vite
config, crypto-shim, zh/en i18n, and GitHub Pages `/docs` setup.
