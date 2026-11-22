import { parseBookLocation, resolveParagraph } from './navigation.js';
import { locateProgress } from './progress.js';
import { edgePull } from './edge-pull.js';
import { pinchFont } from './pinch-font.js';
import { createLocalStorage } from './storage.js';
import { createTtsPlayer } from './tts.js';
import './updates.js';

const isAndroidAssets = location.pathname.includes('/assets/www/');
const bookRoot = new URL(isAndroidAssets ? '../book/' : './book/', location.href);
const elements = {
  content: document.querySelector('#paper-content'),
  reader: document.querySelector('#reader'),
  currentPlace: document.querySelector('#current-place'),
  currentKicker: document.querySelector('.current-kicker'),
  currentTitle: document.querySelector('.current-title'),
  message: document.querySelector('#message'),
  contentsView: document.querySelector('#contents-view'),
  contentsOpen: document.querySelector('#contents-open'),
  paperList: document.querySelector('#paper-list'),
  jumpForm: document.querySelector('#jump-form'),
  jumpRef: document.querySelector('#jump-ref'),
  progress: document.querySelector('#progress-seek'),
  progressValue: document.querySelector('#progress-value'),
  advancedDialog: document.querySelector('#advanced-settings-dialog'),
  advancedBack: document.querySelector('#advanced-settings-back'),
  advancedClose: document.querySelector('#advanced-settings-close'),
  moreOpen: document.querySelector('#more-open'),
  fontSizeControl: document.querySelector('#font-size-control'),
  fontSizeOutput: document.querySelector('#font-size-output'),
  fontWeightControl: document.querySelector('#font-weight-control'),
  fontWeightOutput: document.querySelector('#font-weight-output'),
  fontWeightItem: document.querySelector('#font-weight-item'),
  themeToggle: document.querySelector('#theme-toggle'),
  lineHeight: document.querySelector('#line-height-control'),
  lineHeightValue: document.querySelector('#line-height-value'),
  columnWidth: document.querySelector('#column-width-control'),
  columnWidthValue: document.querySelector('#column-width-value'),
  hyphens: document.querySelector('#hyphens-toggle'),
  showRefs: document.querySelector('#show-refs-toggle'),
  glassBars: document.querySelector('#glass-bars-toggle'),
  navLabels: document.querySelector('#nav-labels-toggle'),
  barsAutoHide: document.querySelector('#bars-auto-hide-toggle'),
  navMinify: document.querySelector('#nav-minify-toggle'),
  navMinifyInstant: document.querySelector('#nav-minify-instant-toggle'),
};

const defaults = {
  theme: 'system',
  fontFamily: 'serif',
  fontSize: 18,
  fontWeight: 400,
  lineHeight: 1.6,
  columnWidth: 820,
  readLang: 'ru',
  placeMode: 'separate',
  enMode: 'full',
  textAlign: 'left',
  hyphens: false,
  showRefs: true,
  navStyle: 'air',
  glassBars: false,
  navLabels: true,
  barsAutoHide: true,
  navMinify: false,
  navMinifyInstant: false,
};
let preferences = { ...defaults };
let toc;
let currentPaper;
let currentParagraph;
let storage;
let positionObserver;
let saveTimer;
let paperSequence = [];
let expandedParts = new Set();
let contentsOpen = false;
let storageWarning = '';
let lastScrollY = window.scrollY;
let chromeHidden = false;
let chromeHoldUntil = 0;
let progressPreview = null;
let progressSeekId = 0;
let progressSeekTarget = null;
let advancedPage = 'home';
let paperChangePending = false;
let openPaperToken = 0;
let activePullLink = null;
let pullPlaceholder = null;
const ttsPlayer = createTtsPlayer({
  get storage() { return storage; },
  getReadLanguage: () => preferences.readLang,
  getPlaceMode: () => preferences.placeMode,
  getArticle: () => elements.content,
  getPaper: () => currentPaper,
  getPapers: () => paperSequence,
  showMessage,
  fetchPaper: (paperId) => loadJson(`papers/paper-${paperId}.json`),
  openPaper: (paperId, ref = null, data = null) =>
    openPaper(paperId, ref ? parseBookLocation(ref) : null, true, data),
});

function showMessage(text = '') {
  elements.message.textContent = text || storageWarning;
}

function textFor(paper, language = preferences.readLang) {
  return language === 'en' ? paper.titleEn : paper.titleRu;
}

function paperLabel(paper, language = preferences.readLang) {
  const title = textFor(paper, language);
  return paper.id === 0 ? title : `${paper.id}. ${title}`;
}

function fontWeightLabel(weight) {
  return ({ 300: 'Тонкий', 400: 'Обычный', 500: 'Средний', 600: 'Полужирный', 700: 'Жирный' })[weight] ?? 'Обычный';
}

async function loadJson(path) {
  const response = await fetch(new URL(path, bookRoot));
  if (!response.ok) throw new Error(`Не удалось загрузить локальные данные книги (${response.status})`);
  return response.json();
}

function applyPreferences() {
  const root = document.documentElement;
  root.dataset.font = preferences.fontFamily;
  root.dataset.glass = preferences.glassBars ? 'on' : 'off';
  root.dataset.navStyle = preferences.navStyle;
  root.dataset.navLabels = preferences.navLabels ? 'on' : 'off';
  root.dataset.navMinifyMotion = preferences.navMinifyInstant ? 'instant' : 'animated';
  if (preferences.theme === 'paper' || preferences.theme === 'graphite') {
    root.dataset.theme = preferences.theme;
  } else {
    delete root.dataset.theme;
  }
  root.style.setProperty('--font-size', `${preferences.fontSize}px`);
  root.style.setProperty('--font-weight', String(preferences.fontWeight));
  root.style.setProperty('--line-height', String(preferences.lineHeight));
  root.style.setProperty('--column-width', `${preferences.columnWidth}px`);
  root.style.setProperty('--text-align', preferences.textAlign);
  root.style.setProperty('--hyphens', preferences.hyphens ? 'auto' : 'manual');
  const isDark = getComputedStyle(root).colorScheme === 'dark';
  elements.themeToggle.setAttribute('aria-pressed', String(isDark));
  elements.themeToggle.setAttribute('aria-label', isDark ? 'Светлая тема' : 'Тёмная тема');
  elements.moreOpen.setAttribute('aria-expanded', String(elements.advancedDialog.open));
  elements.lineHeight.value = String(preferences.lineHeight);
  elements.lineHeight.style.setProperty('--range-progress', `${((preferences.lineHeight - 1.3) / 0.8) * 100}%`);
  elements.lineHeightValue.value = String(preferences.lineHeight);
  elements.lineHeightValue.textContent = preferences.lineHeight.toFixed(1);
  elements.fontSizeControl.value = String(preferences.fontSize);
  elements.fontSizeControl.style.setProperty('--range-progress', `${((preferences.fontSize - 14) / 12) * 100}%`);
  elements.fontSizeOutput.value = `${preferences.fontSize}px`;
  elements.fontSizeOutput.textContent = `${preferences.fontSize}px`;
  elements.fontWeightControl.value = String(preferences.fontWeight);
  elements.fontWeightControl.style.setProperty('--range-progress', `${((preferences.fontWeight - 300) / 400) * 100}%`);
  elements.fontWeightControl.disabled = preferences.fontFamily === 'serif';
  elements.fontWeightItem.classList.toggle('settings-inactive', preferences.fontFamily === 'serif');
  elements.fontWeightOutput.value = fontWeightLabel(preferences.fontWeight);
  elements.fontWeightOutput.textContent = fontWeightLabel(preferences.fontWeight);
  elements.columnWidth.value = String(preferences.columnWidth);
  elements.columnWidth.style.setProperty('--range-progress', `${((preferences.columnWidth - 560) / 640) * 100}%`);
  elements.columnWidthValue.value = `${preferences.columnWidth}px`;
  elements.columnWidthValue.textContent = `${preferences.columnWidth}px`;
  elements.hyphens.checked = preferences.hyphens;
  elements.showRefs.checked = preferences.showRefs;
  elements.glassBars.checked = preferences.glassBars;
  elements.navLabels.checked = preferences.navLabels;
  elements.barsAutoHide.checked = preferences.barsAutoHide;
  elements.navMinify.checked = preferences.navMinify;
  elements.navMinifyInstant.checked = preferences.navMinifyInstant;
  elements.navMinifyInstant.disabled = !preferences.navMinify;
  document.querySelector('#nav-minify-instant-item').classList.toggle('settings-inactive', !preferences.navMinify);

  for (const button of document.querySelectorAll('[data-font]')) {
    button.setAttribute('aria-pressed', String(button.dataset.font === preferences.fontFamily));
  }
  for (const button of document.querySelectorAll('[data-language]')) {
    button.setAttribute('aria-pressed', String(button.dataset.language === preferences.readLang));
  }
  for (const button of document.querySelectorAll('[data-en-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.enMode === preferences.enMode));
  }
  for (const button of document.querySelectorAll('[data-place-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.placeMode === preferences.placeMode));
  }
  for (const button of document.querySelectorAll('[data-align]')) {
    button.setAttribute('aria-pressed', String(button.dataset.align === preferences.textAlign));
  }
  for (const button of document.querySelectorAll('[data-nav-style]')) {
    button.setAttribute('aria-pressed', String(button.dataset.navStyle === preferences.navStyle));
  }
  const navPreview = document.querySelector('.settings-nav-preview');
  navPreview.dataset.style = preferences.navStyle;
  navPreview.dataset.glass = preferences.glassBars ? 'on' : 'off';
  navPreview.dataset.labels = preferences.navLabels ? 'on' : 'off';
  const englishModeUnavailable = preferences.readLang !== 'ru';
  document.querySelector('#english-mode-item').classList.toggle('settings-inactive', englishModeUnavailable);
  document.querySelectorAll('[data-en-mode]').forEach((button) => { button.disabled = englishModeUnavailable; });
  document.querySelector('#paper-content').classList.toggle('hide-paragraph-refs', !preferences.showRefs);
  const color = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]').content = color;
  window.NativeBars?.setSystemBars(color, color, !isDark);
  updateChromeClasses();
}

async function savePreferences() {
  if (!storage) return;
  try {
    await storage.write('preferences', preferences);
  } catch (error) {
    showMessage(`Не удалось сохранить настройки: ${error.message}`);
  }
}

function setHeaderLocation(paper, paragraph = currentParagraph) {
  if (!paper) {
    elements.currentKicker.textContent = 'Книга Урантии';
    elements.currentTitle.textContent = '';
    return;
  }
  const part = toc.parts.find((item) => item.id === paper.partId);
  const partTitle = part ? (preferences.readLang === 'en' ? part.titleEn : part.titleRu) : '';
  elements.currentKicker.textContent = paper.id === 0
    ? 'Предисловие'
    : `Текст ${paper.id}${paragraph?.sectionNum ? ` · §${paragraph.sectionNum}` : ''}`;
  elements.currentTitle.textContent = textFor(paper);
  elements.currentPlace.setAttribute('aria-label', `Оглавление. ${partTitle} — ${paperLabel(paper)}`);
}

function setContentsOpen(open) {
  contentsOpen = open;
  if (!open) elements.jumpRef.value = '';
  elements.contentsView.classList.toggle('open', open);
  elements.contentsView.setAttribute('aria-hidden', String(!open));
  elements.contentsView.inert = !open;
  elements.reader.inert = open;
  elements.contentsOpen.setAttribute('aria-expanded', String(open));
  if (open) {
    showChrome();
    renderContents(elements.jumpRef.value);
  }
}

function makePaperChoice(paper, filter = '') {
  const container = document.createElement('div');
  const button = document.createElement('button');
  button.className = 'paper-choice';
  button.type = 'button';
  button.dataset.paper = String(paper.id);
  if (paper.id === currentPaper?.paper.id) button.setAttribute('aria-current', 'page');

  const title = document.createElement('span');
  title.className = 'paper-choice-title';
  title.textContent = paper.id === 0 ? textFor(paper) : `${paper.id}. ${textFor(paper)}`;
  button.append(title);
  if (preferences.readLang === 'ru') {
    const english = document.createElement('span');
    english.className = 'paper-choice-en';
    english.textContent = paper.titleEn;
    button.append(english);
  }
  button.addEventListener('click', () => {
    setContentsOpen(false);
    void openPaper(paper.id);
  });
  container.append(button);

  if (paper.id === currentPaper?.paper.id && !filter) {
    const sections = currentPaper.sections.filter((section) => section.num > 0);
    if (sections.length) {
      const sectionList = document.createElement('div');
      sectionList.className = 'section-list';
      for (const section of sections) {
        const sectionButton = document.createElement('button');
        sectionButton.className = 'section-choice';
        sectionButton.type = 'button';
        sectionButton.textContent = preferences.readLang === 'en'
          ? `${section.num}. ${section.titleEn}`
          : `${section.num}. ${section.titleRu}`;
        if (section.num === currentParagraph?.sectionNum) sectionButton.setAttribute('aria-current', 'location');
        sectionButton.addEventListener('click', () => {
          setContentsOpen(false);
          const location = parseBookLocation(`${paper.id}:${section.num}`);
          void openPaper(paper.id, location);
        });
        sectionList.append(sectionButton);
      }
      container.append(sectionList);
    }
  }
  return container;
}

function renderContents(filter = '') {
  if (!toc) return;
  const needle = filter.trim().toLocaleLowerCase();
  const parsedLocation = parseBookLocation(needle);
  elements.paperList.replaceChildren();

  const foreword = paperSequence.find((paper) => paper.id === 0);
  if (foreword && (!needle || `${foreword.titleRu} ${foreword.titleEn}`.toLocaleLowerCase().includes(needle))) {
    elements.paperList.append(makePaperChoice(foreword, needle));
  }

  if (parsedLocation && paperSequence.some((paper) => paper.id === parsedLocation.paperId)) {
    const result = document.createElement('button');
    result.className = 'paper-choice';
    result.type = 'button';
    result.textContent = `Перейти к ${needle}`;
    result.addEventListener('click', () => {
      setContentsOpen(false);
      void openPaper(parsedLocation.paperId, parsedLocation);
    });
    elements.paperList.append(result);
  }

  for (const part of toc.parts) {
    const partPapers = paperSequence.filter((paper) => paper.partId === part.id && paper.id !== 0);
    const matching = partPapers.filter((paper) =>
      `${paper.id} ${paper.titleRu} ${paper.titleEn}`.toLocaleLowerCase().includes(needle),
    );
    if (!matching.length) continue;

    const section = document.createElement('section');
    section.className = 'part-section';
    const heading = document.createElement('button');
    heading.className = 'part-heading';
    heading.type = 'button';
    heading.setAttribute('aria-expanded', String(!needle && expandedParts.has(part.id)));
    const chevron = document.createElement('span');
    chevron.className = 'part-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    const headingText = document.createElement('span');
    headingText.className = 'part-heading-text';
    const partNumber = document.createElement('span');
    partNumber.className = 'part-heading-number';
    partNumber.textContent = `Часть ${part.id}`;
    const title = document.createElement('span');
    title.className = 'part-heading-title';
    title.textContent = preferences.readLang === 'en' ? part.titleEn : part.titleRu;
    headingText.append(partNumber, title);
    heading.append(chevron, headingText);
    heading.addEventListener('click', () => {
      if (expandedParts.has(part.id)) expandedParts.delete(part.id);
      else expandedParts.add(part.id);
      renderContents(elements.jumpRef.value);
    });
    heading.setAttribute('aria-label', `Часть ${part.id}. ${title.textContent}`);
    section.append(heading);

    if (needle || expandedParts.has(part.id)) {
      for (const paper of matching) section.append(makePaperChoice(paper, needle));
    }
    elements.paperList.append(section);
  }

  if (!elements.paperList.childElementCount) {
    const empty = document.createElement('p');
    empty.className = 'empty-filter';
    empty.textContent = 'Ничего не найдено.';
    elements.paperList.append(empty);
  }
  if (contentsOpen && !needle) {
    requestAnimationFrame(() => elements.paperList.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' }));
  }
}

function addParagraph(paragraph) {
  const node = document.createElement('section');
  node.className = 'paragraph';
  node.dataset.ref = paragraph.ref;
  node.id = `paragraph-${paragraph.ref.replaceAll(':', '-').replaceAll('.', '-')}`;

  const meta = document.createElement('div');
  meta.className = 'paragraph-meta';
  const reference = document.createElement('span');
  reference.className = 'paragraph-reference';
  reference.textContent = paragraph.ref;
  const play = document.createElement('button');
  play.className = 'paragraph-play';
  play.type = 'button';
  play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15L19.5 12z" /></svg>';
  meta.append(reference, play);

  const primary = document.createElement('div');
  primary.className = 'paragraph-body';
  primary.lang = preferences.readLang;
  const body = document.createElement('p');
  body.lang = preferences.readLang;
  body.dataset.tts = preferences.readLang;
  body.dataset.ttsKey = paragraph.ref;
  body.innerHTML = preferences.readLang === 'en' ? paragraph.htmlEn : paragraph.htmlRu;
  primary.append(body);
  node.append(meta, primary);

  if (preferences.readLang === 'ru' && preferences.enMode !== 'hidden') {
    const translation = document.createElement('p');
    translation.className = 'english-text';
    translation.lang = 'en';
    translation.dataset.tts = 'en';
    translation.dataset.ttsKey = paragraph.ref;
    translation.innerHTML = paragraph.htmlEn;
    if (preferences.enMode === 'collapsed') {
      const toggle = document.createElement('div');
      toggle.className = 'english-text english-toggle collapsible';
      toggle.lang = 'en';
      toggle.dataset.ref = paragraph.ref;
      toggle.dataset.lang = 'en';
      toggle.dataset.tts = 'en';
      toggle.dataset.ttsKey = paragraph.ref;
      toggle.setAttribute('role', 'button');
      toggle.setAttribute('tabindex', '0');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.title = 'Развернуть';
      const toggleEnglish = () => {
        if (!getSelection()?.isCollapsed) return;
        const expanded = toggle.classList.toggle('expanded');
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.title = expanded ? 'Свернуть' : 'Развернуть';
      };
      toggle.addEventListener('click', toggleEnglish);
      toggle.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleEnglish();
        }
      });
      toggle.innerHTML = paragraph.htmlEn;
      node.append(toggle);
    } else {
      node.append(translation);
    }
  } else if (preferences.readLang === 'ru') {
    const hiddenTranslation = document.createElement('span');
    hiddenTranslation.hidden = true;
    hiddenTranslation.lang = 'en';
    hiddenTranslation.dataset.tts = 'en';
    hiddenTranslation.dataset.ttsKey = paragraph.ref;
    hiddenTranslation.innerHTML = paragraph.htmlEn;
    node.append(hiddenTranslation);
  }
  elements.content.append(node);
  if (preferences.readLang === 'en') {
    const hiddenTranslation = document.createElement('span');
    hiddenTranslation.hidden = true;
    hiddenTranslation.lang = 'ru';
    hiddenTranslation.dataset.tts = 'ru';
    hiddenTranslation.dataset.ttsKey = paragraph.ref;
    hiddenTranslation.innerHTML = paragraph.htmlRu;
    node.append(hiddenTranslation);
  }
  ttsPlayer.registerParagraph(node, paragraph.ref);
}

function renderPaper(data) {
  positionObserver?.disconnect();
  elements.content.replaceChildren();

  const head = document.createElement('header');
  head.className = 'paper-head';
  const kicker = document.createElement('p');
  kicker.className = 'paper-kicker';
  const part = toc.parts.find((item) => item.id === data.paper.partId);
  kicker.textContent = data.paper.id === 0
    ? (preferences.readLang === 'en' ? 'Foreword' : 'Предисловие')
    : `${preferences.readLang === 'en' ? 'Part' : 'Часть'} ${data.paper.partId} · ${preferences.readLang === 'en' ? part?.titleEn : part?.titleRu}`;
  const title = document.createElement('h1');
  title.id = 'paper-title';
  title.className = 'paper-title';
  if (data.paper.id !== 0) {
    const number = document.createElement('span');
    number.className = 'paper-num';
    number.textContent = `${preferences.readLang === 'en' ? 'Paper' : 'Текст'} ${data.paper.id}`;
    title.append(number);
  }
  const titleText = document.createElement('span');
  titleText.textContent = textFor(data.paper);
  titleText.dataset.tts = preferences.readLang;
  titleText.dataset.ttsKey = 'h0';
  title.append(titleText);
  if (preferences.readLang === 'en') {
    const russianTitle = document.createElement('span');
    russianTitle.hidden = true;
    russianTitle.textContent = data.paper.titleRu;
    russianTitle.dataset.tts = 'ru';
    russianTitle.dataset.ttsKey = 'h0';
    title.append(russianTitle);
  }
  if (preferences.readLang === 'ru') {
    const englishTitle = document.createElement('span');
    englishTitle.className = 'paper-title-en';
    englishTitle.textContent = data.paper.titleEn;
    englishTitle.dataset.tts = 'en';
    englishTitle.dataset.ttsKey = 'h0';
    title.append(englishTitle);
  }
  head.append(kicker, title);
  elements.content.append(head);

  let sectionNum = null;
  for (const paragraph of data.paragraphs) {
    if (paragraph.sectionNum !== sectionNum) {
      sectionNum = paragraph.sectionNum;
      const section = data.sections.find((item) => item.num === sectionNum);
      if (section?.num > 0) {
        const heading = document.createElement('h2');
        heading.className = 'section-title';
        heading.id = `section-${section.num}`;
        const headingText = document.createElement('span');
        headingText.textContent = preferences.readLang === 'en' ? section.titleEn : section.titleRu;
        headingText.dataset.tts = preferences.readLang;
        headingText.dataset.ttsKey = `h${section.num}`;
        heading.append(headingText);
        if (preferences.readLang === 'en' && section.titleRu) {
          const russian = document.createElement('span');
          russian.hidden = true;
          russian.textContent = section.titleRu;
          russian.dataset.tts = 'ru';
          russian.dataset.ttsKey = `h${section.num}`;
          heading.append(russian);
        }
        if (preferences.readLang === 'ru' && section.titleEn) {
          const english = document.createElement('span');
          english.className = 'section-title-en';
          english.textContent = section.titleEn;
          english.dataset.tts = 'en';
          english.dataset.ttsKey = `h${section.num}`;
          heading.append(english);
        }
        elements.content.append(heading);
      }
    }
    addParagraph(paragraph);
  }

  const pager = document.createElement('nav');
  pager.className = 'paper-pager';
  pager.setAttribute('aria-label', 'Переход между текстами');
  const paperIndex = paperSequence.findIndex((paper) => paper.id === data.paper.id);
  const previous = paperSequence[paperIndex - 1];
  const next = paperSequence[paperIndex + 1];
  const pagerLabel = (paper) => paper.id === 0
    ? (preferences.readLang === 'en' ? 'Foreword' : 'Предисловие')
    : `${preferences.readLang === 'en' ? 'Paper' : 'Текст'} ${paper.id}`;
  for (const [paper, direction] of [[previous, 'prev'], [next, 'next']]) {
    if (!paper) {
      const spacer = document.createElement('span');
      pager.append(spacer);
      continue;
    }
    const link = document.createElement('a');
    link.href = `#paper-${paper.id}`;
    link.className = `paper-pager-link ${direction}`;
    link.textContent = `${direction === 'prev' ? '← ' : ''}${pagerLabel(paper)}${direction === 'next' ? ' →' : ''}`;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      void openPaper(paper.id);
    });
    pager.append(link);
  }
  elements.content.append(pager);

  updateProgress();
  if (contentsOpen) renderContents(elements.jumpRef.value);
}

function updateProgress() {
  if (!currentPaper || !currentParagraph) return;
  const before = paperSequence
    .filter((paper) => paper.id < currentPaper.paper.id)
    .reduce((sum, paper) => sum + (paper.paragraphCount ?? 0), 0);
  const inPaper = currentPaper.paragraphs.findIndex((paragraph) => paragraph.ref === currentParagraph.ref);
  const total = paperSequence.reduce((sum, paper) => sum + (paper.paragraphCount ?? 0), 0);
  const current = before + Math.max(0, inPaper) + 1;
  const percent = total ? Math.min(100, (current / total) * 100) : 0;
  if (progressPreview === null) {
    elements.progress.value = String(Math.round(percent * 10));
    elements.progress.style.setProperty('--done', `${percent}%`);
    elements.progress.setAttribute('aria-valuetext', `${percent.toFixed(1)}%`);
    elements.progressValue.textContent = `${percent.toFixed(1)}%`;
  }
}

function clearProgressSeek() {
  progressSeekId += 1;
  progressSeekTarget = null;
  progressPreview = null;
  updateProgress();
}

async function seekToProgress(value) {
  const target = locateProgress(paperSequence, value);
  if (!target) return clearProgressSeek();

  const requestId = ++progressSeekId;
  const openTokenAtStart = openPaperToken;
  progressPreview = value / 10;
  elements.progressValue.textContent = `${progressPreview.toFixed(1)}%`;
  elements.progress.setAttribute('aria-valuetext', `${progressPreview.toFixed(1)}%`);

  try {
    const data = await loadJson(`papers/paper-${target.paperId}.json`);
    if (requestId !== progressSeekId || openTokenAtStart !== openPaperToken) return;
    const paragraph = data.paragraphs[target.paragraphOffset];
    if (!paragraph) throw new Error('В выбранном месте нет абзаца.');
    progressSeekTarget = { paperId: target.paperId, ref: paragraph.ref };
    const opened = await openPaper(
      target.paperId,
      parseBookLocation(paragraph.ref),
      true,
      data,
      false,
      requestId,
    );
    if (!opened && requestId === progressSeekId) clearProgressSeek();
  } catch (error) {
    if (requestId !== progressSeekId) return;
    clearProgressSeek();
    showMessage(`Не удалось перейти к выбранному месту: ${error.message}`);
  }
}

function updateChromeClasses() {
  document.body.classList.toggle('chrome-hidden', chromeHidden && preferences.barsAutoHide);
  document.body.classList.toggle('nav-mini', chromeHidden && preferences.navMinify);
}

function showChrome() {
  chromeHidden = false;
  chromeHoldUntil = Date.now() + 900;
  updateChromeClasses();
}

function trackReaderScroll() {
  const y = window.scrollY;
  const dy = y - lastScrollY;
  lastScrollY = y;
  document.body.classList.toggle('chrome-scrolled', y > 8);
  if (matchMedia('(min-width: 768px)').matches) return;
  if (!preferences.barsAutoHide && !preferences.navMinify) {
    chromeHidden = false;
    updateChromeClasses();
    return;
  }
  if (Date.now() < chromeHoldUntil) return;
  if (y < 56) chromeHidden = false;
  else if (dy > 6) chromeHidden = true;
  else if (dy < -10) chromeHidden = false;
  updateChromeClasses();
}

function paragraphObserver(paper = currentPaper) {
  positionObserver?.disconnect();
  if (!paper) return;
  positionObserver = new IntersectionObserver((entries) => {
    if (currentPaper !== paper) return;
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (!visible.length) return;
    const ref = visible[0].target.dataset.ref;
    const paragraph = paper.paragraphs.find((item) => item.ref === ref);
    if (!paragraph) return;
    if (ref !== currentParagraph?.ref) {
      currentParagraph = paragraph;
      setHeaderLocation(paper.paper, currentParagraph);
      ttsPlayer.onReadPlace(paper.paper.id, ref, preferences.readLang);
      if (contentsOpen) renderContents(elements.jumpRef.value);
      scheduleSave();
    }
    if (progressSeekTarget?.paperId === paper.paper.id && progressSeekTarget.ref === ref) {
      progressPreview = null;
      progressSeekTarget = null;
    }
    updateProgress();
  }, { rootMargin: '-15% 0px -72% 0px', threshold: 0 });

  for (const paragraph of elements.content.querySelectorAll('.paragraph')) positionObserver.observe(paragraph);
}

async function savePosition() {
  if (!storage || !currentParagraph || !currentPaper) return;
  await storage.write('reading-place', {
    ref: currentParagraph.ref,
    language: preferences.readLang,
    savedAt: Date.now(),
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void savePosition().catch((error) => showMessage(`Не удалось сохранить место чтения: ${error.message}`));
  }, 250);
}

async function openPaper(paperId, location = null, shouldScroll = true, loadedData = null, landAtEnd = false, progressRequestId = null) {
  if (progressRequestId !== null) {
    if (progressRequestId !== progressSeekId) return false;
  } else {
    clearProgressSeek();
  }
  const token = ++openPaperToken;
  showChrome();
  const paper = paperSequence.find((item) => item.id === paperId);
  if (!paper) {
    showMessage(`Текст ${paperId} не найден в оглавлении.`);
    return false;
  }

  try {
    const data = loadedData ?? await loadJson(`papers/paper-${paperId}.json`);
    if (token !== openPaperToken) return false;
    const paragraph = location
      ? resolveParagraph(data.paragraphs, location)
      : data.paragraphs[0];
    if (!paragraph) {
      showMessage(`Место ${location ? `${paperId}:${location.sectionNum ?? ''}${location.paragraphNum ? `.${location.paragraphNum}` : ''}` : paperId} не найдено.`);
      return false;
    }

    currentPaper = data;
    currentParagraph = paragraph;
    makePartExpandedFor(paperId);
    renderPaper(data);
    ttsPlayer.onPaperReady(data);
    setHeaderLocation(data.paper, paragraph);
    showMessage('');

    const scrollToParagraph = () => {
      if (token !== openPaperToken) return;
      if (shouldScroll) {
        if (landAtEnd) {
          window.scrollTo(0, document.documentElement.scrollHeight);
        } else {
          document.getElementById(`paragraph-${paragraph.ref.replaceAll(':', '-').replaceAll('.', '-')}`)
            ?.scrollIntoView({ block: 'start' });
        }
      }
      paragraphObserver(data);
    };
    requestAnimationFrame(scrollToParagraph);
    scheduleSave();
    return true;
  } catch (error) {
    if (token !== openPaperToken) return false;
    showMessage(`Не удалось открыть текст ${paperId}: ${error.message}`);
    return false;
  }
}

function canChangePaper(direction) {
  if (paperChangePending || contentsOpen || elements.advancedDialog.open
    || getSelection()?.isCollapsed === false) return false;
  const index = paperSequence.findIndex((paper) => paper.id === currentPaper?.paper.id);
  return direction === 'next' ? index >= 0 && index < paperSequence.length - 1 : index > 0;
}

async function changePaperAtEdge(direction) {
  if (!canChangePaper(direction)) return;
  const index = paperSequence.findIndex((paper) => paper.id === currentPaper?.paper.id);
  const nextPaper = paperSequence[index + (direction === 'next' ? 1 : -1)];
  if (!nextPaper) return;
  paperChangePending = true;
  try {
    await openPaper(nextPaper.id, null, true, null, direction === 'prev');
  } finally {
    paperChangePending = false;
  }
}

function clearPagerPull() {
  activePullLink?.classList.remove('pull-active', 'pull-ready', 'pull-next', 'pull-prev');
  activePullLink?.style.removeProperty('--pull-progress');
  pullPlaceholder?.remove();
  activePullLink = null;
  pullPlaceholder = null;
}

function updatePagerPull(direction, progress) {
  if (!direction || !currentPaper) return clearPagerPull();
  const index = paperSequence.findIndex((paper) => paper.id === currentPaper.paper.id);
  const paper = paperSequence[index + (direction === 'next' ? 1 : -1)];
  const link = elements.content.querySelector(`.paper-pager-link.${direction}`);
  if (!paper || !link) return clearPagerPull();

  if (activePullLink !== link) {
    clearPagerPull();
    const rect = link.getBoundingClientRect();
    pullPlaceholder = document.createElement('span');
    pullPlaceholder.className = 'paper-pager-placeholder';
    pullPlaceholder.setAttribute('aria-hidden', 'true');
    pullPlaceholder.style.width = `${rect.width}px`;
    pullPlaceholder.style.height = `${rect.height}px`;
    link.before(pullPlaceholder);
    activePullLink = link;
  }
  activePullLink.classList.add('pull-active');
  activePullLink.classList.toggle('pull-next', direction === 'next');
  activePullLink.classList.toggle('pull-prev', direction === 'prev');
  activePullLink.classList.toggle('pull-ready', progress >= 1);
  activePullLink.style.setProperty('--pull-progress', String(progress));
}

async function jumpToLocation(value) {
  const location = parseBookLocation(value);
  if (!location) {
    showMessage('Введите номер текста, раздела или абзаца, например 5, 5:1 или 5:1.3.');
    return;
  }
  if (!paperSequence.some((paper) => paper.id === location.paperId)) {
    showMessage(`Текст ${location.paperId} не найден.`);
    return;
  }
  setContentsOpen(false);
  await openPaper(location.paperId, location);
}

async function setPreference(key, value) {
  const location = currentParagraph ? parseBookLocation(currentParagraph.ref) : null;
  preferences = { ...preferences, [key]: value };
  applyPreferences();
  await savePreferences();
  if (currentPaper && (key === 'readLang' || key === 'enMode')) {
    await openPaper(currentPaper.paper.id, location, true);
  }
}

function previewRange(key, value) {
  preferences = { ...preferences, [key]: Number(value) };
  applyPreferences();
}

function setAdvancedPage(page) {
  advancedPage = page;
  const titles = { appearance: 'Оформление', text: 'Текст', panels: 'Панели' };
  const isHome = page === 'home';
  document.querySelector('#advanced-settings-title').textContent = isHome ? 'Настройки' : titles[page];
  document.querySelector('#advanced-settings-back').hidden = isHome;
  document.querySelector('#settings-home').hidden = !isHome;
  document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== page;
  });
  document.querySelector('.settings-page-body').scrollTop = 0;
}

function openAdvancedSettings() {
  setAdvancedPage('home');
  openSheet(elements.advancedDialog);
  elements.moreOpen.setAttribute('aria-expanded', 'true');
  elements.moreOpen.setAttribute('aria-current', 'page');
  elements.moreOpen.classList.add('active');
  const bookButton = document.querySelector('[data-view="book"]');
  bookButton.removeAttribute('aria-current');
  bookButton.classList.remove('active');
}

function makePartExpandedFor(paperId) {
  const paper = paperSequence.find((item) => item.id === paperId);
  if (paper) expandedParts.add(paper.partId);
}

elements.contentsOpen.addEventListener('click', () => setContentsOpen(!contentsOpen));
elements.currentPlace.addEventListener('click', () => setContentsOpen(!contentsOpen));
elements.jumpForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = elements.jumpRef.value.trim();
  if (parseBookLocation(value)) {
    void jumpToLocation(value);
  } else {
    renderContents(value);
  }
});
elements.jumpRef.addEventListener('input', () => renderContents(elements.jumpRef.value));
function openSheet(dialog) {
  showChrome();
  if (!dialog.open) dialog.showModal();
}

function closeSheet(dialog) {
  if (dialog.open) dialog.close();
}

elements.advancedBack.addEventListener('click', () => setAdvancedPage('home'));
elements.advancedClose.addEventListener('click', () => closeSheet(elements.advancedDialog));
elements.advancedDialog.addEventListener('click', (event) => {
  if (event.target === elements.advancedDialog) closeSheet(elements.advancedDialog);
});
elements.advancedDialog.addEventListener('cancel', (event) => {
  if (advancedPage !== 'home') {
    event.preventDefault();
    setAdvancedPage('home');
  }
});
document.querySelectorAll('[data-settings-page]').forEach((button) => {
  button.addEventListener('click', () => setAdvancedPage(button.dataset.settingsPage));
});
elements.moreOpen.addEventListener('click', () => {
  if (elements.advancedDialog.open) {
    closeSheet(elements.advancedDialog);
  } else {
    openAdvancedSettings();
  }
});
elements.advancedDialog.addEventListener('close', () => {
  elements.moreOpen.setAttribute('aria-expanded', 'false');
  elements.moreOpen.removeAttribute('aria-current');
  elements.moreOpen.classList.remove('active');
  const bookButton = document.querySelector('[data-view="book"]');
  bookButton.classList.add('active');
  bookButton.setAttribute('aria-current', 'page');
});
elements.themeToggle.addEventListener('click', () => {
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const currentlyDark = preferences.theme === 'graphite' || (preferences.theme === 'system' && systemDark);
  void setPreference('theme', currentlyDark ? 'paper' : 'graphite');
});
document.querySelectorAll('[data-font]').forEach((button) => {
  button.addEventListener('click', () => void setPreference('fontFamily', button.dataset.font));
});
document.querySelectorAll('[data-language]').forEach((button) => {
  button.addEventListener('click', () => void setPreference('readLang', button.dataset.language));
});
document.querySelectorAll('[data-en-mode]').forEach((button) => {
  button.addEventListener('click', () => void setPreference('enMode', button.dataset.enMode));
});
document.querySelectorAll('[data-place-mode]').forEach((button) => {
  button.addEventListener('click', () => void setPreference('placeMode', button.dataset.placeMode));
});
document.querySelectorAll('[data-align]').forEach((button) => {
  button.addEventListener('click', () => void setPreference('textAlign', button.dataset.align));
});
document.querySelectorAll('[data-nav-style]').forEach((button) => {
  button.addEventListener('click', () => void setPreference('navStyle', button.dataset.navStyle));
});
for (const [control, key] of [
  [elements.fontSizeControl, 'fontSize'],
  [elements.fontWeightControl, 'fontWeight'],
  [elements.lineHeight, 'lineHeight'],
  [elements.columnWidth, 'columnWidth'],
]) {
  control.addEventListener('input', () => previewRange(key, control.value));
  control.addEventListener('change', () => void savePreferences());
}
elements.hyphens.addEventListener('change', () => {
  void setPreference('hyphens', elements.hyphens.checked);
});
elements.showRefs.addEventListener('change', () => {
  void setPreference('showRefs', elements.showRefs.checked);
});
elements.glassBars.addEventListener('change', () => {
  void setPreference('glassBars', elements.glassBars.checked);
});
elements.navLabels.addEventListener('change', () => {
  void setPreference('navLabels', elements.navLabels.checked);
});
elements.barsAutoHide.addEventListener('change', () => {
  void setPreference('barsAutoHide', elements.barsAutoHide.checked);
});
elements.navMinify.addEventListener('change', () => {
  void setPreference('navMinify', elements.navMinify.checked);
});
elements.navMinifyInstant.addEventListener('change', () => {
  void setPreference('navMinifyInstant', elements.navMinifyInstant.checked);
});
elements.progress.addEventListener('input', () => {
  progressSeekId += 1;
  progressSeekTarget = null;
  progressPreview = Number(elements.progress.value) / 10;
  elements.progress.style.setProperty('--done', `${progressPreview}%`);
  elements.progressValue.textContent = `${progressPreview.toFixed(1)}%`;
  elements.progress.setAttribute('aria-valuetext', `${progressPreview.toFixed(1)}%`);
});
elements.progress.addEventListener('change', () => {
  const value = Number(elements.progress.value);
  void seekToProgress(value);
});
elements.content.addEventListener('click', (event) => {
  if (!getSelection()?.isCollapsed) return;
  if (event.target.closest('a, button, input, textarea')) return;
  showChrome();
});
window.addEventListener('scroll', trackReaderScroll, { passive: true });
const pinchFontController = pinchFont(elements.reader, {
  get: () => preferences.fontSize,
  set: (size) => previewRange('fontSize', size),
  min: 14,
  max: 26,
  anchor: '.paragraph, .section-title, .paper-head',
  adjustScroll: (delta) => window.scrollBy(0, delta),
  onCommit: () => void savePreferences(),
});
const edgePullController = edgePull(document.documentElement, {
  can: canChangePaper,
  onprogress: updatePagerPull,
  ongo: (direction) => void changePaperAtEdge(direction),
});

window.__liteHandleBack = () => {
  const updatesDialog = document.querySelector('#updates-dialog');
  if (updatesDialog.open) {
    updatesDialog.close();
    return true;
  }
  if (document.querySelector('#tts-dictionary-dialog').open) {
    document.querySelector('#tts-dictionary-dialog').close();
    return true;
  }
  if (elements.advancedDialog.open && advancedPage !== 'home') {
    setAdvancedPage('home');
    return true;
  }
  if (elements.advancedDialog.open) {
    closeSheet(elements.advancedDialog);
    return true;
  }
  if (contentsOpen) {
    setContentsOpen(false);
    return true;
  }
  if (ttsPlayer.state.open) {
    if (ttsPlayer.state.settingsOpen) {
      ttsPlayer.closeSettings();
    } else if (ttsPlayer.state.playing) {
      ttsPlayer.pause();
    } else {
      ttsPlayer.close();
    }
    return true;
  }
  return false;
};
document.querySelector('[data-view="book"]').addEventListener('click', () => {
  setContentsOpen(false);
});
window.addEventListener('ub-lite-bookmark', async (event) => {
  if (!storage) return showMessage('Локальное хранилище закладок недоступно.');
  const { ref, language } = event.detail;
  try {
    const bookmarks = await storage.read('bookmarks') ?? [];
    const existing = bookmarks.findIndex((bookmark) => bookmark.ref === ref);
    if (existing >= 0) bookmarks.splice(existing, 1);
    else bookmarks.push({
      id: ref,
      version: 1,
      ref,
      language,
      createdAt: new Date().toISOString(),
    });
    await storage.write('bookmarks', bookmarks);
    showMessage(existing >= 0 ? `Закладка ${ref} удалена.` : `Закладка ${ref} сохранена.`);
  } catch (error) {
    showMessage(`Не удалось сохранить закладку: ${error.message}`);
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void savePosition().catch((error) => showMessage(error.message));
});
window.addEventListener('pagehide', () => {
  clearTimeout(saveTimer);
  pinchFontController.destroy();
  edgePullController.destroy();
  void savePosition()
    .catch((error) => showMessage(error.message))
    .finally(() => storage?.close());
});

async function start() {
  try {
    toc = await loadJson('toc.json');
    paperSequence = [...toc.papers].sort((a, b) => a.id - b.id);
    let place = null;
    try {
      storage = createLocalStorage();
      place = await storage.read('reading-place');
      const savedPreferences = await storage.read('preferences');
      if (savedPreferences && typeof savedPreferences === 'object') {
        const savedFontFamily = ['serif', 'sans', 'roboto'].includes(savedPreferences.fontFamily)
          ? savedPreferences.fontFamily
          : defaults.fontFamily;
        const savedTheme = ['system', 'paper', 'graphite'].includes(savedPreferences.theme)
          ? savedPreferences.theme
          : defaults.theme;
        preferences = {
          ...defaults,
          ...savedPreferences,
          fontFamily: savedFontFamily,
          theme: savedTheme,
          fontSize: Math.min(26, Math.max(14, Number(savedPreferences.fontSize) || defaults.fontSize)),
          fontWeight: [300, 400, 500, 600, 700].includes(Number(savedPreferences.fontWeight))
            ? Number(savedPreferences.fontWeight)
            : defaults.fontWeight,
          lineHeight: Math.min(2.1, Math.max(1.3, Number(savedPreferences.lineHeight) || defaults.lineHeight)),
          columnWidth: Math.min(1200, Math.max(560, Number(savedPreferences.columnWidth) || defaults.columnWidth)),
          readLang: savedPreferences.readLang === 'en' ? 'en' : 'ru',
          placeMode: savedPreferences.placeMode === 'shared' ? 'shared' : 'separate',
          enMode: ['full', 'collapsed', 'hidden'].includes(savedPreferences.enMode)
            ? savedPreferences.enMode
            : defaults.enMode,
          textAlign: savedPreferences.textAlign === 'justify' ? 'justify' : 'left',
          hyphens: savedPreferences.hyphens === true,
          showRefs: savedPreferences.showRefs !== false,
          navStyle: savedPreferences.navStyle === 'bar' ? 'bar' : 'air',
          glassBars: savedPreferences.glassBars === true,
          navLabels: savedPreferences.navLabels !== false,
          barsAutoHide: savedPreferences.barsAutoHide !== false,
          navMinify: savedPreferences.navMinify === true,
          navMinifyInstant: savedPreferences.navMinifyInstant === true,
        };
      } else {
        const legacyLanguage = await storage.read('language');
        if (legacyLanguage === 'en') preferences.readLang = 'en';
      }
    } catch (error) {
      storage = null;
      storageWarning = `Локальное сохранение недоступно: ${error.message}`;
      showMessage(storageWarning);
    }
    applyPreferences();
    await ttsPlayer.init();

    const savedLocation = place?.ref ? parseBookLocation(place.ref) : null;
    if (place?.language === 'en' || place?.language === 'ru') preferences.readLang = place.language;
    applyPreferences();

    const restored = savedLocation
      ? await openPaper(savedLocation.paperId, savedLocation, false)
      : false;
    if (!restored) {
      makePartExpandedFor(paperSequence[0].id);
      await openPaper(paperSequence[0].id, null, false);
      if (savedLocation) showMessage('Сохранённое место не найдено; открыто начало книги.');
    } else {
      makePartExpandedFor(savedLocation.paperId);
      requestAnimationFrame(() => {
        document.getElementById(`paragraph-${place.ref.replaceAll(':', '-').replaceAll('.', '-')}`)
          ?.scrollIntoView({ block: 'start' });
        paragraphObserver();
      });
    }
  } catch (error) {
    showMessage(`Не удалось загрузить книгу из памяти приложения: ${error.message}`);
    elements.currentKicker.textContent = 'Книга недоступна';
  }
}

void start();
