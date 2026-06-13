// ETH Validator + SSV Toolkit — fully client-side.
// Tab ① Generate: mnemonic -> keystores + deposit_data (verified vs deposit-cli).
// Tab ② Split: keystore -> SSV keyshares.
// Secrets never leave the tab; only a non-secret UI lang preference is stored.
import { SSVKeys, KeyShares, KeySharesItem } from '@ssv-labs/ssv-sdk';
import { generateValidators, NETWORKS, detectNextIndex } from './generate';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { type Lang, LANGS, UI, MSG } from './i18n';

const $ = (id: string) => document.getElementById(id) as any;
const mkLog = (id: string) => (msg: string, replace = false) => {
  const el = $(id);
  el.textContent = replace ? msg : `${el.textContent}\n${msg}`;
  el.scrollTop = el.scrollHeight;
};
const log = mkLog('log');     // split panel
const glog = mkLog('gLog');   // generate panel
const tLog = mkLog('tLog');   // top-up panel

// EIP-55 checksum address validation — typo guard for the (irreversible) withdrawal address.
function checksumAddress(addr: string): string {
  const a = addr.toLowerCase().replace(/^0x/, '');
  const hash = keccak_256(new TextEncoder().encode(a));
  let hex = '';
  for (let i = 0; i < hash.length; i++) hex += hash[i].toString(16).padStart(2, '0');
  let out = '0x';
  for (let i = 0; i < 40; i++) out += parseInt(hex[i], 16) >= 8 ? a[i].toUpperCase() : a[i];
  return out;
}
function validAddress(addr: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return false;
  const body = addr.slice(2);
  if (body === body.toLowerCase() || body === body.toUpperCase()) return true; // no checksum info → accept
  return checksumAddress(addr) === addr; // mixed-case must satisfy EIP-55 (catches typos)
}

// ---------------- i18n ----------------
let lang: Lang = 'en';
const t = (k: string) => UI[lang]?.[k] ?? UI.en[k] ?? k;
const m = (k: string, p: Record<string, string | number> = {}): string => {
  let s = MSG[lang]?.[k] ?? MSG.en[k] ?? k;
  for (const key in p) s = s.split('{' + key + '}').join(String(p[key]));
  return s;
};

($('langSel') as HTMLSelectElement).innerHTML = LANGS.map((l) => `<option value="${l.code}">${l.name}</option>`).join('');

function applyLang(l: Lang) {
  lang = l;
  document.documentElement.lang = l;
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n!); });
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml!); });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh!); });
  ($('langSel') as HTMLSelectElement).value = l;
  try { localStorage.setItem('toolkitLang', l); } catch { /* noop */ }
}
$('langSel').addEventListener('change', (e: Event) => applyLang(((e.target as HTMLSelectElement).value) as Lang));

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
  glog(m('mnemGenerated'), true);
});

$('gDetectIdx').addEventListener('click', async () => {
  const mnemonic = genMode === 'new' ? (confirmGrid.getMnemonic() || generatedMnemonic) : importGrid.getMnemonic();
  if (!validateMnemonic(mnemonic, wordlist)) {
    return glog(m('detectNeedMnemonic'), true);
  }
  const net = NETWORKS[$('gNetwork').value];
  if (!net.beacon) return glog(m('detectUnsupported', { label: net.label }), true);
  $('gDetectIdx').disabled = true;
  glog(m('detecting'), true);
  try {
    const next = await detectNextIndex(mnemonic, net.beacon);
    $('gStart').value = String(next);
    glog(m('detectOk', { next }));
  } catch (e: any) {
    glog(m('detectFail', { error: e.message }));
  } finally {
    $('gDetectIdx').disabled = false;
  }
});

$('gGen').addEventListener('click', async () => {
  try {
    const network = $('gNetwork').value;
    let mnemonic = '';
    if (genMode === 'new') {
      if (!generatedMnemonic) return glog(m('needGenFirst'), true);
      const confirm = confirmGrid.getMnemonic();
      if (confirm !== generatedMnemonic) return glog(m('confirmMismatch'), true);
      mnemonic = generatedMnemonic;
    } else {
      mnemonic = importGrid.getMnemonic();
      if (!validateMnemonic(mnemonic, wordlist)) return glog(m('invalidMnemonic'), true);
    }
    const withdraw = ($('gWithdraw').value || '').trim();
    const withdraw2 = ($('gWithdraw2').value || '').trim();
    if (!validAddress(withdraw)) return glog(m('invalidWithdraw'), true);
    if (withdraw.toLowerCase() !== withdraw2.toLowerCase()) return glog(m('withdrawMismatch'), true);
    const compounding = $('gCompounding').checked;
    const startIndex = parseInt(($('gStart').value || '').trim(), 10);
    const count = parseInt(($('gCount').value || '').trim(), 10);
    const amountEth = parseFloat(($('gAmount').value || '').trim());
    const password = maskedValue($('gPw'));
    if (Number.isNaN(startIndex) || startIndex < 0) return glog(m('invalidStartIndex'), true);
    if (Number.isNaN(count) || count < 1) return glog(m('invalidCount'), true);
    if (password.length < 8) return glog(m('pwTooShort'), true);
    if (compounding) {
      if (Number.isNaN(amountEth) || amountEth < 32 || amountEth > 2048) {
        return glog(m('amount02Range'), true);
      }
    } else if (amountEth !== 32) {
      return glog(m('amount01Fixed'), true);
    }
    const amountGwei = Math.round(amountEth * 1e9);

    $('gGen').disabled = true;
    clearDownloads($('gDl'));
    $('gNext').classList.add('hidden');
    glog(m('generatingN', { count }), true);

    const res = await generateValidators({ mnemonic, password, withdrawalAddress: withdraw, network, startIndex, count, compounding, amountGwei });

    const dl = $('gDl');
    res.keystores.forEach((k: any) => addDownload(dl, k.filename, k.json));
    addDownload(dl, `deposit_data-${Date.now()}.json`, JSON.stringify(res.depositData));

    glog(m('genDone', { label: NETWORKS[network].label, count }));

    const lp = NETWORKS[network].launchpad;
    $('gNext').classList.remove('hidden');
    $('gNext').innerHTML = m('genNext', { lp });
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
    if (!validateMnemonic(mnemonic, wordlist)) return tLog(m('invalidMnemonic'), true);
    const withdraw = ($('tWithdraw').value || '').trim();
    if (!validAddress(withdraw)) return tLog(m('invalidWithdraw'), true);
    const startIndex = parseInt(($('tIndex').value || '').trim(), 10);
    const count = parseInt(($('tCount').value || '').trim(), 10);
    const amountEth = parseFloat(($('tAmount').value || '').trim());
    if (Number.isNaN(startIndex) || startIndex < 0) return tLog(m('topInvalidIndex'), true);
    if (Number.isNaN(count) || count < 1) return tLog(m('invalidCount'), true);
    if (Number.isNaN(amountEth) || amountEth < 1 || amountEth > 2048) return tLog(m('topAmountRange'), true);

    $('tGen').disabled = true;
    clearDownloads($('tDl'));
    $('tNext').classList.add('hidden');
    tLog(m('topGeneratingN', { count }), true);
    const res = await generateValidators({
      mnemonic, password: '', withdrawalAddress: withdraw, network,
      startIndex, count, compounding: true, amountGwei: Math.round(amountEth * 1e9), depositOnly: true,
    });
    res.depositData.forEach((d: any, i: number) => tLog(`  • index ${startIndex + i}: 0x${d.pubkey.slice(0, 14)}…  +${amountEth} ETH`));
    addDownload($('tDl'), `topup_deposit_data-${Date.now()}.json`, JSON.stringify(res.depositData));
    tLog(m('topDone', { label: NETWORKS[network].label }));
    $('tNext').classList.remove('hidden');
    $('tNext').innerHTML = m('topNext');
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
  const get = (name: string) => { const mm = text.match(new RegExp(`--${name}(?:=|\\s+)(\\S+)`)); return mm ? mm[1] : null; };
  const ids = get('operator-ids'); const keys = get('operator-keys'); const owner = get('owner-address'); const nonce = get('owner-nonce');
  if (ids) $('opIds').value = ids;
  if (keys) $('opKeys').value = keys;
  if (owner) $('owner').value = owner;
  if (nonce !== null) $('nonce').value = nonce;
  const got = [ids && 'IDs', keys && 'keys', owner && 'owner', nonce !== null && 'nonce'].filter(Boolean).join(', ');
  log(got ? m('parseImported', { got }) : m('parseNone'), true);
});

$('fetchKeys').addEventListener('click', async () => {
  const ids = $('opIds').value.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (!ids.length) return log(m('needOpIds'), true);
  log(m('fetchingKeys', { ids: ids.join(', ') }), true);
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
    log(m('keysFilled'));
  } catch (e: any) { log(m('fetchFail', { error: e.message })); }
});

$('connect').addEventListener('click', async () => {
  const eth = (window as any).ethereum;
  if (!eth) return log(m('noWallet'), true);
  try {
    const accts: string[] = await eth.request({ method: 'eth_requestAccounts' });
    $('owner').value = accts[0];
    log(m('connected', { addr: accts[0] }));
  } catch (e: any) { log(m('connectFail', { error: e.message })); }
});

$('gen').addEventListener('click', async () => {
  try {
    const ids = $('opIds').value.split(',').map((s: string) => parseInt(s.trim(), 10));
    const opKeys = $('opKeys').value.split(',').map((s: string) => s.trim()).filter(Boolean);
    const owner = $('owner').value.trim();
    const baseNonce = parseInt($('nonce').value.trim(), 10);
    const password = maskedValue($('pw'));
    const fileList = $('files').files;
    if (ids.length !== opKeys.length || !opKeys.length) return log(m('idsKeysMismatch'), true);
    if (ids.length < 4) return log(m('min4ops'), true);
    if (!validAddress(owner)) return log(m('ownerInvalid'), true);
    if (Number.isNaN(baseNonce)) return log(m('nonceNaN'), true);
    if (!fileList || !fileList.length) return log(m('chooseKeystore'), true);
    if (!password) return log(m('enterPassword'), true);

    const operators = ids.map((id: number, i: number) => ({ id, operatorKey: opKeys[i] }));
    $('gen').disabled = true;
    clearDownloads($('dl'));
    log(m('splittingN', { count: fileList.length }), true);
    const keyShares = new KeyShares();
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const raw = await file.text();
      let keystore: any;
      try { keystore = JSON.parse(raw); } catch { return log(m('notJson', { name: file.name })); }
      let step = 'init';
      try {
        const ssvKeys = new SSVKeys();
        step = m('stepExtract');
        const { publicKey, privateKey } = await ssvKeys.extractKeys(keystore, password);
        step = m('stepBuild');
        const encryptedShares = await ssvKeys.buildShares(privateKey, operators);
        step = 'buildPayload';
        const item = new KeySharesItem();
        const nonce = baseNonce + i;
        await item.update({ ownerAddress: owner, ownerNonce: nonce, operators, publicKey });
        await item.buildPayload({ publicKey, operators, encryptedShares }, { ownerAddress: owner, ownerNonce: nonce, privateKey });
        keyShares.add(item);
        log('  ' + m('splitOneDone', { name: file.name, nonce }));
      } catch (err: any) {
        console.error(`[step:${step}] ${file.name}:`, err?.stack || err);
        log('  ' + m('splitOneFail', { name: file.name, step, error: err?.message ?? err }));
        throw err;
      }
    }
    addDownload($('dl'), `keyshares-${Date.now()}.json`, keyShares.toJson());
    log('\n' + m('splitAllDone'));
  } catch (e: any) {
    console.error('split failed:', e?.stack || e);
  } finally {
    $('gen').disabled = false;
  }
});

// ---------------- init ----------------
const savedRaw = (() => { try { return localStorage.getItem('toolkitLang'); } catch { return null; } })();
const saved = savedRaw === 'zh' ? 'zh-Hant' : savedRaw; // migrate legacy 'zh'
applyLang(LANGS.some((l) => l.code === saved) ? (saved as Lang) : 'en');
showTab('generate');
