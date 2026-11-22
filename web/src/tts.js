import { splitSentences } from './sentences.js';
import { DEFAULT_PRONUNCIATIONS } from './pronunciation-defaults.js';

const DEFAULT_VOICE = {
  ru: { voice: '', rate: 1.1, pitch: 0.7, volume: 1 },
  en: { voice: '', rate: 1, pitch: 1, volume: 1 },
};
const SLEEP_STEPS = [null, 15, 30, 45, 60, 'paper'];

function normalizedSettings(value, fallbackLang) {
  const validVoice = (voice) => typeof voice === 'string' ? voice : '';
  const validRate = (rate, fallback) => Number.isFinite(rate) ? Math.min(2, Math.max(0.6, rate)) : fallback;
  const validPitch = (pitch, fallback) => Number.isFinite(pitch) ? Math.min(2, Math.max(0.5, pitch)) : fallback;
  const rules = Array.isArray(value?.dictionary)
    ? value.dictionary.filter((rule) =>
      rule && typeof rule.id === 'string' && typeof rule.word === 'string'
      && typeof rule.say === 'string' && (rule.lang === 'ru' || rule.lang === 'en'),
    )
    : [];
  return {
    lang: value?.lang === 'en' || value?.lang === 'ru' ? value.lang : fallbackLang,
    autoStart: value?.autoStart === true,
    highlightColor: value?.highlightColor === 'blue' ? 'blue' : 'gray',
    voices: {
      ru: {
        voice: validVoice(value?.voices?.ru?.voice),
        rate: validRate(value?.voices?.ru?.rate, DEFAULT_VOICE.ru.rate),
        pitch: validPitch(value?.voices?.ru?.pitch, DEFAULT_VOICE.ru.pitch),
        volume: Number.isFinite(value?.voices?.ru?.volume) ? Math.min(1, Math.max(0, value.voices.ru.volume)) : 1,
      },
      en: {
        voice: validVoice(value?.voices?.en?.voice),
        rate: validRate(value?.voices?.en?.rate, DEFAULT_VOICE.en.rate),
        pitch: validPitch(value?.voices?.en?.pitch, DEFAULT_VOICE.en.pitch),
        volume: Number.isFinite(value?.voices?.en?.volume) ? Math.min(1, Math.max(0, value.voices.en.volume)) : 1,
      },
    },
    dictionary: rules,
    place: value?.place && Number.isInteger(value.place.paper) && typeof value.place.key === 'string'
      ? {
        paper: value.place.paper,
        key: value.place.key,
        sentence: Math.max(0, Number(value.place.sentence) || 0),
        at: Number.isFinite(value.place.at) ? value.place.at : 0,
      }
      : null,
  };
}

function makeRange(element, start, end) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let length = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const textLength = node.textContent?.length ?? 0;
    nodes.push({ node, start: length, end: length + textLength });
    length += textLength;
  }
  const from = nodes.find((item) => start >= item.start && start < item.end);
  const to = [...nodes].reverse().find((item) => end > item.start && end <= item.end);
  if (!from || !to) return null;
  const range = document.createRange();
  range.setStart(from.node, start - from.start);
  range.setEnd(to.node, end - to.start);
  return range;
}

export function replaceWithDictionary(text, dictionary, lang) {
  let output = text;
  for (const rule of dictionary) {
    if (rule.lang !== lang || !rule.word.trim() || !rule.say.trim()) continue;
    const escaped = rule.word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sourceRule = rule.id.startsWith('source-');
    const pattern = sourceRule
      ? `(^|[^\\p{L}\\p{N}_])(${escaped})`
      : `(^|[^\\p{L}\\p{N}_])(${escaped})(?=$|[^\\p{L}\\p{N}_])`;
    output = output.replace(new RegExp(pattern, 'giu'), (_match, before, matched) => {
      const spoken = matched[0] !== matched[0].toLowerCase()
        ? rule.say[0].toUpperCase() + rule.say.slice(1)
        : rule.say[0].toLowerCase() + rule.say.slice(1);
      return `${before}${spoken}`;
    });
  }
  return output;
}

export function createTtsPlayer(host) {
  const ui = {
    button: document.querySelector('#listen-open'),
    panel: document.querySelector('#tts-player'),
    back: document.querySelector('#tts-back'),
    progress: document.querySelector('#tts-progress'),
    percent: document.querySelector('#tts-percent'),
    sleep: document.querySelector('#tts-sleep'),
    sleepIcon: document.querySelector('#tts-sleep-icon'),
    sleepLabel: document.querySelector('#tts-sleep-label'),
    bookmark: document.querySelector('#tts-bookmark'),
    language: document.querySelector('#tts-language'),
    previousBlock: document.querySelector('#tts-previous-block'),
    previousSentence: document.querySelector('#tts-previous-sentence'),
    play: document.querySelector('#tts-play'),
    nextSentence: document.querySelector('#tts-next-sentence'),
    nextBlock: document.querySelector('#tts-next-block'),
    settingsButton: document.querySelector('#tts-settings-button'),
    drawer: document.querySelector('#tts-settings'),
    voice: document.querySelector('#tts-voice'),
    voiceValue: document.querySelector('#tts-voice-value'),
    rate: document.querySelector('#tts-rate'),
    pitchDown: document.querySelector('#tts-pitch-down'),
    pitch: document.querySelector('#tts-pitch'),
    pitchUp: document.querySelector('#tts-pitch-up'),
    autoStart: document.querySelector('#tts-auto-start'),
    highlightColors: [...document.querySelectorAll('[data-tts-highlight-color]')],
    dictionaryOpen: document.querySelector('#tts-dictionary-open'),
    dictionaryDialog: document.querySelector('#tts-dictionary-dialog'),
    dictionaryForm: document.querySelector('#tts-dictionary-form'),
    dictionaryWord: document.querySelector('#tts-dictionary-word'),
    dictionarySay: document.querySelector('#tts-dictionary-say'),
    dictionaryLanguage: document.querySelector('#tts-dictionary-language'),
    dictionaryList: document.querySelector('#tts-dictionary-list'),
    dictionaryClose: document.querySelector('#tts-dictionary-close'),
    dictionarySummary: document.querySelector('#tts-dictionary-summary'),
  };
  const native = window.NativeTts ?? null;
  const synth = native ? null : window.speechSynthesis ?? null;
  const state = {
    open: false,
    playing: false,
    settingsOpen: false,
    lang: host.getReadLanguage(),
    autoStart: false,
    highlightColor: 'gray',
    voices: { ru: { ...DEFAULT_VOICE.ru }, en: { ...DEFAULT_VOICE.en } },
    dictionary: [],
    place: null,
    sleep: null,
    sleepUntil: null,
  };
  let speechVoices = [];
  let current = null;
  let queue = [];
  let queueIndex = 0;
  let run = 0;
  let onlyKey = null;
  let sessionStart = null;
  let pendingOpen = null;
  let voiceAt = 0;
  let sleepTimer = 0;
  let autoTimer = 0;
  let autoPending = false;
  let backPlace = null;
  let backTimer = 0;
  let longPressTriggered = false;
  let initialized = false;
  let ready = false;
  let pendingListenOpen = false;

  function showError(text) {
    host.showMessage(text);
  }

  ui.button.addEventListener('click', () => {
    if (!ready) {
      pendingListenOpen = true;
      return;
    }
    if (state.open) close();
    else open(state.autoStart);
  });

  async function save() {
    if (!host.storage) return;
    try {
      await host.storage.write('tts-settings', {
        lang: state.lang,
        autoStart: state.autoStart,
        highlightColor: state.highlightColor,
        voices: state.voices,
        dictionary: state.dictionary,
        place: state.place,
      });
    } catch (error) {
      showError(`Не удалось сохранить настройки озвучивания: ${error.message}`);
    }
  }

  async function returnToPreviousPlace() {
    if (!backPlace) return;
    const target = backPlace;
    clearTimeout(backTimer);
    backPlace = null;
    updatePlayerState();
    if (host.getPaper()?.paper.id === target.paper) {
      current = { key: target.key, sentence: target.sentence };
      if (target.play) start();
      else showPosition(resolveCurrent());
      document.getElementById(`paragraph-${target.key.replaceAll(':', '-').replaceAll('.', '-')}`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (state.playing) pause();
    pendingOpen = { ...target };
    const opened = await host.openPaper(target.paper, target.key);
    if (!opened) {
      pendingOpen = null;
      showError('Не удалось вернуться к предыдущему месту озвучивания.');
    }
  }

  function activeBlocks() {
    return [...(host.getArticle()?.querySelectorAll(`[data-tts="${state.lang}"]`) ?? [])];
  }

  function blockData(element) {
    const text = element.textContent ?? '';
    return { element, key: element.dataset.ttsKey ?? '', text, sentences: splitSentences(text) };
  }

  function resolveCurrent() {
    if (!current) return null;
    const element = activeBlocks().find((item) => item.dataset.ttsKey === current.key);
    if (!element) return null;
    const block = blockData(element);
    const sentence = Math.min(current.sentence, Math.max(0, block.sentences.length - 1));
    const [start, end] = block.sentences[sentence] ?? [0, block.text.length];
    return { ...block, sentence, start, end };
  }

  function clearHighlight() {
    if (window.CSS?.highlights) window.CSS.highlights.delete('tts');
    for (const highlight of host.getArticle()?.querySelectorAll('.tts-highlight-fallback') ?? []) {
      highlight.replaceWith(...highlight.childNodes);
      highlight.parentNode?.normalize();
    }
  }

  function metadata(item) {
    if (!native) return;
    const paper = host.getPaper();
    const title = paper ? (paper.paper.id === 0 ? 'Предисловие' : `Текст ${paper.paper.id}`) : 'Книга Урантии';
    native.meta(title, item?.text.slice(0, 100) ?? 'Книга Урантии');
  }

  function progressFor(item) {
    const paper = host.getPaper();
    const papers = host.getPapers();
    if (!paper || !item) return 0;
    const index = papers.findIndex((entry) => entry.id === paper.paper.id);
    if (index < 0) return 0;
    const total = papers.reduce((sum, entry) => sum + (entry.paragraphCount ?? 0), 0);
    if (!total) return 0;
    const before = papers.slice(0, index).reduce((sum, entry) => sum + (entry.paragraphCount ?? 0), 0);
    const paragraphIndex = paper.paragraphs.findIndex((entry) => entry.ref === item.key);
    const count = Math.max(1, item.sentenceCount ?? item.sentences.length);
    return Math.max(0, Math.min(1, (before + Math.max(0, paragraphIndex) + item.sentence / count) / total));
  }

  function remember(item) {
    if (!item) return;
    const paper = host.getPaper();
    if (!paper) return;
    state.place = { paper: paper.paper.id, key: item.key, sentence: item.sentence };
    state.place.at = Date.now();
    if (state.playing) voiceAt = state.place.at;
    if (host.getPlaceMode() === 'shared' && /^\d+:\d+\.\d+$/.test(item.key) && host.storage) {
      void host.storage.write('reading-place', {
        ref: item.key,
        language: host.getReadLanguage(),
        savedAt: state.place.at,
      }).catch((error) => showError(`Не удалось сохранить общее место чтения: ${error.message}`));
    }
    void save();
    ui.progress.value = String(Math.round(progressFor(item) * 1000));
    ui.progress.style.setProperty('--done', `${progressFor(item) * 100}%`);
    ui.percent.textContent = `${(progressFor(item) * 100).toFixed(1)}%`;
  }

  function showPosition(item, shouldScroll = true) {
    clearHighlight();
    if (!item) return;
    const range = makeRange(item.element, item.start, item.end);
    if (range && state.highlightColor && window.CSS?.highlights && window.Highlight) {
      window.CSS.highlights.set('tts', new Highlight(range));
    } else if (range && state.highlightColor) {
      const highlight = document.createElement('span');
      highlight.className = 'tts-highlight-fallback';
      highlight.append(range.extractContents());
      range.insertNode(highlight);
    }
    remember(item);
    metadata(item);
    if (!shouldScroll || !item.element.getClientRects().length) return;
    const rect = range && window.CSS?.highlights && window.Highlight
      ? range.getBoundingClientRect()
      : item.element.querySelector('.tts-highlight-fallback')?.getBoundingClientRect() ?? item.element.getBoundingClientRect();
    const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
    const playerTop = document.querySelector('.bottom-shell')?.getBoundingClientRect().top ?? window.innerHeight;
    const center = top + Math.max(0, playerTop - top) / 2;
    const sentenceCenter = rect.top + rect.height / 2;
    if (state.playing || rect.top < top + 8 || rect.bottom > playerTop - 8) {
      window.scrollBy({ top: sentenceCenter - center, behavior: 'smooth' });
    }
  }

  function firstVisible() {
    const top = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0) + 8;
    const element = activeBlocks().find((item) => item.getBoundingClientRect().bottom > top);
    return element ? { key: element.dataset.ttsKey ?? '', sentence: 0 } : null;
  }

  function currentIsVisible(item) {
    if (!item) return false;
    const range = makeRange(item.element, item.start, item.end);
    const rect = range?.getBoundingClientRect() ?? item.element.getBoundingClientRect();
    const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
    const bottom = document.querySelector('.bottom-shell')?.getBoundingClientRect().top ?? window.innerHeight;
    return rect.bottom > top && rect.top < bottom;
  }

  function elementsQueue(from) {
    const blocks = activeBlocks().map(blockData);
    const startIndex = blocks.findIndex((item) => item.key === from.key);
    if (startIndex < 0) return [];
    const result = [];
    for (let i = startIndex; i < blocks.length; i++) {
      const block = blocks[i];
      block.sentences.forEach(([start, end], sentence) => {
        if (i !== startIndex || sentence >= from.sentence) {
          const text = replaceWithDictionary(
            block.text.slice(start, end).replace(/\s+/g, ' ').trim(),
            [...DEFAULT_PRONUNCIATIONS, ...state.dictionary],
            state.lang,
          );
          if (text.trim()) result.push({
            key: block.key,
            sentence,
            start,
            end,
            text,
            element: block.element,
            sentenceCount: block.sentences.length,
          });
        }
      });
      if (onlyKey === block.key) break;
    }
    return result;
  }

  function syncParagraphButton(button) {
    const active = state.playing && button.dataset.ref === onlyKey;
    if (button.dataset.playing === String(active)) return;
    button.dataset.playing = String(active);
    button.classList.toggle('on', active);
    button.setAttribute('aria-label', active ? 'Остановить озвучивание абзаца' : `Озвучить абзац ${button.dataset.ref ?? ''}`);
    button.title = active ? 'Остановить' : 'Озвучить абзац';
    button.innerHTML = active
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5h11v11h-11z" /></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15L19.5 12z" /></svg>';
  }

  function updatePlayerState() {
    document.documentElement.dataset.ttsHighlight = state.highlightColor;
    document.body.classList.toggle('tts-open', state.open);
    document.body.classList.toggle('tts-settings-open', state.open && state.settingsOpen);
    ui.button.classList.toggle('active', state.open);
    ui.button.setAttribute('aria-pressed', String(state.open));
    ui.button.setAttribute('aria-label', state.open ? 'Слушать: закрыть плеер' : 'Слушать: открыть плеер');
    ui.panel.hidden = !state.open;
    ui.panel.classList.toggle('settings-open', state.settingsOpen);
    ui.back.hidden = !state.open || !backPlace;
    if (backPlace) {
      ui.back.textContent = `Вернуться к ${backPlace.key.includes(':') ? backPlace.key : `Тексту ${backPlace.paper}`}`;
    }
    ui.drawer.setAttribute('aria-hidden', String(!state.settingsOpen));
    ui.drawer.inert = !state.settingsOpen;
    ui.settingsButton.setAttribute('aria-expanded', String(state.settingsOpen));
    ui.play.setAttribute('aria-label', state.playing ? 'Пауза' : 'Читать');
    ui.play.classList.toggle('playing', state.playing);
    ui.play.classList.toggle('auto', autoPending);
    ui.language.textContent = state.lang.toUpperCase();
    ui.language.setAttribute('aria-label', `Язык озвучивания: ${state.lang === 'ru' ? 'русский' : 'английский'}. Переключить`);
    ui.autoStart.checked = state.autoStart;
    for (const choice of ui.highlightColors) {
      const selected = choice.dataset.ttsHighlightColor === state.highlightColor;
      choice.setAttribute('aria-checked', String(selected));
      choice.classList.toggle('selected', selected);
    }
    ui.rate.textContent = `${Number(state.voices[state.lang].rate.toFixed(2))}×`;
    ui.pitch.textContent = state.voices[state.lang].pitch.toFixed(1);
    ui.pitchDown.disabled = state.voices[state.lang].pitch <= 0.5;
    ui.pitchUp.disabled = state.voices[state.lang].pitch >= 2;
    ui.sleepLabel.textContent = state.sleep === 'paper'
      ? 'До конца'
      : state.sleepUntil ? `${Math.max(1, Math.ceil((state.sleepUntil - Date.now()) / 60_000))} мин` : '';
    ui.sleepIcon.hidden = state.sleep !== null;
    ui.sleep.classList.toggle('active', state.sleep !== null);
    ui.sleep.setAttribute('aria-label', state.sleep === null
      ? 'Таймер сна выключен. Нажмите — 15 минут'
      : `Таймер сна: ${ui.sleepLabel.textContent}. Нажмите — следующий вариант`);
    for (const button of host.getArticle()?.querySelectorAll('.paragraph-play') ?? []) syncParagraphButton(button);
    const ruleCount = DEFAULT_PRONUNCIATIONS.filter((rule) => rule.lang === state.lang).length
      + state.dictionary.filter((rule) => rule.lang === state.lang).length;
    ui.dictionarySummary.textContent = ruleCount
      ? `${ruleCount} ${ruleCount === 1 ? 'слово' : ruleCount < 5 ? 'слова' : 'слов'}`
      : '';
    refreshVoices();
  }

  function refreshVoices() {
    const saved = state.voices[state.lang].voice;
    const options = [{ id: '', name: 'Системный', engine: '' },
      ...speechVoices.filter((voice) => voice.lang.toLowerCase().startsWith(state.lang))];
    ui.voice.replaceChildren();
    for (const voice of options) {
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = `${voice.name}${voice.engine ? ` · ${voice.engine}` : ''}${voice.local === false ? ' · онлайн' : ''}`;
      ui.voice.append(option);
    }
    ui.voice.value = options.some((voice) => voice.id === saved) ? saved : '';
    ui.voiceValue.textContent = ui.voice.selectedOptions[0]?.textContent ?? 'Системный';
  }

  function loadVoices() {
    if (native) {
      try {
        speechVoices = JSON.parse(native.voices()).map((voice) => ({
          id: voice.id,
          name: voice.name,
          lang: voice.lang,
          local: voice.local,
          engine: voice.engine,
        }));
      } catch (error) {
        showError(`Не удалось получить голоса Android TTS: ${error.message}`);
      }
    } else if (synth) {
      speechVoices = synth.getVoices().map((voice) => ({
        id: voice.voiceURI || voice.name,
        name: voice.name,
        lang: voice.lang,
        local: voice.localService,
        engine: '',
      }));
    }
    updatePlayerState();
  }

  function syncNativePlayer() {
    if (!native) return;
    if (state.open) {
      native.player(state.playing);
      metadata(resolveCurrent());
    } else {
      native.end();
    }
  }

  function stopEngine() {
    if (native) native.cancel();
    else synth?.cancel();
  }

  function cancelSleep() {
    clearTimeout(sleepTimer);
    sleepTimer = 0;
    state.sleep = null;
    state.sleepUntil = null;
  }

  function sleepDue() {
    if (state.sleepUntil === null || Date.now() < state.sleepUntil) return false;
    cancelSleep();
    if (state.playing) pause();
    return true;
  }

  function setSleep(value) {
    clearTimeout(sleepTimer);
    state.sleep = value;
    state.sleepUntil = typeof value === 'number' ? Date.now() + value * 60_000 : null;
    if (typeof value === 'number') {
      sleepTimer = window.setTimeout(() => {
        if (sleepDue()) updatePlayerState();
      }, value * 60_000);
    }
    updatePlayerState();
  }

  function finishPaper() {
    if (state.sleep === 'paper') {
      cancelSleep();
      pause();
      return;
    }
    if (onlyKey) {
      onlyKey = null;
      pause();
      return;
    }
    const papers = host.getPapers();
    const index = papers.findIndex((paper) => paper.id === host.getPaper()?.paper.id);
    const next = papers[index + 1];
    if (!next) {
      pause();
      showError('Дочитана последняя страница книги.');
      return;
    }
    pendingOpen = { paper: next.id, key: 'h0', sentence: 0, play: true };
    void host.openPaper(next.id, null).then((opened) => {
      if (!opened && pendingOpen?.paper === next.id) {
        pendingOpen = null;
        pause();
        showError(`Не удалось открыть Текст ${next.id} для продолжения озвучивания.`);
      }
    });
  }

  function updateActive(item) {
    if (sleepDue()) return;
    current = { key: item.key, sentence: item.sentence };
    showPosition(item);
  }

  function finishNativeQueue(my) {
    if (my !== run || !state.playing) return;
    if (sleepDue()) return updatePlayerState();
    if (onlyKey) {
      onlyKey = null;
      pause();
      return;
    }
    finishPaper();
  }

  function speakNative(my) {
    const prefs = state.voices[state.lang];
    queue.forEach((item, index) => {
      const id = `${my}:${index}`;
      item.nativeId = id;
      native.speak(id, item.text, state.lang === 'ru' ? 'ru-RU' : 'en-US',
        prefs.voice, prefs.rate, prefs.pitch, prefs.volume);
    });
  }

  function speakBrowser(my) {
    if (my !== run || !state.playing) return;
    if (sleepDue()) return updatePlayerState();
    const item = queue[queueIndex];
    if (!item) return finishNativeQueue(my);
    updateActive(item);
    const utterance = new SpeechSynthesisUtterance(item.text);
    const prefs = state.voices[state.lang];
    utterance.lang = state.lang === 'ru' ? 'ru-RU' : 'en-US';
    utterance.rate = prefs.rate;
    utterance.pitch = prefs.pitch;
    utterance.volume = prefs.volume;
    const voice = speechVoices.find((candidate) => candidate.id === prefs.voice);
    if (voice) utterance.voice = synth.getVoices().find((candidate) => (candidate.voiceURI || candidate.name) === voice.id) ?? null;
    utterance.onend = () => {
      if (my !== run || !state.playing) return;
      queueIndex += 1;
      speakBrowser(my);
    };
    utterance.onerror = (event) => {
      if (my !== run || !state.playing) return;
      pause();
      showError(`Синтез речи завершился с ошибкой: ${event.error}`);
    };
    synth.speak(utterance);
  }

  function start() {
    clearTimeout(autoTimer);
    autoTimer = 0;
    autoPending = false;
    if (!state.open) state.open = true;
    if (!native && !synth) {
      showError('На этом устройстве не найден синтез речи.');
      updatePlayerState();
      return;
    }
    if (!current || !resolveCurrent()) current = firstVisible();
    if (!current) {
      showError('Не удалось определить место для озвучивания.');
      updatePlayerState();
      return;
    }
    const item = resolveCurrent();
    if (!item) {
      showError('Выбранный текст недоступен для озвучивания.');
      updatePlayerState();
      return;
    }
    sessionStart ??= { paper: host.getPaper()?.paper.id, key: current.key, sentence: current.sentence };
    state.playing = true;
    queue = elementsQueue(current);
    queueIndex = 0;
    if (!queue.length) {
      pause();
      showError('В выбранном месте нет текста для озвучивания.');
      return;
    }
    const my = ++run;
    stopEngine();
    updatePlayerState();
    syncNativePlayer();
    if (native) speakNative(my);
    else speakBrowser(my);
  }

  function pause() {
    clearTimeout(autoTimer);
    autoTimer = 0;
    autoPending = false;
    state.playing = false;
    run += 1;
    stopEngine();
    updatePlayerState();
    syncNativePlayer();
  }

  function scheduleAutoStart() {
    clearTimeout(autoTimer);
    autoTimer = 0;
    autoPending = true;
    updatePlayerState();
    if (!resolveCurrent()) return;
    autoTimer = window.setTimeout(() => {
      autoTimer = 0;
      start();
    }, 2000);
  }

  function open(auto = false) {
    clearTimeout(autoTimer);
    if (!currentIsVisible(resolveCurrent())) current = firstVisible();
    state.open = true;
    state.settingsOpen = false;
    showPosition(resolveCurrent(), false);
    updatePlayerState();
    if (auto) {
      scheduleAutoStart();
    }
  }

  function close() {
    pause();
    clearTimeout(backTimer);
    backPlace = null;
    state.open = false;
    state.settingsOpen = false;
    current = null;
    sessionStart = null;
    onlyKey = null;
    clearHighlight();
    updatePlayerState();
    syncNativePlayer();
  }

  function toggle() {
    if (autoPending) {
      clearTimeout(autoTimer);
      autoPending = false;
      updatePlayerState();
      return;
    }
    if (state.playing) pause();
    else {
      const active = resolveCurrent();
      if (active) {
        const range = makeRange(active.element, active.start, active.end);
        const rect = range?.getBoundingClientRect() ?? active.element.getBoundingClientRect();
        const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
        const bottom = ui.panel.getBoundingClientRect().top;
        if (rect.bottom <= top || rect.top >= bottom) current = firstVisible();
      }
      start();
    }
  }

  function stepSentence(direction) {
    const item = resolveCurrent();
    if (!item) {
      current = firstVisible();
      if (!current) return;
    } else {
      const next = item.sentence + direction;
      if (next >= 0 && next < item.sentences.length) current = { key: item.key, sentence: next };
      else {
        const blocks = activeBlocks();
        const index = blocks.findIndex((block) => block.dataset.ttsKey === item.key);
        const target = blocks[index + direction];
        if (!target) return;
        const targetBlock = blockData(target);
        current = { key: targetBlock.key, sentence: direction > 0 ? 0 : Math.max(0, targetBlock.sentences.length - 1) };
      }
    }
    if (state.playing) start();
    else showPosition(resolveCurrent());
  }

  function stepBlock(direction) {
    const blocks = activeBlocks();
    const index = blocks.findIndex((block) => block.dataset.ttsKey === current?.key);
    const target = blocks[index + direction];
    if (!target) return;
    current = { key: target.dataset.ttsKey ?? '', sentence: direction < 0 ? Math.max(0, blockData(target).sentences.length - 1) : 0 };
    if (state.playing) start();
    else showPosition(resolveCurrent());
  }

  function speakParagraph(ref) {
    if (state.playing && onlyKey === ref) {
      pause();
      return;
    }
    const element = activeBlocks().find((block) => block.dataset.ttsKey === ref);
    if (!element) {
      showError(`Абзац ${ref} недоступен для выбранного языка озвучивания.`);
      return;
    }
    if (!state.open) open(false);
    onlyKey = ref;
    current = { key: ref, sentence: 0 };
    start();
  }

  function cycleSleep() {
    const index = SLEEP_STEPS.indexOf(state.sleep);
    setSleep(SLEEP_STEPS[(index + 1) % SLEEP_STEPS.length]);
  }

  function updateDictionaryList() {
    ui.dictionaryList.replaceChildren();
    const language = ui.dictionaryLanguage.value;
    const defaults = DEFAULT_PRONUNCIATIONS.filter((rule) => rule.lang === language);
    const entries = state.dictionary.filter((rule) => rule.lang === language);
    if (!defaults.length && !entries.length) {
      const empty = document.createElement('p');
      empty.className = 'tts-dictionary-empty';
      empty.textContent = 'Пока нет правил произношения.';
      ui.dictionaryList.append(empty);
      return;
    }
    if (defaults.length) {
      const heading = document.createElement('p');
      heading.className = 'tts-dictionary-section';
      heading.textContent = `Встроенные правила ударений (${defaults.length})`;
      ui.dictionaryList.append(heading);
      for (const rule of defaults) {
        const row = document.createElement('div');
        row.className = 'tts-dictionary-row';
        const text = document.createElement('span');
        text.textContent = `${rule.word} → ${rule.say}`;
        row.append(text);
        ui.dictionaryList.append(row);
      }
    }
    if (entries.length) {
      const heading = document.createElement('p');
      heading.className = 'tts-dictionary-section';
      heading.textContent = 'Мои правила';
      ui.dictionaryList.append(heading);
    }
    for (const rule of entries) {
      const row = document.createElement('div');
      row.className = 'tts-dictionary-row';
      const text = document.createElement('span');
      text.textContent = `${rule.word} → ${rule.say}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tts-dictionary-remove';
      remove.textContent = 'Удалить';
      remove.setAttribute('aria-label', `Удалить правило ${rule.word}`);
      remove.addEventListener('click', () => {
        state.dictionary = state.dictionary.filter((item) => item.id !== rule.id);
        void save();
        updateDictionaryList();
        updatePlayerState();
      });
      row.append(text, remove);
      ui.dictionaryList.append(row);
    }
  }

  function installPanelGestures() {
    let gesture = null;
    const seekAt = (clientX) => {
      const rect = ui.progress.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      ui.progress.value = String(Math.round(fraction * 1000));
      ui.progress.dispatchEvent(new Event('input', { bubbles: true }));
    };
    ui.panel.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches[0];
      if (!touch) return;
      const progress = event.target instanceof Element
        ? event.target.closest('.tts-progress')
        : null;
      const rect = ui.progress.getBoundingClientRect();
      gesture = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        scrub: Boolean(progress && !event.target.closest('button') && touch.clientX >= rect.left && touch.clientX <= rect.right),
        direction: null,
        changed: false,
      };
    }, { passive: true });

    ui.panel.addEventListener('touchmove', (event) => {
      if (!gesture) return;
      const touch = [...event.changedTouches].find((item) => item.identifier === gesture.id);
      if (!touch) return;
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (!gesture.direction) {
        if (gesture.scrub && Math.abs(dx) > Math.abs(dy) * 1.15 && Math.abs(dx) > 10) gesture.direction = 'seek';
        else if (Math.abs(dy) > Math.abs(dx) * 1.15 && Math.abs(dy) > 10) gesture.direction = 'settings';
        else return;
      }
      if (event.cancelable) event.preventDefault();
      if (gesture.direction === 'seek') {
        seekAt(touch.clientX);
        gesture.changed = true;
      } else if (Math.abs(dy) > 36 && !gesture.changed) {
        state.settingsOpen = dy < 0;
        updatePlayerState();
        gesture.changed = true;
      }
    }, { passive: false });

    const finish = (event) => {
      if (!gesture) return;
      const touch = [...event.changedTouches].find((item) => item.identifier === gesture.id);
      if (touch && gesture.scrub) {
        if (gesture.direction === 'seek' || !gesture.direction) {
          seekAt(touch.clientX);
          ui.progress.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      gesture = null;
    };
    ui.panel.addEventListener('touchend', finish, { passive: true });
    ui.panel.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    if (host.storage) {
      try {
        const saved = await host.storage.read('tts-settings');
        Object.assign(state, normalizedSettings(saved, host.getReadLanguage()));
        if (host.getPlaceMode() === 'shared') {
          const readPlace = await host.storage.read('reading-place');
          const match = typeof readPlace?.ref === 'string' ? readPlace.ref.match(/^(\d+):\d+\.\d+$/) : null;
          if (match && (readPlace.savedAt ?? 0) > (state.place?.at ?? 0)) {
            state.place = {
              paper: Number(match[1]),
              key: readPlace.ref,
              sentence: 0,
              at: readPlace.savedAt,
            };
          }
        }
      } catch (error) {
        showError(`Не удалось загрузить настройки озвучивания: ${error.message}`);
      }
    }
    loadVoices();
    updatePlayerState();
    ui.back.addEventListener('click', () => void returnToPreviousPlace());
    ui.play.addEventListener('click', toggle);
    ui.language.addEventListener('click', () => {
      state.lang = state.lang === 'ru' ? 'en' : 'ru';
      current = current ? { key: current.key, sentence: 0 } : null;
      void save();
      loadVoices();
      if (state.playing) start();
      else showPosition(resolveCurrent());
    });
    ui.previousBlock.addEventListener('click', () => stepBlock(-1));
    ui.nextBlock.addEventListener('click', () => stepBlock(1));
    ui.previousSentence.addEventListener('click', () => stepSentence(-1));
    ui.nextSentence.addEventListener('click', () => stepSentence(1));
    ui.settingsButton.addEventListener('click', () => {
      state.settingsOpen = !state.settingsOpen;
      updatePlayerState();
    });
    ui.voice.addEventListener('change', () => {
      state.voices[state.lang].voice = ui.voice.value;
      void save();
      if (state.playing) start();
    });
    ui.rate.addEventListener('click', () => {
      const rate = state.voices[state.lang].rate;
      const next = (Math.floor(rate / 0.2 + 1e-6) + 1) * 0.2;
      state.voices[state.lang].rate = next > 2 ? 0.6 : next;
      void save();
      updatePlayerState();
      if (state.playing) start();
    });
    ui.pitchDown.addEventListener('click', () => changePitch(-1));
    ui.pitchUp.addEventListener('click', () => changePitch(1));
    ui.autoStart.addEventListener('change', () => {
      state.autoStart = ui.autoStart.checked;
      void save();
    });
    for (const choice of ui.highlightColors) choice.addEventListener('click', () => {
      state.highlightColor = choice.dataset.ttsHighlightColor === 'blue' ? 'blue' : 'gray';
      void save();
      updatePlayerState();
      showPosition(resolveCurrent(), false);
    });
    ui.sleep.addEventListener('click', cycleSleep);
    ui.bookmark.addEventListener('click', () => {
      const ref = current?.key && /^\d+:\d+\.\d+$/.test(current.key) ? current.key : null;
      if (!ref) return showError('Закладку можно поставить на абзац.');
      window.dispatchEvent(new CustomEvent('ub-lite-bookmark', { detail: { ref, language: state.lang } }));
      ui.bookmark.classList.add('saved');
      ui.bookmark.setAttribute('aria-label', `Закладка добавлена: ${ref}`);
      window.setTimeout(() => ui.bookmark.classList.remove('saved'), 900);
    });
    ui.progress.addEventListener('input', () => {
      const value = Number(ui.progress.value) / 1000;
      ui.progress.style.setProperty('--done', `${value * 100}%`);
      ui.percent.textContent = `${(value * 100).toFixed(1)}%`;
    });
    ui.progress.addEventListener('change', () => void seekProgress(Number(ui.progress.value) / 1000));
    ui.dictionaryOpen.addEventListener('click', () => {
      ui.dictionaryLanguage.value = state.lang;
      updateDictionaryList();
      ui.dictionaryDialog.showModal();
    });
    ui.dictionaryClose.addEventListener('click', () => ui.dictionaryDialog.close());
    ui.dictionaryLanguage.addEventListener('change', updateDictionaryList);
    ui.dictionaryDialog.addEventListener('click', (event) => {
      if (event.target === ui.dictionaryDialog) ui.dictionaryDialog.close();
    });
    ui.dictionaryForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const word = ui.dictionaryWord.value.trim();
      const say = ui.dictionarySay.value.trim();
      if (!word || !say) return;
      state.dictionary.push({ id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, word, say, lang: ui.dictionaryLanguage.value });
      ui.dictionaryWord.value = '';
      ui.dictionarySay.value = '';
      void save();
      updateDictionaryList();
    });
    let pressTimer;
    ui.play.addEventListener('pointerdown', () => {
      longPressTriggered = false;
      pressTimer = window.setTimeout(() => {
        longPressTriggered = true;
        if (sessionStart) {
          pendingOpen = { ...sessionStart, play: true };
          if (host.getPaper()?.paper.id === sessionStart.paper) {
            current = { key: sessionStart.key, sentence: sessionStart.sentence };
            start();
          } else {
            void host.openPaper(sessionStart.paper, sessionStart.key).then((opened) => {
              if (!opened) {
                pendingOpen = null;
                pause();
                showError('Не удалось вернуться к началу сессии озвучивания.');
              }
            });
          }
        }
      }, 550);
    });
    for (const name of ['pointerup', 'pointerleave', 'pointercancel']) {
      ui.play.addEventListener(name, () => clearTimeout(pressTimer));
    }
    ui.play.addEventListener('click', (event) => {
      if (longPressTriggered) {
        event.preventDefault();
        event.stopImmediatePropagation();
        longPressTriggered = false;
      }
    }, true);
    ui.play.addEventListener('contextmenu', (event) => event.preventDefault());
    installPanelGestures();
    window.setInterval(() => {
      if (state.sleepUntil !== null) updatePlayerState();
    }, 15_000);
    document.addEventListener('visibilitychange', () => {
      if (!synth || document.visibilityState !== 'visible' || !state.playing) return;
      if (synth.paused) synth.resume();
      window.setTimeout(() => {
        if (state.playing && !synth.speaking && !synth.pending) start();
      }, 400);
    });
    window.__liteTtsEvent = onNativeEvent;
    window.__liteNativeCommand = onNativeCommand;
    if (synth) synth.addEventListener('voiceschanged', loadVoices);
    ready = true;
    updatePlayerState();
    if (pendingListenOpen) {
      pendingListenOpen = false;
      open(state.autoStart);
    }
  }

  function changePitch(direction) {
    const pitch = state.voices[state.lang].pitch;
    state.voices[state.lang].pitch = Math.round(Math.min(2, Math.max(0.5, pitch + direction * 0.1)) * 10) / 10;
    void save();
    updatePlayerState();
    if (state.playing) start();
  }

  async function seekProgress(fraction) {
    const papers = host.getPapers();
    const total = papers.reduce((sum, paper) => sum + (paper.paragraphCount ?? 0), 0);
    if (!total) return;
    let offset = Math.min(total - 1, Math.max(0, Math.floor(fraction * total)));
    let paper = papers[0];
    for (const candidate of papers) {
      if (offset < candidate.paragraphCount) {
        paper = candidate;
        break;
      }
      offset -= candidate.paragraphCount;
    }
    const keepPlaying = state.playing;
    const previousPaper = host.getPaper()?.paper.id;
    const previous = current && previousPaper !== undefined
      ? { paper: previousPaper, key: current.key, sentence: current.sentence, play: keepPlaying }
      : null;
    try {
      const data = await host.fetchPaper(paper.id);
      const paragraph = data.paragraphs[offset];
      if (!paragraph) throw new Error('В выбранном месте нет абзаца.');
      clearTimeout(backTimer);
      backPlace = previous;
      if (backPlace) {
        backTimer = window.setTimeout(() => {
          backPlace = null;
          updatePlayerState();
        }, 8000);
      }
      updatePlayerState();
      pendingOpen = { paper: paper.id, key: paragraph.ref, sentence: 0, play: keepPlaying };
      if (host.getPaper()?.paper.id === paper.id) {
        current = { key: paragraph.ref, sentence: 0 };
        pendingOpen = null;
        if (keepPlaying) start();
        else showPosition(resolveCurrent());
        document.getElementById(`paragraph-${paragraph.ref.replaceAll(':', '-').replaceAll('.', '-')}`)
          ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else {
        if (state.playing) pause();
        pendingOpen.play = keepPlaying;
        const opened = await host.openPaper(paper.id, paragraph.ref, data);
        if (!opened) {
          pendingOpen = null;
          pause();
          showError('Не удалось открыть выбранное место книги.');
        }
      }
    } catch (error) {
      pendingOpen = null;
      showError(`Не удалось перейти к выбранному месту озвучивания: ${error.message}`);
    }
  }

  function onPaperReady(data) {
    if (pendingOpen) {
      if (pendingOpen.paper !== data.paper.id) return;
      const target = pendingOpen;
      pendingOpen = null;
      current = target.key
        ? { key: target.key, sentence: target.sentence }
        : { key: data.paragraphs[0]?.ref ?? 'h0', sentence: 0 };
      window.setTimeout(() => {
        if (target.play) start();
        else {
          showPosition(resolveCurrent());
          if (state.open && autoPending && !autoTimer) scheduleAutoStart();
        }
      }, 250);
      return;
    }
    if (!current && state.place?.paper === data.paper.id
      && activeBlocks().some((block) => block.dataset.ttsKey === state.place.key)) {
      current = { key: state.place.key, sentence: state.place.sentence };
    }
    if (current && !resolveCurrent()) {
      pause();
      current = null;
      clearHighlight();
    }
    if (state.open && autoPending && !autoTimer) {
      if (!resolveCurrent()) current = firstVisible();
      if (resolveCurrent()) scheduleAutoStart();
    }
  }

  function onNativeEvent(type, id) {
    if (type === 'voices') return loadVoices();
    const [eventRun, indexText] = id.split(':');
    if (Number(eventRun) !== run) return;
    const itemIndex = Number(indexText);
    const item = queue[itemIndex];
    if (!item) return;
    if (type === 'start') {
      if (sleepDue()) {
        native.cancel();
        return updatePlayerState();
      }
      updateActive(item);
      return;
    }
    if (type === 'error') {
      pause();
      showError(`Не удалось озвучить текст в ${item.key}. Проверьте выбранный голос и язык.`);
      return;
    }
    if (type === 'end' && itemIndex === queue.length - 1) finishNativeQueue(run);
  }

  function onNativeCommand(action) {
    if (action === 'play') start();
    else if (action === 'pause') pause();
    else if (action === 'next') stepBlock(1);
    else if (action === 'prev') stepBlock(-1);
    else if (action === 'close') close();
  }

  function setLanguage(language) {
    if (language !== 'ru' && language !== 'en') return;
    state.lang = language;
    current = current ? { key: current.key, sentence: 0 } : null;
    void save();
    loadVoices();
    if (state.playing) start();
    else showPosition(resolveCurrent());
  }

  function onReadPlace(paper, key) {
    if (host.getPlaceMode() !== 'shared' || Date.now() - voiceAt < 5000) return;
    state.place = { paper, key, sentence: 0, at: Date.now() };
    current = { key, sentence: 0 };
    void save();
    if (state.open) showPosition(resolveCurrent(), false);
  }

  function registerParagraph(element, ref) {
    const button = element.querySelector('.paragraph-play');
    if (!button) return;
    button.dataset.ref = ref;
    button.dataset.playing = '';
    button.disabled = false;
    syncParagraphButton(button);
    button.onclick = () => speakParagraph(ref);
  }

  return {
    init,
    onPaperReady,
    open,
    close,
    closeSettings() {
      state.settingsOpen = false;
      updatePlayerState();
    },
    pause,
    setLanguage,
    onReadPlace,
    registerParagraph,
    get state() { return state; },
  };
}
