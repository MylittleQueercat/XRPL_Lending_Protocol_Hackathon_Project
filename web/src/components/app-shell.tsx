"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { routes, TRACK1 } from "@/lib/network";
import { Button } from "@/components/ui/button";
import { Logo, RaiseMark } from "@/components/logo";
import { NetworkBadge } from "@/components/network-badge";
import { WalletButton } from "@/components/wallet-button";
import { SubmissionRecovery } from "@/components/submission-recovery";

// Every screen is reachable from here. Screens never build their own navigation.
const NAV = [
  { href: routes.position, label: "My position" },
  { href: routes.market, label: "Market" },
  { href: routes.sell(), label: "Sell" },
  { href: routes.operator, label: "Operator" },
];

const REPO = "https://github.com/MylittleQueercat/XRPL_Lending_Protocol_Hackathon_Project";

// Shared product navigation and resources.
const FOOTER: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "My position", href: routes.position },
      { label: "Market", href: routes.market },
      { label: "Sell shares", href: routes.sell() },
      { label: "Operator console", href: routes.operator },
    ],
  },
  {
    title: "Protocol",
    links: [
      { label: "XLS-65 Single Asset Vault", href: "https://github.com/XRPLF/XRPL-Standards/discussions/192", external: true },
      { label: "XLS-66 Lending Protocol", href: "https://github.com/XRPLF/XRPL-Standards/discussions/190", external: true },
      { label: "XLS-56 Batch", href: "https://github.com/XRPLF/XRPL-Standards/discussions/162", external: true },
      { label: "Track 1 explorer", href: TRACK1.explorerUrl, external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Repository", href: REPO, external: true },
      { label: "Roadmap", href: `${REPO}/blob/main/docs/ROADMAP.md`, external: true },
      { label: "DevEx report", href: `${REPO}/blob/main/DEVEX_FEEDBACK.md`, external: true },
      { label: "Evidence", href: `${REPO}/tree/main/evidence`, external: true },
    ],
  },
];

function isActive(pathname: string, href: string) {
  const base = href.split("?")[0];
  return pathname === base || (base !== "/" && pathname.startsWith(base + "/"));
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <a href="#site-content" className="skip-link raise-focus">Skip to content</a>
      <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80" role="banner">
        <div className="mx-auto flex h-20 w-full max-w-layout-wide items-center justify-between px-4 md:px-6 lg:px-8">
          <div className="flex flex-grow items-center gap-10 md:flex-none">
            <Link href={routes.home} aria-label="Home" className="raise-focus rounded-sm">
              <Logo />
            </Link>
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn("raise-focus raise-nav rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground", active ? "bg-accent text-accent-foreground" : "text-muted-foreground")}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block"><NetworkBadge /></span>
            <Button size="icon" variant="ghost" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              <Sun className="dark:hidden" /><Moon className="hidden dark:block" />
            </Button>
            <WalletButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-3 lg:hidden" aria-label="Primary mobile">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={cn("raise-focus raise-nav rounded-full px-4 py-1.5 text-sm whitespace-nowrap transition-colors", active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-secondary")} aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main id="site-content" tabIndex={-1} className="relative z-0 flex-1 outline-none" role="main">
        <div className="mx-auto w-full max-w-layout px-4 md:px-6 lg:px-8"><SubmissionRecovery /></div>
        {pathname === routes.home ? children : <div className="mx-auto w-full max-w-layout px-4 py-10 md:px-6 lg:px-8 lg:py-16">{children}</div>}
      </main>

      <footer id="site-footer" role="contentinfo" className="bg-[#233d32] py-14 text-white lg:py-16">
        <div className="mx-auto grid w-full max-w-layout grid-cols-2 gap-x-4 gap-y-10 px-4 md:grid-cols-4 md:gap-x-8 md:px-6 lg:grid-cols-12 lg:gap-x-12 lg:px-8">
          <div className="col-span-full lg:col-span-3">
            <Link href={routes.home} aria-label="Home" className="inline-flex items-center gap-2.5">
              <RaiseMark className="h-7" />
              <span className="text-2xl font-medium tracking-[-0.5px]">Raise</span>
            </Link>
            <p className="body4 mt-6 max-w-xs text-white/70">A secondary market for XRPL vault shares. Exit a lending position when the vault cannot pay you out.</p>
          </div>
          {FOOTER.map((group) => (
            <div key={group.title} className="lg:col-span-3">
              <p className="mb-4 text-xs font-medium tracking-[0.08em] text-white/60 uppercase">{group.title}</p>
              <ul className="space-y-3">
                {group.links.map((link) => (
                  <li key={link.href}>
                    {link.external ? (
                      <a href={link.href} target="_blank" rel="noreferrer" className="body4 text-white/70 transition-colors hover:text-white">{link.label}</a>
                    ) : (
                      <Link href={link.href} className="body4 text-white/70 transition-colors hover:text-white">{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="col-span-full mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/15 pt-8 lg:mt-10">
            <p className="body4 text-white/60">© 2026 Raise. XRPL Lending Protocol Hackathon, Track 1. Built on the XRP Ledger.</p>
            <p className="body4 text-white/60">Test network {TRACK1.networkId} only. Not investment advice. Liquidity and returns are not guaranteed.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
