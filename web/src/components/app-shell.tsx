"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/network";
import { Button } from "@/components/ui/button";
import { NetworkBadge } from "@/components/network-badge";
import { WalletButton } from "@/components/wallet-button";

// Every screen is reachable from here. Screens never build their own navigation.
const NAV = [
  { href: routes.position, label: "My position" },
  { href: routes.market, label: "Market" },
  { href: routes.sell(), label: "Sell" },
  { href: routes.operator, label: "Operator" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href={routes.home} className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">R</span>
            Raise
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV.map((item) => {
              const active = pathname === item.href.split("?")[0] || (item.href !== "/" && pathname.startsWith(item.href.split("?")[0] + "/"));
              return (
                <Link key={item.href} href={item.href} className={cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")} aria-current={active ? "page" : undefined}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <NetworkBadge />
            <Button size="icon" variant="ghost" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              <Sun className="dark:hidden" /><Moon className="hidden dark:block" />
            </Button>
            <WalletButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Primary mobile">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={cn("rounded-md px-3 py-1.5 text-sm whitespace-nowrap", pathname.startsWith(item.href.split("?")[0]) ? "bg-muted" : "text-muted-foreground")}>{item.label}</Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <span>Raise · XRPL Lending Protocol Hackathon · Track 1, Loaded</span>
          <span>Test network only. Not investment advice. Liquidity and returns are not guaranteed.</span>
        </div>
      </footer>
    </div>
  );
}
