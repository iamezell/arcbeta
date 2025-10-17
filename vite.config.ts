import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: './src',
  build: {
    outDir: '../public/js',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'arc-client': resolve(__dirname, 'src/arc-client.ts'),
        'fps-controller': resolve(__dirname, 'src/fps-controller.ts'),
        'socket-client': resolve(__dirname, 'src/socket-client.ts')
      },
      output: {
        entryFileNames: '[name].js',
        format: 'es'
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'https://localhost:443',
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  }
});

