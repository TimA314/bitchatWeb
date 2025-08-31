import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { Capacitor } from '@capacitor/core';

// Initialize Capacitor
const initializeCapacitor = async () => {
  if (Capacitor.isNativePlatform()) {
    console.log('Running in Capacitor native app');
    // Additional native-specific initialization can go here
  } else {
    console.log('Running in web browser');
  }
};

initializeCapacitor();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
