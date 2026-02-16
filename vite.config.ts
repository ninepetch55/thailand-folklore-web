import { defineConfig } from 'vite';

export default defineConfig({
    worker: {
        format: 'es',
        plugins: () => [],
    },
    optimizeDeps: {
        exclude: ['@sqlite.org/sqlite-wasm'],
    },
    build: {
        rollupOptions: {
            input: {
                main: 'index.html', // Standard Astro/Vite entry
                'db-worker': 'src/workers/db-worker.ts', // Explicit worker entry
            },
            output: {
                entryFileNames: 'assets/[name]-[hash].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]',
            },
        },
    },
    server: {
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
    },
});