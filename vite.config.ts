import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['screenshot-desktop.svg', 'screenshot-mobile.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          name: 'MovizNow',
          short_name: 'MovizNow',
          description: 'Your premium movie and series streaming platform',
          id: '/',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          orientation: 'portrait',
          dir: 'ltr',
          lang: 'en-US',
          categories: ['entertainment', 'video', 'movies'],
          iarc_rating_id: 'e',
          related_applications: [],
          prefer_related_applications: false,
          shortcuts: [
            {
              name: 'Home',
              short_name: 'Home',
              description: 'Go to Home',
              url: '/',
              icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }]
            }
          ],
          screenshots: [
            {
              src: 'screenshot-desktop.svg',
              sizes: '1920x1080',
              type: 'image/svg+xml',
              form_factor: 'wide'
            },
            {
              src: 'screenshot-mobile.svg',
              sizes: '1080x1920',
              type: 'image/svg+xml',
              form_factor: 'narrow'
            }
          ],
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
