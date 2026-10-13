package com.restaurantpos.app;

import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.net.NoRouteToHostException;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

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

    @Override
    protected void handleOnDestroy() {
        executor.shutdown();
        super.handleOnDestroy();
    }
}
