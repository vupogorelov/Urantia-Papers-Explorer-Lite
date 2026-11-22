package ubsite.lite;

import android.content.Context;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

final class Speech extends UtteranceProgressListener {
    interface Events {
        void emit(String type, String id);
    }

    private final class Engine {
        final String packageName;
        final String label;
        final TextToSpeech tts;
        final List<Runnable> waiting = new ArrayList<>();
        final List<String> waitingIds = new ArrayList<>();
        boolean ready;
        String lastVoice;
        String lastLanguage;
        float lastRate = -1;
        float lastPitch = -1;

        Engine(Context context, String packageName, String label) {
            this.packageName = packageName;
            this.label = label;
            tts = new TextToSpeech(context, this::onInit, packageName);
        }

        private void onInit(int status) {
            synchronized (Speech.this) {
                ready = status == TextToSpeech.SUCCESS;
                if (!ready) {
                    for (String id : waitingIds) events.emit("error", id);
                    waiting.clear();
                    waitingIds.clear();
                    return;
                }
                tts.setOnUtteranceProgressListener(Speech.this);
                for (Runnable request : waiting) request.run();
                waiting.clear();
                waitingIds.clear();
            }
            events.emit("voices", "");
        }
    }

    private final Events events;
    private final Map<String, Engine> engines = new LinkedHashMap<>();
    private final String defaultPackage;

    Speech(Context context, Events events) {
        this.events = events;
        Context appContext = context.getApplicationContext();
        TextToSpeech probe = new TextToSpeech(appContext, status -> {});
        String systemDefault = probe.getDefaultEngine();
        List<TextToSpeech.EngineInfo> available = probe.getEngines();
        probe.shutdown();
        defaultPackage = systemDefault != null
                ? systemDefault
                : available.isEmpty() ? "" : available.get(0).name;
        for (TextToSpeech.EngineInfo engine : available) {
            if (engine.name.equals(defaultPackage)) {
                engines.put(engine.name, new Engine(appContext, engine.name, shortLabel(engine)));
                break;
            }
        }
        for (TextToSpeech.EngineInfo engine : available) {
            if (!engines.containsKey(engine.name)) {
                engines.put(engine.name, new Engine(appContext, engine.name, shortLabel(engine)));
            }
        }
    }

    private static String shortLabel(TextToSpeech.EngineInfo engine) {
        if (engine.name.startsWith("com.google.")) return "Google";
        if (engine.name.startsWith("com.huawei.")) return "Huawei";
        if (engine.name.startsWith("com.samsung.")) return "Samsung";
        if (engine.name.toLowerCase(Locale.ROOT).contains("rhvoice")) return "RHVoice";
        return engine.label == null ? engine.name : engine.label.toString();
    }

    synchronized String voices() {
        JSONArray result = new JSONArray();
        for (Engine engine : engines.values()) {
            if (!engine.ready) continue;
            Set<Voice> available;
            try {
                available = engine.tts.getVoices();
            } catch (RuntimeException error) {
                continue;
            }
            if (available == null) continue;
            List<Voice> sorted = new ArrayList<>();
            for (Voice voice : available) {
                Set<String> features = voice.getFeatures();
                if (features != null && features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
                if (voice.getName().endsWith("-language")) continue;
                sorted.add(voice);
            }
            sorted.sort((left, right) -> {
                if (left.isNetworkConnectionRequired() != right.isNetworkConnectionRequired()) {
                    return left.isNetworkConnectionRequired() ? 1 : -1;
                }
                return voiceLabel(left).compareToIgnoreCase(voiceLabel(right));
            });
            for (Voice voice : sorted) {
                try {
                    result.put(new JSONObject()
                            .put("id", engine.packageName + "|" + voice.getName())
                            .put("name", voiceLabel(voice))
                            .put("lang", voice.getLocale().toLanguageTag())
                            .put("local", !voice.isNetworkConnectionRequired())
                            .put("engine", engine.label));
                } catch (JSONException ignored) {
                    // JSON values above are strings and cannot fail in normal operation.
                }
            }
        }
        return result.toString();
    }

    private static String voiceLabel(Voice voice) {
        String[] parts = voice.getName().split("-x-");
        if (parts.length == 2) {
            return "Голос " + parts[1].replace("-local", "").replace("-network", "");
        }
        return voice.getName();
    }

    synchronized void speak(String id, String text, String language, String voice, float rate, float pitch, float volume, boolean replaceQueue) {
        int separator = voice.indexOf('|');
        String packageName = separator > 0 ? voice.substring(0, separator) : defaultPackage;
        Engine engine = engines.get(packageName);
        if (engine == null) engine = engines.get(defaultPackage);
        if (engine == null) {
            events.emit("error", id);
            return;
        }
        String voiceName = separator > 0 ? voice.substring(separator + 1) : voice;
        Engine selected = engine;
        Runnable request = () -> say(selected, id, text, language, voiceName, rate, pitch, volume, replaceQueue);
        if (!selected.ready) {
            selected.waiting.add(request);
            selected.waitingIds.add(id);
        }
        else request.run();
    }

    private void say(Engine engine, String id, String text, String language, String voice, float rate, float pitch, float volume, boolean replaceQueue) {
        TextToSpeech tts = engine.tts;
        if (!Objects.equals(voice, engine.lastVoice) || !Objects.equals(language, engine.lastLanguage)) {
            Voice selectedVoice = voice.isEmpty() ? null : find(tts, voice);
            if (selectedVoice != null) tts.setVoice(selectedVoice);
            else tts.setLanguage(Locale.forLanguageTag(language));
            engine.lastVoice = voice;
            engine.lastLanguage = language;
        }
        if (rate != engine.lastRate) tts.setSpeechRate(engine.lastRate = rate);
        if (pitch != engine.lastPitch) tts.setPitch(engine.lastPitch = pitch);
        Bundle parameters = new Bundle();
        parameters.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume);
        try {
            int queueMode = replaceQueue ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD;
            if (tts.speak(text, queueMode, parameters, id) != TextToSpeech.SUCCESS) {
                events.emit("error", id);
            }
        } catch (RuntimeException error) {
            events.emit("error", id);
        }
    }

    private static Voice find(TextToSpeech tts, String name) {
        try {
            for (Voice voice : tts.getVoices()) {
                if (voice.getName().equals(name)) return voice;
            }
        } catch (RuntimeException ignored) {
        }
        return null;
    }

    synchronized void cancel() {
        for (Engine engine : engines.values()) {
            engine.waiting.clear();
            engine.waitingIds.clear();
            if (engine.ready) engine.tts.stop();
        }
    }

    synchronized void shutdown() {
        for (Engine engine : engines.values()) engine.tts.shutdown();
        engines.clear();
    }

    @Override public void onStart(String id) { events.emit("start", id); }
    @Override public void onDone(String id) { events.emit("end", id); }

    @Override
    @SuppressWarnings("deprecation")
    public void onError(String id) {
        events.emit("error", id);
    }

    @Override
    public void onError(String id, int errorCode) {
        events.emit("error", id);
    }
}
