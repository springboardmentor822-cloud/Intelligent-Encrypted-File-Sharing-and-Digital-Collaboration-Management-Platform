import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev-server port must match TS_FRONTEND_URL / TS_CORS_ORIGINS in
// backend/.env (http://localhost:5174).  OAuth callbacks and generated share
// links are built from that value, so a mismatch produces dead links.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true, proxy: { "/api": "http://localhost:8000" } },
  // The preview server must proxy /api as well, otherwise a production build
  // served with `vite preview` cannot reach the backend and every share link,
  // upload and admin call fails with "cannot reach the server".
  preview: { port: 5174, strictPort: true, proxy: { "/api": "http://localhost:8000" } },
});
