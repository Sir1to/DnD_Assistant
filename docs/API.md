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

GET    /campaigns/:campaignId/characters
POST   /campaigns/:campaignId/characters
GET    /characters/:sheetId
PATCH  /characters/:sheetId
GET    /characters/:sheetId/document
PATCH  /characters/:sheetId/document
GET    /characters/:sheetId/document-revisions
POST   /characters/:sheetId/document-revisions/:documentRevision/restore
PATCH  /characters/:sheetId/runtime
POST   /characters/:sheetId/portrait
GET    /characters/:sheetId/portrait
GET    /characters/:sheetId/export
GET    /characters/:sheetId/export/folchar
POST   /campaigns/:campaignId/characters/import/preview
POST   /campaigns/:campaignId/characters/import/folchar
DELETE /characters/:sheetId

GET    /campaigns/:campaignId/battle
POST   /campaigns/:campaignId/battle
POST   /campaigns/:campaignId/battle/encounter
POST   /campaigns/:campaignId/battle/generate
GET    /campaigns/:campaignId/battle-combatant-presets
POST   /campaigns/:campaignId/battle-combatant-presets/import
PATCH  /battle-scenes/:sceneId
GET    /battle-scenes/:sceneId/background
POST   /battle-scenes/:sceneId/combatants
POST   /battle-scenes/:sceneId/characters/:sheetId/place
POST   /battle-scenes/:sceneId/combatant-presets/:presetId/import
POST   /battle-scenes/:sceneId/next-turn
POST   /characters/:sheetId/battle-combatant-preset
PATCH  /battle-combatants/:combatantId
DELETE /battle-combatants/:combatantId
POST   /battle-combatants/:combatantId/hp
POST   /battle-combatants/:combatantId/resources
POST   /battle-combatants/:combatantId/preset
PATCH  /battle-combatant-presets/:presetId
POST   /battle-combatant-presets/:presetId/duplicate
GET    /battle-combatant-presets/:presetId/export
DELETE /battle-combatant-presets/:presetId
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

Боевые пресеты доступны только `OWNER`/`GM` и принадлежат кампании. Пресет создаётся из
существующего участника или листа персонажа, редактируется, дублируется и удаляется
независимо от сцен. Импорт создаёт нового независимого участника: текущие HP равны
максимальным, состояния и потраченная скорость сброшены. Мастер может оставить первую
свободную клетку и значения пресета либо перед добавлением выбрать владельца, координаты,
размер, цвет и переопределить основные характеристики только для этого боя. Изменения
импортированной копии не меняют пресет или другие бои.

Переносимый формат `fog-of-lore.battle-combatant-preset` версии 1 исключает ID кампании,
пользователя и вложения. Владелец при импорте всегда сбрасывается. Необязательное изображение
токена переносится как base64 только для JPEG/PNG/WebP, проверяется по сигнатуре и фактическим
размерам (до 512 КиБ и 4096×4096), а затем сохраняется в приватном черновике Альманаха новой
кампании. Встроенный токен вместо файла переносится стабильным `systemAssetId`. Экспорт и
импорт доступны только `OWNER`/`GM`.

Встроенный стартовый набор боевых ассетов версионируется в доменном каталоге и не создаёт
строк пользовательских вложений. `systemAssetId` хранится у токена, препятствия, объекта и
боевого пресета, проходит через именованный снимок и безопасную player-проекцию. API принимает
только существующий ID нужного типа (`TOKEN`, `OBSTACLE` или `PROP`); системный ассет и
`imageAttachmentId` взаимоисключающие. Обычный токен `PLAYER` не принимает ни один вид
изображения. Исключение — герой, размещённый из roster специальной серверной командой: он
получает проверенный портрет связанного листа, но клиент не может назначить картинку
произвольному PLAYER-токену.
Сами файлы стартового набора являются публичными статическими ресурсами, но скрытый объект
целиком удаляется из player-проекции, поэтому его ID и изображение не раскрываются.

`POST /campaigns/:campaignId/battle/generate` принимает структурированное описание
случайной карты: местность, размер/форму, число игроков, состав противников, опасность,
цель, расположение стартов, плотность препятствий, сложную местность, свет, погоду,
входы, интерактивные объекты и опасности. Пропущенные поля получают безопасные значения
по умолчанию. `seed` необязателен; ответ всегда возвращает фактически использованный
`generation.seed`, резюме и координаты стартов. Одинаковые описание и seed создают
одинаковую раскладку (UUID новых строк различаются). Результат атомарно сохраняется как
редактируемая сцена `DRAFT`, никогда не запускает бой и отвечает `409`, если в кампании
уже есть неархивированная сцена.

`POST /campaigns/:campaignId/battle/encounter` атомарно добавляет состав Encounter Lab
на текущую неархивированную сцену. Для SRD-существ сервер заново читает
проверенный статблок, переносит HP, КД, бонус инициативы, скорость и размер,
затем расставляет новые токены по свободным клеткам. Каждая копия получает
свои текущие HP, состояния и позицию. Если хотя бы один ID неизвестен или на поле
нет места для всего состава, запрос не создаёт частичных участников. Маршрут доступен
только `OWNER`/`GM`.

Портрет листа загружается как JPEG/PNG/WebP через авторизованный multipart-маршрут. Web-клиент
кадрирует исходник в квадрат 512×512 до отправки; сервер повторно проверяет MIME, сигнатуру,
размер и принадлежность листа кампании. `OWNER`/`GM` может поставить лист непосредственно на
текущую сцену. Имя, владелец, текущие и временные HP, состояния, КД, скорость, класс, вид и
инициатива вычисляются сервером из документа/runtime, а `battle_combatant` сохраняет
`character_sheet_id`. Повторное размещение того же листа на одной сцене возвращает `409`.
Именованный снимок сохраняет связь и портрет; удалённый или чужой лист при восстановлении не
подставляется.

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
GET    /characters/:sheetId/document
PATCH  /characters/:sheetId/document
GET    /characters/:sheetId/document-revisions
POST   /characters/:sheetId/document-revisions/:documentRevision/restore
PATCH  /characters/:sheetId/runtime
DELETE /characters/:sheetId
GET    /characters/:sheetId/export
```

Лист использует `ruleset: dnd5e-srd-5.2.1`, версию набора правил, версию документа,
режим создания и валидируемый документ `data`. Старый UI по-прежнему получает совместимую
v1-проекцию: сервер безопасно читает документы v1 и v2, но legacy `PATCH` не перезаписывает
документ v2. `GET /document` возвращает единую v2-модель, производные значения, проблемы
правил и фактическую версию хранимого документа. Для v1 это проекция без записи; первый
успешный `PATCH /document` атомарно повышает лист до v2 по `expectedRevision`. `DRAFT` может хранить
ошибки правил, а `READY` — нет. Campaign overrides создают только OWNER/GM; сохранённые legacy overrides
нельзя подменить новыми. Постоянные текущие HP, временные HP, ресурсы, ячейки, состояния, вдохновение и
спасброски от смерти хранятся отдельно в `runtime` и меняются через собственный маршрут с
независимым `expectedRevision`. `PLAYER` видит и меняет только собственные листы;
`OWNER` и `GM` — все листы кампании. Экспорт имеет формат
`fog-of-lore.character-sheet`, версию `1` и не содержит ID кампании, пользователя,
ревизии или внутренних временных меток. Импорт всегда создаёт новый лист и повторно
проверяет владельца и данные на сервере.

Каждая запись v2-документа атомарно добавляет append-only ревизию с автором,
типом изменения и необязательным `changeSummary`. Восстановление требует текущий
`expectedRevision` и создаёт новую ревизию вместо перезаписи истории. Если OWNER/GM меняет
чужой лист, сервер сам определяет изменённые JSON Pointer-пути и помечает их как
`Правка мастера`; клиент не может подделать эти метки. Следующее изменение того же
поля владельцем снимает активную метку.

WebSocket-событие `campaign.characters.changed` не содержит листа и служит только
сигналом обновить REST-снимок после изменения или reconnect.

## Бестиарий D&D 5e

```text
GET    /rulesets/dnd5e/monsters
GET    /rulesets/dnd5e/monsters/:monsterId
```

Первый маршрут возвращает лёгкие карточки всех 322 существ: стабильный SRD ID, название,
размер, тип, CR, XP, КД, хиты и инициативу. Второй маршрут возвращает один нормализованный
статблок с характеристиками, скоростями, чувствами, защитами, особенностями, действиями,
реакциями и легендарными действиями. Оба маршрута требуют пользовательскую сессию; в каждом
ответе полного статблока сохраняются `source: SRD 5.2.1` и `license: CC-BY-4.0`.

Набор воспроизводимо генерируется `scripts/import-srd-bestiary.mjs` из открытых данных SRD.
Список отделён от деталей намеренно: справочник и Encounter Lab не загружают около мегабайта
описаний до выбора конкретного существа.

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
