
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Dynamic version in development: `npm run dev:api` serves the functions of /api on port 3001.
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  }
});
