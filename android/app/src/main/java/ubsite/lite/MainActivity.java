package ubsite.lite;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
    private static MainActivity instance;
    private WebView web;
    private Speech speech;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        speech = new Speech(this, (type, id) -> runOnUiThread(() -> emitTtsEvent(type, id)));

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
        if (web == null) return;
        web.evaluateJavascript("window.__liteTtsEvent&&window.__liteTtsEvent("
                + JSONObject.quote(type) + "," + JSONObject.quote(id) + ")", null);
    }

    private void emitCommand(String action) {
        if (web == null) return;
        web.evaluateJavascript("window.__liteNativeCommand&&window.__liteNativeCommand("
                + JSONObject.quote(action) + ")", null);
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
    protected void onDestroy() {
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
                public void speak(String id, String text, String language, String voice, double rate, double pitch, double volume) {
                    if (id == null || !id.matches("[0-9]+:[0-9]+") || text == null || text.isEmpty() || text.length() > 20000
                            || !("ru-RU".equals(language) || "en-US".equals(language))
                            || !Double.isFinite(rate) || rate < 0.6 || rate > 2
                            || !Double.isFinite(pitch) || pitch < 0.5 || pitch > 2
                            || !Double.isFinite(volume) || volume < 0 || volume > 1) {
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
