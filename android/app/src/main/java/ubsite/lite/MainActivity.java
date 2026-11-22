package ubsite.lite;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.content.pm.PackageInfo;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final String START_URL = "https://appassets.androidplatform.net/assets/www/index.html";
    static final String APK_URL = "https://github.com/vupogorelov/Urantia-Papers-Explorer-Lite/releases/latest/download/upexplorer.apk";
    static MainActivity instance;
    private WebView web;
    private Speech speech;
    private TtsDiagnostics ttsDiagnostics;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        ttsDiagnostics = new TtsDiagnostics(this);
        ttsDiagnostics.add("app.created", "sdk=" + Build.VERSION.SDK_INT);
        speech = new Speech(this, (type, id) -> runOnUiThread(() -> emitTtsEvent(type, id)), ttsDiagnostics);

        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setTextZoom(100);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new SystemBars(), "NativeBars");
        web.addJavascriptInterface(new NativeSpeech(), "NativeTts");
        web.addJavascriptInterface(new NativeUpdates(), "NativeApp");

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return !"appassets.androidplatform.net".equals(uri.getHost())
                        || !"/assets".equals(uri.getPath()) && !uri.getPath().startsWith("/assets/");
            }
        });
        setContentView(web);
        web.loadUrl(START_URL);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7);
        }
    }

    static void command(String action) {
        MainActivity activity = instance;
        if (activity != null) activity.runOnUiThread(() -> activity.emitCommand(action));
    }

    private void emitTtsEvent(String type, String id) {
        if (web == null) {
            ttsDiagnostics.add("bridge.event.dropped", "type=" + type + " id=" + id + " reason=webview_unavailable");
            return;
        }
        if ("error".equals(type) || isDiagnosticId(id)) {
            ttsDiagnostics.add("bridge.event.dispatch", "type=" + type + " id=" + id);
        }
        web.evaluateJavascript("window.__liteTtsEvent&&window.__liteTtsEvent("
                + JSONObject.quote(type) + "," + JSONObject.quote(id) + ")", null);
    }

    private boolean isDiagnosticId(String id) {
        try {
            long value = Long.parseLong(id);
            return value <= 5 || value % 25 == 0;
        } catch (NumberFormatException ignored) {
            return false;
        }
    }

    private void emitCommand(String action) {
        if (web == null) return;
        web.evaluateJavascript("window.__liteNativeCommand&&window.__liteNativeCommand("
                + JSONObject.quote(action) + ")", null);
    }

    void emitUpdate(String state) {
        if (web == null) return;
        web.evaluateJavascript("window.__liteUpdateEvent&&window.__liteUpdateEvent(" + JSONObject.quote(state) + ")", null);
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript(
                "(function(){return window.__liteHandleBack ? window.__liteHandleBack() : false})()",
                handled -> {
                    if (!"true".equals(handled)) {
                        MainActivity.super.onBackPressed();
                    }
                });
    }

    @Override
    protected void onStop() {
        if (ttsDiagnostics != null) {
            ttsDiagnostics.add("app.stopped", "lifecycle=onStop");
            ttsDiagnostics.flush();
        }
        super.onStop();
    }

    @Override
    protected void onDestroy() {
                if (ttsDiagnostics != null) ttsDiagnostics.flush();
                instance = null;
                if (speech != null) speech.shutdown();
                if (web != null) {
                    web.destroy();
                    web = null;
                }
                super.onDestroy();
    }

    private final class NativeSpeech {
                @JavascriptInterface
                public String voices() {
                    return speech.voices();
                }

                @JavascriptInterface
                public String diagnostics() {
                    return ttsDiagnostics.read();
                }

                @JavascriptInterface
                public void clearDiagnostics() {
                    ttsDiagnostics.clear();
                    ttsDiagnostics.add("diagnostics.cleared", "source=app");
                }

                @JavascriptInterface
                public void speak(String id, String text, String language, String voice, double rate, double pitch, double volume) {
                    if (id == null || !id.matches("[0-9]+") || text == null || text.isEmpty() || text.length() > 20000
                            || !("ru-RU".equals(language) || "en-US".equals(language))
                            || !Double.isFinite(rate) || rate < 0.6 || rate > 2
                            || !Double.isFinite(pitch) || pitch < 0.5 || pitch > 2
                            || !Double.isFinite(volume) || volume < 0 || volume > 1) {
                        ttsDiagnostics.add("bridge.speak.rejected", "id=" + id + " lang=" + language + " chars=" + (text == null ? -1 : text.length()));
                        runOnUiThread(() -> emitTtsEvent("error", id == null ? "" : id));
                        return;
                    }
                    speech.speak(id, text, language, voice == null ? "" : voice, (float) rate, (float) pitch, (float) volume);
                }

                @JavascriptInterface
                public void cancel() {
                    speech.cancel();
                }

                @JavascriptInterface
                public void player(boolean playing) {
                    PlayerService.update(MainActivity.this, playing);
                }

                @JavascriptInterface
                public void meta(String title, String subtitle) {
                    PlayerService.metadata(MainActivity.this, title, subtitle);
                }

                @JavascriptInterface
                public void end() {
                    PlayerService.end(MainActivity.this);
                }
    }

    private final class NativeUpdates {
        @JavascriptInterface
        public String appVersion() {
            try {
                PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                return info.versionName == null ? "" : info.versionName;
            } catch (Exception ignored) {
                return "";
            }
        }

        @JavascriptInterface
        public int appVersionCode() {
            try {
                PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                        ? (int) info.getLongVersionCode()
                        : info.versionCode;
            } catch (Exception ignored) {
                return 0;
            }
        }

        @JavascriptInterface
        public void installApp(String url) {
            if (!APK_URL.equals(url)) return;
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        && !getPackageManager().canRequestPackageInstalls()) {
                    Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getPackageName()));
                    startActivity(settings);
                    emitUpdate("permission");
                    return;
                }
                Updater.start(MainActivity.this, APK_URL);
            });
        }
    }

    private final class SystemBars {
        @JavascriptInterface
        public void setSystemBars(String statusColor, String navigationColor, boolean lightIcons) {
            if (statusColor == null || !statusColor.matches("#[0-9a-fA-F]{6}")
                    || navigationColor == null || !navigationColor.matches("#[0-9a-fA-F]{6}")) {
                return;
            }
            runOnUiThread(() -> {
                getWindow().setStatusBarColor(Color.parseColor(statusColor));
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    getWindow().setNavigationBarColor(Color.parseColor(navigationColor));
                }
                View decor = getWindow().getDecorView();
                int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                }
                int visibility = decor.getSystemUiVisibility();
                decor.setSystemUiVisibility(lightIcons ? visibility | flags : visibility & ~flags);
            });
        }
    }
}
