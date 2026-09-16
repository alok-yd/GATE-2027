import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { seedHistoricalData } from './services/HistoricalDataSeeder';
import './firebase'; // Initialize Firebase & Analytics

// Initialize and fill previous records/entries from progress report
seedHistoricalData();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);