# CLAUDE.md — память проекта DealerEasy (папка dealer/)

## Пользователь и как с ним работать
- Пишет по-русски, отвечать по-русски. На этапе планирования просил отвечать **кратко**.
- Тот же владелец, что у CarWashEasy (репозиторий `vbuleiko/carwash`): решения и привычки оттуда действуют и здесь. Перед большими задачами — уточняющие вопросы. «Супер минималистично и удобно», лишнего не добавлять.
- Бизнес в **ЮАР**. Прод — Google Cloud, как у мойки.

## Продукт
Сервис по подписке для небольших автосалонов (б/у машины), по аналогии с CarWashEasy:
- салон добавляет машину один раз (скан диска, фото с телефона, цена) → она на его сайте, в каталоге Facebook и на площадках;
- заявки покупателей → в приложение и на почту, ответ в WhatsApp.

Продвижение, как у мойки: общий лендинг и много готовых сайтов для салонов, которые ещё не зарегистрировались.

### Решения пользователя (18.10.2026)
| Вопрос | Решение |
|---|---|
| Типовой сайт | **Не сайт Octane.** Макеты дизайна — из CarWashEasy (5 тем: Carbon, Volt, Midnight, Noir, Classic) |
| Стек | «Любой, но сайты быстрые, картинки грузятся хорошо, без лишних анимаций» → Flask, как мойка |
| Логины | **Один логин на салон** |
| DMS (VMG и др.) | **Не делать** («понятия не имею о чём ты, пока без этого») |
| Автопубликация на площадки | **Делать** |
| Где код | Папка `dealer/` в репозитории `vbuleiko/octane` (сайт Octane в корне не тронут). Можно вынести в отдельный репозиторий с историей: `git subtree split --prefix dealer` |

Не решено: цена (черновые `R499/мес`, `R4,990/год`), название (`APP_NAME`, черновое DealerEasy), домен.

### Площадки (исследование 18.10.2026, подробно в README)
- **Facebook/Instagram** — единственный канал без договора. Каталог Vehicles в Meta Commerce Manager, фид по расписанию: `/feeds/<feed_key>/facebook.csv` по спецификации Meta Vehicle catalog. Нужны город, провинция и координаты дилера. Бесплатных объявлений салонов на Marketplace больше нет: только реклама.
- **AutoTrader, Cars.co.za, Gumtree, AutoMart, SearchMyRide** — автоматический сток только от одобренных поставщиков, спецификаций нет. Поток: салон жмёт Connect → запрос в `/admin` и письмо оператору → оператор договаривается с площадкой, отдаёт ей фид салона (общий XML) → «Connected».
- **AutoTrader** самый закрытый. Пока договора нет: «Copy ad» + «Save photos» для ручной публикации в AutoTrader Connect.
- **Google:** vehicle ads в ЮАР нет, структурированные данные машин Google больше не показывает (2025). schema.org `Car` оставили — вреда нет.

### Комплектации
Справочник марок и моделей — стартовый, в коде (`catalog.MODELS`). Комплектации накапливаются в таблице `variants` из машин реальных салонов (не демо): подсказки и автозаполнение характеристик. Полный справочник ЮАР — коды M&M TransUnion, по лицензии, позже.

## Архитектура
Форк каркаса CarWashEasy: Python 3.12 · Flask · SQLite (WAL) · Jinja · Pillow · `app.js` (приложение, лендинг, админка) и `site.js` (сайты салонов, ~8 КБ) · без CDN. Docker (gunicorn) + контейнер `notify` + Caddy (on-demand TLS для доменов салонов, `/media` отдаётся прямо с диска).

```
app/__init__.py  create_app: конфиг, заголовки, фильтры (rand, km, phone, local_phone, ago, num)
app/public.py    /, /signup, /login, /logout, POST /demo, /theme, /media/<tenant>/<file>, /privacy, /robots.txt, /tls-check, /healthz
app/owner.py     /app: склад, /app/car/new|<id>, фото (/app/photos, /app/photo/<id>/delete, /app/car/<id>/photos.zip), /app/catalog, /app/disc, /app/describe, заявки, /app/portals, /app/website, /app/settings/*
app/site.py      сайты салонов: каждый вид зарегистрирован дважды — /site/<slug>/... (endpoint `site.X`) и на домене салона /... (`site.X_d`, только при g.host). site_url() — ссылка для текущего адреса, public_url() — для Google, площадок и canonical (домен салона, если есть)
app/portals.py   CHANNELS (facebook — self_serve; остальные — через оператора), фиды /feeds/<feed_key>/<name>, ad_text()
app/admin.py     /admin: салоны, сайты без владельца (prospects), Hand over, домен, подключения площадок
app/notify.py    tick раз в минуту: заявки салонам (на lead_email или email; у prospect — оператору), регистрации, запросы площадок, отчёт 22:00; чистка фото без машины старше суток
app/stock.py     машины: as_dict, attach_photos, фильтры сайта (в памяти: сток маленький), finance(), describe(), json_ld()
app/photos.py    save(): JPEG ≤1600 + WebP 400/800/1200/1600, EXIF удаляется; save_logo(); src/srcset/jpeg-адреса
app/catalog.py   MODELS, BODIES, FUELS, FEATURES, PERKS, PROVINCES; nice_make, split_model, learn, variants_for
app/disc.py      лицензионный диск → reg_no, make, model+variant (split_model), colour, body, VIN, engine_no
app/samples.py   машины-примеры (static/samples/samples.json, собирает scripts/build_samples.py)
app/seed.py      create_tenant, демо (Sunrise Motors), cleanup_demos (с папкой фото)
app/accounts.py  is_prospect, subscription, site_live (подписка + 7 дней), session_key, chat_link (в демо — «#»)
```

### Модель данных
`tenants` (салон) → `vehicles` → `photos` (а также `photos` у заявок «продать авто»), `leads`, `channels` (площадки салона).
`variants` — общий справочник комплектаций (без tenant_id).
Служебные таблицы — как у мойки: `rate_hits`, `errors`, `mails_sent`.

### Соглашения (важно соблюдать)
- **Каждый запрос фильтруется по `tenant_id`**, чужие id → 404. Тест: `test_one_dealer_cannot_touch_another`.
- **Цены и пробег — целые рэнды и км** (не центы, в отличие от мойки). Ввод — `parse_amount` (понимает «R189 995», «189,995.00», «84 000 km»). Вывод — фильтры `rand`, `km`.
- Время — UTC-строки `YYYY-MM-DD HH:MM:SS` (`utils.ts()`), фильтр `local` — в поясе салона.
- Телефоны — международные цифры без `+` (`27821234567`).
- Статусы машины: `draft` (видна только салону) / `available` / `reserved` (на сайте с плашкой, не в фидах) / `sold` (снята с сайта и фидов; страница отвечает «продано» и показывает похожие). `listed_at` ставится при первой продаже, `sold_at` — при продаже.
- В фиды попадают только `available` с ценой и фото, без площадки в `channels_off`, пока канал не на паузе и подписка не кончилась больше 7 дней назад.
- Фото: на телефоне JS ужимает до 2000 px и грузит по одному (`/app/photos`). Строка `photos` без машины привязывается при сохранении формы (`photo` — id по порядку), иначе удаляется через сутки. Без JS файлы идут вместе с формой (`photos`). Файлы удаляются, только когда ключ больше никто не использует. Ключи `samples/...` — общие файлы примеров, их не удалять.
- Сайт prospect (без email): `noindex`; без своих машин показывает примеры. Как только появляется своя машина, примеры исчезают. После Hand over примеров нет никогда.
- Все POST — с CSRF. JS-запросы шлют `X-Requested-With: fetch`.
- Вёрстка mobile-first. После изменений UI проверять ширину 390 px на **горизонтальный скролл** во всех 5 темах.
- Темы: цвета только через токены. Правила для компонентов сайта и приложения — в `style.css`; в `themes/<name>.css` — только отличия.
- Стиль кода как у мойки: без лишних комментариев, короткие функции, код на английском.

## Команды
```bash
cd dealer
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt
ADMIN_PASSWORD=admin flask --app app run --debug
pytest -q
```
