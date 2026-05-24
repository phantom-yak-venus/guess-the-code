const puppeteer = require('puppeteer');
const path = require('path');
const { LiveChat } = require('youtube-chat');
const dns = require('dns'); // Используем встроенный модуль DNS

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

  let liveChat = null;
  let chatConnected = false;
  let isRetrying = false; 

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
    }).catch(()=>{});

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

  // Легкий DNS-пинг каждые 10 секунд
  setInterval(() => {
    if (!chatConnected || isRetrying) return;

    dns.resolve('youtube.com', (err) => {
      if (err) {
        console.log('🐕 Сторожевой пес: Обрыв сети (DNS не отвечает)!');
        scheduleRetry('Потеряно соединение с интернетом');
      }
    });
  }, 10000);

  const connectToChat = async () => {
    if (chatConnected) return;

    console.log(`⏳ Проверка статуса стрима на канале ${channelId}...`);
    liveChat = new LiveChat({ channelId });

    liveChat.on('start', (liveId) => {
      chatConnected = true;
      isRetrying = false;
      console.log(`✅ Чат успешно подключен! Live ID: ${liveId}`);
      
      page.evaluate(() => {
        if (window.initGame) window.initGame();
      }).catch(()=>{});

      // --- ДОБАВЬТЕ ЭТОТ БЛОК ДЛЯ ТЕСТА ---
      setTimeout(() => {
        console.log('🚨 СИМУЛЯЦИЯ: Принудительный обрыв связи!');
        // Искусственно вызываем событие 'error' у чата
        liveChat.emit('error', new Error('Тестовая ошибка сети'));
      }, 20000); // Ошибка сработает через 20 секунд
      // ------------------------------------
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
      console.error('🚨 Ошибка события чата:', err.message);
      scheduleRetry('Официальная ошибка youtube-chat');
    });

    try {
      const ok = await liveChat.start();
      if (!ok) scheduleRetry('Стрим пока не найден');
    } catch (err) {
      console.error('🚨 Ошибка при попытке старта:', err.message);
      scheduleRetry('Ошибка запроса на старт');
    }
  };

  connectToChat();
})();