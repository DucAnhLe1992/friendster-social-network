import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: '/',
  plugins: [command === 'serve' && inspectAttr(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Long-lived libraries get their own cacheable chunks, separate from app code that changes often.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return 'react';
          if (id.includes('@radix-ui') || id.includes('lucide-react')) return 'ui';
          if (id.includes('@tanstack') || id.includes('axios') || id.includes('zustand')) return 'data';
          if (id.includes('socket.io') || id.includes('engine.io')) return 'realtime';
          return undefined;
        },
      },
    },
  },
}));
