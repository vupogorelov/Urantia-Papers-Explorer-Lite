package ubsite.lite;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayDeque;

/** A small, local-only ring buffer for Android TTS events. It never stores spoken text. */
final class TtsDiagnostics {
    private static final String PREFS = "tts_diagnostics";
    private static final String KEY = "events";
    private static final int LIMIT = 400;
    private static final long FLUSH_DELAY_MS = 500;

    private final SharedPreferences preferences;
    private final ArrayDeque<JSONObject> entries = new ArrayDeque<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean flushPending;

    TtsDiagnostics(Context context) {
        preferences = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray saved = new JSONArray(preferences.getString(KEY, "[]"));
            for (int i = Math.max(0, saved.length() - LIMIT); i < saved.length(); i++) {
                JSONObject entry = saved.optJSONObject(i);
                if (entry != null) entries.addLast(entry);
            }
        } catch (JSONException ignored) {
            // A damaged old log must not prevent speech from working.
        }
    }

    synchronized void add(String event, String details) {
        try {
            entries.addLast(new JSONObject()
                    .put("at", System.currentTimeMillis())
                    .put("event", event)
                    .put("details", details == null ? "" : details));
            while (entries.size() > LIMIT) entries.removeFirst();
        } catch (JSONException ignored) {
            return;
        }
        if (!flushPending) {
            flushPending = true;
            handler.postDelayed(this::flush, FLUSH_DELAY_MS);
        }
    }

    synchronized String read() {
        return toJson().toString();
    }

    synchronized void clear() {
        handler.removeCallbacksAndMessages(null);
        flushPending = false;
        entries.clear();
        flushNow();
    }

    synchronized void flush() {
        flushPending = false;
        flushNow();
    }

    private JSONArray toJson() {
        JSONArray result = new JSONArray();
        for (JSONObject entry : entries) result.put(entry);
        return result;
    }

    private void flushNow() {
        preferences.edit().putString(KEY, toJson().toString()).apply();
    }
}
