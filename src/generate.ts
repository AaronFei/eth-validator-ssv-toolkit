// Validator key generation — browser, client-side.
// Verified BYTE-IDENTICAL to the official ethstaker/staking-deposit-cli
// (same pubkey / withdrawal_credentials / signature / deposit_data_root).
// Uses audited libs only; herumi BLS backend (bls-eth-wasm) for the browser.
import { deriveKeyFromMnemonic, deriveEth2ValidatorKeys } from '@chainsafe/bls-keygen';
import { createKeystore, decryptKeystore } from './keystore';
import { ssz } from '@lodestar/types';
import blsHerumi from '@chainsafe/bls/herumi';

const bls: any = (blsHerumi as any).default ?? blsHerumi;
let blsReady: Promise<void> | null = null;
async function initBls() {
  if (!blsReady) blsReady = (typeof bls.init === 'function' ? bls.init('herumi') : Promise.resolve());
  await blsReady;
}

// GENESIS_FORK_VERSION per network (the deposit domain uses this, not the current fork).
export const NETWORKS: Record<string, { label: string; forkVersion: string; launchpad: string }> = {
  mainnet: { label: 'Mainnet', forkVersion: '00000000', launchpad: 'https://launchpad.ethereum.org' },
  hoodi: { label: 'Hoodi (testnet)', forkVersion: '10000910', launchpad: 'https://hoodi.launchpad.ethereum.org' },
  holesky: { label: 'Holesky (testnet)', forkVersion: '01017000', launchpad: 'https://holesky.launchpad.ethereum.org' },
};

const DOMAIN_DEPOSIT = Uint8Array.from([3, 0, 0, 0]);
const ZERO32 = new Uint8Array(32);
const AMOUNT_GWEI = 32_000_000_000;

const hexToBytes = (h: string) => Uint8Array.from(Buffer.from(h.replace(/^0x/, ''), 'hex'));
const bytesToHex = (u: Uint8Array) => Buffer.from(u).toString('hex');

function computeDepositDomain(forkVersionHex: string): Uint8Array {
  const forkDataRoot = ssz.phase0.ForkData.hashTreeRoot({
    currentVersion: hexToBytes(forkVersionHex),
    genesisValidatorsRoot: ZERO32,
  });
  const domain = new Uint8Array(32);
  domain.set(DOMAIN_DEPOSIT, 0);
  domain.set(forkDataRoot.slice(0, 28), 4);
  return domain;
}

function withdrawalCredentials(execAddress: string, compounding: boolean): Uint8Array {
  const wc = new Uint8Array(32);
  wc[0] = compounding ? 0x02 : 0x01;
  wc.set(hexToBytes(execAddress), 12); // 0x01/0x02 + 11 zero bytes + 20-byte address
  return wc;
}

export interface GenInput {
  mnemonic: string;
  password: string;
  withdrawalAddress: string; // 0x + 40 hex
  network: keyof typeof NETWORKS;
  startIndex: number;
  count: number;
  compounding?: boolean;
  amountGwei?: number; // default 32 ETH
}

export interface GenResult {
  keystores: { filename: string; json: string }[];
  depositData: any[]; // array written to deposit_data-*.json
}

export async function generateValidators(input: GenInput): Promise<GenResult> {
  await initBls();
  const net = NETWORKS[input.network];
  if (!net) throw new Error(`unknown network ${input.network}`);
  const domain = computeDepositDomain(net.forkVersion);
  const amount = input.amountGwei ?? AMOUNT_GWEI;
  const master = deriveKeyFromMnemonic(input.mnemonic);
  const keystores: { filename: string; json: string }[] = [];
  const depositData: any[] = [];

  for (let n = 0; n < input.count; n++) {
    const index = input.startIndex + n;
    const { signing } = deriveEth2ValidatorKeys(master, index);
    const sk = bls.SecretKey.fromBytes(signing);
    const pubkey: Uint8Array = sk.toPublicKey().toBytes();
    const wc = withdrawalCredentials(input.withdrawalAddress, !!input.compounding);

    // deposit_data
    const depositMessage = { pubkey, withdrawalCredentials: wc, amount };
    const dmRoot = ssz.phase0.DepositMessage.hashTreeRoot(depositMessage);
    const signingRoot = ssz.phase0.SigningData.hashTreeRoot({ objectRoot: dmRoot, domain });
    const signature: Uint8Array = sk.sign(signingRoot).toBytes();
    const dd = { pubkey, withdrawalCredentials: wc, amount, signature };
    const ddRoot = ssz.phase0.DepositData.hashTreeRoot(dd);

    // sanity self-verify (catches any backend/domain mistake before you deposit)
    if (!bls.verify(pubkey, signingRoot, signature)) throw new Error(`signature self-verify failed @ index ${index}`);

    depositData.push({
      pubkey: bytesToHex(pubkey),
      withdrawal_credentials: bytesToHex(wc),
      amount,
      signature: bytesToHex(signature),
      deposit_message_root: bytesToHex(dmRoot),
      deposit_data_root: bytesToHex(ddRoot),
      fork_version: net.forkVersion,
      network_name: input.network,
      deposit_cli_version: 'eth-validator-ssv-toolkit',
    });

    // EIP-2335 keystore + round-trip self-verify (decrypt must return the key)
    const path = `m/12381/3600/${index}/0/0`;
    const ks = createKeystore(input.password, signing, pubkey, path);
    if (bytesToHex(decryptKeystore(ks, input.password)) !== bytesToHex(signing)) {
      throw new Error(`keystore round-trip failed @ index ${index}`);
    }
    keystores.push({
      filename: `keystore-m_12381_3600_${index}_0_0-${Date.now()}.json`,
      json: JSON.stringify(ks),
    });
  }

  return { keystores, depositData };
}
