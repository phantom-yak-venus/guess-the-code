const puppeteer = require('puppeteer');
const path = require('path');
const { LiveChat } = require('youtube-chat');
const dns = require('dns');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1080,1920', '--kiosk', '--hide-scrollbars'],
    defaultViewport: null
  });

  const page = await browser.newPage();

  // --- ПРОБРОС ПЕРЕМЕННЫХ ОКРУЖЕНИЯ В БРАУЗЕР ---
  await page.evaluateOnNewDocument((config) => {
    window.GAME_CONFIG = config;
  }, {
    appVersion: process.env.APP_VERSION || "SYS_HACK v1.3.0",
    showVersion: process.env.SHOW_VERSION !== 'false', 
    cheatsEnabled: process.env.CHEATS_ENABLED === 'true', 
    difficulty: process.env.DIFFICULTY || "MEDIUM" 
  });

  const fileUrl = `file://${path.join(__dirname, 'index.html')}`;
  await page.goto(fileUrl);

  let processedMessageIds = new Set();
  let currentRoundStartTime = 0;

  const channelId = process.env.CHANNEL_ID;
  if (!channelId) {
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
    
    console.log(`\n🔄 РАЗРЫВ (${reason}). Переподключение...`);
    if (liveChat) { liveChat.stop(); liveChat = null; }
    
    page.evaluate(() => { if (window.showReconnect) window.showReconnect(); }).catch(()=>{});
    setTimeout(() => { isRetrying = false; connectToChat(); }, 5000);
  };

  const connectToChat = async () => {
    if (chatConnected) return;

    liveChat = new LiveChat({ channelId });

    liveChat.on('start', (liveId) => {
      chatConnected = true;
      isRetrying = false;
      console.log(`✅ Чат подключен: ${liveId}`);
      page.evaluate(() => { if (window.initGame) window.initGame(); }).catch(()=>{});
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

    liveChat.on('error', (err) => scheduleRetry('Ошибка чата'));
    
    try {
      const ok = await liveChat.start();
      if (!ok) scheduleRetry('Стрим не найден');
    } catch (err) { scheduleRetry('Ошибка старта'); }
  };

  await page.exposeFunction('onNewRoundStarted', () => {
      currentRoundStartTime = Date.now();
      processedMessageIds.clear();
  });

  connectToChat();
})();