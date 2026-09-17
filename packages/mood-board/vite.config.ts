import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react()],
  environments: {
    ssr: {
      build: {
        rollupOptions: {
          input: "./src/cloudflare/worker.ts",
        },
      },
    },
  },
  server: {
    watch: {
      ignored: ["**/.alchemy/**", "**/data/**"],
    },
  },
});
