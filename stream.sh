#!/bin/bash
killall Xvfb node ffmpeg 2>/dev/null
rm -f /tmp/audio_pipe

# Проверяем, передан ли ключ трансляции
if [ -z "$STREAM_KEY" ]; then
  echo "Ошибка: Переменная STREAM_KEY не задана!"
  echo "Запустите докер с флагом -e STREAM_KEY=\"ваш_ключ\""
  exit 1
fi

echo "Подготовка аудио потока..."
# Создаем именованный канал (трубу)
mkfifo /tmp/audio_pipe

# Фоновый процесс-«диджей»: бесконечно декодирует MP3 в сырой звук
(
  while true; do
    mp3_found=false
    
    for file in /app/audio/*.mp3; do
      # Проверка на то, что файл существует (если папка пуста)
      [ -e "$file" ] || continue
      mp3_found=true
      
      echo "🎵 Сейчас играет: $(basename "$file")" >&2
      # Декодируем файл в raw PCM (без заголовков, 16bit, 44100Hz, stereo) и льем в трубу
      ffmpeg -v error -i "$file" -f s16le -ar 44100 -ac 2 -
    done
    
    # Защита от падения: если треков нет, генерируем бесконечную тишину, 
    # чтобы труба не пересохла и стрим не упал
    if [ "$mp3_found" = false ]; then
      echo "⚠️ MP3 файлы не найдены. Генерируем тишину..." >&2
      ffmpeg -v error -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -f s16le -ar 44100 -ac 2 -
    fi
  done
) > /tmp/audio_pipe &

# Запускаем виртуальный дисплей
Xvfb :99 -screen 0 1080x1920x24 -ac &
sleep 1
export DISPLAY=:99

# Запускаем браузер
node browser.js &
sleep 2

echo "Начинаем прямую трансляцию на YouTube..."

# Запускаем основной FFmpeg
# Он читает аудио из /tmp/audio_pipe как из бесконечного микрофона
ffmpeg \
  -f x11grab \
  -video_size 1080x1920 \
  -framerate 30 \
  -i :99.0 \
  -f s16le \
  -ar 44100 \
  -ac 2 \
  -thread_queue_size 1024 \
  -i /tmp/audio_pipe \
  -c:v libx264 \
  -preset veryfast \
  -b:v 2500k \
  -maxrate 2500k \
  -bufsize 5000k \
  -pix_fmt yuv420p \
  -g 60 \
  -c:a aac \
  -b:a 192k \
  -af "loudnorm" \
  -f flv "rtmp://a.rtmp.youtube.com/live2/$STREAM_KEY"