import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Inside docker-compose the API lives at http://api:4000; locally it's
// http://localhost:4000. Configurable so the same image works in both.
const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // listen on 0.0.0.0 so the container port is reachable
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      "/socket.io": { target: apiTarget, changeOrigin: true, ws: true },
    },
  },
});
