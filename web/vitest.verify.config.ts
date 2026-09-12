import { defineConfig } from "vitest/config";
import path from "node:path";

// Live-network verification, kept out of the default test run: it funds a faucet wallet and
// submits a real transaction on network 4001 through the same code path the browser uses.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["verify/**/*.verify.ts"], testTimeout: 180_000, hookTimeout: 180_000 },
});
