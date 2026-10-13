import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.restaurantpos.app',
  appName: 'Restaurant POS',
  webDir: 'dist',
  plugins: {
    // Live updates of the web part of the app, driven by our own code in
    // src/updates/liveUpdate.ts from this repository's GitHub releases.
    // Automatic mode and Capgo's cloud/statistics are switched off.
    CapacitorUpdater: {
      autoUpdate: false,
      statsUrl: '',
      appReadyTimeout: 15000,
      resetWhenUpdate: true,
    },
  },
  android: {
    // The app talks to the printer over a raw TCP socket from native code,
    // so the WebView itself never needs plain-HTTP access.
    allowMixedContent: false,
  },
};

export default config;
