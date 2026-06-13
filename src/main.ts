// Local, client-side SSV keyshare splitter.
// The keystore + decrypted private key NEVER leave this tab: no fetch/upload of
// secret material, no localStorage/IndexedDB writes (only a non-secret UI lang
// preference is stored). Only the operator-encrypted keyshares JSON is written
// out, via a local download.
import { SSVKeys, KeyShares, KeySharesItem } from '@ssv-labs/ssv-sdk';

const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
const logEl = document.getElementById('log') as HTMLDivElement;

function log(msg: string, replace = false) {
  logEl.textContent = replace ? msg : `${logEl.textContent}\n${msg}`;
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------------- i18n ----------------
type Lang = 'zh' | 'en';
let lang: Lang = 'zh';
let started = false; // true after the first user action (so toggling lang keeps the log)
const tx = (zh: string, en: string) => (lang === 'zh' ? zh : en);

const I18N: Record<Lang, Record<string, string>> = {
  zh: {
    title: '🔐 SSV KeyShare 切割器 — 本機 / 離線',
    bannerWarn:
      '<b>私鑰只在這個瀏覽器分頁的記憶體裡處理,不上傳任何伺服器、不寫入瀏覽器儲存。</b><br />' +
      '<b>切割真實 keystore 前,建議先「斷網」再操作</b> —— 本頁全程不需要網路即可完成切割,斷網後就算程式被竄改也無法外傳。' +
      '用完直接關閉分頁即清除記憶體。產生的 <code>keyshares.json</code> 是「已對 operator 加密」的,之後上傳官方 app 是安全的。<br />' +
      '最高安全做法:用本機 / Tailscale 版,或把 repo clone 下來、離線打開 <code>docs/index.html</code>。',
    secCmd: '⓪ 一鍵帶入(貼上 app.ssv.network 產生的指令)',
    cmdLabel:
      '在官方 app 選好 operator 後會給一段 <code>ssv-keys ...</code> 指令,整段貼進來自動填好下面 operator/owner/nonce 欄位(含官方算好的正確 nonce)。',
    parseCmdBtn: '⤵ 解析並帶入',
    cmdHint: '這段指令只含「公開」資料(operator 公鑰、你的 owner 地址、nonce),沒有私鑰,貼進本機頁面是安全的。',
    secOps: '① Operators(至少 4 個)',
    opIdsLabel: 'Operator IDs(逗號分隔)',
    fetchKeysBtn: '↻ 從 SSV API 抓這些 ID 的公鑰',
    opKeysLabel: 'Operator public keys(base64,逗號分隔,順序對齊上面的 IDs)',
    opKeysHint: '抓公鑰是讀取「公開」資料,不涉及私鑰。想完全離線可自己貼上。',
    secOwner: '② Owner(管理/付費錢包,不是收錢的冷錢包)',
    ownerLabel: 'Owner address',
    connectBtn: '🔗 連接錢包',
    nonceLabel: 'Owner nonce',
    ownerHint:
      'nonce 從 <a href="https://app.ssv.network" target="_blank" rel="noreferrer">app.ssv.network</a> 連錢包後可看到;全新 owner 地址為 0。多個 keystore 會自動 nonce+1 遞增。',
    secKeystore: '③ Keystore(私鑰,留在本機)',
    filesLabel: '選擇 keystore 檔(可多選,例如 9 個一起)',
    pwLabel: 'Keystore 密碼',
    pwPlaceholder: '當初建立 validator 時設的密碼',
    genBtn: '產生 KeyShares 並下載',
    okBanner:
      '<b>切完接下來:</b> 把 <code>keyshares.json</code> 上傳到 app.ssv.network 註冊。' +
      '⚠️ 同一個 validator 仍在別處運作時請勿註冊 —— 先停掉它、在 beaconcha.in 等連續 2 次漏勤,確認已停止後再註冊,以免雙簽被罰。',
    langBtn: 'EN',
    ready: '準備就緒。建議:① 抓/貼 operator 公鑰 → ② 連錢包或填 owner → ③ 選 keystore + 密碼 → 產生。',
  },
  en: {
    title: '🔐 SSV KeyShare Splitter — local / offline',
    bannerWarn:
      "<b>Your private key is processed only in this browser tab's memory — never uploaded, never written to browser storage.</b><br />" +
      '<b>Before splitting a real keystore, disconnect from the network first</b> — this page needs no network to split, so offline means even a tampered build cannot exfiltrate anything. ' +
      'Close the tab when done to clear memory. The resulting <code>keyshares.json</code> is already encrypted to the operators, so uploading it to the official app afterwards is safe.<br />' +
      'Safest: use the local / Tailscale version, or clone the repo and open <code>docs/index.html</code> offline.',
    secCmd: '⓪ Quick fill (paste the command from app.ssv.network)',
    cmdLabel:
      'After picking operators in the official app it gives an <code>ssv-keys ...</code> command. Paste the whole thing to auto-fill the operator / owner / nonce fields below (incl. the correct nonce).',
    parseCmdBtn: '⤵ Parse & fill',
    cmdHint: 'This command contains only public data (operator public keys, your owner address, nonce) — no private key, so it is safe to paste here.',
    secOps: '① Operators (at least 4)',
    opIdsLabel: 'Operator IDs (comma-separated)',
    fetchKeysBtn: "↻ Fetch these IDs' public keys from the SSV API",
    opKeysLabel: 'Operator public keys (base64, comma-separated, in the same order as the IDs)',
    opKeysHint: 'Fetching public keys reads public data only — no private key involved. To stay fully offline, paste them yourself.',
    secOwner: '② Owner (the managing / paying wallet, NOT your cold receiving wallet)',
    ownerLabel: 'Owner address',
    connectBtn: '🔗 Connect wallet',
    nonceLabel: 'Owner nonce',
    ownerHint:
      'You can see the nonce on <a href="https://app.ssv.network" target="_blank" rel="noreferrer">app.ssv.network</a> after connecting your wallet; a brand-new owner address is 0. Multiple keystores auto-increment nonce by 1.',
    secKeystore: '③ Keystore (private key — stays local)',
    filesLabel: 'Choose keystore file(s) (multiple allowed, e.g. all 9 at once)',
    pwLabel: 'Keystore password',
    pwPlaceholder: 'the password you set when creating the validator',
    genBtn: 'Generate KeyShares & download',
    okBanner:
      '<b>Next, after splitting:</b> upload <code>keyshares.json</code> to app.ssv.network to register. ' +
      "⚠️ Don't register while the same validator is still running elsewhere — stop it first and wait for 2 consecutive missed attestations on beaconcha.in before registering, to avoid double-signing / slashing.",
    langBtn: '中文',
    ready: 'Ready. Suggested flow: ① fetch/paste operator keys → ② connect wallet or fill owner → ③ choose keystore + password → Generate.',
  },
};

const t = (k: string) => I18N[lang][k] ?? I18N.zh[k] ?? k;

function applyLang(l: Lang) {
  lang = l;
  document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as string);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml as string);
  });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh as string);
  });
  const lb = document.getElementById('langBtn');
  if (lb) lb.textContent = t('langBtn');
  if (!started) log(t('ready'), true);
  try { localStorage.setItem('ssvSplitterLang', l); } catch { /* noop */ }
}

document.getElementById('langBtn')?.addEventListener('click', () =>
  applyLang(lang === 'zh' ? 'en' : 'zh'),
);

// ---------- masked password on a PLAIN text field (no browser "save password") ----------
let pwReal = '';
const DOT = '•';
(() => {
  const el = $('pw');
  el.addEventListener('input', () => {
    const v = el.value;
    const caret = el.selectionStart ?? v.length;
    let next = '';
    let oldIdx = 0;
    for (const ch of v) {
      if (ch === DOT) next += pwReal[oldIdx++] ?? '';
      else next += ch;
    }
    pwReal = next;
    el.value = DOT.repeat(pwReal.length);
    try { el.setSelectionRange(caret, caret); } catch { /* noop */ }
  });
})();

// ---------- ⓪ parse the app.ssv.network command, auto-fill fields ----------
$('parseCmd').addEventListener('click', () => {
  started = true;
  const text = (document.getElementById('cmd') as HTMLTextAreaElement).value;
  const get = (name: string) => {
    const m = text.match(new RegExp(`--${name}(?:=|\\s+)(\\S+)`));
    return m ? m[1] : null;
  };
  const ids = get('operator-ids');
  const keys = get('operator-keys');
  const owner = get('owner-address');
  const nonce = get('owner-nonce');
  if (ids) $('opIds').value = ids;
  if (keys) $('opKeys').value = keys;
  if (owner) $('owner').value = owner;
  if (nonce !== null) $('nonce').value = nonce;
  const got = [ids && 'IDs', keys && 'keys', owner && 'owner', nonce !== null && 'nonce']
    .filter(Boolean).join(', ');
  log(got
    ? tx(`已從指令帶入: ${got}。接著到 ③ 選 keystore + 輸入密碼即可。`,
         `Imported from command: ${got}. Now go to ③ pick a keystore + enter the password.`)
    : tx('⚠️ 指令裡找不到參數,請確認貼的是 ssv-keys 指令(含 --operator-keys 等)。',
         "⚠️ No parameters found — make sure it's an ssv-keys command (with --operator-keys etc.)."), true);
});

// ---------- ① fetch operator public keys from the SSV API (public data only) ----------
$('fetchKeys').addEventListener('click', async () => {
  started = true;
  const ids = $('opIds').value.split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return log(tx('⚠️ 請先填 operator IDs', '⚠️ Enter operator IDs first'));
  log(tx(`抓取 operator 公鑰: ${ids.join(', ')} ...`, `Fetching operator public keys: ${ids.join(', ')} ...`), true);
  try {
    const keys: string[] = [];
    for (const id of ids) {
      const r = await fetch(`https://api.ssv.network/api/v4/mainnet/operators/${id}`);
      if (!r.ok) throw new Error(`operator ${id}: HTTP ${r.status}`);
      const j = await r.json();
      if (!j.public_key) throw new Error(`operator ${id}: no public_key`);
      keys.push(j.public_key);
      log(`  ✅ ${id} (${j.name ?? '?'})`);
    }
    $('opKeys').value = keys.join(',');
    log(tx('公鑰已帶入欄位。', 'Public keys filled in.'));
  } catch (e: any) {
    log(tx(`❌ 抓取失敗: ${e.message}. 可手動貼上公鑰。`, `❌ Fetch failed: ${e.message}. You can paste the keys manually.`));
  }
});

// ---------- ② connect wallet (read address only, no transactions) ----------
$('connect').addEventListener('click', async () => {
  started = true;
  const eth = (window as any).ethereum;
  if (!eth) return log(tx('❌ 沒偵測到注入式錢包(MetaMask 等)。可手動填 owner 地址。',
                          '❌ No injected wallet (MetaMask etc.) detected. You can fill the owner address manually.'));
  try {
    const accts: string[] = await eth.request({ method: 'eth_requestAccounts' });
    $('owner').value = accts[0];
    log(tx(`🔗 已連接: ${accts[0]}(只讀取地址,不會送任何交易)`,
           `🔗 Connected: ${accts[0]} (address only — no transaction is sent)`));
  } catch (e: any) {
    log(tx(`❌ 連接取消/失敗: ${e.message}`, `❌ Connect cancelled/failed: ${e.message}`));
  }
});

// ---------- download (visible button; encrypted keyshares only) ----------
let lastUrl: string | null = null;
function offerDownload(filename: string, text: string) {
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const dl = document.getElementById('dl') as HTMLDivElement;
  dl.innerHTML = '';
  const a = document.createElement('a');
  a.href = lastUrl;
  a.download = filename;
  a.className = 'dlbtn';
  a.textContent = tx(`⬇ 下載 ${filename}`, `⬇ Download ${filename}`);
  dl.appendChild(a);
}

// ---------- ③ generate keyshares, entirely in-browser ----------
$('gen').addEventListener('click', async () => {
  started = true;
  try {
    const ids = $('opIds').value.split(',').map((s) => parseInt(s.trim(), 10));
    const opKeys = $('opKeys').value.split(',').map((s) => s.trim()).filter(Boolean);
    const owner = $('owner').value.trim();
    const baseNonce = parseInt($('nonce').value.trim(), 10);
    const password = pwReal;
    const fileList = ($('files') as HTMLInputElement).files;

    if (ids.length !== opKeys.length || !opKeys.length)
      return log(tx('❌ operator IDs 與公鑰數量不符(或公鑰為空)。', '❌ Operator IDs and keys count mismatch (or keys empty).'));
    if (ids.length < 4) return log(tx('❌ 至少需要 4 個 operator。', '❌ At least 4 operators are required.'));
    if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) return log(tx('❌ owner 地址格式不正確。', '❌ Owner address format is invalid.'));
    if (Number.isNaN(baseNonce)) return log(tx('❌ nonce 不是數字。', '❌ Nonce is not a number.'));
    if (!fileList || !fileList.length) return log(tx('❌ 請選擇至少一個 keystore 檔。', '❌ Choose at least one keystore file.'));
    if (!password) return log(tx('❌ 請輸入 keystore 密碼。', '❌ Enter the keystore password.'));

    const operators = ids.map((id, i) => ({ id, operatorKey: opKeys[i] }));
    ($('gen') as HTMLButtonElement).disabled = true;
    log(tx(`開始切割 ${fileList.length} 個 keystore(全程本機,不上傳)...`,
           `Splitting ${fileList.length} keystore(s) (all local, nothing uploaded)...`), true);

    const keyShares = new KeyShares();
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const raw = await file.text();
      let keystore: any;
      try { keystore = JSON.parse(raw); }
      catch { return log(tx(`❌ ${file.name} 不是合法 JSON`, `❌ ${file.name} is not valid JSON`)); }

      let step = 'init';
      try {
        const ssvKeys = new SSVKeys();
        step = tx('extractKeys(解密)', 'extractKeys(decrypt)');
        const { publicKey, privateKey } = await ssvKeys.extractKeys(keystore, password);
        step = tx('buildShares(切割)', 'buildShares(split)');
        const encryptedShares = await ssvKeys.buildShares(privateKey, operators);
        step = 'buildPayload';
        const item = new KeySharesItem();
        const nonce = baseNonce + i;
        await item.update({ ownerAddress: owner, ownerNonce: nonce, operators, publicKey });
        await item.buildPayload(
          { publicKey, operators, encryptedShares },
          { ownerAddress: owner, ownerNonce: nonce, privateKey },
        );
        keyShares.add(item);
        log(tx(`  ✅ ${file.name} → share 完成(nonce ${nonce})`, `  ✅ ${file.name} → share done (nonce ${nonce})`));
      } catch (err: any) {
        console.error(`[step:${step}] ${file.name}:`, err?.stack || err);
        log(tx(`  ❌ ${file.name} 失敗於 [${step}]: ${err?.name ?? ''} ${err?.message ?? err}`,
               `  ❌ ${file.name} failed at [${step}]: ${err?.name ?? ''} ${err?.message ?? err}`));
        throw err;
      }
    }

    const json = keyShares.toJson();
    offerDownload(`keyshares-${Date.now()}.json`, json);
    log(tx(`\n🎉 完成!點下方綠色「⬇ 下載」按鈕儲存 keyshares.json(含 ${fileList.length} 個 validator)。\n關閉此分頁即清除記憶體中的私鑰。`,
           `\n🎉 Done! Click the green "⬇ Download" button below to save keyshares.json (${fileList.length} validator(s)).\nClose this tab to clear the private key from memory.`));
  } catch (e: any) {
    console.error('generate failed:', e?.stack || e);
  } finally {
    ($('gen') as HTMLButtonElement).disabled = false;
  }
});

// ---------- init: language (saved → browser → default) ----------
const saved = (() => { try { return localStorage.getItem('ssvSplitterLang'); } catch { return null; } })();
const initial: Lang = saved === 'en' || saved === 'zh'
  ? saved
  : ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en');
applyLang(initial);
