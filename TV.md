# Установка на телевизор LG (webOS 4–6)

Шаги 1–3 делаются **один раз**. Потом обновлять приложение на ТВ — одна команда `npm run tv`.

## Вариант A: телевизор с Homebrew Channel (root) — основной

Developer Mode и аккаунт LG не нужны, таймера нет — приложение остаётся на ТВ навсегда.

### 1. Включить SSH на телевизоре

1. Откройте **Homebrew Channel** → **Settings** (шестерёнка).
2. Проверьте, что **Root status: ok**.
3. Включите **SSH Server**.
4. Узнайте IP телевизора: *Настройки → Сеть → Подключение → Дополнительно* (например `192.168.1.57`).

Компьютер и телевизор должны быть **в одной сети**.

### 2. Положить ключ компьютера на телевизор

Ключ уже создан: `~/.ssh/webos_tv` (секретная часть, остаётся на ПК) и `~/.ssh/webos_tv.pub` (публичная, идёт на ТВ).

Подставьте IP телевизора:

```bash
cat ~/.ssh/webos_tv.pub | ssh root@192.168.1.57 "mkdir -p /home/root/.ssh && cat >> /home/root/.ssh/authorized_keys && chmod 600 /home/root/.ssh/authorized_keys"
```

- На вопрос `Are you sure you want to continue connecting` ответьте `yes`.
- Пароль — стандартный пароль Homebrew Channel: `alpine`.

> После добавления ключа Homebrew Channel перестаёт пускать по паролю `alpine` — так безопаснее.

### 3. Добавить телевизор в утилиты LG

```bash
npx ares-setup-device -a tv -i "username=root" -i "privatekey=webos_tv" -i "passphrase=" -i "host=192.168.1.57" -i "port=22"
```

Проверка связи (должна показать модель и версию webOS):

```bash
npx ares-device --device tv --system-info
```

## Вариант B: обычный телевизор без root (Developer Mode)

1. Аккаунт на https://webostv.developer.lge.com.
2. На ТВ: LG Content Store → **Developer Mode** → войти → **Dev Mode Status: ON** (перезагрузка) → **Key Server: ON**.
3. Запишите IP и Passphrase с экрана.
4. `npx ares-setup-device -a tv -i "username=prisoner" -i "host=IP" -i "port=9922"`
5. `npx ares-novacom --device tv --getkey` → введите passphrase.

Режим разработчика живёт ~50 часов, продлевается кнопкой **Extend**.

## Установить и запустить

```bash
npm run tv
```

Собирает приложение, упаковывает в `build/com.atvlampa.app_0.1.0_all.ipk`, ставит на ТВ и запускает.
**ATV Lampa** появится в списке приложений телевизора.

## Отладка

```bash
npm run tv:inspect
```

Открывает DevTools (как F12 в браузере), подключённые к приложению на телевизоре.

## Если что-то не так

| Проблема | Что делать |
|---|---|
| `Connection refused` / `ETIMEDOUT` | Проверьте IP, одну сеть, что SSH Server в Homebrew Channel включён |
| `Permission denied` при `ssh root@…` | Ключ уже добавлен ранее и пароль отключён — переходите к шагу 3 |
| `All configured authentication methods failed` | Ключ не попал на ТВ — повторите шаг 2 |
| Чёрный экран | `npm run tv:inspect` → вкладка Console, пришлите ошибку |
| IP телевизора сменился | `npx ares-setup-device -m tv -i "host=НОВЫЙ_IP"` |
