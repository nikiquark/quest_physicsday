# ФизКвест

Веб-приложение для офлайн-квеста школьников. Участник сканирует QR на входе, вводит имя,
получает личный маршрут по станциям и ArUco-маркер на телефоне. Начальник станции сканирует
камерой сразу все маркеры группы — станция засчитывается. На финише выдают приз.
До 500 участников, на станции одновременно 10–15 человек. Приоритет — скорость и надёжность.

## Стек

- **backend/** — Django 5 + Django REST Framework + Channels (ASGI, uvicorn), Postgres, Redis (channel layer + cache).
- **frontend/** — React + TypeScript + Vite, React Router, CSS Modules. Распознавание ArUco — OpenCV.js в Web Worker.
- **Docker Compose**: `docker-compose.yml` (prod), `docker-compose.dev.yml` (dev, hot reload).

## Команды

```bash
# dev: фронт http://localhost:5173, бэк http://localhost:8000
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
DEV_HTTPS=1 docker compose -f docker-compose.dev.yml up   # https://<LAN-IP>:5173 для проверки камеры с телефона

# prod: наружу один порт 127.0.0.1:${WEB_PORT:-8080}, TLS делает внешний nginx (deploy/nginx.host.conf.example)
docker compose up -d --build

# тесты бэкенда (нужен Postgres, поэтому внутри dev-compose)
docker compose -f docker-compose.dev.yml run --rm backend pytest
# тесты фронта
cd frontend && npm test
# нагрузочный тест против запущенного стенда (СБРАСЫВАЕТ данные квеста!)
docker compose -f docker-compose.dev.yml run --rm backend python loadtest/run.py --base http://backend:8000
```

Без Docker (локальный Postgres, без Redis — один процесс, in-memory channel layer):

```bash
cd backend && pip install -r requirements-dev.txt
export REDIS_URL= DJANGO_DEBUG=1 DJANGO_ALLOWED_HOSTS='*' POSTGRES_HOST=/var/run/postgresql POSTGRES_USER=$USER POSTGRES_PASSWORD= POSTGRES_DB=physquest
python manage.py migrate && python manage.py seed && uvicorn config.asgi:application --port 8000
cd frontend && npm install && npm run copy-opencv && npm run dev
```

Django-админка (модели как есть, для отладки): `/django-admin/`, суперпользователь из `.env`.

## Деплой

1. VPS с Docker, `git clone`, `cp .env.example .env`, заполнить домен, пароли, `DJANGO_SECRET_KEY`.
2. `docker compose up -d --build` — наружу `127.0.0.1:${WEB_PORT}`.
3. Внешний nginx + certbot по `deploy/nginx.host.conf.example` (важно: `Upgrade` для WS, таймауты 3600 с, `X-Forwarded-For $remote_addr`).
4. Войти в `/staff` с PIN `0987`, сменить PIN-коды, завести станции, расставить их на карте, распечатать бумажные маркеры (`/staff/admin/print`).
5. Прогон: зарегистрироваться, отсканировать, выдать приз → «Сбросить» в настройках.

## Производительность

- Redis (redis-py ≥ 8): в `CHANNEL_LAYERS` явно заданы `socket_timeout=30` (дефолт 5 с равен ожиданию BZPOPMIN в channels_redis и рвёт простаивающие WS) и `max_connections=2000` (дефолтный пул 100 падает при массовом переподключении телефонов). Не убирать.
- Postgres-соединения: пул psycopg (`DB_POOL_MAX` на воркер). Под ASGI нельзя `CONN_MAX_AGE>0` — соединения утекают по потокам.
- Замер `loadtest/run.py` (1 процесс uvicorn, ноутбук): 500 участников на WS, 10 станций × группы по 15 → 5000 отметок за ~8 с; скан группы p95 ≈ 125 мс, доставка на телефон p95 ≈ 180 мс.
- Распознавание: кадр уменьшается до ширины 1600 px; OpenCV.js находит 13 маркеров в кадре за один проход.

## Архитектура

```
браузер ── внешний nginx (TLS) ── web (nginx: статика React + прокси) ──┬─ /api/, /ws/, /django-admin/, /django-static/ → backend:8000
                                                                        └─ всё остальное → index.html (SPA)
backend (uvicorn, N воркеров) ── postgres
                              └─ redis (channel layer, cache для rate-limit)
```

### Маркеры

- Словарь **DICT_5X5_1000** (OpenCV). ID **0–249** — бумажные (заведены в БД заранее), **250–999** — телефонные, выдаются по порядку при регистрации.
- На телефоне маркер рисуется SVG по таблице битов `frontend/src/aruco/dict5x5_1000.ts` (сгенерирована из OpenCV скриптом `frontend/scripts/gen_dict.py`), обязательно с белым полем вокруг.
- Сканирование: `frontend/src/scanner/` — камера (1920×1080) → кадр в Web Worker → OpenCV.js `ArucoDetector` → список `{id, corners}`. `opencv.js` лежит у нас (`/opencv/opencv.js`), грузится только на страницах сотрудников, кэшируется Service Worker'ом (`public/sw.js`).

### Доменные правила (backend/quest/services)

- **Станция**: название, номер, описание, `x`,`y` (доли 0..1 от размеров карты), `enabled`. **Финиш** — ровно одна станция `is_finish=True`: не удаляется, не отключается, всегда последняя. Станции не удаляются, только отключаются.
- **Участник**: `kind=phone|paper`, `marker_id`, `name`, `token` (только phone), `route` (массив id станций, без финиша), `current_station` (денормализовано), `prize_at`, `prize_forced`.
- **Маршрут** (phone) фиксируется при регистрации: первая станция — с минимумом «активных» участников (случайно среди равных), остальные — случайная перестановка. Регистрации сериализуются блокировкой строки `Settings`.
- **Засчитывание**: скан засчитывает **любую** непройденную станцию (порядок — рекомендация). Идемпотентно (unique participant+station). Первый скан бумажного маркера активирует его.
- **Текущая станция** = первая непройденная включённая в маршруте; если все пройдены — финиш; после приза — нет.
- **«Прошёл всё»** = пройдены все включённые не-финишные станции.
- **Новая станция** вставляется в случайную позицию среди непройденных у всех незавершивших phone-участников. **Отключение** убирает станцию из маршрутов/условия, старые отметки остаются.
- **Приз**: если прошёл не всё — только с `force=true` («выдать всё равно»), пишется `prize_forced` и событие в `EventLog`. Повторно не выдаётся.
- **Сброс** (админ + PIN админа): удаляются phone-участники, отметки, события; бумажные сбрасываются. Станции, координаты, PIN остаются.

### Роли сотрудников

Единый вход `/staff` по PIN (4–8 цифр). Роль определяется введённым PIN; PIN у ролей разные.
Дефолты: `admin=0987`, `station=111111`, `prize=222222`, `help=333333` — меняются в админке.
После входа выдаётся подписанный токен `{role, v}`; смена PIN роли увеличивает `v` → старые токены недействительны.
Rate limit: 10 попыток входа в минуту с IP (Redis cache). Реальный IP — первый элемент `X-Forwarded-For`.

### API и WebSocket

- REST: `/api/...` (см. `backend/quest/urls.py`). Участник авторизуется заголовком `X-Participant-Token` или cookie `pq_token`; сотрудник — `Authorization: Staff <token>`.
- WS `/ws/participant/?token=` — сервер шлёт `{"type":"state", ...}` при подключении и при каждом изменении.
- WS `/ws/station/<station_id>/?token=` — клиент шлёт `{"type":"scan","batch":"<uuid>","ids":[...]}`, сервер отвечает `{"type":"scan_result","batch","results":[{"id","status"}]}`, `status ∈ accepted|already|unknown|disabled`. Клиент держит неподтверждённые батчи в IndexedDB и переотправляет после переподключения.
- WS `/ws/admin/?token=` — `{"type":"stats", ...}` не чаще 1 раза в секунду.
- Групповые рассылки Channels: `participant_<id>`, `participants` (всем — refresh/reset), `admin`.

### Фронтенд: маршруты

- `/` — участник: регистрация → вкладки «Список / (код) / Карта». В списке у участника (и на экране помощи) номера станций не показываются — в порядке маршрута они выглядят случайными; номера видят только сотрудники.
- `/restore/<token>` — перенос сессии (QR из админки).
- `/staff` — вход по PIN → `/staff/station`, `/staff/prize`, `/staff/help`, `/staff/admin`, `/staff/admin/print`.
- Код сотрудников — lazy-чанки, участник грузит минимум.

### Карта

`frontend/src/map/building.svg` — два этажа, каждый — изометрическая перевёрнутая «П» (форма этажа одна, `<defs>#floor`, используется дважды): сверху первый этаж с «Входом» под ним, ниже второй этаж, подписи «1 этаж» / «2 этаж» — в проёме каждой «П». viewBox 1000×1400 — он же `MAP_WIDTH`/`MAP_HEIGHT` в `QuestMap.tsx`. Метки станций накладываются поверх в долях от размера, поэтому правка рисунка не ломает координаты; при смене viewBox нужна миграция координат (примеры — `quest/migrations/0002_two_floor_map.py`, `0003_swap_floors.py`).

## Дизайн

Основа — белый фон, чёрный текст. Фирменный цвет **#344EAD** — акценты: кнопки, активная вкладка, круг кнопки кода, пульсация текущей станции. Успех — зелёный, ошибка — красный. Интерфейс только на русском. Часовой пояс `Asia/Novosibirsk`.

## Соглашения

- Код и комментарии — на английском, интерфейс и этот файл — на русском.
- Бизнес-логика — в `backend/quest/services/`, views/consumers тонкие.
- Любое изменение состояния участника → рассылка нового state в `participant_<id>` и отметка «dirty» в `admin`.
- **Git**: коммиты сразу в `master`, отдельный коммит на логический шаг, сообщение — одна строка на английском, **без Co-Authored-By**.
