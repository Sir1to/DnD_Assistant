# Контракты API и WebSocket

## Общие правила

- Базовый путь REST: `/api`.
- Успешный ответ содержит ресурс напрямую; список кампаний имеет `{ campaigns }`.
- Ошибка: `{ error: { code, message, requestId, details? } }`.
- Время — ISO 8601 UTC, идентификаторы — UUID.
- `POST` возвращает `201`, `DELETE` — `204`, конфликт revision — `409`.
- Клиент передаёт ожидаемый `revision`; сервер обновляет только при совпадении.
- Поля `ownerId`, `campaignId`, timestamps и revision нельзя менять mass update.

## Реализованные маршруты

```text
POST   /auth/register
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh
GET    /auth/me

GET    /campaigns
POST   /campaigns
GET    /campaigns/:campaignId
GET    /campaigns/:campaignId/members
GET    /campaigns/:campaignId/invitations
POST   /campaigns/:campaignId/invitations
DELETE /campaigns/:campaignId/invitations/:invitationId
GET    /invitations/:token
POST   /invitations/:token/accept
GET    /campaigns/:campaignId/lore
POST   /campaigns/:campaignId/lore
GET    /lore/:entryId
PATCH  /lore/:entryId
DELETE /lore/:entryId

GET    /campaigns/:campaignId/battle
POST   /campaigns/:campaignId/battle
PATCH  /battle-scenes/:sceneId
GET    /battle-scenes/:sceneId/background
POST   /battle-scenes/:sceneId/combatants
POST   /battle-scenes/:sceneId/next-turn
PATCH  /battle-combatants/:combatantId
DELETE /battle-combatants/:combatantId
POST   /battle-combatants/:combatantId/hp
POST   /battle-tokens/:tokenId/move

GET    /widgets/catalog
GET    /boards/:boardId
POST   /boards/:boardId/views
POST   /boards/:boardId/widgets
PATCH  /views/:viewId
POST   /views/:viewId/placements
PATCH  /views/:viewId/layout
PATCH  /widgets/:widgetId
POST   /widgets/:widgetId/commands
```

Изменяющие запросы требуют допустимый `Origin`, а маршруты кампаний — действующую
session cookie. Запрос чужой кампании возвращает `404`, чтобы не подтверждать
существование ресурса. Создание кампании одной транзакцией создаёт membership
`OWNER`, доску «Мастерская» и вид `gm-laptop`.

Управление участниками и приглашениями доступно только `OWNER`. Приглашение одноразовое,
имеет срок от 1 до 30 дней и всегда выдаёт роль `PLAYER`. Исходный токен возвращается
только при создании; списки содержат метаданные без токена. `BoardView` создаётся с
`audience: MASTER`; `PATCH /views/:viewId` может явно переключить его в `PLAYERS`.
Ответы кампании и доски для `PLAYER` фильтруются на сервере.

Знания создаются как `DRAFT/MASTER` по умолчанию. `OWNER` и `GM` могут публиковать материал
для `ALL_PLAYERS` или `SELECTED_PLAYERS`; во втором случае каждый получатель должен быть
игроком этой кампании. Изменение требует `expectedRevision`, устаревшая версия возвращает
`409`. Игрок получает только опубликованные и разрешённые ему записи, без списка остальных
получателей.

Тактический стол хранится отдельно от виджета Combat Tracker. `OWNER`/`GM` создают сцену,
добавляют участников, выбирают изображение карты из Альманаха, изменяют HP и передают
ход. `PLAYER` получает сцену только в статусе `LIVE`; скрытые токены и запрещённые
поля не входят в DTO. Игрок может перемещать только принадлежащий ему токен, только в
активный ход, внутри границы и оставшегося бюджета скорости. Урон и лечение доступны
только мастерам. Фон активной сцены отдаётся по отдельному авторизованному маршруту,
поэтому закрытую запись Альманаха не требуется публиковать ради боя.

`POST /widgets/:widgetId/commands` принимает типизированные команды Timer,
Dice/Randomizer и Combat Tracker. Каждая команда содержит `expectedRevision`;
несовпадение возвращает `409`. Таймер сохраняет только временные точки, а не каждую
секунду. Броски выполняются на сервере без `eval`.

## Возможные следующие маршруты

```text
PATCH  /campaigns/:campaignId
GET    /campaigns/:campaignId/boards
POST   /campaigns/:campaignId/boards

GET    /boards/:boardId/views
GET    /boards/:boardId/widgets

PATCH  /views/:viewId/placements/:placementId
DELETE /views/:viewId/placements/:placementId

GET    /widgets/:widgetId
```

## Личные сообщения кампании

```text
GET    /campaigns/:campaignId/direct-conversations
PUT    /campaigns/:campaignId/direct-conversations/:playerUserId
GET    /direct-conversations/:conversationId/messages?beforeSequence=&afterSequence=&limit=
POST   /direct-conversations/:conversationId/messages
PATCH  /direct-conversations/:conversationId/read
```

У беседы один игрок и все текущие `OWNER`/`GM` кампании. Игрок видит только свою
беседу, а чужая беседа отвечает `404` без метаданных. `PUT` создаёт канал для
активного игрока; игрок может вызвать его только для себя. Отправка требует
`clientMessageId` UUID: повторная отправка того же сообщения возвращает уже
созданную запись. Сообщения — только обычный текст до 10 000 символов.

WebSocket-подписка `direct-messages.subscribe { campaignId }` добавляет пользователя
в его персональную комнату кампании. Событие `direct-messages.event` содержит только
`campaignId`, `conversationId`, тип, время и необязательную последовательность — без
текста или данных другого игрока. После reconnect клиент повторяет подписку и
перезагружает REST-снимок.

## WebSocket envelope

Каждое сообщение содержит `contractVersion: 1`, UUID `eventId`, `occurredAt`,
`boardId`, опциональный `revision` и проверенное `data`.

Серверные события:

- `board.view.created`;
- `board.view.updated`;
- `board.layout.updated`;
- `widget.instance.created`;
- `widget.instance.updated`;
- `widget.instance.deleted`;
- `widget.placement.created`;
- `widget.placement.deleted`;
- `timer.command.executed`;
- `encounter.updated`;
- `encounter.turn.changed`.
- `campaign.battle.changed` — metadata-only сигнал перечитать безопасную проекцию сцены.

Клиентские команды:

- `board.subscribe` `{ boardId, lastKnownRevision? }`;
- `campaign.subscribe` `{ campaignId }`;
- `board.unsubscribe` `{ boardId }`;
- `timer.command` `{ widgetId, command, expectedRevision }`;
- `encounter.turn.command` `{ encounterId, direction, expectedRevision }`.

Backend подтверждает команду или возвращает версионированную ошибку. Авторизация
комнаты выполняется до подписки. Мастера и игроки подписываются на разные комнаты:
игрок получает событие без payload и обновляет безопасный REST-снимок. Эфемерные события
в будущем получат отдельный канал и
не будут сохраняться.

## Листы персонажей D&D 5e

```text
GET    /rulesets/dnd5e/character-options
GET    /campaigns/:campaignId/characters
POST   /campaigns/:campaignId/characters
POST   /campaigns/:campaignId/characters/import
GET    /characters/:sheetId
PATCH  /characters/:sheetId
DELETE /characters/:sheetId
GET    /characters/:sheetId/export
```

Лист использует `ruleset: dnd5e-srd-5.2.1`, валидируемый документ `data` и
`expectedRevision` при изменении. `PLAYER` видит и меняет только собственные листы;
`OWNER` и `GM` — все листы кампании. Экспорт имеет формат
`fog-of-lore.character-sheet`, версию `1` и не содержит ID кампании, пользователя,
ревизии или внутренних временных меток. Импорт всегда создаёт новый лист и повторно
проверяет владельца и данные на сервере.

WebSocket-событие `campaign.characters.changed` не содержит листа и служит только
сигналом обновить REST-снимок после изменения или reconnect.

## Вложения знаний

```text
POST   /lore/:entryId/attachments
GET    /lore-attachments/:attachmentId/content
DELETE /lore-attachments/:attachmentId
```

Загрузка — `multipart/form-data`, поле `file`. Разрешены JPEG, PNG, WebP, GIF и PDF
до 10 МБ; сервер проверяет MIME и сигнатуру содержимого. Загрузка и удаление доступны
`OWNER`/`GM`, скачивание наследует видимость записи знаний. Массив metadata
`attachments` возвращается внутри `LoreEntry`.
