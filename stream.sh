#!/bin/bash
killall Xvfb node ffmpeg 2>/dev/null

# Проверяем, передан ли ключ трансляции
if [ -z "$STREAM_KEY" ]; then
  echo "Ошибка: Переменная STREAM_KEY не задана!"
  echo "Запустите докер с флагом -e STREAM_KEY=\"ваш_ключ\""
  exit 1
fi

# Запускаем виртуальный дисплей
Xvfb :99 -screen 0 1080x1920x24 -ac &
sleep 1
export DISPLAY=:99

# Запускаем браузер
node browser.js &
sleep 2

echo "Начинаем прямую трансляцию на YouTube..."

# Запускаем FFmpeg с генерацией пустой аудиодорожки и стримингом по RTMP
ffmpeg -f x11grab \
       -video_size 1080x1920 \
       -framerate 30 \
       -i :99.0 \
       -f lavfi \
       -i anullsrc=channel_layout=stereo:sample_rate=44100 \
       -c:v libx264 \
       -preset veryfast \
       -b:v 2500k \
       -maxrate 2500k \
       -bufsize 5000k \
       -pix_fmt yuv420p \
       -g 60 \
       -c:a aac \
       -b:a 128k \
       -f flv "rtmp://a.rtmp.youtube.com/live2/$STREAM_KEY"