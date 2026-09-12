import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The API imports the shared domain modules from the repository root.
  turbopack: { root: path.resolve(__dirname, "..") },
  // Root modules use NodeNext .js specifiers; resolve their TypeScript sources in webpack.
  experimental: { extensionAlias: { ".js": [".ts", ".tsx", ".js"] } },
  serverExternalPackages: ["xrpl", "ripple-keypairs"],
  webpack(config, { isServer }) {
    if (isServer) {
      // Shared root imports otherwise bundle ws's optional native adapter as an empty module.
      const existing = Array.isArray(config.externals) ? config.externals : [config.externals];
      config.externals = [...existing.filter(Boolean), { xrpl: "commonjs xrpl", "ripple-keypairs": "commonjs ripple-keypairs", ws: "commonjs ws" }];
    }
    return config;
  },
};

export default nextConfig;
