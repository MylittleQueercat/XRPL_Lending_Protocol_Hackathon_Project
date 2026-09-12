import { describe, expect, it } from "vitest";
import { dropsToXrpString, formatXrp, shortAddress, xrpToDrops } from "@/lib/format";

describe("amount formatting never rounds the ledger value", () => {
  it("renders drops exactly", () => {
    expect(dropsToXrpString("100000188")).toBe("100.000188");
    expect(dropsToXrpString("1")).toBe("0.000001");
    expect(dropsToXrpString("0")).toBe("0");
    expect(formatXrp("5000000")).toBe("5 XRP");
  });
  it("floors fractional drop strings from Loan objects instead of throwing", () => {
    expect(dropsToXrpString("6710290.955601783635")).toBe("6.71029");
    expect(formatXrp("80523492.5")).toBe("80.523492 XRP");
  });
  it("groups thousands", () => {
    expect(dropsToXrpString("1234567890000")).toBe("1,234,567.89");
  });
  it("parses user input into drops or refuses it", () => {
    expect(xrpToDrops("50")).toBe("50000000");
    expect(xrpToDrops("0.000001")).toBe("1");
    expect(xrpToDrops("0")).toBeNull();
    expect(xrpToDrops("1.0000001")).toBeNull();
    expect(xrpToDrops("abc")).toBeNull();
  });
  it("shortens addresses without losing the prefix", () => {
    expect(shortAddress("rzqEAQrkcXMjaKUMYdV6DXT4ybeaDWWjd")).toBe("rzqEAQ…WWjd");
  });
});
