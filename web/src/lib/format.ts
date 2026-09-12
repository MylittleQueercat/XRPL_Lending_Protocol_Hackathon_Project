// All ledger amounts are drop strings. Formatting never rounds the underlying value.
const DROPS_PER_XRP = 1_000_000n;

export function dropsToXrpString(drops: string | bigint, decimals = 6): string {
  // Some Loan fields are fractional drop strings; whole drops are what a person can hold or pay.
  const value = typeof drops === "bigint" ? drops : BigInt((drops || "0").split(".")[0] || "0");
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / DROPS_PER_XRP;
  const frac = (abs % DROPS_PER_XRP).toString().padStart(6, "0").slice(0, decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${frac ? "." + frac : ""}`;
}

export function formatXrp(drops: string | bigint, decimals = 6): string {
  return `${dropsToXrpString(drops, decimals)} XRP`;
}

// Parses a user-typed XRP decimal into drops, rejecting anything the ledger would reject.
export function xrpToDrops(value: string): string | null {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value.trim())) return null;
  const [whole = "0", frac = ""] = value.trim().split(".");
  const drops = BigInt(whole) * DROPS_PER_XRP + BigInt(frac.padEnd(6, "0"));
  return drops > 0n ? drops.toString() : null;
}

export function shortAddress(address: string, head = 6, tail = 4): string {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…`;
}

export function formatShares(units: string | bigint): string {
  const value = typeof units === "bigint" ? units : BigInt(units || "0");
  return value.toLocaleString("en-US");
}

// Basis points as a percentage string, e.g. 500 -> "5.00 %".
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)} %`;
}

export function formatPercent(ratio: number, decimals = 1): string {
  return `${(ratio * 100).toFixed(decimals)} %`;
}

export function formatRelativeTime(iso: string): string {
  const delta = Date.parse(iso) - Date.now();
  const abs = Math.abs(delta);
  const unit = abs < 60_000 ? ["second", 1000] : abs < 3_600_000 ? ["minute", 60_000] : abs < 86_400_000 ? ["hour", 3_600_000] : ["day", 86_400_000];
  const n = Math.round(delta / (unit[1] as number));
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(n, unit[0] as Intl.RelativeTimeFormatUnit);
}
