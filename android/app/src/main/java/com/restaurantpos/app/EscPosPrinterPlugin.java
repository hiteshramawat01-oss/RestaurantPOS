package com.restaurantpos.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PermissionState;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.ConnectException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.InetSocketAddress;
import java.net.NoRouteToHostException;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Sends raw ESC/POS bytes to a network thermal printer over TCP
 * (the "raw" / JetDirect protocol, usually port 9100).
 *
 * Jobs run one at a time on a single background thread because most
 * receipt printers accept only one connection at once.
 *
 * Note: this app targets SDK 36, where local-network access comes with the
 * INTERNET permission. If targetSdkVersion is ever raised to 37+, declare
 * and request android.permission.ACCESS_LOCAL_NETWORK, or printing will fail.
 */
// Bluetooth calls are only made after needsBtPermission() has been checked.
@SuppressLint("MissingPermission")
@CapacitorPlugin(
    name = "EscPosPrinter",
    permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) }
)
public class EscPosPrinterPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final ExecutorService btExecutor = Executors.newSingleThreadExecutor();

    /** Serial Port Profile: the standard channel of Bluetooth receipt printers. */
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private static final int DEFAULT_PORT = 9100;
    private static final int DEFAULT_TIMEOUT_MS = 5000;

    @PluginMethod
    public void print(PluginCall call) {
        final String host = call.getString("host", "").trim();
        final int port = call.getInt("port", DEFAULT_PORT);
        final int timeout = call.getInt("timeoutMs", DEFAULT_TIMEOUT_MS);
        final String data = call.getString("data");

        if (host.isEmpty()) {
            call.reject("Printer IP address is not set", "NO_HOST");
            return;
        }
        if (data == null || data.isEmpty()) {
            call.reject("Nothing to print", "NO_DATA");
            return;
        }

        final byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Print data is corrupted", "BAD_DATA", e);
            return;
        }

        executor.execute(() -> {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host, port), timeout);
                socket.setSoTimeout(timeout);
                socket.setTcpNoDelay(true);
                OutputStream out = socket.getOutputStream();
                out.write(bytes);
                out.flush();
                // Half-close and give the printer a moment to drain its buffer;
                // closing immediately makes some models drop the end of the job.
                socket.shutdownOutput();
                sleep(200);
                JSObject result = new JSObject();
                result.put("bytesSent", bytes.length);
                call.resolve(result);
            } catch (Exception e) {
                rejectWithReason(call, host, port, e);
            }
        });
    }

    /**
     * Reachability plus, when the printer answers, ESC/POS real-time status
     * (DLE EOT). Printers that do not answer are reported reachable without
     * paper/cover details.
     */
    @PluginMethod
    public void status(PluginCall call) {
        final String host = call.getString("host", "").trim();
        final int port = call.getInt("port", DEFAULT_PORT);
        final int timeout = call.getInt("timeoutMs", 3000);

        if (host.isEmpty()) {
            call.reject("Printer IP address is not set", "NO_HOST");
            return;
        }

        executor.execute(() -> {
            JSObject result = new JSObject();
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host, port), timeout);
                socket.setSoTimeout(1500);
                OutputStream out = socket.getOutputStream();
                InputStream in = socket.getInputStream();
                result.put("reachable", true);

                Integer printer = query(out, in, 1); // printer status
                if (printer != null) {
                    result.put("statusByte", printer);
                    result.put("offline", (printer & 0x08) != 0);
                    Integer offline = query(out, in, 2); // offline cause
                    if (offline != null) {
                        result.put("coverOpen", (offline & 0x04) != 0);
                    }
                    Integer paper = query(out, in, 4); // roll paper sensor
                    if (paper != null) {
                        result.put("paperNearEnd", (paper & 0x0C) != 0);
                        result.put("paperOut", (paper & 0x60) != 0);
                    }
                }
                call.resolve(result);
            } catch (Exception e) {
                result.put("reachable", false);
                result.put("error", describe(host, port, e));
                call.resolve(result);
            }
        });
    }

    private static Integer query(OutputStream out, InputStream in, int n) {
        try {
            out.write(new byte[] {0x10, 0x04, (byte) n});
            out.flush();
            int b = in.read();
            return b < 0 ? null : b;
        } catch (IOException e) {
            return null;
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    private static String describe(String host, int port, Exception e) {
        if (e instanceof SocketTimeoutException) return "Connection timed out (" + host + ":" + port + ")";
        if (e instanceof ConnectException) return "Connection refused by " + host + ":" + port;
        if (e instanceof NoRouteToHostException) return "Printer unreachable (no route to " + host + ")";
        if (e instanceof UnknownHostException) return "Unknown host " + host;
        String m = e.getMessage();
        if (m != null && m.toLowerCase().contains("unreachable")) return "Network unreachable. Is Wi-Fi on?";
        return m != null ? m : e.getClass().getSimpleName();
    }

    private static void rejectWithReason(PluginCall call, String host, int port, Exception e) {
        String code = e instanceof SocketTimeoutException ? "TIMEOUT"
                : e instanceof ConnectException ? "REFUSED"
                : e instanceof NoRouteToHostException ? "UNREACHABLE"
                : e instanceof UnknownHostException ? "UNKNOWN_HOST"
                : "IO";
        call.reject(describe(host, port, e), code, e);
    }

    /**
     * Find printers on the same Wi-Fi network as this phone: every address in
     * the phone's local /24 network is tried on the printer port (usually 9100,
     * the standard raw-printing port of network receipt printers). Takes a few
     * seconds. No extra Android permission is needed for this.
     */
    @PluginMethod
    public void scan(PluginCall call) {
        final int port = call.getInt("port", DEFAULT_PORT);
        final int timeout = Math.max(150, Math.min(2000, call.getInt("timeoutMs", 500)));

        final Inet4Address local = localWifiAddress();
        if (local == null) {
            call.reject("This phone is not connected to a Wi-Fi network", "NO_WIFI");
            return;
        }
        final byte[] ip = local.getAddress();
        final String prefix = (ip[0] & 0xff) + "." + (ip[1] & 0xff) + "." + (ip[2] & 0xff) + ".";
        final int self = ip[3] & 0xff;

        new Thread(() -> {
            ExecutorService pool = Executors.newFixedThreadPool(48);
            final List<Integer> found = Collections.synchronizedList(new ArrayList<>());
            for (int i = 1; i <= 254; i++) {
                if (i == self) continue;
                final int host = i;
                pool.execute(() -> {
                    try (Socket socket = new Socket()) {
                        socket.connect(new InetSocketAddress(prefix + host, port), timeout);
                        found.add(host);
                    } catch (IOException ignored) {
                        // nothing listening there
                    }
                });
            }
            pool.shutdown();
            try {
                pool.awaitTermination(30, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            List<Integer> sorted;
            synchronized (found) {
                sorted = new ArrayList<>(found);
            }
            Collections.sort(sorted);
            JSArray printers = new JSArray();
            for (int h : sorted) {
                JSObject p = new JSObject();
                p.put("host", prefix + h);
                p.put("port", port);
                printers.put(p);
            }
            JSObject result = new JSObject();
            result.put("localIp", local.getHostAddress());
            result.put("network", prefix + "0/24");
            result.put("printers", printers);
            call.resolve(result);
        }, "printer-scan").start();
    }

    /** The phone's own IPv4 address on Wi-Fi (or Ethernet), if connected. */
    private static Inet4Address localWifiAddress() {
        Inet4Address fallback = null;
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback() || nif.isVirtual()) continue;
                String name = nif.getName() == null ? "" : nif.getName();
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("tun") || name.startsWith("dummy")) continue;
                for (InterfaceAddress ia : nif.getInterfaceAddresses()) {
                    InetAddress a = ia.getAddress();
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress() || a.isLinkLocalAddress()) continue;
                    // Wi-Fi / Ethernet: any normal IPv4 address. Other interfaces only if private (LAN) addresses.
                    if (name.startsWith("wlan") || name.startsWith("eth")) return (Inet4Address) a;
                    if (fallback == null && a.isSiteLocalAddress()) fallback = (Inet4Address) a;
                }
            }
        } catch (Exception ignored) {
            // treated as "not connected"
        }
        return fallback;
    }

    // ------------------------------------------------------------------
    // Bluetooth (classic SPP) printers, e.g. portable 58 mm bill printers.
    // The printer is paired once in the phone's Bluetooth settings; the app
    // lists paired devices and prints to the chosen one.
    // ------------------------------------------------------------------

    /** Android 12+ needs the "Nearby devices" permission to talk to paired devices. */
    private boolean needsBtPermission() {
        return Build.VERSION.SDK_INT >= 31 && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    @PermissionCallback
    private void btPermissionCallback(PluginCall call) {
        if (needsBtPermission()) {
            call.reject("Allow \"Nearby devices\" for this app to use the Bluetooth printer.", "BT_PERMISSION");
            return;
        }
        switch (call.getMethodName()) {
            case "btPaired": btPaired(call); break;
            case "btPrint": btPrint(call); break;
            case "btCheck": btCheck(call); break;
            default: call.reject("Unknown call", "UNKNOWN");
        }
    }

    private BluetoothAdapter adapter(PluginCall call) {
        BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter a = bm == null ? null : bm.getAdapter();
        if (a == null) {
            call.reject("This phone has no Bluetooth.", "BT_NONE");
            return null;
        }
        if (!a.isEnabled()) {
            call.reject("Bluetooth is off. Turn it on and try again.", "BT_OFF");
            return null;
        }
        return a;
    }

    /** Paired (bonded) Bluetooth devices; printers first. */
    @PluginMethod
    public void btPaired(PluginCall call) {
        if (needsBtPermission()) {
            requestPermissionForAlias("bluetooth", call, "btPermissionCallback");
            return;
        }
        BluetoothAdapter a = adapter(call);
        if (a == null) return;
        try {
            Set<BluetoothDevice> bonded = a.getBondedDevices();
            JSArray printers = new JSArray();
            JSArray others = new JSArray();
            if (bonded != null) {
                for (BluetoothDevice d : bonded) {
                    String name = d.getName();
                    BluetoothClass c = d.getBluetoothClass();
                    boolean imaging = c != null && c.getMajorDeviceClass() == BluetoothClass.Device.Major.IMAGING;
                    String n = name == null ? "" : name.toLowerCase();
                    boolean looksLikePrinter = imaging || n.contains("print") || n.contains("pos") || n.contains("bill")
                        || n.contains("receipt") || n.contains("thermal") || n.startsWith("mpt") || n.startsWith("rpp");
                    JSObject o = new JSObject();
                    o.put("name", name == null || name.isEmpty() ? d.getAddress() : name);
                    o.put("address", d.getAddress());
                    o.put("printer", looksLikePrinter);
                    (looksLikePrinter ? printers : others).put(o);
                }
            }
            for (int i = 0; i < others.length(); i++) printers.put(others.opt(i));
            JSObject result = new JSObject();
            result.put("devices", printers);
            call.resolve(result);
        } catch (SecurityException e) {
            call.reject("Allow \"Nearby devices\" for this app to use the Bluetooth printer.", "BT_PERMISSION", e);
        }
    }

    @PluginMethod
    public void btPrint(PluginCall call) {
        if (needsBtPermission()) {
            requestPermissionForAlias("bluetooth", call, "btPermissionCallback");
            return;
        }
        final String address = call.getString("address", "").trim();
        final String data = call.getString("data");
        if (address.isEmpty()) {
            call.reject("No Bluetooth printer chosen yet.", "NO_PRINTER");
            return;
        }
        if (data == null || data.isEmpty()) {
            call.reject("Nothing to print", "NO_DATA");
            return;
        }
        final byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Print data is corrupted", "BAD_DATA", e);
            return;
        }
        final BluetoothAdapter a = adapter(call);
        if (a == null) return;

        btExecutor.execute(() -> {
            BluetoothSocket socket = null;
            try {
                socket = connect(a, address);
                OutputStream out = socket.getOutputStream();
                // Small chunks: portable printers have small buffers.
                for (int off = 0; off < bytes.length; off += 256) {
                    out.write(bytes, off, Math.min(256, bytes.length - off));
                    out.flush();
                    sleep(15);
                }
                // Let the printer receive everything before the link closes.
                sleep(Math.min(3000, 500 + bytes.length / 4));
                JSObject result = new JSObject();
                result.put("bytesSent", bytes.length);
                call.resolve(result);
            } catch (SecurityException e) {
                call.reject("Allow \"Nearby devices\" for this app to use the Bluetooth printer.", "BT_PERMISSION", e);
            } catch (Exception e) {
                call.reject("Could not connect to the Bluetooth printer. Check it is switched on, charged and paired with this phone.", "BT_CONNECT", e);
            } finally {
                closeQuietly(socket);
            }
        });
    }

    /** Try to connect to the printer and disconnect again. */
    @PluginMethod
    public void btCheck(PluginCall call) {
        if (needsBtPermission()) {
            requestPermissionForAlias("bluetooth", call, "btPermissionCallback");
            return;
        }
        final String address = call.getString("address", "").trim();
        final BluetoothAdapter a = adapter(call);
        if (a == null) return;
        btExecutor.execute(() -> {
            BluetoothSocket socket = null;
            JSObject result = new JSObject();
            try {
                socket = connect(a, address);
                result.put("reachable", true);
            } catch (Exception e) {
                result.put("reachable", false);
                result.put("error", "Could not connect. Check the printer is switched on, charged and paired with this phone.");
            } finally {
                closeQuietly(socket);
            }
            call.resolve(result);
        });
    }

    /** Opens the phone's Bluetooth settings so the printer can be paired. */
    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open Bluetooth settings", "NO_SETTINGS", e);
        }
    }

    /**
     * Connect over SPP. Cheap printers differ, so try the standard secure
     * socket, then the insecure one, then the raw channel 1 that many of them use.
     */
    private static BluetoothSocket connect(BluetoothAdapter a, String address) throws IOException {
        BluetoothDevice device = a.getRemoteDevice(address);
        try {
            a.cancelDiscovery(); // discovery slows connections down
        } catch (SecurityException ignored) {
            // needs the scan permission on Android 12+; not essential
        }
        IOException last = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            BluetoothSocket s = null;
            try {
                if (attempt == 0) s = device.createRfcommSocketToServiceRecord(SPP_UUID);
                else if (attempt == 1) s = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                else {
                    Method m = device.getClass().getMethod("createRfcommSocket", int.class);
                    s = (BluetoothSocket) m.invoke(device, 1);
                }
                s.connect();
                return s;
            } catch (IOException e) {
                last = e;
                closeQuietly(s);
                sleep(300);
            } catch (ReflectiveOperationException e) {
                closeQuietly(s);
            }
        }
        throw last != null ? last : new IOException("Bluetooth connection failed");
    }

    private static void closeQuietly(BluetoothSocket s) {
        if (s == null) return;
        try {
            s.close();
        } catch (IOException ignored) {
            // already closed
        }
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdown();
        btExecutor.shutdown();
        super.handleOnDestroy();
    }
}
