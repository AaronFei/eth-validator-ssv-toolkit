// ETH Validator + SSV Toolkit — fully client-side.
// Tab ① Generate: mnemonic -> keystores + deposit_data (verified vs deposit-cli).
// Tab ② Split: keystore -> SSV keyshares.
// Secrets never leave the tab; only a non-secret UI lang preference is stored.
import { SSVKeys, KeyShares, KeySharesItem } from '@ssv-labs/ssv-sdk';
import { generateValidators, NETWORKS, detectNextIndex } from './generate';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

const $ = (id: string) => document.getElementById(id) as any;
const mkLog = (id: string) => (msg: string, replace = false) => {
  const el = $(id);
  el.textContent = replace ? msg : `${el.textContent}\n${msg}`;
  el.scrollTop = el.scrollHeight;
};
const log = mkLog('log');     // split panel
const glog = mkLog('gLog');   // generate panel
const tLog = mkLog('tLog');   // top-up panel

// ---------------- i18n ----------------
type Lang = 'zh' | 'en';
let lang: Lang = 'zh';
const tx = (zh: string, en: string) => (lang === 'zh' ? zh : en);

const I18N: Record<Lang, Record<string, string>> = {
  zh: {
    title: '🔐 ETH Validator + SSV 工具箱(本機)',
    langBtn: 'EN',
    tabGenerate: '① 產生金鑰',
    tabSplit: '② 切割 KeyShares',
    // --- generate ---
    genWarn:
      '<b>產生真實金鑰前請先「斷網」。</b>助記詞與私鑰只在本分頁記憶體處理,不上傳、不寫入瀏覽器儲存。' +
      '產生引擎已與官方 deposit-cli 交叉驗證(pubkey/簽名/deposit_data_root 完全一致)。' +
      '<b>放錢請用官方 launchpad</b>(它會在你存錢前驗證 deposit_data)。本頁產生<b>全程不需連網</b>;每個 validator 都會自動驗證(BLS 簽名 sign→verify + keystore 可解回)。',
    genSecNetwork: '網路',
    genSecMnemonic: '① 助記詞',
    genModeNew: '產生新助記詞',
    genModeImport: '匯入既有助記詞',
    genNewBtn: '🎲 產生 24 字助記詞',
    genNewShow: '請「離線」抄寫保存(這是你的總備份,遺失無法復原):',
    genConfirmLabel: '再輸入一次助記詞以確認你已備份:',
    genConfirmPh: '重新輸入上面的 24 個字',
    genImportLabel: '貼上你既有的助記詞:',
    genImportPh: '24 個字,以空格分隔',
    genSecWithdraw: '② 提款地址(收益/提款進這裡,設定後不可更改)',
    genWithdrawLabel: '提款地址(0x + 40 hex)',
    genWithdraw2Label: '再輸入一次確認(避免打錯):',
    genCompounding: '產生 0x02 複利型(上限 2048 ETH)。不勾為 0x01(32 ETH)。',
    genSecValidators: '③ Validator 設定',
    genStartLabel: '起始 index',
    genCountLabel: '數量',
    genAmountLabel: '每個金額 ETH(0x02:32–2048,可小數)',
    genPwLabel: 'Keystore 密碼(至少 8 字)',
    genPwPh: '用來加密 keystore 的密碼',
    genGenBtn: '產生 keystore + deposit_data',
    genDetectBtn: '🌐 偵測下一個可用 index(需連網)',
    gridHint: '可把整串助記詞貼到第 1 格,會自動分配到 24 格;輸入前幾個字母會自動補完整個字。',
    genNext: '',
    // --- split ---
    bannerWarn:
      '<b>私鑰只在這個瀏覽器分頁的記憶體裡處理,不上傳、不寫入瀏覽器儲存。</b><br />' +
      '<b>切割真實 keystore 前,建議先「斷網」。</b>產生的 <code>keyshares.json</code> 已對 operator 加密,上傳官方 app 安全。<br />🌐 標記的按鈕(抓公鑰、連錢包)需連網、只讀公開資料;keystore 切割本身完全離線。',
    secCmd: '⓪ 一鍵帶入(貼上 app.ssv.network 產生的指令)',
    cmdLabel: '把官方 app 給的 <code>ssv-keys ...</code> 指令整段貼進來,自動填好下面欄位。',
    parseCmdBtn: '⤵ 解析並帶入',
    cmdHint: '這段指令只含公開資料(operator 公鑰、owner 地址、nonce),沒有私鑰。',
    secOps: '① Operators(至少 4 個)',
    opIdsLabel: 'Operator IDs(逗號分隔)',
    fetchKeysBtn: '🌐 從 SSV API 抓公鑰(需連網)',
    opKeysLabel: 'Operator public keys(base64,逗號分隔,順序對齊 IDs)',
    opKeysHint: '抓公鑰是讀公開資料,不涉及私鑰。想完全離線可自己貼上。',
    secOwner: '② Owner(管理/付費錢包,不是收錢的冷錢包)',
    ownerLabel: 'Owner address',
    connectBtn: '🌐 連接錢包(需連網)',
    nonceLabel: 'Owner nonce',
    ownerHint: 'nonce 在 <a href="https://app.ssv.network" target="_blank" rel="noreferrer">app.ssv.network</a> 連錢包後可看到;全新 owner 為 0。多個 keystore 自動 nonce+1。',
    secKeystore: '③ Keystore(私鑰,留在本機)',
    filesLabel: '選擇 keystore 檔(可多選)',
    pwLabel: 'Keystore 密碼',
    pwPlaceholder: '當初建立 validator 時設的密碼',
    genBtn: '產生 KeyShares 並下載',
    okBanner:
      '<b>切完接下來:</b> 把 <code>keyshares.json</code> 上傳到 app.ssv.network 註冊。' +
      '⚠️ 同一個 validator 仍在別處運作時請勿註冊 —— 先停掉、等連續 2 次漏勤,確認後再註冊,以免雙簽被罰。',
    tabTopup: '③ 加碼 Top-up',
    topWarn:
      '<b>幫既有 0x02 validator 加碼。</b>本頁只產生 top-up 的 <code>deposit_data.json</code>(不需密碼、不出 keystore)。' +
      '鏈上 top-up 只認 pubkey,簽名與提款憑證不會被重新檢查;<b>產生前建議斷網</b>。送出用 ethdo / launchpad / 直接對存款合約。',
    topSecMnemonic: '① 助記詞(該 validator 的)',
    topMnemonicLabel: '匯入助記詞(用來推出正確 pubkey 並簽名)',
    topSecValidator: '② 既有 validator + 加碼金額',
    topIndexLabel: '既有 validator 的 index',
    topAmountLabel: '每個加碼 ETH(1–2048,可小數)',
    topWithdrawLabel: '提款地址(該 0x02 validator 的)',
    topWithdrawHint: 'index 要填「既有」那個(不是 detect 的下一個);可從 keystore 檔名 m_12381_3600_X 或 beaconcha 對照。提款地址在 top-up 鏈上會忽略,但建議填正確。',
    topGenBtn: '產生 top-up deposit_data',
    topNext: '',
  },
  en: {
    title: '🔐 ETH Validator + SSV Toolkit (local)',
    langBtn: '中文',
    tabGenerate: '① Generate keys',
    tabSplit: '② Split KeyShares',
    genWarn:
      '<b>Disconnect from the network before generating real keys.</b> The mnemonic and private keys are processed only in this tab — never uploaded, never stored. ' +
      'The generator is cross-verified against the official deposit-cli (identical pubkey / signature / deposit_data_root). ' +
      '<b>Deposit via the official launchpad</b> (it validates your deposit_data before you send ETH).',
    genSecNetwork: 'Network',
    genSecMnemonic: '① Mnemonic',
    genModeNew: 'Generate new mnemonic',
    genModeImport: 'Import existing mnemonic',
    genNewBtn: '🎲 Generate 24-word mnemonic',
    genNewShow: 'Write it down OFFLINE and keep it safe (this is your master backup — lose it and keys are unrecoverable):',
    genConfirmLabel: 'Re-enter the mnemonic to confirm you backed it up:',
    genConfirmPh: 'type the 24 words again',
    genImportLabel: 'Paste your existing mnemonic:',
    genImportPh: '24 words, space-separated',
    genSecWithdraw: '② Withdrawal address (rewards/withdrawals go here; cannot be changed once set)',
    genWithdrawLabel: 'Withdrawal address (0x + 40 hex)',
    genWithdraw2Label: 'Re-enter to confirm (avoid typos):',
    genCompounding: 'Generate 0x02 compounding (up to 2048 ETH). Unchecked = 0x01 (32 ETH).',
    genSecValidators: '③ Validator settings',
    genStartLabel: 'Start index',
    genCountLabel: 'Count',
    genAmountLabel: 'Amount each (ETH; 0x02: 32–2048, decimals OK)',
    genPwLabel: 'Keystore password (min 8 chars)',
    genPwPh: 'password that encrypts the keystore',
    genGenBtn: 'Generate keystore + deposit_data',
    genDetectBtn: '🌐 Detect next free index (needs network)',
    gridHint: 'Paste the whole mnemonic into box 1 — it fills all 24; typing the first letters auto-completes each word.',
    genNext: '',
    bannerWarn:
      "<b>Your private key is processed only in this browser tab — never uploaded, never stored.</b><br />" +
      '<b>Disconnect from the network before splitting a real keystore.</b> The resulting <code>keyshares.json</code> is operator-encrypted, so uploading it to the official app is safe.<br />Buttons marked 🌐 (fetch keys, connect wallet) need network for public data; the split itself is fully offline.',
    secCmd: '⓪ Quick fill (paste the command from app.ssv.network)',
    cmdLabel: 'Paste the whole <code>ssv-keys ...</code> command from the official app to auto-fill the fields below.',
    parseCmdBtn: '⤵ Parse & fill',
    cmdHint: 'This command holds only public data (operator public keys, owner address, nonce) — no private key.',
    secOps: '① Operators (at least 4)',
    opIdsLabel: 'Operator IDs (comma-separated)',
    fetchKeysBtn: '🌐 Fetch operator public keys from SSV API (needs network)',
    opKeysLabel: 'Operator public keys (base64, comma-separated, same order as IDs)',
    opKeysHint: 'Fetching public keys reads public data only. To stay fully offline, paste them yourself.',
    secOwner: '② Owner (managing / paying wallet, NOT your cold receiving wallet)',
    ownerLabel: 'Owner address',
    connectBtn: '🌐 Connect wallet (needs network)',
    nonceLabel: 'Owner nonce',
    ownerHint: 'See the nonce on <a href="https://app.ssv.network" target="_blank" rel="noreferrer">app.ssv.network</a> after connecting; a new owner is 0. Multiple keystores auto-increment by 1.',
    secKeystore: '③ Keystore (private key — stays local)',
    filesLabel: 'Choose keystore file(s) (multiple allowed)',
    pwLabel: 'Keystore password',
    pwPlaceholder: 'the password you set when creating the validator',
    genBtn: 'Generate KeyShares & download',
    okBanner:
      "<b>Next:</b> upload <code>keyshares.json</code> to app.ssv.network to register. " +
      "⚠️ Don't register while the same validator runs elsewhere — stop it, wait for 2 consecutive missed attestations, then register, to avoid double-signing.",
    tabTopup: '③ Top-up',
    topWarn:
      '<b>Add ETH to an existing 0x02 validator.</b> This page only produces a top-up <code>deposit_data.json</code> (no password, no keystore). ' +
      'On-chain a top-up only matches by pubkey; its signature & withdrawal credentials are not re-checked. <b>Disconnect before generating.</b> Submit via ethdo / launchpad / the deposit contract.',
    topSecMnemonic: '① Mnemonic (of that validator)',
    topMnemonicLabel: 'Import the mnemonic (to derive the correct pubkey and sign)',
    topSecValidator: '② Existing validator + top-up amount',
    topIndexLabel: "Existing validator's index",
    topAmountLabel: 'Top-up ETH each (1–2048, decimals OK)',
    topWithdrawLabel: 'Withdrawal address (of that 0x02 validator)',
    topWithdrawHint: "Use the EXISTING validator's index (not the next-free one); find it from the keystore filename m_12381_3600_X or beaconcha. The address is ignored on top-up but better correct.",
    topGenBtn: 'Generate top-up deposit_data',
    topNext: '',
  },
};
const t = (k: string) => I18N[lang][k] ?? I18N.zh[k] ?? k;

function applyLang(l: Lang) {
  lang = l;
  document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n!); });
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml!); });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh!); });
  $('langBtn').textContent = t('langBtn');
  try { localStorage.setItem('toolkitLang', l); } catch { /* noop */ }
}
$('langBtn').addEventListener('click', () => applyLang(lang === 'zh' ? 'en' : 'zh'));

// ---------------- tabs ----------------
function showTab(which: 'generate' | 'topup' | 'split') {
  (['generate', 'topup', 'split'] as const).forEach((tb) => $('panel-' + tb).classList.toggle('hidden', which !== tb));
  $('tabGenerate').classList.toggle('active', which === 'generate');
  $('tabTopup').classList.toggle('active', which === 'topup');
  $('tabSplit').classList.toggle('active', which === 'split');
}
$('tabGenerate').addEventListener('click', () => showTab('generate'));
$('tabTopup').addEventListener('click', () => showTab('topup'));
$('tabSplit').addEventListener('click', () => showTab('split'));

// ---------------- masked password (plain text field, no save-password prompt) ----------------
const DOT = '•';
const realMap = new WeakMap<HTMLInputElement, string>();
function setupMask(el: HTMLInputElement) {
  realMap.set(el, '');
  el.addEventListener('input', () => {
    const v = el.value;
    const caret = el.selectionStart ?? v.length;
    let real = realMap.get(el) || '';
    let next = '';
    let oi = 0;
    for (const ch of v) { if (ch === DOT) next += real[oi++] ?? ''; else next += ch; }
    realMap.set(el, next);
    el.value = DOT.repeat(next.length);
    try { el.setSelectionRange(caret, caret); } catch { /* noop */ }
  });
}
const maskedValue = (el: HTMLInputElement) => realMap.get(el) || '';
setupMask($('pw'));
setupMask($('gPw'));

// ---------------- download helper ----------------
const liveUrls: string[] = [];
function addDownload(container: HTMLElement, filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  liveUrls.push(url);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.className = 'dlbtn'; a.textContent = `⬇ ${filename}`;
  container.appendChild(a);
}
function clearDownloads(container: HTMLElement) {
  liveUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  container.innerHTML = '';
}

// ---------------- mnemonic word grid (24 cells, BIP-39 autocomplete) ----------------
function buildMnemonicGrid(container: HTMLElement) {
  container.innerHTML = '';
  const inputs: HTMLInputElement[] = [];
  for (let i = 0; i < 24; i++) {
    const cell = document.createElement('div');
    cell.className = 'wcell';
    const num = document.createElement('span');
    num.textContent = String(i + 1);
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    inp.setAttribute('data-lpignore', 'true');
    inp.setAttribute('data-1p-ignore', '');
    cell.append(num, inp);
    container.appendChild(cell);
    inputs.push(inp);
  }
  const fill = (from: number, words: string[]) => {
    for (let k = 0; k < words.length && from + k < 24; k++) inputs[from + k].value = words[k];
  };
  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', () => {
      const v = inp.value.toLowerCase().trim();
      if (/\s/.test(v)) {
        // a full/multi-word paste → distribute across cells from here
        const words = v.split(/\s+/).filter(Boolean);
        fill(idx, words);
        inputs[Math.min(idx + words.length, 23)].focus();
        return;
      }
      inp.value = v;
      if (v.length >= 2) {
        const matches = wordlist.filter((w) => w.startsWith(v));
        if (matches.length === 1 && matches[0] !== v) {
          inp.value = matches[0]; // unique prefix → autocomplete the word
          if (idx < 23) inputs[idx + 1].focus();
        }
      }
    });
    inp.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && idx < 23) { e.preventDefault(); inputs[idx + 1].focus(); }
    });
  });
  return {
    getMnemonic: () => inputs.map((i) => i.value.trim()).filter(Boolean).join(' '),
    clear: () => inputs.forEach((i) => (i.value = '')),
  };
}
const confirmGrid = buildMnemonicGrid($('gConfirmGrid'));
const importGrid = buildMnemonicGrid($('gImportGrid'));
const topupGrid = buildMnemonicGrid($('gTopupGrid'));

// ================= GENERATE =================
let genMode: 'new' | 'import' = 'new';
let generatedMnemonic = '';
function setGenMode(m: 'new' | 'import') {
  genMode = m;
  $('gNewBox').classList.toggle('hidden', m !== 'new');
  $('gImportBox').classList.toggle('hidden', m !== 'import');
  $('gModeNew').style.opacity = m === 'new' ? '1' : '0.55';
  $('gModeImport').style.opacity = m === 'import' ? '1' : '0.55';
}
$('gModeNew').addEventListener('click', () => setGenMode('new'));
$('gModeImport').addEventListener('click', () => setGenMode('import'));
setGenMode('new');

// amount is only editable for 0x02 (compounding); 0x01 is fixed at 32 ETH
$('gCompounding').addEventListener('change', () => {
  const c = $('gCompounding').checked;
  $('gAmount').disabled = !c;
  if (!c) $('gAmount').value = '32';
});
$('gAmount').disabled = true;

$('gGenMnemonic').addEventListener('click', () => {
  generatedMnemonic = generateMnemonic(wordlist, 256);
  $('gMnemonicShow').textContent = generatedMnemonic;
  glog(tx('已產生助記詞 —— 請離線抄寫,並在下方 24 格再輸入一次確認。', 'Mnemonic generated — write it down offline, then re-enter it in the 24 boxes below to confirm.'), true);
});

$('gDetectIdx').addEventListener('click', async () => {
  const mnemonic = genMode === 'new' ? (confirmGrid.getMnemonic() || generatedMnemonic) : importGrid.getMnemonic();
  if (!validateMnemonic(mnemonic, wordlist)) {
    return glog(tx('❌ 先輸入有效助記詞才能偵測 index。', '❌ Enter a valid mnemonic first to detect the index.'), true);
  }
  const net = NETWORKS[$('gNetwork').value];
  if (!net.beacon) return glog(tx(`❌ ${net.label} 不支援自動偵測,請手動填。`, `❌ Auto-detect not available for ${net.label}; enter manually.`), true);
  $('gDetectIdx').disabled = true;
  glog(tx('🌐 偵測下一個可用 index(查鏈、只送公鑰)...', '🌐 Detecting next free index (queries chain, sends only pubkeys)...'), true);
  try {
    const next = await detectNextIndex(mnemonic, net.beacon);
    $('gStart').value = String(next);
    glog(tx(`✅ 下一個可用 index = ${next}(已填入起始 index)`, `✅ Next free index = ${next} (filled into Start index)`));
  } catch (e: any) {
    glog(tx(`❌ 偵測失敗: ${e.message}。可手動填。`, `❌ Detect failed: ${e.message}. Enter manually.`));
  } finally {
    $('gDetectIdx').disabled = false;
  }
});

$('gGen').addEventListener('click', async () => {
  try {
    const network = $('gNetwork').value;
    let mnemonic = '';
    if (genMode === 'new') {
      if (!generatedMnemonic) return glog(tx('❌ 請先按「產生 24 字助記詞」。', '❌ Click "Generate 24-word mnemonic" first.'), true);
      const confirm = confirmGrid.getMnemonic();
      if (confirm !== generatedMnemonic) return glog(tx('❌ 確認用的助記詞跟產生的不一致。', '❌ The confirmation mnemonic does not match.'), true);
      mnemonic = generatedMnemonic;
    } else {
      mnemonic = importGrid.getMnemonic();
      if (!validateMnemonic(mnemonic, wordlist)) return glog(tx('❌ 助記詞無效(檢查字數/拼字)。', '❌ Invalid mnemonic (check word count/spelling).'), true);
    }
    const withdraw = ($('gWithdraw').value || '').trim();
    const withdraw2 = ($('gWithdraw2').value || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(withdraw)) return glog(tx('❌ 提款地址格式不正確。', '❌ Withdrawal address format is invalid.'), true);
    if (withdraw.toLowerCase() !== withdraw2.toLowerCase()) return glog(tx('❌ 兩次輸入的提款地址不一致。', '❌ The two withdrawal addresses do not match.'), true);
    const compounding = $('gCompounding').checked;
    const startIndex = parseInt(($('gStart').value || '').trim(), 10);
    const count = parseInt(($('gCount').value || '').trim(), 10);
    const amountEth = parseFloat(($('gAmount').value || '').trim());
    const password = maskedValue($('gPw'));
    if (Number.isNaN(startIndex) || startIndex < 0) return glog(tx('❌ 起始 index 不正確。', '❌ Start index is invalid.'), true);
    if (Number.isNaN(count) || count < 1) return glog(tx('❌ 數量不正確。', '❌ Count is invalid.'), true);
    if (password.length < 8) return glog(tx('❌ keystore 密碼至少 8 字。', '❌ Keystore password must be at least 8 chars.'), true);
    if (compounding) {
      if (Number.isNaN(amountEth) || amountEth < 32 || amountEth > 2048) {
        return glog(tx('❌ 0x02 每個金額需介於 32–2048 ETH。', '❌ 0x02 amount must be between 32 and 2048 ETH each.'), true);
      }
    } else if (amountEth !== 32) {
      return glog(tx('❌ 0x01 固定每個 32 ETH(要超過請勾「0x02 複利型」)。', '❌ 0x01 is fixed at 32 ETH each (check "0x02 compounding" to deposit more).'), true);
    }
    const amountGwei = Math.round(amountEth * 1e9);

    $('gGen').disabled = true;
    clearDownloads($('gDl'));
    $('gNext').classList.add('hidden');
    glog(tx(`產生 ${count} 個 validator(全程本機)...`, `Generating ${count} validator(s) (all local)...`), true);

    const res = await generateValidators({ mnemonic, password, withdrawalAddress: withdraw, network, startIndex, count, compounding, amountGwei });

    const dl = $('gDl');
    res.keystores.forEach((k: any) => addDownload(dl, k.filename, k.json));
    addDownload(dl, `deposit_data-${Date.now()}.json`, JSON.stringify(res.depositData));

    glog(tx(
      `✅ 完成 ${count} 個 —— 每個已驗證:BLS 簽名(sign→verify)+ keystore 可解回原金鑰。點下方下載 keystore 與 deposit_data.json。`,
      `✅ Done (${count}) — each verified: BLS signature (sign→verify) + keystore decrypts back to the key. Click below to download keystores + deposit_data.json.`));

    const lp = NETWORKS[network].launchpad;
    $('gNext').classList.remove('hidden');
    $('gNext').innerHTML = tx(
      `<b>接下來:</b> 到官方 <a href="${lp}" target="_blank" rel="noreferrer">${lp}</a> 上傳 <code>deposit_data.json</code> 放錢(它會驗證);keystore 匯入你的節點/代管。建議先測 1 個。`,
      `<b>Next:</b> deposit at the official <a href="${lp}" target="_blank" rel="noreferrer">${lp}</a> by uploading <code>deposit_data.json</code> (it validates first); import keystores into your node/host. Test 1 validator first.`);
  } catch (e: any) {
    console.error('generate failed:', e?.stack || e);
    glog('❌ ' + (e?.message ?? e));
  } finally {
    $('gGen').disabled = false;
  }
});

// ================= TOP-UP =================
$('tGen').addEventListener('click', async () => {
  try {
    const network = $('tNetwork').value;
    const mnemonic = topupGrid.getMnemonic();
    if (!validateMnemonic(mnemonic, wordlist)) return tLog(tx('❌ 助記詞無效(檢查字數/拼字)。', '❌ Invalid mnemonic (check word count/spelling).'), true);
    const withdraw = ($('tWithdraw').value || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(withdraw)) return tLog(tx('❌ 提款地址格式不正確。', '❌ Withdrawal address format is invalid.'), true);
    const startIndex = parseInt(($('tIndex').value || '').trim(), 10);
    const count = parseInt(($('tCount').value || '').trim(), 10);
    const amountEth = parseFloat(($('tAmount').value || '').trim());
    if (Number.isNaN(startIndex) || startIndex < 0) return tLog(tx('❌ index 不正確。', '❌ Index is invalid.'), true);
    if (Number.isNaN(count) || count < 1) return tLog(tx('❌ 數量不正確。', '❌ Count is invalid.'), true);
    if (Number.isNaN(amountEth) || amountEth < 1 || amountEth > 2048) return tLog(tx('❌ 加碼金額需 1–2048 ETH。', '❌ Top-up amount must be 1–2048 ETH.'), true);

    $('tGen').disabled = true;
    clearDownloads($('tDl'));
    $('tNext').classList.add('hidden');
    tLog(tx(`產生 ${count} 筆 top-up deposit_data(本機)...`, `Generating ${count} top-up deposit_data (local)...`), true);
    const res = await generateValidators({
      mnemonic, password: '', withdrawalAddress: withdraw, network,
      startIndex, count, compounding: true, amountGwei: Math.round(amountEth * 1e9), depositOnly: true,
    });
    res.depositData.forEach((d: any, i: number) => tLog(`  • index ${startIndex + i}: 0x${d.pubkey.slice(0, 14)}…  +${amountEth} ETH`));
    addDownload($('tDl'), `topup_deposit_data-${Date.now()}.json`, JSON.stringify(res.depositData));
    tLog(tx('✅ 完成。請先核對上面 pubkey 是你要加碼的 validator,再送出。', '✅ Done. Verify the pubkey(s) above match the validator(s) you want to top up before submitting.'));
    $('tNext').classList.remove('hidden');
    $('tNext').innerHTML = tx(
      '<b>送出方式(這是 top-up):</b> ethdo(<code>ethdo validator deposit</code>)、官方 launchpad 的 top-up,或直接對存款合約送這個 deposit_data。鏈上只認 pubkey,會把 ETH 加到既有 validator。',
      '<b>How to submit (this is a top-up):</b> ethdo (<code>ethdo validator deposit</code>), the official launchpad top-up, or send this deposit_data to the deposit contract directly. On-chain it matches by pubkey and adds the ETH to the existing validator.');
  } catch (e: any) {
    console.error('topup failed:', e?.stack || e);
    tLog('❌ ' + (e?.message ?? e));
  } finally {
    $('tGen').disabled = false;
  }
});

// ================= SPLIT (existing) =================
$('parseCmd').addEventListener('click', () => {
  const text = $('cmd').value;
  const get = (name: string) => { const m = text.match(new RegExp(`--${name}(?:=|\\s+)(\\S+)`)); return m ? m[1] : null; };
  const ids = get('operator-ids'); const keys = get('operator-keys'); const owner = get('owner-address'); const nonce = get('owner-nonce');
  if (ids) $('opIds').value = ids;
  if (keys) $('opKeys').value = keys;
  if (owner) $('owner').value = owner;
  if (nonce !== null) $('nonce').value = nonce;
  const got = [ids && 'IDs', keys && 'keys', owner && 'owner', nonce !== null && 'nonce'].filter(Boolean).join(', ');
  log(got
    ? tx(`已帶入: ${got}。接著到 ③ 選 keystore + 密碼。`, `Imported: ${got}. Now pick a keystore + password in ③.`)
    : tx('⚠️ 找不到參數,確認貼的是 ssv-keys 指令。', "⚠️ No parameters found — make sure it's an ssv-keys command."), true);
});

$('fetchKeys').addEventListener('click', async () => {
  const ids = $('opIds').value.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (!ids.length) return log(tx('⚠️ 請先填 operator IDs', '⚠️ Enter operator IDs first'), true);
  log(tx(`抓取公鑰: ${ids.join(', ')} ...`, `Fetching public keys: ${ids.join(', ')} ...`), true);
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
    log(tx('公鑰已帶入。', 'Public keys filled in.'));
  } catch (e: any) { log(tx(`❌ 抓取失敗: ${e.message}`, `❌ Fetch failed: ${e.message}`)); }
});

$('connect').addEventListener('click', async () => {
  const eth = (window as any).ethereum;
  if (!eth) return log(tx('❌ 沒偵測到錢包。可手動填 owner。', '❌ No wallet detected. Fill owner manually.'), true);
  try {
    const accts: string[] = await eth.request({ method: 'eth_requestAccounts' });
    $('owner').value = accts[0];
    log(tx(`🔗 已連接: ${accts[0]}(只讀地址,不送交易)`, `🔗 Connected: ${accts[0]} (address only, no tx)`));
  } catch (e: any) { log(tx(`❌ 連接失敗: ${e.message}`, `❌ Connect failed: ${e.message}`)); }
});

$('gen').addEventListener('click', async () => {
  try {
    const ids = $('opIds').value.split(',').map((s: string) => parseInt(s.trim(), 10));
    const opKeys = $('opKeys').value.split(',').map((s: string) => s.trim()).filter(Boolean);
    const owner = $('owner').value.trim();
    const baseNonce = parseInt($('nonce').value.trim(), 10);
    const password = maskedValue($('pw'));
    const fileList = $('files').files;
    if (ids.length !== opKeys.length || !opKeys.length) return log(tx('❌ IDs 與公鑰數量不符。', '❌ IDs/keys count mismatch.'), true);
    if (ids.length < 4) return log(tx('❌ 至少 4 個 operator。', '❌ At least 4 operators.'), true);
    if (!/^0x[0-9a-fA-F]{40}$/.test(owner)) return log(tx('❌ owner 地址不正確。', '❌ Owner address invalid.'), true);
    if (Number.isNaN(baseNonce)) return log(tx('❌ nonce 不是數字。', '❌ Nonce is not a number.'), true);
    if (!fileList || !fileList.length) return log(tx('❌ 請選 keystore 檔。', '❌ Choose a keystore file.'), true);
    if (!password) return log(tx('❌ 請輸入密碼。', '❌ Enter the password.'), true);

    const operators = ids.map((id: number, i: number) => ({ id, operatorKey: opKeys[i] }));
    $('gen').disabled = true;
    clearDownloads($('dl'));
    log(tx(`切割 ${fileList.length} 個 keystore(本機)...`, `Splitting ${fileList.length} keystore(s) (local)...`), true);
    const keyShares = new KeyShares();
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const raw = await file.text();
      let keystore: any;
      try { keystore = JSON.parse(raw); } catch { return log(tx(`❌ ${file.name} 不是合法 JSON`, `❌ ${file.name} is not valid JSON`)); }
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
        await item.buildPayload({ publicKey, operators, encryptedShares }, { ownerAddress: owner, ownerNonce: nonce, privateKey });
        keyShares.add(item);
        log(tx(`  ✅ ${file.name} → 完成(nonce ${nonce})`, `  ✅ ${file.name} → done (nonce ${nonce})`));
      } catch (err: any) {
        console.error(`[step:${step}] ${file.name}:`, err?.stack || err);
        log(tx(`  ❌ ${file.name} 失敗於 [${step}]: ${err?.message ?? err}`, `  ❌ ${file.name} failed at [${step}]: ${err?.message ?? err}`));
        throw err;
      }
    }
    addDownload($('dl'), `keyshares-${Date.now()}.json`, keyShares.toJson());
    log(tx(`\n🎉 完成!點下方按鈕下載 keyshares.json。`, `\n🎉 Done! Click below to download keyshares.json.`));
  } catch (e: any) {
    console.error('split failed:', e?.stack || e);
  } finally {
    $('gen').disabled = false;
  }
});

// ---------------- init ----------------
const saved = (() => { try { return localStorage.getItem('toolkitLang'); } catch { return null; } })();
applyLang(saved === 'en' || saved === 'zh' ? saved : ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'));
showTab('generate');
