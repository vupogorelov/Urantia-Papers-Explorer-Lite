const RELEASE_API = 'https://api.github.com/repos/vupogorelov/Urantia-Papers-Explorer-Lite/releases/latest';
const APK_URL = 'https://github.com/vupogorelov/Urantia-Papers-Explorer-Lite/releases/latest/download/upexplorer.apk';
const SEEN_KEY = 'ub-lite-release-seen';
const native = window.NativeApp ?? null;

const elements = {
  open: document.querySelector('#updates-open'),
  dot: document.querySelector('#updates-dot'),
  dialog: document.querySelector('#updates-dialog'),
  close: document.querySelector('#updates-close'),
  status: document.querySelector('#updates-status'),
  release: document.querySelector('#updates-release'),
  version: document.querySelector('#updates-version'),
  installed: document.querySelector('#updates-installed'),
  notes: document.querySelector('#updates-notes'),
  install: document.querySelector('#updates-install'),
};

let latest = null;
let latestCode = 0;
let updateAvailable = false;
let checking = false;
let checkedAt = 0;

function compareVersions(a, b) {
  const numbers = (value) => String(value ?? '').replace(/^v/i, '').match(/^\d+(?:\.\d+)*/) ?? [];
  const left = numbers(a)[0]?.split('.').map(Number);
  const right = numbers(b)[0]?.split('.').map(Number);
  if (!left || !right) return null;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

function versionCodeFromNotes(body = '') {
  const match = String(body ?? '').match(/<!--\s*upexplorer-version-code=(\d+)\s*-->/i);
  return match ? Number(match[1]) : 0;
}

function cleanNotes(body = '') {
  return String(body ?? '').replace(/<!--\s*upexplorer-version-code=\d+\s*-->/gi, '').trim();
}

function seenTag() {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}

function render() {
  const seen = latest && seenTag() === latest.tag_name;
  const hasNotice = updateAvailable || (latest && !seen);
  elements.dot.hidden = !hasNotice;
  elements.open.setAttribute('aria-label', updateAvailable
    ? `Обновления: доступна версия ${latest.tag_name}`
    : hasNotice ? `Что нового: ${latest.tag_name}` : 'Обновления');
  elements.open.setAttribute('aria-expanded', String(elements.dialog.open));

  if (latest) {
    elements.release.hidden = false;
    elements.version.textContent = updateAvailable ? `Обновление · ${latest.tag_name}` : `Что нового · ${latest.tag_name}`;
    elements.installed.textContent = native
      ? `Установлена версия ${native.appVersion?.() || '—'}`
      : 'Новая версия приложения для Android';
    elements.notes.textContent = cleanNotes(latest.body) || 'Описание изменений пока не добавлено.';
    elements.status.textContent = updateAvailable
      ? 'Доступна новая версия приложения.'
      : 'Установлена актуальная версия приложения.';
    elements.install.hidden = !updateAvailable;
    elements.install.textContent = native ? 'Обновить' : 'Скачать APK';
  } else {
    elements.release.hidden = true;
    if (!elements.status.textContent || checkedAt) {
      elements.status.textContent = 'Не удалось проверить обновления. Проверьте подключение к интернету.';
    }
  }
}

export async function checkForUpdates(force = false) {
  if (checking || (!force && Date.now() - checkedAt < 60_000)) return;
  if (!navigator.onLine) {
    elements.status.textContent = 'Нет подключения к интернету. Проверим позже.';
    return;
  }

  checking = true;
  if (!latest) elements.status.textContent = 'Проверяем обновления…';
  try {
    const response = await fetch(RELEASE_API, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(`GitHub ${response.status}`);
    const release = await response.json();
    if (!release || release.draft || release.prerelease || !Array.isArray(release.assets)
      || !release.assets.some((asset) => asset.name === 'upexplorer.apk')) {
      throw new Error('APK отсутствует в последнем релизе');
    }

    latest = release;
    latestCode = versionCodeFromNotes(release.body);
    const installedCode = Number(native?.appVersionCode?.() ?? 0);
    const versionOrder = compareVersions(release.tag_name, native?.appVersion?.() ?? '');
    updateAvailable = native
      ? latestCode && installedCode ? latestCode > installedCode : versionOrder === 1
      : true;
    checkedAt = Date.now();
    render();
  } catch {
    checkedAt = Date.now();
    if (!latest) elements.status.textContent = 'Не удалось проверить обновления. Проверьте подключение к интернету.';
  } finally {
    checking = false;
    render();
  }
}

function markSeen() {
  if (latest) {
    try { localStorage.setItem(SEEN_KEY, latest.tag_name); } catch { /* optional in private browser mode */ }
  }
  render();
}

elements.open.addEventListener('click', () => {
  elements.dialog.showModal();
  markSeen();
  void checkForUpdates();
});
elements.close.addEventListener('click', () => elements.dialog.close());
elements.dialog.addEventListener('click', (event) => {
  if (event.target === elements.dialog) elements.dialog.close();
});
elements.dialog.addEventListener('close', () => elements.open.setAttribute('aria-expanded', 'false'));
elements.install.addEventListener('click', () => {
  markSeen();
  if (native?.installApp) native.installApp(APK_URL);
  else location.href = APK_URL;
});

window.__liteUpdateEvent = (state) => {
  if (/^\d+$/.test(state)) elements.status.textContent = `Загружается обновление · ${state} %`;
  else if (state === 'install') elements.status.textContent = 'Загрузка завершена. Откройте установщик Android и подтвердите обновление.';
  else if (state === 'permission') elements.status.textContent = 'Разрешите установку из этого приложения в настройках Android, затем нажмите «Обновить» ещё раз.';
  else if (state.startsWith('error:')) elements.status.textContent = `Не удалось обновить приложение: ${state.slice(6)}`;
};

void checkForUpdates(true);
window.addEventListener('online', () => void checkForUpdates(true));
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void checkForUpdates();
});
window.setInterval(() => {
  if (document.visibilityState === 'visible') void checkForUpdates(true);
}, 15 * 60_000);
