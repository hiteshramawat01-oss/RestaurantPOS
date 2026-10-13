import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.restaurantpos.app',
  appName: 'Restaurant POS',
  webDir: 'dist',
  android: {
    // The app talks to the printer over a raw TCP socket from native code,
    // so the WebView itself never needs plain-HTTP access.
    allowMixedContent: false,
  },
};

export default config;
