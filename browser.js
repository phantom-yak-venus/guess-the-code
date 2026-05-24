const puppeteer = require('puppeteer');
const path = require('path');
const { LiveChat } = require('youtube-chat');
const dns = require('dns');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isFilled(value) {
  return value && value.trim() !== '' && value.trim() !== 'replace_me';
}

async function findActiveLiveIdByApi(channelId) {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!isFilled(apiKey)) {
    throw new Error('YOUTUBE_API_KEY is empty');
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('channelId', channelId);
  url.searchParams.set('eventType', 'live');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '1');
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString());
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status} ${body}`);
  }

  const data = JSON.parse(body);
  const liveId = data.items?.[0]?.id?.videoId;

  if (!liveId) {
    throw new Error(`Active live stream was not found by YouTube API. Response: ${body}`);
  }

  console.log(`✅ Активная трансляция найдена через YouTube API. Live ID: ${liveId}`);
  console.log(`🎬 Название: ${data.items?.[0]?.snippet?.title || 'unknown'}`);

  return liveId;
}

async function findActiveLiveIdByApiWithRetry(channelId) {
  const attempts = 24;
  const delayMs = 5000;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      console.log(`⏳ Поиск активной трансляции через YouTube API: попытка ${attempt}/${attempts}`);
      return await findActiveLiveIdByApi(channelId);
    } catch (err) {
      console.log(`⚠️ Активная трансляция пока не найдена через API: ${err.message}`);

      if (attempt === attempts) {
        throw err;
      }

      await sleep(delayMs);
    }
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1080,1920',
      '--window-position=0,0',
      '--kiosk',
      '--hide-scrollbars',
      '--disable-translate',
      '--disable-features=Translate',
      '--disable-notifications',
      '--disable-ipv6'
    ],
    defaultViewport: null
  });

  const page = await browser.newPage();
  const fileUrl = `file://${path.join(__dirname, 'index.html')}`;
  await page.goto(fileUrl);

  console.log('Браузер запущен. Отрисовка экрана загрузки...');

  const channelId = process.env.CHANNEL_ID;
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;

  if (!channelId) {
    console.log('⚠️ CHANNEL_ID не указан. Запускаем игру в оффлайн-режиме.');
    await page.evaluate(() => window.initGame());
    return;
  }

  let liveChat = null;
  let chatConnected = false;
  let isRetrying = false;
  let processedMessageIds = new Set();
  let currentRoundStartTime = 0;

  const scheduleRetry = (reason = 'Неизвестная ошибка') => {
    if (isRetrying) return;

    isRetrying = true;
    chatConnected = false;

    console.log(`\n🔄 РАЗРЫВ СОЕДИНЕНИЯ (${reason}). Переподключение через 5 секунд...`);

    if (liveChat) {
      liveChat.stop();
      liveChat = null;
    }

    page.evaluate(() => {
      if (window.showReconnect) window.showReconnect();
    }).catch(() => {});

    setTimeout(() => {
      isRetrying = false;
      connectToChat();
    }, 5000);
  };

  process.on('unhandledRejection', (err) => {
    console.error('🚨 Скрытая ошибка внутри youtube-chat:', err.message);
    scheduleRetry('Скрытый сбой промиса');
  });

  process.on('uncaughtException', (err) => {
    console.error('🚨 Критическая системная ошибка:', err.message);
    scheduleRetry('Критическая ошибка Node.js');
  });

  setInterval(() => {
    if (!chatConnected || isRetrying) return;

    dns.resolve('youtube.com', (err) => {
      if (err) {
        console.log('🚨 Сторожевой пес: Обрыв сети (DNS не отвечает)!');
        scheduleRetry('Потеряно соединение с интернетом');
      }
    });
  }, 10000);

  const connectToChat = async () => {
    if (chatConnected) return;

    try {
      if (isFilled(youtubeApiKey)) {
        console.log(`⏳ YOUTUBE_API_KEY задан. Ищем активную трансляцию на канале ${channelId} через YouTube API...`);
        const liveId = await findActiveLiveIdByApiWithRetry(channelId);

        console.log(`⏳ Подключаемся к чату по Live ID: ${liveId}`);
        liveChat = new LiveChat({ liveId });
      } else {
        console.log(`⏳ YOUTUBE_API_KEY не задан. Используем старый режим поиска чата по CHANNEL_ID: ${channelId}`);
        liveChat = new LiveChat({ channelId });
      }

      liveChat.on('start', (liveId) => {
        chatConnected = true;
        isRetrying = false;

        console.log(`✅ Чат успешно подключен! Live ID: ${liveId}`);

        page.evaluate(() => {
          if (window.initGame) window.initGame();
        }).catch(() => {});
      });

      liveChat.on('chat', async (chatItem) => {
        const msgTime = new Date(chatItem.timestamp).getTime();
        if (msgTime < currentRoundStartTime) return;

        const msgId = chatItem.id;
        if (processedMessageIds.has(msgId)) return;

        processedMessageIds.add(msgId);

        const author = chatItem.author.name;
        const avatarUrl = chatItem.author.thumbnail?.url || 'https://via.placeholder.com/250/000000/00FF00?text=?';
        const text = chatItem.message.map(m => m.text || '').join(' ');

        await page.evaluate((a, t, img) => {
          if (window.handleChat) window.handleChat(a, t, img);
        }, author, text, avatarUrl).catch(() => {});
      });

      liveChat.on('error', (err) => {
        console.error('🚨 Ошибка события чата:', err.message);
        scheduleRetry('Официальная ошибка youtube-chat');
      });

      const ok = await liveChat.start();

      if (!ok) {
        scheduleRetry('Стрим пока не найден');
      }
    } catch (err) {
      console.error('🚨 Ошибка при попытке подключения к чату:', err.message);
      scheduleRetry('Ошибка запроса на старт');
    }
  };

  await page.exposeFunction('onNewRoundStarted', () => {
    currentRoundStartTime = Date.now();
    processedMessageIds.clear();
    console.log('🆕 Новый раунд! Сброс фильтров времени и ID.');
  });

  connectToChat();
})();
