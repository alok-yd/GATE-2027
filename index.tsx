import React from 'react';
import ReactDOM from 'react-dom/client';
import { installUserScopedStorage } from './services/UserScopedStorage';
import './firebase'; // Initialize the default Firebase app and its existing App Check integration.

// Install the UID-aware Storage adapter before importing application modules.
// CloudSyncService captures Storage methods during module evaluation.
installUserScopedStorage();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <main className="flex min-h-screen items-center justify-center bg-[#07152f] px-4 text-white">
    <p className="text-sm font-medium text-slate-300">Loading ACHIEVER securely…</p>
  </main>
);

// Import the application only after storage scoping is installed. This ensures
// no protected component reads another account's unscoped browser records.
void import('./App')
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch((error) => {
    console.error('[ACHIEVER] Application startup failed.', error);
    root.render(
      <main className="flex min-h-screen items-center justify-center bg-[#07152f] px-4 text-white">
        <p role="alert" className="max-w-lg text-center text-sm text-rose-200">
          ACHIEVER could not start securely. Refresh the page or contact support.
        </p>
      </main>
    );
  });
