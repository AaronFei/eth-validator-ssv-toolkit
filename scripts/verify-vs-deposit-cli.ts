// Manual cross-check helper: prints this toolkit's deposit_data for a mnemonic,
// plus the exact ethstaker-deposit-cli command to reproduce, so you can diff.
// Offline (only derives + prints). Run: pnpm verify:cli  [mnemonic] [index] [amountEth] [withdrawal]
import { generateValidators } from '../src/generate';

const M = process.argv[2] ||
  'abstract mango stumble major thing ghost share put detect opera venue ' +
  'marine hammer unknown tomorrow layer camp change issue either video essence broom spike';
const index = parseInt(process.argv[3] || '0', 10);
const amountEth = parseFloat(process.argv[4] || '32');
const ADDR = process.argv[5] || '0x00000000219ab540356cBB839Cbe05303d7705Fa';
const compounding = amountEth !== 32;

const res = await generateValidators({
  mnemonic: M, password: 'verifyonly', withdrawalAddress: ADDR, network: 'mainnet',
  startIndex: index, count: 1, compounding, amountGwei: Math.round(amountEth * 1e9), depositOnly: true,
});
const d: any = res.depositData[0];
console.log('=== this toolkit ===');
console.log('pubkey               :', d.pubkey);
console.log('withdrawal_credentials:', d.withdrawal_credentials);
console.log('signature            :', d.signature);
console.log('deposit_data_root    :', d.deposit_data_root);
console.log('\n=== reproduce with the official CLI and diff the 4 fields above ===');
console.log('git clone https://github.com/eth-educators/ethstaker-deposit-cli && cd ethstaker-deposit-cli');
console.log('python -m ethstaker_deposit --language English existing-mnemonic \\');
console.log(`  --mnemonic="${M}" --validator_start_index=${index} --num_validators=1 \\`);
console.log(`  --chain=mainnet --withdrawal_address=${ADDR} ${compounding ? `--compounding --amount=${amountEth}` : '--regular-withdrawal'} \\`);
console.log('  --keystore_password=verifyonly --folder=/tmp/dcli-out');
console.log('# then compare /tmp/dcli-out/validator_keys/deposit_data-*.json');
