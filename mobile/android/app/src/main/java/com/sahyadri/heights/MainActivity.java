package com.sahyadri.heights;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SahyadriNfcPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
