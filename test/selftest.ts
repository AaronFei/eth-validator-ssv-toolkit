// Offline self-test — runs the real generate/keystore code against FIXED VECTORS
// that were produced by the official ethstaker-deposit-cli. No network.
// If the crypto path ever regresses, this fails. Run with: pnpm test
import { generateValidators } from '../src/generate';
import { decryptKeystore } from '../src/keystore';

const M =
  'abstract mango stumble major thing ghost share put detect opera venue ' +
  'marine hammer unknown tomorrow layer camp change issue either video essence broom spike';
const ADDR = '0x00000000219ab540356cBB839Cbe05303d7705Fa';

// Expected fields (hex, NO 0x prefix) — captured from ethstaker-deposit-cli.
const CASES = [
  {
    name: '0x01 / 32 ETH',
    input: { compounding: false, amountGwei: 32_000_000_000 },
    pubkey: 'b8c8d36c99d55f57739cc96330766a62155ab25af9007565e0e930380525e83ce6d104f4403bf691541a4b6a4d19823c',
    signature: '82093a4da06ffbd29da4a922bcce40275c855d60f64ea082c0af64a528787e2d37ba4ab7bb8041eb12d4b47a92982a6617b95232f4c99d17c6651eb7ba0444620bd3ff29b43c899a309b06cf7fd0ece64a7418ac675652d4e354faa777939baa',
    deposit_data_root: 'e5c5ace22149fa0f1a849d00d29af5d2f347c00e8316641de14b9a150f8bf389',
    keystore: true,
  },
  {
    name: '0x02 / 100.5 ETH (compounding, non-integer)',
    input: { compounding: true, amountGwei: 100_500_000_000 },
    pubkey: 'b8c8d36c99d55f57739cc96330766a62155ab25af9007565e0e930380525e83ce6d104f4403bf691541a4b6a4d19823c',
    signature: '921eb7ab8822b9c612af295a69e003b68ba779b566c15bc88dd29bee69c824350ca6f496c328bef2f766a9362b6c37b109644b158d99f57625deabe39e540a9665a41d690536be5852e37e5e669043fea81d7d280d27441490ef70902b85a286',
    deposit_data_root: 'd9b4966aa13e32b90b4378178a2854bb59a0cb5684d077243d0e4da4fe53250b',
    keystore: true,
  },
  {
    name: 'top-up / 0x02 50 ETH (depositOnly)',
    input: { compounding: true, amountGwei: 50_000_000_000, depositOnly: true },
    pubkey: 'b8c8d36c99d55f57739cc96330766a62155ab25af9007565e0e930380525e83ce6d104f4403bf691541a4b6a4d19823c',
    signature: '8d4950e2b6e729e4b876be1c618c29cb721d7dc00a55ee059f1797be0ab61202a6e81d72e48700c572b4e8f5b331639010759e086ad93a22f4bc40aaeb023d34efbb69ca8f217c851c0ba3d14dbebc55e7ee2fc8e42b8a5f9533ee700bc5ae59',
    deposit_data_root: '3921380787ab16fcd585c9f26dbd495362bd0c573c2ba515ea4caba774173b66',
    keystore: false,
  },
];

let failed = 0;
const ok = (cond: boolean, label: string) => { console.log((cond ? '✅' : '❌') + ' ' + label); if (!cond) failed++; };

for (const c of CASES) {
  const res = await generateValidators({
    mnemonic: M, password: 'testtest', withdrawalAddress: ADDR, network: 'mainnet',
    startIndex: 0, count: 1, ...c.input,
  });
  const d: any = res.depositData[0];
  ok(d.pubkey === c.pubkey, `${c.name}: pubkey`);
  ok(d.signature === c.signature, `${c.name}: signature == deposit-cli`);
  ok(d.deposit_data_root === c.deposit_data_root, `${c.name}: deposit_data_root == deposit-cli`);
  if (c.keystore) {
    const ks = JSON.parse(res.keystores[0].json);
    const back = decryptKeystore(ks, 'testtest');
    ok(back.length === 32, `${c.name}: keystore decrypts to 32-byte key (round-trip)`);
  }
}

if (failed) { console.error(`\n${failed} check(s) FAILED — crypto regression!`); process.exit(1); }
console.log('\nAll self-tests passed (offline; fixed vectors from ethstaker-deposit-cli).');
