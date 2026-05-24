# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Проект

Проект "guess-the-code" — это приложение для стриминга веб-контента на YouTube/Twitch. Использует headless-браузер Chromium в Docker-контейнере для рендеринга HTML/JS и FFmpeg для захвата и трансляции видеопотока.

## Команды

### Сборка Docker-образа
```bash
docker build -t headless-timer .
```

### Запуск трансляции
```bash
docker run -it --rm \
  -e STREAM_KEY="ВАШ_КЛЮЧ_ТРАНСЛЯЦИИ" \
  -e CHANNEL_ID="ВАШ_ID_КАНАЛА" \
  headless-timer
```

Остановить: `Ctrl+C`

### Локальная разработка
```bash
node browser.js
```
Требует наличия X-сервера (Xvfb) и Puppeteer.

## Архитектура

Проект состоит из 4 основных компонентов:

1. **index.html** — веб-приложение (UI), которое отображается в браузере. В данном случае — миллисекундный неоновый таймер с поддержкой чата YouTube.

2. **browser.js** — Node.js-скрипт на Puppeteer. Запускает Chromium в режиме киоска (1080x1920, вертикальное разрешение), открывает index.html, подключается к YouTube Chat через youtube-chat и передает сообщения в UI через page.evaluate().

3. **stream.sh** — bash-скрипт-оркестратор. Поднимает Xvfb (виртуальный дисплей), запускает browser.js, стартует FFmpeg для захвата экрана и RTMP-стриминга. Обрабатывает сигналы завершения (Ctrl+C).

4. **Dockerfile** — собирает легковесный Linux-образ со всеми зависимостями: Node.js, Xvfb, Chromium, FFmpeg.

## Важные детали

- Разрешение всегда **1080x1920** (вертикальное, для Shorts/Reels/TikTok)
- FFmpeg генерирует пустую аудиодорожку (обязательно для YouTube)
- `lang="en"` в HTML предотвращает появление панели Google Translate в Chromium
- CHANNEL_ID опционален — без него чат не подключается
- RTMP-адрес можно изменить в stream.sh для стрима на Twitch: `rtmp://live.twitch.tv/app/$STREAM_KEY`