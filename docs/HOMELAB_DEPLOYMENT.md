# Fog of Lore в homelab (Ninkear M7)

Полное руководство по развёртыванию на Debian 12/Ubuntu 24.04 (x86-64) VM в Proxmox, включая Docker, PostgreSQL, HTTPS, backup, архитектуру и диагностику. Его можно использовать как runbook: выполняйте разделы сверху вниз.

## Текущий экземпляр и быстрый вход

Актуальное состояние конкретного сервера на 30 сентября 2026 также кратко зафиксировано в
`docs/CHAT_HANDOFF.md`. Для текущего экземпляра используются:

| Параметр           | Значение                                     |
| ------------------ | -------------------------------------------- |
| SSH                | `projects@192.168.51.125`                    |
| Ключ на Windows    | `C:\Users\Sir1to\.ssh\id_ed25519`            |
| Каталог проекта    | `/opt/fog-of-lore`                           |
| Tailscale hostname | `sir1to-projects.tail95395c.ts.net`          |
| Tailscale IP       | `100.75.197.118`                             |
| HTTPS              | `https://sir1to-projects.tail95395c.ts.net/` |

Быстрая проверка из PowerShell:

```powershell
ssh -i C:\Users\Sir1to\.ssh\id_ed25519 -o BatchMode=yes projects@192.168.51.125 "cd /opt/fog-of-lore && docker compose ps && curl -fsS http://127.0.0.1:4000/api/health"
```

Ключ имеет passphrase и обычно уже загружен в Windows `ssh-agent`. Если `BatchMode` сообщает
об ошибке авторизации, проверить `ssh-add -l`; добавление ключа и ввод passphrase выполняет
пользователь командой `ssh-add C:\Users\Sir1to\.ssh\id_ed25519`. Пользователь `projects`
может управлять Docker без `sudo`, но root-команды требуют пароль.

На сервере сейчас находится незакоммиченный снимок локальной рабочей версии поверх commit
`d3ac88a` ветки `development`. До отдельной синхронизации Git не применять разрушительные
команды и не считать сервер обычным чистым clone. Никогда не перезаписывать `.env`, `data/`
или `backups/` при передаче исходников.

Tailscale Serve настроен так:

```text
https://sir1to-projects.tail95395c.ts.net (tailnet only)
|-- / proxy http://127.0.0.1:8080
```

Backend `127.0.0.1:8080` обслуживает compose-сервис `tailscale-proxy` на Caddy. Если Serve
потребуется восстановить, использовать `sudo tailscale serve --bg --yes
http://127.0.0.1:8080`, а не `TCPForward` с `TerminateTLS`.

Если с этого Windows-ПК `curl` получает HTTP 200, но Firefox показывает
`PR_END_OF_FILE_ERROR`, причина известна: Happ/AdGuard/Mozilla VPN могут направлять приватный
Tailscale-трафик через автоматически обнаруженный прокси. В Firefox выбрать «Без прокси»
либо добавить в bypass `*.ts.net` и `100.64.0.0/10`. В такой ситуации не менять серверный
сертификат и не переустанавливать Tailscale: TLS 1.3 и HTTP/2 уже проверены.

## Архитектура

```text
Браузер -> Caddy (HTTPS, опционально) -> web (Next.js/React)
                                      -> api (NestJS REST + Socket.IO)
                                           |-> PostgreSQL 18 (Drizzle)
                                           `-> /app/data (загрузки)
```

`apps/web` — интерфейс мастера и игрока. `apps/api` — авторизация, кампании, бой, загрузки, REST и WebSocket. `packages/contracts` содержит общие Zod-схемы, `packages/domain` — игровую логику, `packages/ui` — общие компоненты. PostgreSQL — источник истины; REST используется для CRUD и восстановления после reconnect, Socket.IO сообщает об изменениях.

Игроки всегда круглые; картинки применяются к врагам/NPC и окружению. API автоматически назначает свободный цвет в пределах сцены и подбирает свободную клетку, если координаты не переданы. GIF сохраняются в файловом storage, метаданные — в PostgreSQL.

## Требования

- Debian 12 или Ubuntu Server 24.04, x86-64;
- 4 ГБ RAM минимум, 8 ГБ комфортно;
- 20 ГБ свободного SSD плюс отдельное место под backup;
- Docker Engine 24+ и Docker Compose v2;
- статический LAN-IP/DHCP reservation;
- DNS-имя для HTTPS либо VPN/Tailscale.

CPU Ninkear M7 достаточно для домашней партии. Ограничения обычно связаны с диском (карты/GIF) и резервными копиями. PostgreSQL наружу не публикуйте.

## VM в Proxmox

Создайте отдельную Linux VM, а не LXC: Docker внутри VM проще обновлять, изолировать и восстанавливать. Рекомендуемая стартовая конфигурация:

- OS: Debian 12 или Ubuntu Server 24.04 ISO;
- CPU: 2 vCPU типа `host`;
- RAM: 4 ГБ (8 ГБ, если на VM будут ещё сервисы);
- диск: 32 ГБ+ на SSD, SCSI/VirtIO SCSI, включить `Discard` и `IO thread`;
- сеть: VirtIO, bridge `vmbr0` в домашнюю LAN;
- включить QEMU Guest Agent и после установки установить `qemu-guest-agent` в госте.

В Proxmox назначьте VM фиксированный адрес через DHCP reservation на роутере либо статический IP в гостевой ОС. Если включён Proxmox Firewall, разрешите VM входящий TCP 22, а TCP 80/443 — только если нужен публичный Caddy. Не публикуйте 3000, 4000 или 5432 ни правилами Proxmox, ни роутером.

После установки ОС:

```bash
sudo apt update
sudo apt install -y qemu-guest-agent
sudo systemctl enable --now qemu-guest-agent
ip -brief address
ip route
```

Проверьте IP VM в панели Proxmox и с другого устройства LAN. Snapshot Proxmox удобен перед обновлением, но не заменяет PostgreSQL dump: снимок работающей БД не гарантирует консистентность.

## Подготовка ОС и Docker

Для **Ubuntu** выполните:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y ca-certificates curl git ufw unattended-upgrades
sudo timedatectl set-timezone Europe/Moscow
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
docker run --rm hello-world
docker compose version
```

Для **Debian 12** используйте этот блок вместо Ubuntu-строк с Docker repository:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y ca-certificates curl git ufw unattended-upgrades
sudo timedatectl set-timezone Europe/Moscow
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
docker run --rm hello-world
docker compose version
```

Откройте только SSH и, при публичном HTTPS, HTTP/HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Порты 3000, 4000 и 5432 не открывайте в интернет.

Compose использует named volume `postgres-data` для базы, bind mount `./data:/app/data` для загруженных файлов и `./backups:/backups` для maintenance-профиля. Для нестандартного локального bind используйте `WEB_BIND_ADDRESS` и `API_BIND_ADDRESS`; при reverse proxy оставляйте их на `127.0.0.1`.

## Получение проекта и секреты

```bash
sudo mkdir -p /opt/fog-of-lore
sudo chown -R "$USER":"$USER" /opt/fog-of-lore
git clone -b development https://github.com/Sir1to/DnD_Assistant.git /opt/fog-of-lore
cd /opt/fog-of-lore
mkdir -p data backups
cp .env.example .env
openssl rand -base64 36
```

Для первого развёртывания можно использовать ветку `development`; переносить код в
`main` заранее не требуется. Если репозиторий приватный, GitHub может запросить
авторизацию через Personal Access Token или SSH-ключ.

Если проект уже был склонирован на VM, обновите его из `development`:

```bash
cd /opt/fog-of-lore
git switch development
git pull --ff-only origin development
docker compose build --pull
docker compose up -d
docker compose exec api pnpm db:migrate
```

Рекомендуемый рабочий процесс — разрабатывать и проверять изменения в `development`,
а затем объединять её с `main` через Pull Request на GitHub. После этого production-VM
можно перевести на стабильную ветку `main`:

```bash
cd /opt/fog-of-lore
git switch main
git pull --ff-only origin main
docker compose build --pull
docker compose up -d
docker compose exec api pnpm db:migrate
```

Не выполняйте `git pull` с `--rebase` или `--allow-unrelated-histories` на production-VM
без необходимости: история ветки должна обновляться обычным fast-forward способом.

В `.env` для публичного HTTPS укажите:

```dotenv
POSTGRES_DB=fog_of_lore
POSTGRES_USER=fog_of_lore
POSTGRES_PASSWORD=<длинный-случайный-пароль>
WEB_ORIGIN=https://fog.example.net
NEXT_PUBLIC_API_URL=/api
COOKIE_SECURE=true
FOG_OF_LORE_DOMAIN=fog.example.net
```

`WEB_ORIGIN` должен точно совпадать с адресом браузера. Для локального HTTP используйте `COOKIE_SECURE=false`.

### Какие переменные действительно используются Compose

Compose передаёт в production-контейнер API: `WEB_ORIGIN`, `COOKIE_SECURE`, PostgreSQL-параметры и принудительно задаёт `FILE_STORAGE_PATH=/app/data`. В web на этапе сборки передаётся `NEXT_PUBLIC_API_URL`. `APP_VERSION`, `APP_COMMIT` и `APP_BUILD_TIME` передаются обоим приложениям; штатный `pnpm release:build` вычисляет их сам. Значения `SESSION_TTL_DAYS`, `LOGIN_RATE_LIMIT_ATTEMPTS` и `LOGIN_RATE_LIMIT_WINDOW_SECONDS` из `.env.example` **сейчас не пробрасываются compose-файлом**; API применяет свои встроенные defaults: 30 дней, 5 попыток, 900 секунд. Не рассчитывайте на их изменение через `.env`, пока не добавите их в `compose.yaml`.

## Выбор сценария доступа

Выберите ровно один основной сценарий и согласуйте с ним `WEB_ORIGIN` и `COOKIE_SECURE`.

| Сценарий             | Адрес в браузере               | Настройки                                                                                                                  | Сеть                             |
| -------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Публичный домен      | `https://fog.example.net`      | `COOKIE_SECURE=true`, Caddy profile                                                                                        | DNS A/AAAA, проброс 80/443 на VM |
| Tailscale/VPN        | HTTPS-адрес VPN или TLS на VPN | `WEB_ORIGIN` должен совпадать с ним; secure cookie только с HTTPS                                                          | не открывать порты в интернет    |
| Только LAN, временно | `http://VM_IP:3000`            | `WEB_BIND_ADDRESS=0.0.0.0`, `COOKIE_SECURE=false`, `NEXT_PUBLIC_API_URL=http://VM_IP:4000/api`, `API_BIND_ADDRESS=0.0.0.0` | firewall только для LAN          |

Последний сценарий не подходит для недоверенной сети: HTTP передаёт сессию без TLS. Для постоянного LAN-доступа используйте внутренний DNS и VPN либо настройте внутренний TLS отдельно. Текущий `Caddyfile` получает публичный сертификат автоматически только если домен резолвится на VM и Caddy доступен снаружи по 80/443.

## Первый запуск

```bash
docker compose build --pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 postgres api web
docker compose exec api pnpm db:migrate
```

Демо-данные необязательны. Для них задайте `DEMO_PASSWORD` (12+ символов) и выполните `docker compose exec api pnpm db:seed`.

```bash
curl http://127.0.0.1:4000/api/health
curl -I http://127.0.0.1:3000
```

## HTTPS через Caddy

DNS-имя должно указывать на внешний IP, а роутер — пробрасывать TCP 80/443 на M7:

```bash
docker compose --profile proxy up -d
docker compose ps
docker compose logs -f caddy
```

Caddy проксирует web, `/api` и `/socket.io`, получает сертификат Let’s Encrypt и хранит его в volume `caddy-data`. Для LAN-only безопаснее VPN/Tailscale.

Если сертификат не выпускается, сначала проверьте: публичный DNS, проброс TCP 80/443 именно на IP VM, firewall роутера, UFW гостя и отсутствие другого reverse proxy на этих портах. Не делайте много повторных попыток подряд — можно попасть под rate limit Let's Encrypt.

## Обновление

После того как рабочее дерево сервера приведено к чистой ветке `development`, штатное
обновление запускается одной командой:

```bash
pnpm release:deploy
```

Сначала план можно проверить без изменений системы:

```bash
pnpm release:deploy -- --dry-run
```

Скрипт требует существующие production-образы для безопасного отката и выполняет цепочку
`preflight → backup → git pull --ff-only → frozen install → migration check → release build →
migrate → recreate → smoke test`. Перед сборкой текущие API/web-образы получают уникальные
rollback-теги. Если миграция или smoke test завершаются ошибкой, скрипт останавливает новую
версию, восстанавливает PostgreSQL из созданного dump (если миграция уже началась), возвращает
предыдущие образы и ждёт их healthcheck. Исходники остаются на неудачном commit для диагностики;
автоматический `git reset` намеренно не выполняется.

`.env`, `data/` и `backups/` не копируются и не удаляются. Загруженные файлы не требуют
отката, потому что во время миграции API и web остановлены. Для нестандартных имён образов
задайте `DEPLOY_API_IMAGE` и `DEPLOY_WEB_IMAGE`; для другой ветки — `DEPLOY_BRANCH` или
`--branch`. Флаг `--skip-pull` предназначен только для уже проверенного локального checkout.

Ручная последовательность для диагностики остаётся такой:

```bash
docker compose --profile maintenance run --rm backup
git pull --ff-only
pnpm release:build
docker compose stop web api
docker compose run --rm api pnpm db:migrate
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:4000/api/health
```

После успешной сборки `deploy-reports/build-*.json` фиксирует version, commit, признак
грязного рабочего дерева и UTC-время. Эти же значения должны появиться в `build` ответа
healthcheck и короткой метке в интерфейсе. Каталог отчётов не входит в Git; переносите
нужный отчёт вместе с журналом конкретного deploy.

Так новая схема применяется до возврата пользовательского трафика. Если миграция не прошла, не запускайте новую версию поверх старой схемы: изучите `docker compose logs api postgres`, восстановите dump при необходимости и возвращайтесь к известной версии кода. Миграции лежат в `apps/api/drizzle`. После изменения `schema.ts` локально выполните `pnpm db:generate`, проверьте SQL и только затем применяйте `pnpm db:migrate`. Не используйте `docker compose down -v`.

Миграции `0013_battle_object_labels` и `0014_repair_battle_object_labels` идемпотентны.
Если колонка `show_label` ранее была добавлена на сервере вручную, обычный `db:migrate`
безопасно зафиксирует цепочку и продолжит с metadata checkpoint `0015`; удалять строки из
`drizzle.__drizzle_migrations` или повторно изменять таблицу вручную не нужно. Перед запуском
можно проверить фактическую схему и историю:

```bash
docker compose exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d battle_scene_objects"'
docker compose exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select * from drizzle.__drizzle_migrations order by created_at"'
docker compose run --rm api pnpm migrations:check
docker compose run --rm api pnpm db:migrate
```

`0015` не меняет таблицы: он синхронизирует Drizzle snapshot с уже применёнными SQL
`0008–0014`, чтобы следующая генерация миграции не пыталась создать те же объекты повторно.

## Backup и восстановление

```bash
docker compose --profile maintenance run --rm backup
find backups -type f -mtime +30 -delete
```

Копируйте на внешний диск/NAS и `backups/`, и `data/`: PostgreSQL-дамп не содержит загруженные изображения.

### Ежедневный backup через systemd

Создайте `/etc/systemd/system/fog-of-lore-backup.service`:

```ini
[Unit]
Description=Fog of Lore PostgreSQL backup
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/fog-of-lore
ExecStart=/usr/bin/docker compose --profile maintenance run --rm backup
ExecStartPost=/usr/bin/find /opt/fog-of-lore/backups -type f -name *.dump -mtime +30 -delete
```

И `/etc/systemd/system/fog-of-lore-backup.timer`:

```ini
[Unit]
Description=Daily Fog of Lore backup

[Timer]
OnCalendar=*-*-* 03:20:00
Persistent=true
RandomizedDelaySec=20m

[Install]
WantedBy=timers.target
```

Активируйте и проверьте:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fog-of-lore-backup.timer
sudo systemctl start fog-of-lore-backup.service
systemctl list-timers fog-of-lore-backup.timer
ls -lh /opt/fog-of-lore/backups
```

Systemd timer создаёт dump, но не копирует его на другой носитель. Настройте отдельную репликацию `backups/` и `data/` на NAS (например, `rsync` по SSH) и периодически проверяйте, что удалённая копия читается. Права на backup должны быть ограничены владельцем сервиса.

Восстановление заменяет таблицы. Остановите приложение, сделайте дополнительную свежую копию и только затем выполните:

```bash
cd /opt/fog-of-lore
docker compose stop web api
docker compose exec -T postgres pg_restore -U fog_of_lore -d fog_of_lore --clean --if-exists < backups/fog-of-lore-YYYYMMDDTHHMMSSZ.dump
docker compose up -d
docker compose exec api pnpm db:migrate
curl -fsS http://127.0.0.1:4000/api/health
```

Затем восстановите соответствующую сохранённую копию `data/`, если это аварийное восстановление всего сервиса. Проверяйте реальное восстановление минимум раз в квартал на отдельной тестовой VM или БД.

## Архитектурные нюансы

- Авторизация — cookie-сессии; при HTTPS обязательно `COOKIE_SECURE=true`.
- Роли кампании ограничивают мастерские данные и действия игрока.
- REST-запросы используют `expectedRevision` для optimistic concurrency; конфликт означает изменение объекта другим клиентом.
- WebSocket не является источником истины: после reconnect клиент перечитывает snapshot через REST.
- Игроки всегда круги; API отклоняет image attachment для `PLAYER`.
- Цвет хранится на battle token и уникализируется отдельно для каждой сцены.
- Пустые X/Y при создании позволяют API найти свободную клетку; явные координаты проверяются на границы и terrain.
- GIF окружения отдаётся как загруженный файл. Используйте небольшие оптимизированные GIF/WebP и следите за размером `data/`.
- Полноэкранный режим, zoom и pan зависят от Fullscreen/Pointer/Wheel API; на планшете лучше landscape и современный Chromium/Safari.
- События боя включают позицию, урон и лечение; клиент показывает короткие CSS-анимации, но состояние всегда берётся из API.

## Типичные проблемы

### `Unexpected server error` при открытии боя

```bash
docker compose ps
docker compose logs --tail=200 api postgres
docker compose exec api pnpm db:migrate
```

Обычно причина — неприменённая миграция, неправильный `WEB_ORIGIN` или недоступная база.

### `Token destination is blocked by terrain`

Клетка занята препятствием/блокирующим объектом или токен выходит за форму поля. Оставьте координаты пустыми — API подберёт свободную клетку. Проверьте `blocksMovement` у объектов.

### Не загружается изображение/GIF

```bash
df -h
docker compose exec api ls -la /app/data
docker compose logs --tail=100 api
```

Проверьте права на `data/`, свободное место и MIME-тип. Storage не должен быть read-only.

### Не работает вход за прокси

Проверьте `WEB_ORIGIN`, `COOKIE_SECURE=true`, HTTPS и проксирование `/api`/`/socket.io`. Secure-cookie не работает на HTTP.

### Не синхронизируется WebSocket

Проверьте в DevTools запрос `/socket.io`. Даже при сбое Socket.IO клиент восстановит состояние через REST после reconnect.

### VM доступна из Proxmox, но не из LAN/интернета

Проверьте цепочку от гостя к внешней сети:

```bash
ip -brief address
ip route
sudo ufw status verbose
sudo ss -ltnp | grep -E ':80|:443|:3000|:4000'
```

Для LAN проверьте bridge `vmbr0`, VLAN и DHCP reservation. Для интернета проверьте также DNS A/AAAA, проброс портов роутера на IP VM и firewall Proxmox. Проброс портов на IP хоста Proxmox вместо IP VM — частая ошибка.

### Caddy не получает сертификат

```bash
docker compose logs --tail=200 caddy
```

Публичный DNS должен уже указывать на VM, а TCP 80 и 443 должны быть доступны извне. Если это невозможно (CGNAT, только LAN), не используйте публичный Let's Encrypt сценарий: выберите Tailscale/VPN или настройте внутренний CA/TLS.

### PostgreSQL unhealthy или миграция зависла

```bash
docker compose logs postgres
docker compose exec postgres pg_isready -U fog_of_lore -d fog_of_lore
```

Не запускайте миграции параллельно и не удаляйте `postgres-data` без проверенного backup.

## Эксплуатационный чек-лист

- [ ] SSH по ключам, root-вход отключён.
- [ ] Регулярно обновляются ОС и Docker.
- [ ] Пароли не коммитятся и не совпадают с demo-паролем.
- [ ] Наружу открыты только 80/443 или VPN.
- [ ] Ежедневно копируются PostgreSQL и `data/` вне M7.
- [ ] Proxmox snapshot используется только как дополнительный rollback, а не вместо dump.
- [ ] Проверены VM bridge/VLAN, Proxmox Firewall, UFW и маршрутизация до DNS/роутера.
- [ ] После deploy проверяются `/api/health`, вход, поле боя и загрузка изображения.
- [ ] Контролируется заполнение диска Docker-слоями, логами и загрузками.
