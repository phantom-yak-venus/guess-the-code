# Используем легковесный образ с Node.js
FROM node:20-slim

# Устанавливаем Xvfb, FFmpeg и сам браузер Chromium (чтобы не качать его через Puppeteer)
RUN apt-get update && apt-get install -y \
    xvfb \
    ffmpeg \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Настраиваем Puppeteer на использование системного Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Копируем исходники (предполагается, что package.json, скрипты и html уже в папке)
COPY package.json .
RUN npm install puppeteer youtube-chat

COPY index.html browser.js stream.sh ./
RUN chmod +x stream.sh

# Запускаем наш баш-скрипт при старте контейнера
CMD ["./stream.sh"]