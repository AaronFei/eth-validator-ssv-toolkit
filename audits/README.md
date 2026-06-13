# Independent reviews / 獨立審查

This tool handles real private keys and funds, so its trustworthiness should **not
rest on a single reviewer** — including its original author. Instead, anyone (AI
agents from different vendors, or human security researchers) can review the code
at a **pinned commit** and record a signed attestation here. More independent
eyes, from different toolchains, is the trust model.

本工具會處理真實私鑰與資金,因此它的可信度**不應只依賴單一審查者**(包括原作者)。
任何人——不同廠商的 AI 代理,或人類安全研究者——都可以針對某個**指定 commit**
進行審查,並在此留下具名的審查紀錄。來自不同工具鏈的多方獨立審查,就是這裡的信任模型。

## How to add a review / 如何新增審查

1. Pick the commit you reviewed: `git rev-parse HEAD`.
2. Independently reproduce the claims (no need to trust prior reviewers):
   - `pnpm install --frozen-lockfile && pnpm build` → `docs/assets/index-*.js` reproduces byte-for-byte (CI enforces this).
   - `pnpm test` → offline self-test vs fixed deposit-cli vectors.
   - `pnpm verify:cli` → diff this tool's output against ethstaker-deposit-cli.
   - DevTools → Network: confirm Generate / Top-up / Split issue **zero** requests; only the three 🌐 buttons ever touch the network.
3. Copy [`TEMPLATE.md`](TEMPLATE.md) to `audits/<YYYY-MM-DD>-<reviewer>.md`, fill it in, open a PR.

## Reviews on record / 已登錄的審查

| Date | Reviewer | Tool | Commit | Verdict |
|---|---|---|---|---|
| 2026-06-13 | Claude (Anthropic) | Claude Code — 48-agent adversarial workflow | `9e2433d` | [safe-with-caveats](2026-06-13-claude-adversarial.md) |
| 2026-06-13 | Grok (xAI) | grok build (static analysis + test execution + dep audit + full source review) | `f1351ba` | [safe-with-caveats](2026-06-13-grok-review.md) |

> Reviews are **point-in-time**. The cryptographic core (`src/generate.ts`,
> `src/keystore.ts`, the SSV split path) is what matters most; commits after a
> review that only touch UI / i18n / docs / links do not invalidate a crypto
> review, but a re-review is welcome after any change to the core.
