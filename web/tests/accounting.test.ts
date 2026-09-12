import { describe, expect, it } from "vitest";
import { shareValueDrops, estimateShareValueDrops, wholeDrops } from "../src/lib/ledger";
import { formatXrp } from "../src/lib/format";
import { liquidityPicture, canVaultFund } from "../src/components/position/position-math";
import { fullRepaymentOfferDrops } from "../src/components/operator/lending";

describe("ledger NUMBER values reach UI without float conversion", () => {
  it("values scientific and fractional total assets", () => {
    expect(shareValueDrops("100", { assetsTotalDrops: "1e11", sharesOutstanding: "1000" })).toBe("10000000000");
    expect(shareValueDrops("100", { assetsTotalDrops: "1000.25", sharesOutstanding: "1000" })).toBe("100");
  });
  it("deducts unrealized losses from the ownership claim", () => {
    expect(shareValueDrops("100", { assetsTotalDrops: "1000", lossUnrealizedDrops: "200", sharesOutstanding: "1000" })).toBe("80");
  });
  it("does not crash rendering stale offers larger than the remaining supply", () => {
    expect(estimateShareValueDrops("1000", { assetsTotalDrops: "10", sharesOutstanding: "100" })).toBeNull();
    expect(estimateShareValueDrops("1000", { assetsTotalDrops: "0", sharesOutstanding: "0" })).toBeNull();
  });
  it("floors NUMBER at display boundaries and ceils repayment only once", () => {
    expect(wholeDrops("1.23e5")).toBe("123000");
    expect(formatXrp("1.23456789e6")).toBe("1.234567 XRP");
    expect(fullRepaymentOfferDrops("1.00000001e6", "5")).toBe("1000006");
  });
  it("subtracts fractional cash before rounding deployed assets", () => {
    expect(liquidityPicture("100.9", "99.1").deployedDrops).toBe("1");
    expect(canVaultFund("100", "9.99e1")).toBe(false);
  });
});
