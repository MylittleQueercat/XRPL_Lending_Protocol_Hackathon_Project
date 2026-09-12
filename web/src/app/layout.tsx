import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { WalletProvider } from "@/lib/wallet";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Raise", template: "%s · Raise" },
  description: "A secondary market for XRPL vault shares. Sell your position when the vault cannot fund your withdrawal.",
  applicationName: "Raise",
  keywords: ["XRPL", "XRP Ledger", "XLS-65", "XLS-66", "Single Asset Vault", "Lending Protocol", "Batch"],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5ec" },
    { media: "(prefers-color-scheme: dark)", color: "#19271f" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className="min-h-full">
        <ThemeProvider>
          <WalletProvider>
            <AppShell>{children}</AppShell>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
