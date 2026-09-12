import { describe, expect, it } from "vitest";
import { canVaultFund, classifyRefusal, fundableTodayDrops, liquidityPicture, shareOfVault } from "@/components/position/position-math";
import { KNOWN_VAULTS_KEY, isVaultId, readKnownVaults, rememberVault } from "@/components/position/known-vaults";

const VAULT = "CD685221DDF58CFD53806EF9A18C11CB5C25A2F02C101A600985A5A23DF141CE";

describe("liquidity picture", () => {
  it("splits total assets into cash and deployed capital exactly", () => {
    const p = liquidityPicture("100000000", "50000000");
    expect(p.deployedDrops).toBe("50000000");
    expect(p.utilisation).toBe(0.5);
  });
  it("never reports negative deployment when available exceeds total", () => {
    expect(liquidityPicture("10", "20").deployedDrops).toBe("0");
  });
  it("handles an empty vault", () => {
    expect(liquidityPicture("0", "0").utilisation).toBe(0);
    expect(shareOfVault("0", "0")).toBe(0);
  });
  it("computes share of vault from units, not from XRP", () => {
    expect(shareOfVault("100000000", "100000000")).toBe(1);
    expect(shareOfVault("25", "100")).toBe(0.25);
  });
});

describe("withdrawal prediction and refusal classification", () => {
  it("predicts whether the vault can pay a request today", () => {
    expect(canVaultFund("50000000", "50000000")).toBe(true);
    expect(canVaultFund("50000001", "50000000")).toBe(false);
  });
  it("caps what is fundable at both the holder's value and the vault's cash", () => {
    expect(fundableTodayDrops("100000000", "50000000")).toBe("50000000");
    expect(fundableTodayDrops("30000000", "50000000")).toBe("30000000");
  });
  // This is the run recorded in evidence/vanilla-flow.json: 100 XRP requested, 50 XRP available,
  // 100,000,000 share units held. The refusal is the vault's liquidity, not the holding.
  it("attributes the recorded guardrail to vault liquidity, not to the holding", () => {
    expect(classifyRefusal("tecINSUFFICIENT_FUNDS", "100000000", "100000000", "50000000")).toBe("vault-liquidity");
  });
  it("attributes a request beyond the holder's value to insufficient shares", () => {
    expect(classifyRefusal("tecINSUFFICIENT_FUNDS", "200000000", "100000000", "50000000")).toBe("insufficient-shares");
  });
  it("does not classify other codes as a liquidity refusal", () => {
    expect(classifyRefusal("tecNO_ENTRY", "1", "100", "0")).toBe("other");
    expect(classifyRefusal("tesSUCCESS", "1", "100", "100")).toBe("other");
  });
});

describe("known vaults", () => {
  const memory = () => {
    const store = new Map<string, string>();
    return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  };
  it("accepts only 64-hex ledger indexes", () => {
    expect(isVaultId(VAULT)).toBe(true);
    expect(isVaultId(VAULT.toLowerCase())).toBe(true);
    expect(isVaultId("rzqEAQrkcXMjaKUMYdV6DXT4ybeaDWWjd")).toBe(false);
  });
  it("remembers the most recent first, without duplicates", () => {
    const s = memory();
    rememberVault(s, VAULT.toLowerCase());
    rememberVault(s, "A".repeat(64));
    rememberVault(s, VAULT);
    expect(readKnownVaults(s)).toEqual([VAULT, "A".repeat(64)]);
    expect(JSON.parse(s.getItem(KNOWN_VAULTS_KEY) as string)).toHaveLength(2);
  });
  it("ignores corrupt storage rather than breaking the page", () => {
    const s = memory();
    s.setItem(KNOWN_VAULTS_KEY, "{not json");
    expect(readKnownVaults(s)).toEqual([]);
    expect(readKnownVaults(null)).toEqual([]);
  });
});
