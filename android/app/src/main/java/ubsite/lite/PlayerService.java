package ubsite.lite;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;

public final class PlayerService extends Service {
    static final String PLAY = "play";
    static final String PAUSE = "pause";
    static final String NEXT = "next";
    static final String PREVIOUS = "prev";
    static final String CLOSE = "close";
    private static final String CHANNEL = "lite-reading";
    private static final int NOTIFICATION_ID = 1;
    private static volatile boolean playing;
    private static volatile String title = "Книга Урантии";
    private static volatile String subtitle = "Озвучивание текста";
    private static volatile PlayerService instance;
    private static volatile boolean starting;
    private static volatile boolean stopPending;
    private MediaSession mediaSession;

    private final BroadcastReceiver audioBecomingNoisy = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent.getAction()) && playing) {
                MainActivity.command(PAUSE);
            }
        }
    };

    static void update(Context context, boolean isPlaying) {
        playing = isPlaying;
        if (instance != null) {
            instance.refresh();
        } else if (isPlaying && !starting) {
            starting = true;
            stopPending = false;
            Intent intent = new Intent(context, PlayerService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
            else context.startService(intent);
        }
    }

    static void metadata(Context context, String newTitle, String newSubtitle) {
        title = newTitle == null ? "Книга Урантии" : newTitle;
        subtitle = newSubtitle == null ? "Озвучивание текста" : newSubtitle;
        if (instance != null) instance.refresh();
    }

    static void end(Context context) {
        playing = false;
        if (starting) {
            stopPending = true;
            return;
        }
        context.stopService(new Intent(context, PlayerService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(CHANNEL, getString(R.string.tts_channel), NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
        mediaSession = new MediaSession(this, "Lite TTS");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { MainActivity.command(PLAY); }
            @Override public void onPause() { MainActivity.command(PAUSE); }
            @Override public void onSkipToNext() { MainActivity.command(NEXT); }
            @Override public void onSkipToPrevious() { MainActivity.command(PREVIOUS); }
            @Override public void onStop() { MainActivity.command(PAUSE); }
        });
        mediaSession.setSessionActivity(openApplication());
        mediaSession.setActive(true);
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(audioBecomingNoisy, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(audioBecomingNoisy, filter);
        // Publish the service only after its MediaSession is fully initialized.
        // The WebView bridge can call metadata() from another thread at any time.
        instance = this;
    }

    @Override
    public synchronized int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        starting = false;
        if (stopPending) {
            stopPending = false;
            stopSelf();
            return START_NOT_STICKY;
        }
        String action = intent == null ? null : intent.getAction();
        if (action != null) MainActivity.command(action);
        if (CLOSE.equals(action)) stopSelf();
        return START_NOT_STICKY;
    }

    private synchronized void refresh() {
        if (mediaSession == null) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.notify(NOTIFICATION_ID, buildNotification());
    }

    private Notification buildNotification() {
        mediaSession.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build());
        mediaSession.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, "Urantia Papers Explorer Lite")
                .putString(MediaMetadata.METADATA_KEY_ALBUM, subtitle)
                .build());
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        return builder
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title)
                .setContentText(subtitle)
                .setContentIntent(openApplication())
                .setDeleteIntent(action(CLOSE))
                .setOngoing(playing)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(button(android.R.drawable.ic_media_previous, R.string.tts_previous, PREVIOUS))
                .addAction(button(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        playing ? R.string.tts_pause : R.string.tts_play, playing ? PAUSE : PLAY))
                .addAction(button(android.R.drawable.ic_media_next, R.string.tts_next, NEXT))
                .addAction(button(android.R.drawable.ic_menu_close_clear_cancel, R.string.tts_close, CLOSE))
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(mediaSession.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2))
                .build();
    }

    private Notification.Action button(int icon, int label, String action) {
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), getString(label), action(action)).build();
    }

    private PendingIntent action(String action) {
        Intent intent = new Intent(this, PlayerService.class).setAction(action);
        return PendingIntent.getService(this, action.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private PendingIntent openApplication() {
        Intent intent = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        MainActivity.command(CLOSE);
        stopSelf();
    }

    @Override
    public synchronized void onDestroy() {
        if (instance == this) instance = null;
        try {
            unregisterReceiver(audioBecomingNoisy);
        } catch (IllegalArgumentException ignored) {
            // Receiver may not have been registered if service setup failed.
        }
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
