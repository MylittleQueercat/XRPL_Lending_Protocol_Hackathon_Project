import type { SubmittableTransaction } from 'xrpl';
import { TRACK1 } from './core.js';

/** The transaction surface used by the current Raise demo. Payment appears twice because
 * XRP and vault-share MPT Payments have different asset semantics. */
export const REQUIRED_SIGNING_SURFACE = Object.freeze([
  { transactionType: 'Payment', asset: 'XRP', role: 'buyer', purpose: 'Batch inner payment' },
  { transactionType: 'Payment', asset: 'vault-share MPT', role: 'seller', purpose: 'Batch inner share delivery' },
  { transactionType: 'MPTokenAuthorize', asset: 'vault-share MPT', role: 'buyer', purpose: 'receiver holding opt-in' },
  { transactionType: 'VaultCreate', asset: 'XRP', role: 'operator', purpose: 'create vault' },
  { transactionType: 'VaultDeposit', asset: 'XRP', role: 'lender', purpose: 'fund vault' },
  { transactionType: 'VaultWithdraw', asset: 'XRP', role: 'holder', purpose: 'redeem shares' },
  { transactionType: 'LoanBrokerSet', asset: 'XRP', role: 'operator', purpose: 'configure broker' },
  { transactionType: 'LoanBrokerCoverDeposit', asset: 'XRP', role: 'operator', purpose: 'fund first-loss cover' },
  { transactionType: 'LoanSet', asset: 'XRP', role: 'broker/borrower', purpose: 'multi-party loan acceptance' },
  { transactionType: 'LoanPay', asset: 'XRP', role: 'borrower', purpose: 'repay loan' },
  { transactionType: 'Batch', asset: 'XRP + vault-share MPT', role: 'seller + buyer', purpose: 'tfAllOrNothing settlement' },
] as const);

export type WalletErrorCode = 'DISCONNECTED' | 'WRONG_NETWORK' | 'UNSUPPORTED_TRANSACTION' | 'SIGNING_REJECTED' | 'SIGNING_FAILED';

export class WalletOperationError extends Error {
  constructor(public readonly code: WalletErrorCode, message: string) {
    super(message);
    this.name = 'WalletOperationError';
  }
}

export interface WalletConnection {
  connected: boolean;
  account: string;
  networkId: number | null;
}

export interface Track1Signer extends WalletConnection {
  sign(transaction: SubmittableTransaction): Promise<{ tx_blob: string; hash: string }>;
}

export function publicWalletStatus(connection: WalletConnection) {
  return {
    connected: connection.connected,
    account: connection.account,
    networkId: connection.networkId,
    network: connection.networkId === TRACK1.networkId ? 'Track 1 custom Devnet' : 'Unknown / wrong network',
  };
}

export function assertWalletReady(connection: WalletConnection): void {
  if (!connection.connected) throw new WalletOperationError('DISCONNECTED', 'Wallet is disconnected. Reconnect before signing.');
  if (connection.networkId !== TRACK1.networkId) {
    throw new WalletOperationError('WRONG_NETWORK', `Wallet network ${String(connection.networkId)} does not match Track 1 network ${TRACK1.networkId}. Signing is blocked.`);
  }
  if (!connection.account || !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(connection.account)) {
    throw new WalletOperationError('SIGNING_FAILED', 'Connected wallet did not provide a valid classic XRPL account.');
  }
}

export function assertSupportedTransaction(transaction: SubmittableTransaction): void {
  if (!REQUIRED_SIGNING_SURFACE.some((entry) => entry.transactionType === transaction.TransactionType)) {
    throw new WalletOperationError('UNSUPPORTED_TRANSACTION', `Raise wallet mode does not support ${String(transaction.TransactionType)}.`);
  }
}

/** Signs only after the wallet/network checks. This function deliberately has no submit or server call. */
export async function signTrack1(transaction: SubmittableTransaction, signer: Track1Signer) {
  assertWalletReady(signer);
  assertSupportedTransaction(transaction);
  try {
    return await signer.sign(transaction);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/reject|den(y|ied)|cancel/i.test(message)) {
      throw new WalletOperationError('SIGNING_REJECTED', 'The wallet rejected the signature. No transaction was submitted.');
    }
    throw new WalletOperationError('SIGNING_FAILED', `Wallet signing failed: ${message}`);
  }
}
