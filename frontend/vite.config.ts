import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = process.env.BACKEND_URL ?? "http://localhost:8000";
const https = process.env.DEV_HTTPS === "1";

export default defineConfig({
  plugins: [react(), ...(https ? [basicSsl()] : [])],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: backend, changeOrigin: false },
      "/ws": { target: backend, ws: true },
      "/django-admin": { target: backend },
      "/django-static": { target: backend },
    },
  },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: "node",
  },
});
