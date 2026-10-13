// Injected at build time from package.json (see vite.config.ts).
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev';
export const BUILD_CHANNEL: 'test' | 'release' = typeof __BUILD_CHANNEL__ !== 'undefined' ? __BUILD_CHANNEL__ : 'release';
export const BUILD_NUMBER: number = typeof __BUILD_NUMBER__ !== 'undefined' ? __BUILD_NUMBER__ : 0;
export const BUILD_TIME: string = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';
