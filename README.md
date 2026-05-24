# Crimea Real Estate Lead Monitor

Мониторит 7 источников по всей России, находит людей которые хотят купить недвижимость в Крыму, и отправляет заявки в Telegram-группу.

## Источники
- Telegram (userbot — реальное время)
- Авито (раздел "Куплю", каждые 30 мин)
- ЦИАН форум (каждые 45 мин)
- ВКонтакте (каждые 20 мин)
- Restate.ru форум (каждый час)
- Move.ru Крым (каждый час)
- Квартира без агента (каждый час)

## Установка

### 1. Получить Telegram API credentials

1. Зайти на https://my.telegram.org
2. Войти под номером телефона мониторинг-аккаунта
3. Нажать "API development tools"
4. Создать приложение (название и платформа — любые)
5. Скопировать `App api_id` и `App api_hash`

### 2. Настроить .env

```bash
cp env.example .env
nano .env
```

Заполнить:
- `API_ID` — из my.telegram.org
- `API_HASH` — из my.telegram.org
- `PHONE` — номер телефона мониторинг-аккаунта (с +7)
- `NOTIFICATION_BOT_TOKEN` — токен бота для отправки (Jarvis_neuro_bot или другой)
- `FORWARD_CHAT_ID` — уже установлен: -1003766315731

### 3. Установить зависимости

```bash
npm install
```

### 4. Запустить

```bash
node index.js
```

При первом запуске придёт SMS на номер из PHONE — ввести код.

### 5. Запустить как сервис (опционально)

```bash
sudo nano /etc/systemd/system/crimea-leads.service
```

```ini
[Unit]
Description=Crimea Real Estate Lead Monitor
After=network.target

[Service]
Type=simple
User=agent
WorkingDirectory=/home/agent/projects/crimea-leads
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable crimea-leads
sudo systemctl start crimea-leads
```

## Добавить VK API (опционально)

Для более точного мониторинга ВКонтакте:
1. Зайти на https://vk.com/apps?act=manage
2. Создать приложение → тип "Standalone"
3. Получить сервисный ключ в настройках
4. Добавить в .env: `VK_TOKEN=your_token`
