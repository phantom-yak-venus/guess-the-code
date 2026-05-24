# Infra

Скрипты для быстрого развёртывания и управления `guess-the-code` на Ubuntu-сервере через Docker и systemd.

По умолчанию сервис:

```text
запускается каждые 5 минут
работает 120 секунд
при остановке ждёт graceful shutdown максимум 15 секунд
после этого останавливается жёстко
```

## Структура

```text
infra/
  env.example  # пример конфигурации, можно коммитить
  env          # локальная конфигурация с секретами, НЕ коммитить
  init         # создаёт/перезаписывает systemd service и timer
  start        # запускает работу по расписанию
  stop         # останавливает расписание и текущий контейнер
```

## 1. Скачать проект

Через HTTPS:

```bash
git clone https://github.com/phantom-yak-venus/guess-the-code.git
cd guess-the-code
```

Или через SSH:

```bash
git clone git@github.com:phantom-yak-venus/guess-the-code.git
cd guess-the-code
```

## 2. Установить Docker

```bash
sudo apt update
sudo apt install -y docker.io
sudo systemctl enable --now docker
```

Проверить:

```bash
sudo docker ps
```

## 3. Создать локальный env-файл

```bash
cp infra/env.example infra/env
nano infra/env
```

Минимально заполнить:

```bash
STREAM_KEY=your_youtube_stream_key
CHANNEL_ID=your_youtube_channel_id
```

`infra/env` содержит секреты. Его нельзя коммитить.

## 4. Собрать Docker-образ

```bash
sudo docker build -t headless-timer .
```

Имя образа должно совпадать с `IMAGE_NAME` в `infra/env`.

## 5. Инициализировать systemd

```bash
chmod +x infra/init infra/start infra/stop
./infra/init
```

Скрипт создаст или перезапишет:

```text
/etc/guess-the-code.env
/etc/systemd/system/guess-the-code.service
/etc/systemd/system/guess-the-code.timer
```

## 6. Запустить работу по расписанию

```bash
./infra/start
```

## 7. Остановить расписание и текущий контейнер

```bash
./infra/stop
```

## 8. Проверить статус

Проверить таймер:

```bash
systemctl status guess-the-code.timer
systemctl list-timers | grep guess-the-code
```

Проверить service:

```bash
systemctl status guess-the-code.service
```

Проверить контейнер:

```bash
sudo docker ps --filter name=guess-the-code
```

Смотреть логи:

```bash
journalctl -u guess-the-code.service -f -a
```

## 9. Обновить код и пересобрать

```bash
./infra/stop
git pull
sudo docker build -t headless-timer .
./infra/init
./infra/start
```

## Полезные команды

Ручной запуск service:

```bash
sudo systemctl start guess-the-code.service
```

Ручная остановка service:

```bash
sudo systemctl stop guess-the-code.service
```

Последние логи:

```bash
journalctl -u guess-the-code.service -n 100 --no-pager -a
```

Логи в реальном времени:

```bash
journalctl -u guess-the-code.service -f -a
```

Потребление CPU/RAM контейнером:

```bash
sudo docker stats guess-the-code
```

Жёстко удалить контейнер:

```bash
sudo docker rm -f guess-the-code
```

Сбросить failed-состояние systemd:

```bash
sudo systemctl reset-failed guess-the-code.service
```

Проверить созданные unit-файлы:

```bash
systemctl cat guess-the-code.service
systemctl cat guess-the-code.timer
```

Проверить IPv4/IPv6 доступность YouTube:

```bash
curl -4 -I -L https://www.youtube.com
curl -6 -I -L https://www.youtube.com
```


