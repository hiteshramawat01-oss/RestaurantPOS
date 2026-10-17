import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Bridge to the Android plugin in
 * android/app/src/main/java/com/restaurantpos/app/EscPosPrinterPlugin.java,
 * which opens a raw TCP socket (usually port 9100) to the printer.
 * Only available inside the installed Android app (APK), not in a browser.
 */
export interface BtDevice {
  name: string;
  address: string;
  /** Looks like a printer (device class or name). */
  printer: boolean;
}

export interface EscPosPrinterPlugin {
  /** Bluetooth devices already paired with the phone, printers first. */
  btPaired(): Promise<{ devices: BtDevice[] }>;
  btPrint(options: { address: string; data: string }): Promise<{ bytesSent: number }>;
  btCheck(options: { address: string }): Promise<{ reachable: boolean; error?: string }>;
  openBluetoothSettings(): Promise<void>;
  print(options: { host: string; port: number; data: string; timeoutMs?: number }): Promise<{ bytesSent: number }>;
  /** Find printers listening on `port` in the phone's Wi-Fi network (/24). */
  scan(options: { port?: number; timeoutMs?: number }): Promise<{
    localIp: string;
    network: string;
    printers: { host: string; port: number }[];
  }>;
  status(options: { host: string; port: number; timeoutMs?: number }): Promise<{
    reachable: boolean;
    statusByte?: number;
    paperOut?: boolean;
    paperNearEnd?: boolean;
    coverOpen?: boolean;
    offline?: boolean;
    error?: string;
  }>;
}

export const EscPosPrinter = registerPlugin<EscPosPrinterPlugin>('EscPosPrinter');

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePrintingAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('EscPosPrinter');
}
