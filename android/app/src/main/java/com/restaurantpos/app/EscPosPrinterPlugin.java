package com.restaurantpos.app;

import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
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
@CapacitorPlugin(name = "EscPosPrinter")
public class EscPosPrinterPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

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

    @Override
    protected void handleOnDestroy() {
        executor.shutdown();
        super.handleOnDestroy();
    }
}
