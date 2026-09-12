// Pure logic for the sell flow, kept free of React so it can be unit-tested.
import { discountRatio, unitPriceDrops, validateOfferInput } from "@/lib/offers";
import { shareValueDrops, type VaultState } from "@/lib/ledger";
import { xrpToDrops } from "@/lib/format";

export const EXPIRY_OPTIONS = [
  { label: "1 hour", hours: 1 },
  { label: "6 hours", hours: 6 },
  { label: "24 hours", hours: 24 },
  { label: "72 hours", hours: 72 },
] as const;

export function expiryFromHours(hours: number, now = Date.now()): string {
  return new Date(now + hours * 3_600_000).toISOString();
}

export interface TermsInput {
  shares: string; // raw user text
  priceXrp: string; // raw user text
  expiryHours: number;
}

export interface TermsErrors {
  shares?: string;
  price?: string;
  general: string[];
}

export interface Review {
  shares: string;
  priceDrops: string;
  unitPriceXrp: string; // decimal string, XRP per share unit
  accountingValueDrops: string;
  discount: number | null; // ratio; positive = discount, negative = premium
  expiresAt: string;
}

// Validates the terms against the live balance and the offer model. Returns either errors or a
// review the user can publish. Never rounds a monetary quantity.
export function computeReview(
  input: TermsInput,
  ctx: {
    vault: Pick<VaultState, "vaultId" | "shareMptId" | "assetsTotalDrops" | "sharesOutstanding">;
    seller: string;
    balance: string;
    networkId: number;
    now?: number;
  },
): { errors: TermsErrors; review: Review | null } {
  const errors: TermsErrors = { general: [] };
  const shares = input.shares.trim();
  if (!/^[1-9]\d*$/.test(shares)) errors.shares = "Enter a whole number of share units.";
  else if (BigInt(shares) > BigInt(ctx.balance || "0")) errors.shares = "You hold fewer units than that on the ledger.";

  const priceDrops = xrpToDrops(input.priceXrp);
  if (!priceDrops) errors.price = "Enter a positive XRP amount with at most six decimals.";

  const expiresAt = expiryFromHours(input.expiryHours, ctx.now);
  if (!errors.shares && priceDrops) {
    errors.general = validateOfferInput(
      { network: ctx.networkId, vaultId: ctx.vault.vaultId, shareMptId: ctx.vault.shareMptId, seller: ctx.seller, shares, priceDrops, expiresAt },
      ctx.networkId,
    );
  }
  if (errors.shares || errors.price || errors.general.length) return { errors, review: null };

  const accountingValueDrops = shareValueDrops(shares, ctx.vault);
  return {
    errors,
    review: {
      shares,
      priceDrops: priceDrops as string,
      unitPriceXrp: unitPriceDrops({ priceDrops: priceDrops as string, shares }),
      accountingValueDrops,
      discount: discountRatio(priceDrops as string, accountingValueDrops),
      expiresAt,
    },
  };
}

// Recently used vault IDs, so the seller does not have to paste a 64-hex index each time.
const KNOWN_VAULTS_KEY = "raise.knownVaults.v1";

export function readKnownVaults(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KNOWN_VAULTS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function rememberVault(vaultId: string): string[] {
  const next = [vaultId, ...readKnownVaults().filter((v) => v !== vaultId)].slice(0, 8);
  try {
    window.localStorage.setItem(KNOWN_VAULTS_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable; the list is still returned for this render.
  }
  return next;
}

export const isVaultId = (value: string) => /^[A-F0-9]{64}$/i.test(value.trim());
