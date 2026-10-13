package com.restaurantpos.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugin for direct Wi-Fi ESC/POS printing (see EscPosPrinterPlugin).
        registerPlugin(EscPosPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
