# Urantia Papers Explorer

Автономная мобильная читалка Книги Урантии для Android.

Приложение должно работать полностью локально:

- чтение и сохранение позиции;
- прослушивание системой TTS в фоне;
- закладки и заметки;
- локальный текстовый поиск;
- локальная навигация по книге;
- без аккаунта, сервера и обязательного интернета.

Подробные правила находятся в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Структура

- `android/` — APK и офлайн-WebView; мост к Android TTS будет добавлен отдельным этапом;
- `web/` — локальное пользовательское приложение;
- `book/` — исходники и сгенерированный локальный формат Книги;
- `scripts/` — сборка и проверка офлайн-продукта;
- `tests/` — тесты формата контента и навигации;
- `docs/` — архитектура и форматы данных.

## Запуск сборки

```powershell
npm run build
```

Собранный APK всегда копируется под именем `upexplorer.apk`:

`dist/upexplorer.apk`

Обычная локальная сборка создаёт debug APK. Для release-сборки задайте `ANDROID_BUILD_VARIANT=release`, `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` и `ANDROID_KEY_PASSWORD`, затем запустите `npm run build:android`.

## Релизы APK на GitHub

Workflow `.github/workflows/release-apk.yml` собирает подписанный APK и прикладывает его к GitHub Release при отправке тега вида `v0.1.0`. Для постоянной подписи (чтобы Android разрешал устанавливать обновления поверх предыдущей версии) в приватном репозитории должны быть заданы Actions secrets:

- `ANDROID_KEYSTORE_BASE64` — keystore в Base64;
- `ANDROID_KEYSTORE_PASSWORD`;
- `ANDROID_KEY_ALIAS`;
- `ANDROID_KEY_PASSWORD`.

Для текущего локального Android-ключа Base64 можно скопировать в PowerShell так:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.android\debug.keystore")) | Set-Clipboard
```

Добавьте строку из буфера как `ANDROID_KEYSTORE_BASE64`; для стандартного локального debug-ключа значения остальных secrets — `android`, `androiddebugkey`, `android`. Этот ключ сохраняет совместимость APK с уже установленной сборкой.

Номер версии Android увеличивается с каждым запуском workflow. Чтобы выпустить новую версию, отправьте новый тег:

```powershell
git tag v0.1.1
git push origin v0.1.1
```

APK в каждом релизе называется `upexplorer.apk`.

### Постоянная ссылка на актуальный APK

Ссылка ведёт на файл `upexplorer.apk` в последнем опубликованном релизе и не меняется при выпуске новых версий:

`https://github.com/vupogorelov/Urantia-Papers-Explorer-Lite/releases/latest/download/upexplorer.apk`

Репозиторий приватный, поэтому для скачивания на телефоне нужен вход в GitHub с аккаунтом, у которого есть доступ к репозиторию. Android разрешает обновлять установленное приложение, если APK подписан тем же ключом и имеет больший номер версии. Ключ хранится в Actions secrets, а номер версии увеличивается при каждой сборке workflow.

Workflow запускается при отправке нового тега или публикации релиза. Если сборку нужно повторить, её можно вручную запустить в GitHub Actions, указав существующий тег. При уже созданном релизе workflow заменяет приложенный APK, а не пытается создать дубликат релиза.

Для разработки web-интерфейса после `npm run build:web` можно запустить локальный preview:

```powershell
python -m http.server 4181 --directory web/public
```

Откройте `http://127.0.0.1:4181`.

Сейчас реализованы чтение RU/EN, оглавление, переход по ссылкам вида `5:1.3`, сохранение последней позиции/языка, локальные темы и настройки типографики. TTS, поиск, закладки и заметки — следующие этапы.
