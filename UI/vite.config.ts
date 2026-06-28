import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/hub": {
        target: "http://192.168.1.5:51429",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
