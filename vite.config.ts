import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split large dependency groups so the main entry bundle stays smaller.
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (
            id.includes("react-dom") ||
            id.includes("react-router") ||
            /[\\/]node_modules[\\/](react|scheduler)[\\/]/.test(id)
          ) {
            return "react-vendor";
          }

          if (id.includes("leaflet") || id.includes("react-leaflet")) {
            return "map-vendor";
          }

          if (id.includes("recharts")) {
            return "charts-vendor";
          }

          if (id.includes("react-hook-form") || id.includes("@hookform")) {
            return "form-vendor";
          }

          if (
            id.includes("@supabase") ||
            id.includes("@tanstack") ||
            id.includes("zod") ||
            id.includes("date-fns")
          ) {
            return "data-vendor";
          }

          if (
            id.includes("@radix-ui") ||
            id.includes("lucide-react") ||
            id.includes("framer-motion") ||
            id.includes("class-variance-authority") ||
            id.includes("clsx") ||
            id.includes("tailwind-merge") ||
            id.includes("tailwindcss-animate") ||
            id.includes("cmdk") ||
            id.includes("embla-carousel-react") ||
            id.includes("vaul") ||
            id.includes("sonner")
          ) {
            return "ui-vendor";
          }

          return "vendor";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
