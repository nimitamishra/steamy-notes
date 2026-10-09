import { defineConfig } from "vitest/config";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS=1 enables a self-signed cert so phones on the LAN get a secure context
// (camera/mic are blocked on plain http except for localhost).
export default defineConfig({
  base: "./",
  plugins: process.env.HTTPS ? [basicSsl()] : [],
  test: { environment: "node" },
});
