import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppRoot from './App';
import './styles/global.scss';

// The header colour runs up behind the status bar, so its icons must be white.
if (Capacitor.isNativePlatform()) {
  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
);
