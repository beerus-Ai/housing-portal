package com.sahyadri.heights;

import android.app.Activity;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.Ndef;
import android.nfc.tech.NdefFormatable;
import android.os.Bundle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Minimal NDEF reader/writer using reader mode (no foreground dispatch, no intent filters needed).
 * Tag contents are never logged.
 */
@CapacitorPlugin(name = "SahyadriNfc")
public class SahyadriNfcPlugin extends Plugin {
    private static final int FLAGS = NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B
            | NfcAdapter.FLAG_READER_NFC_F | NfcAdapter.FLAG_READER_NFC_V | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK;

    private PluginCall pending;
    private String writeText;

    private NfcAdapter adapter() {
        return NfcAdapter.getDefaultAdapter(getContext());
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        NfcAdapter a = adapter();
        JSObject r = new JSObject();
        r.put("supported", a != null);
        r.put("enabled", a != null && a.isEnabled());
        call.resolve(r);
    }

    @PluginMethod
    public void read(PluginCall call) {
        start(call, null);
    }

    @PluginMethod
    public void write(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.isEmpty()) {
            call.reject("Nothing to write");
            return;
        }
        start(call, text);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        finish();
        call.resolve();
    }

    private void start(PluginCall call, String text) {
        NfcAdapter a = adapter();
        if (a == null) { call.reject("unsupported"); return; }
        if (!a.isEnabled()) { call.reject("disabled"); return; }
        Activity act = getActivity();
        if (act == null) { call.reject("unavailable"); return; }
        finish();
        bridge.saveCall(call);
        pending = call;
        writeText = text;
        Bundle opts = new Bundle();
        opts.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250);
        act.runOnUiThread(() -> {
            try {
                a.enableReaderMode(act, this::onTag, FLAGS, opts);
            } catch (Exception e) {
                settle(null, "unavailable");
            }
        });
    }

    private void onTag(Tag tag) {
        String text = writeText;
        try {
            if (text == null) settle(readTag(tag), null);
            else { writeTag(tag, text); settle(new JSObject(), null); }
        } catch (Exception e) {
            settle(null, text == null ? "read_failed" : "write_failed");
        }
    }

    private JSObject readTag(Tag tag) throws Exception {
        Ndef ndef = Ndef.get(tag);
        NdefMessage msg = ndef == null ? null : ndef.getCachedNdefMessage();
        if (ndef != null && msg == null) {
            ndef.connect();
            try { msg = ndef.getNdefMessage(); } finally { ndef.close(); }
        }
        JSObject r = new JSObject();
        if (msg == null || msg.getRecords().length == 0) { r.put("text", ""); r.put("empty", true); return r; }
        r.put("text", recordText(msg.getRecords()[0]));
        return r;
    }

    private static String recordText(NdefRecord rec) {
        byte[] p = rec.getPayload();
        if (rec.getTnf() == NdefRecord.TNF_WELL_KNOWN && Arrays.equals(rec.getType(), NdefRecord.RTD_TEXT) && p.length > 0) {
            int lang = p[0] & 0x3F;
            java.nio.charset.Charset cs = (p[0] & 0x80) == 0 ? StandardCharsets.UTF_8 : StandardCharsets.UTF_16;
            return new String(p, 1 + lang, Math.max(0, p.length - 1 - lang), cs);
        }
        if (rec.getTnf() == NdefRecord.TNF_WELL_KNOWN && Arrays.equals(rec.getType(), NdefRecord.RTD_URI)) {
            android.net.Uri u = rec.toUri();
            if (u != null) return u.toString();
        }
        return new String(p, StandardCharsets.UTF_8);
    }

    private void writeTag(Tag tag, String text) throws Exception {
        NdefMessage msg = new NdefMessage(new NdefRecord[] { NdefRecord.createTextRecord("en", text) });
        Ndef ndef = Ndef.get(tag);
        if (ndef != null) {
            ndef.connect();
            try {
                if (!ndef.isWritable()) throw new Exception("read only");
                if (ndef.getMaxSize() < msg.toByteArray().length) throw new Exception("too small");
                ndef.writeNdefMessage(msg);
            } finally { ndef.close(); }
            return;
        }
        NdefFormatable f = NdefFormatable.get(tag);
        if (f == null) throw new Exception("unsupported tag");
        f.connect();
        try { f.format(msg); } finally { f.close(); }
    }

    private synchronized void settle(JSObject ok, String err) {
        PluginCall c = pending;
        pending = null;
        writeText = null;
        disable();
        if (c == null) return;
        if (err != null) c.reject(err); else c.resolve(ok);
        bridge.releaseCall(c);
    }

    private synchronized void finish() {
        PluginCall c = pending;
        pending = null;
        writeText = null;
        disable();
        if (c != null) { c.reject("cancelled"); bridge.releaseCall(c); }
    }

    private void disable() {
        NfcAdapter a = adapter();
        Activity act = getActivity();
        if (a == null || act == null) return;
        act.runOnUiThread(() -> { try { a.disableReaderMode(act); } catch (Exception ignored) { } });
    }

    @Override
    protected void handleOnPause() { finish(); }
}
