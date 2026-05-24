const puppeteer = require('puppeteer');
const path = require('path');
const { LiveChat } = require('youtube-chat');

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
      '--disable-notifications'
    ],
    defaultViewport: null
  });

  const page = await browser.newPage();
  const fileUrl = `file://${path.join(__dirname, 'index.html')}`;
  await page.goto(fileUrl);
  console.log('Браузер запущен. Отрисовка экрана загрузки...');

  const channelId = process.env.CHANNEL_ID;
  
  if (!channelId) {
    console.log('⚠️ CHANNEL_ID не указан. Запускаем игру в оффлайн-режиме.');
    await page.evaluate(() => window.initGame());
    return;
  }

  let chatConnected = false;
  let isRetrying = false; // Блокиратор для предотвращения дублирования таймеров

  const connectToChat = async () => {
    if (chatConnected) return;

    console.log(`⏳ Проверка статуса стрима на канале ${channelId}...`);
    const liveChat = new LiveChat({ channelId });

    // Единая функция-предохранитель для планирования реконнекта
    const scheduleRetry = () => {
      liveChat.stop(); // Уничтожаем текущий инстанс, чтобы не плодить слушателей
      
      // Если стрим уже подключен или таймер уже запущен — ничего не делаем
      if (chatConnected || isRetrying) return;
      
      isRetrying = true;
      console.log('🔄 Повторная попытка через 5 секунд...');
      setTimeout(() => {
        isRetrying = false;
        connectToChat();
      }, 5000);
    };

    liveChat.on('start', (liveId) => {
      chatConnected = true;
      isRetrying = false;
      console.log(`✅ Чат успешно подключен! Live ID: ${liveId}`);
      
      page.evaluate(() => {
        if (window.initGame) window.initGame();
      }).catch(()=>{});
    });

    liveChat.on('chat', async (chatItem) => {
      const author = chatItem.author.name;
      const avatarUrl = chatItem.author.thumbnail?.url || 'https://via.placeholder.com/250/000000/00FF00?text=?';
      const text = chatItem.message.map(m => m.text || '').join(' ');
      
      await page.evaluate((a, t, img) => {
        if (window.handleChat) window.handleChat(a, t, img);
      }, author, text, avatarUrl).catch(() => {});
    });

    liveChat.on('error', (err) => {
      // Это событие теперь не будет плодить новые таймеры, если catch уже сработал
      scheduleRetry();
    });

    try {
      const ok = await liveChat.start();
      if (!ok) {
        scheduleRetry();
      }
    } catch (err) {
      scheduleRetry();
    }
  };

  // Запускаем первую попытку
  connectToChat();
})();