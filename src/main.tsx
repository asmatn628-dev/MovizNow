import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {HelmetProvider} from 'react-helmet-async';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

// Register service worker for FCM
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then((registration) => {
        console.log('FCM Service Worker registered with scope:', registration.scope);
      })
      .catch((err) => {
        console.error('FCM Service Worker registration failed:', err);
      });
  });
}

// Handle Vite preload errors (dynamic import failures)
window.addEventListener('vite:preloadError', (event) => {
  console.error('Vite preload error:', event);
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HelmetProvider>
  </StrictMode>,
);
