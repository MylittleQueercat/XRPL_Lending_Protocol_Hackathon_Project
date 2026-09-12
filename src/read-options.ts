import { isValidClassicAddress } from 'xrpl';
import { parseXrp } from './core.js';

export interface PositionOptions {
  command: 'position';
  vaultId: string;
  holder: string;
  loanBrokerId?: string;
  loanId?: string;
  offeredSharesRaw?: string;
  askingPriceDrops?: string;
}
export interface TransactionOptions {
  command: 'transaction';
  hash: string;
  lastLedgerSequence?: number;
}
export type ReadOptions = PositionOptions | TransactionOptions;

function hash(value: string | undefined, field: string): string {
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) throw new Error(`${field} requires a 64-character hexadecimal identifier.`);
  return value.toUpperCase();
}

function flags(args: string[], allowed: ReadonlySet<string>): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!key || !allowed.has(key)) throw new Error(`Unknown option: ${key ?? ''}.`);
    if (result.has(key)) throw new Error(`Duplicate option: ${key}.`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value.`);
    result.set(key, value);
  }
  return result;
}

export function parseReadOptions(args: string[]): ReadOptions {
  const [command, ...rest] = args;
  if (command === 'transaction') {
    const values = flags(rest, new Set(['--hash', '--last-ledger']));
    const options: TransactionOptions = { command, hash: hash(values.get('--hash'), '--hash') };
    if (values.has('--last-ledger')) {
      const raw = values.get('--last-ledger') ?? '';
      if (raw.length > 10 || !/^[1-9]\d*$/.test(raw) || BigInt(raw) > 4_294_967_295n) throw new Error('--last-ledger requires a positive uint32 ledger index.');
      options.lastLedgerSequence = Number(raw);
    }
    return options;
  }
  if (command !== 'position') throw new Error('Usage: position --vault ID --account ADDRESS [--broker ID --loan ID] [--shares RAW --price XRP] | transaction --hash HASH [--last-ledger INDEX]');
  const values = flags(rest, new Set(['--vault', '--account', '--broker', '--loan', '--shares', '--price']));
  const holder = values.get('--account');
  if (!holder || !isValidClassicAddress(holder)) throw new Error('--account requires a valid classic XRPL account address.');
  const options: PositionOptions = { command, vaultId: hash(values.get('--vault'), '--vault'), holder };
  if (values.has('--broker')) options.loanBrokerId = hash(values.get('--broker'), '--broker');
  if (values.has('--loan')) {
    if (!options.loanBrokerId) throw new Error('--loan requires --broker to verify the loan association.');
    options.loanId = hash(values.get('--loan'), '--loan');
  }
  if (values.has('--shares') !== values.has('--price')) throw new Error('--shares and --price must be supplied together.');
  if (values.has('--shares')) {
    const shares = values.get('--shares') ?? '';
    if (shares.length > 19 || !/^[1-9]\d*$/.test(shares)) throw new Error('--shares requires a positive integer in raw share units.');
    options.offeredSharesRaw = shares;
    options.askingPriceDrops = parseXrp(values.get('--price') ?? '');
  }
  return options;
}
