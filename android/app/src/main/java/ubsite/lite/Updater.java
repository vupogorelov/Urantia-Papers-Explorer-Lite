package ubsite.lite;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Downloads the signed update and passes it to Android's package installer. */
final class Updater {
    private static volatile boolean busy;

    static void start(MainActivity app, String url) {
        if (busy) return;
        busy = true;
        new Thread(() -> {
            try {
                install(app, url);
            } catch (Exception e) {
                String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                app.runOnUiThread(() -> app.emitUpdate("error:" + message));
            } finally {
                busy = false;
            }
        }, "app-update").start();
    }

    private static void install(MainActivity app, String url) throws Exception {
        if (!MainActivity.APK_URL.equals(url)) throw new Exception("Неверный адрес APK");
        PackageInstaller installer = app.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(app.getPackageName());
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id)) {
            HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setInstanceFollowRedirects(true);
            int response = connection.getResponseCode();
            if (response != HttpURLConnection.HTTP_OK) throw new Exception("HTTP " + response);
            long total = connection.getContentLengthLong();
            if (total > 150L * 1024 * 1024) throw new Exception("APK слишком большой");
            try (InputStream input = connection.getInputStream();
                 OutputStream output = session.openWrite("upexplorer.apk", 0, total)) {
                byte[] buffer = new byte[64 * 1024];
                long downloaded = 0;
                int previous = -1;
                for (int count; (count = input.read(buffer)) > 0; ) {
                    output.write(buffer, 0, count);
                    downloaded += count;
                    int percent = total > 0 ? (int) (downloaded * 100 / total) : -1;
                    if (percent >= 0 && percent != previous) {
                        previous = percent;
                        String progress = String.valueOf(percent);
                        app.runOnUiThread(() -> app.emitUpdate(progress));
                    }
                }
                session.fsync(output);
            } finally {
                connection.disconnect();
            }

            app.runOnUiThread(() -> app.emitUpdate("install"));
            Intent result = new Intent(app, Result.class);
            PendingIntent pending = PendingIntent.getBroadcast(app, id, result,
                    PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            session.commit(pending.getIntentSender());
        } catch (Exception e) {
            installer.abandonSession(id);
            throw e;
        }
    }

    public static final class Result extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent prompt = Build.VERSION.SDK_INT >= 33
                        ? intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class)
                        : intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (prompt != null) context.startActivity(prompt.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } else if (status != PackageInstaller.STATUS_SUCCESS) {
                String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                String error = status == PackageInstaller.STATUS_FAILURE_ABORTED
                        ? "cancelled" : (message == null ? "failed" : message);
                MainActivity activity = MainActivity.instance;
                if (activity != null) activity.runOnUiThread(() -> activity.emitUpdate("error:" + error));
            }
        }
    }
}
