import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatShares, formatXrp, shortAddress } from "@/lib/format";
import type { Snapshot } from "./settlement";

function signed(value: bigint, render: (v: string) => string): string {
  return `${value > 0n ? "+" : value < 0n ? "−" : ""}${render((value < 0n ? -value : value).toString())}`;
}

// Both parties, both assets, before and after. This table is the proof that a sale happened —
// or that it did not — and it is shown in both cases.
export function SnapshotTable({ before, after, buyer, seller }: { before: Snapshot; after: Snapshot; buyer: string; seller: string }) {
  const rows = [
    { label: "Shares", who: "you", address: buyer, b: before.buyerShares, a: after.buyerShares, fmt: formatShares },
    { label: "Shares", who: "seller", address: seller, b: before.sellerShares, a: after.sellerShares, fmt: formatShares },
    { label: "XRP", who: "you", address: buyer, b: before.buyerXrp, a: after.buyerXrp, fmt: formatXrp },
    { label: "XRP", who: "seller", address: seller, b: before.sellerXrp, a: after.sellerXrp, fmt: formatXrp },
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Before{before.ledgerIndex ? ` · #${before.ledgerIndex.toLocaleString("en-US")}` : ""}</TableHead>
          <TableHead className="text-right">After{after.ledgerIndex ? ` · #${after.ledgerIndex.toLocaleString("en-US")}` : ""}</TableHead>
          <TableHead className="text-right">Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => {
          const d = BigInt(r.a) - BigInt(r.b);
          return (
            <TableRow key={i}>
              <TableCell>{r.label}</TableCell>
              <TableCell className="font-mono text-xs">{r.who} · {shortAddress(r.address)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.fmt(r.b)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.fmt(r.a)}</TableCell>
              <TableCell className={`text-right tabular-nums ${d > 0n ? "text-success" : d < 0n ? "text-destructive" : "text-muted-foreground"}`}>{signed(d, r.fmt)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
