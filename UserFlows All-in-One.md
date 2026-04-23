# TradeHub UK — User Flows & Feature Specification

> Полная карта пользовательских сценариев по всем ролям и действиям.
> Построено по коду из `TradeHub-main/` (backend NestJS + Prisma + frontend React).
> Статусы фич и gap-ов сверены с `tasks/in-progress/README.md` и `tasks/done/README.md`.

---

## Оглавление

0. [Обзор продукта](#0-обзор-продукта)
1. [Онбординг и аутентификация](#1-онбординг-и-аутентификация)
2. [Профиль и аккаунт](#2-профиль-и-аккаунт)
3. [Верификация и документы](#3-верификация-и-документы)
4. [Портфолио воркера](#4-портфолио-воркера)
5. [Поиск и дискавери](#5-поиск-и-дискавери)
6. [Job posts — работодатель](#6-job-posts--работодатель)
7. [Applications — воркер](#7-applications--воркер)
8. [Коллаборации](#8-коллаборации)
9. [Эскроу и платежи](#9-эскроу-и-платежи)
10. [Рефералы](#10-рефералы)
11. [Отзывы](#11-отзывы)
12. [Мессенджер (Inbox)](#12-мессенджер-inbox)
13. [Уведомления](#13-уведомления)
14. [Подписки](#14-подписки)
15. [Staff / Admin](#15-staff--admin)
16. [End-to-end сценарии](#16-end-to-end-сценарии)
17. [Gap-ы и неполные флоу](#17-gap-ы-и-неполные-флоу)

---

## 0. Обзор продукта

**TradeHub UK** — маркетплейс для строительного сектора Великобритании. Соединяет тредов (worker: builder, electrician, plumber, tiler, carpenter и т.д.) с работодателями (employer: строительные компании, генподрядчики, частные заказчики).

Основные ценностные предложения:
- **Двусторонние верифицированные отзывы** — рейтинг и воркера, и работодателя после завершённой коллаборации. Публикация через staff-модерацию.
- **Прогрессивная верификация** — UNVERIFIED → EMAIL → PHONE → IDENTITY_VERIFIED (через Stripe Identity) → HMRC_VERIFIED (ручная верификация). Уровень виден в бейдже.
- **Биржа рефералов с комиссией** — любой профиль может разместить реферал (лид на работу), отправить offer подходящим воркерам; при конвертации в коллаборацию referrer получает commission.
- **Эскроу через Stripe Connect** — работодатель депонирует, воркер получает после подтверждения работы. Платформа удерживает fee.
- **Realtime мессенджер** — 1:1 диалоги, Socket.IO + Redis Pub/Sub.
- **Подписки** — тарифные планы с лимитами (например, `max_referrals`).

### Роли

| Роль | Как определяется | Что может |
|------|------------------|-----------|
| **Guest** | Нет токена | Видит job board, публичные профили по slug, список рефералов, тарифы |
| **Worker** | `account.client_profile.worker_profile` есть | Всё ниже + создание портфолио, отклики на вакансии, принятие referral offers, приём приглашений работодателя |
| **Employer** | `account.client_profile.employer_profile` есть | Создание вакансий, инвайты воркеров, создание эскроу, депозиты |
| **Client (оба)** | Один `ClientProfile` может иметь И worker, И employer | Унаследованные возможности обеих ролей |
| **Moderator** | `account.staff_member.staff_role = 'MODERATOR'` | Очередь модерации, публикация отзывов, approve/reject документов |
| **Admin** | `account.staff_member.staff_role = 'ADMIN'` | Всё, что у модератора, + CRUD справочников (specialisations, tags, subscription plans) |

### Ключевые состояния (entity lifecycles)

- **Account.status**: `ACTIVE` → `DEACTIVATED`
- **Document.status**: `PENDING` → `APPROVED` / `REJECTED`
- **Verification level**: `UNVERIFIED` → `EMAIL_VERIFIED` → `PHONE_VERIFIED` → `IDENTITY_VERIFIED` → `HMRC_VERIFIED`
- **JobPost.status**: `OPEN` → `CLOSED` / `EXPIRED` / `FILLED`
- **JobApplication.status**: `PENDING` → `ACCEPTED` / `REJECTED` / `WITHDRAWN`
- **Collaboration.status**: `PENDING` → `CONFIRMED` → `IN_PROGRESS` → `COMPLETED` / `CANCELLED` / `DISPUTED`
- **Escrow.status**: `CREATED` → `PENDING_DEPOSIT` → `HELD` → `RELEASED` / `REFUNDED` / `DISPUTED`
- **Referral.status**: `OPEN` → `MATCHED` → `CLOSED` / `CANCELLED`
- **ReferralOffer.status**: `PENDING` → `ACCEPTED` / `DECLINED` / `EXPIRED`
- **Review.is_published**: `false` → `true` (после staff approve)
- **ModerationItem.status**: `OPEN` → `IN_REVIEW` → `RESOLVED` / `ESCALATED`
- **UserSubscription.status**: `active` → `cancelled` / `past_due`

### Обозначения в флоу

- **Actor** — кто выполняет действие
- **Trigger** — откуда запускается (страница, элемент UI)
- **Precond.** — что должно быть истиной до старта
- **API** — endpoint и метод (backend контракт)
- **Side-effects** — что ещё создаётся/меняется в БД
- **Notify** — какие уведомления рассылаются
- **→** — переход к следующему шагу / флоу
- **⚠** — текущий gap / неполная реализация

---

## 1. Онбординг и аутентификация

### Feature overview

Стандартный email/пароль + Google OAuth. Отдельный контур для staff (`/auth/staff/login`). JWT access-токен (короткий) + refresh-токен (длинный, хранится в `refresh_token` в БД). После логина `JwtStrategy` догружает дерево профиля (`client_profile`, `worker_profile`, `employer_profile`, `staff_member`) и собирает payload с флагами ролей.

Регистрация создаёт `Account` и сразу `ClientProfile` с уникальным `slug` (генерируется из email или display_name). Роль (worker/employer) пользователь выбирает в отдельном шаге — создаётся либо `WorkerProfile`, либо `EmployerProfile` с тем же `id`.

### 1.1 Регистрация по email

- **Actor:** Guest
- **Trigger:** `RegisterPage` → кнопка «Sign up»
- **Precond.:** email не зарегистрирован
- **Шаги:**
  1. Guest вводит `email`, `password`, `display_name`, выбирает роль (`WORKER` или `EMPLOYER`).
  2. Фронт шлёт `POST /auth/register` с DTO.
  3. Backend валидирует (email uniq, password strength, DTO).
  4. Хэширует пароль (bcrypt), создаёт `Account` (status=`ACTIVE`).
  5. Создаёт `ClientProfile` (генерирует `slug`).
  6. В зависимости от роли создаёт `WorkerProfile` или `EmployerProfile` с тем же id.
  7. Возвращает `{ access_token, refresh_token, account }`.
  8. Фронт сохраняет токены в localStorage, редиректит на `DashboardPage`.
- **API:** `POST /auth/register`
- **Side-effects:** `AuditLog` запись `action=REGISTER`
- **Альтернативы:** email занят → 409 Conflict; слабый пароль → 400.
- **⚠ Gap:** нет email-подтверждения, аккаунт сразу `ACTIVE`. Email confirmation flow отсутствует (см. §17).

### 1.2 Регистрация через Google OAuth

- **Actor:** Guest
- **Trigger:** `LoginPage` / `RegisterPage` → «Continue with Google»
- **Шаги:**
  1. Guest кликает кнопку — редирект на `GET /auth/google`.
  2. Backend инициирует OAuth2 flow (Passport `GoogleStrategy`), редиректит на accounts.google.com.
  3. Пользователь даёт согласие, Google возвращает на `/auth/google/callback`.
  4. Backend проверяет, есть ли `Account` с `google_id` или `email` Google.
  5. **Если нет** — создаёт `Account` (без `password_hash`) и `ClientProfile`. Роль по умолчанию — ??? (⚠ фронт не показывает выбор роли после OAuth).
  6. **Если есть** — логинит.
  7. Выпускает токены и редиректит на фронт: `/oauth-callback?access_token=...&refresh_token=...`.
  8. `OAuthCallbackPage` парсит токены из URL, сохраняет в localStorage, редиректит на dashboard.
- **API:** `GET /auth/google` → `GET /auth/google/callback`
- **⚠ Gap:** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` не заполнены в `.env.dev`, флоу нерабочий без ручной настройки. UI выбора роли после OAuth отсутствует.

### 1.3 Логин по email/паролю

- **Actor:** Guest
- **Trigger:** `LoginPage` → «Log in»
- **Шаги:**
  1. Guest вводит email + пароль.
  2. `POST /auth/login` с DTO.
  3. Backend находит `Account` по email, проверяет `bcrypt.compare`.
  4. Генерирует access + refresh токены, сохраняет refresh в `refresh_token`.
  5. Обновляет `account.last_login_at`.
  6. Возвращает токены + account payload.
- **API:** `POST /auth/login`
- **Альтернативы:**
  - Неверный пароль → 401.
  - Аккаунт `DEACTIVATED` → 403.
  - Staff-аккаунт пробует логин сюда → backend направляет на `/auth/staff/login` (или 403).
- **⚠ Gap:** нет rate-limit/CAPTCHA на login (только общий throttler 60 req/min).

### 1.4 Staff login (admin / moderator)

- **Actor:** Guest со staff-аккаунтом
- **Trigger:** `InternalLoginPage` (`/internal/login`)
- **Шаги:** Аналогично 1.3, но через `POST /auth/staff/login`. Backend дополнительно проверяет, что у `Account` есть `staff_member` запись.
- **API:** `POST /auth/staff/login`
- **Альтернативы:** обычный пользователь через этот endpoint → 403.

### 1.5 Рефреш access-токена

- **Actor:** Любой авторизованный
- **Trigger:** автоматически во фронте, когда access-токен истекает (401 на любом API-запросе)
- **Шаги:**
  1. Axios interceptor ловит 401 → шлёт `POST /auth/refresh` с refresh-токеном.
  2. Backend валидирует refresh (проверяет в БД + подпись), ротирует (старый удаляет, новый создаёт).
  3. Возвращает новый access + новый refresh.
  4. Interceptor ретраит исходный запрос.
- **API:** `POST /auth/refresh`
- **Альтернативы:** refresh просрочен / не найден → 401, фронт редиректит на `/login`.

### 1.6 Logout

- **Actor:** Любой авторизованный
- **Trigger:** `AppShell` → dropdown user → «Log out»
- **Шаги:**
  1. Фронт вызывает `POST /auth/logout` (⚠ без refresh_token в body — баг).
  2. Backend ожидает refresh в body для удаления записи из `refresh_token`, но не получает его.
  3. Фронт очищает localStorage и редиректит на `/login`.
- **API:** `POST /auth/logout`
- **⚠ Gap:** refresh в БД остаётся валидным до TTL — можно повторно залогиниться с тем же refresh. Исправление: передавать `{ refresh_token }` в body.

### 1.7 Logout со всех устройств

- **Actor:** Авторизованный
- **Trigger:** ⚠ **нет UI**. Endpoint существует, но ни одна страница его не вызывает.
- **Планируемый флоу:**
  1. Settings → Security → «Log out from all devices».
  2. `POST /auth/logout-all`.
  3. Backend удаляет ВСЕ refresh-токены аккаунта.
  4. На текущем устройстве фронт разлогинивается.
- **API:** `POST /auth/logout-all`

### 1.8 Деактивация аккаунта

- **Actor:** Авторизованный
- **Trigger:** ⚠ **нет UI**. Endpoint `DELETE /account/me` существует.
- **Планируемый флоу:**
  1. Settings → Danger zone → «Deactivate account» → подтверждение паролем.
  2. `DELETE /account/me`.
  3. Backend ставит `account.status = DEACTIVATED` (soft-delete), НЕ удаляет данные для истории.
  4. Все refresh-токены удаляются.
  5. Фронт разлогинивается.
- **API:** `DELETE /account/me`
- **⚠ Gap:** Нет UI. Нет re-activation флоу.

### 1.9 Подтверждение email *(gap)*

⚠ Флоу отсутствует полностью. Нужен:
1. При регистрации — отправка письма (через Resend) с токеном.
2. Страница `/verify-email?token=...`.
3. `POST /auth/verify-email { token }` → ставит `account.email_verified = true` + добавляет `VerificationMilestone` типа `EMAIL_VERIFIED` + апгрейдит `client_profile.verification_level` на `EMAIL_VERIFIED`.

### 1.10 Сброс пароля *(gap)*

⚠ Флоу отсутствует полностью. Нужен:
1. `/forgot-password` → ввод email → `POST /auth/forgot-password`.
2. Резенд-письмо с токеном (15-60 мин TTL).
3. `/reset-password?token=...` → `POST /auth/reset-password { token, new_password }`.

### 1.11 Верификация телефона *(gap)*

⚠ Колонка `account.phone_verified` есть, но нет ни endpoint-ов, ни SMS-провайдера. Нужен:
1. Settings → Phone → «Send code» → `POST /account/phone/send-otp`.
2. Ввод OTP → `POST /account/phone/verify { otp }`.
3. Обновление `phone_verified = true` + `verification_milestone` + апгрейд `verification_level` на `PHONE_VERIFIED`.

---

## 2. Профиль и аккаунт

### Feature overview

Модель наследования: `Account` (auth) → `ClientProfile` (публичные поля: имя, bio, город, аватар, уровень верификации, Stripe Connect id) → `WorkerProfile` ИЛИ `EmployerProfile` (специализированные поля).

Один `ClientProfile` может иметь одновременно И worker, И employer подпрофиль (например, бригадир, который нанимает других и сам берёт работу). В таком случае пользователь видит обе роли.

Публичная страница профиля доступна по `slug` — человекочитаемый URL вроде `/u/mike-the-builder`.

### 2.1 Просмотр собственного профиля

- **Actor:** Авторизованный
- **Trigger:** `AppShell` → avatar → «My profile» / прямой переход на `/profile`
- **Шаги:**
  1. `ProfilePage` при загрузке → `GET /account/me`.
  2. Backend возвращает `Account` + `ClientProfile` + `WorkerProfile`/`EmployerProfile` + `StaffMember` (если есть).
  3. Страница рендерит табы: Account, Client, Worker/Employer (по наличию), Portfolio (для воркера), Verification, Documents.
- **API:** `GET /account/me`
- **⚠ Gap:** «Account» карточка рендерит `<pre>{JSON.stringify(account)}</pre>` с подписью «Raw account data for debugging» — это уйдёт в прод как debug-блок.

### 2.2 Редактирование client-profile (общие поля)

- **Actor:** Авторизованный (любая клиентская роль)
- **Trigger:** `ProfilePage` → таб «Client» → «Edit»
- **Шаги:**
  1. Пользователь меняет: `display_name`, `bio`, `city`, `postcode_area`, `avatar_url`.
  2. `PATCH /client-profiles/me` с частичным DTO.
  3. Backend валидирует (display_name уникален? обычно slug-based), обновляет поля, пересчитывает `updated_at`.
  4. Возвращает обновлённый профиль.
- **API:** `PATCH /client-profiles/me`
- **⚠ Gap:** `avatar_url` — текстовое поле, нет upload флоу. Нужен: multipart upload → S3 / локальное хранение → url в БД.

### 2.3 Редактирование worker-profile

- **Actor:** Worker
- **Trigger:** `ProfilePage` → таб «Worker» → «Edit»
- **Шаги:**
  1. Пользователь меняет: `years_experience`, `day_rate_min/max`, `available_from`, `is_available`.
  2. `PATCH /worker-profiles/me`.
  3. (Отдельно) управление специализациями — см. 2.5.
- **API:** `PATCH /worker-profiles/me`

### 2.4 Редактирование employer-profile

- **Actor:** Employer
- **Trigger:** `ProfilePage` → таб «Employer» → «Edit»
- **Шаги:** Аналогично 2.3, поля: `company_name`, `company_number`, `team_size`.
- **API:** `PATCH /employer-profiles/me`

### 2.5 Управление специализациями воркера *(gap в UI)*

- **Actor:** Worker
- **Trigger:** `ProfilePage` → Worker → «Specialisations»
- **Планируемый флоу:**
  1. Мультиселект из `GET /specialisations`.
  2. Пометить одну как `is_primary = true`.
  3. Сохранить → backend создаёт/удаляет `worker_specialisation` связи.
- **⚠ Gap:** Текущий UI показывает список специализаций как JSON-dump. Нужен chip-picker + primary toggle. Endpoint на добавление/удаление связи неявно нужно добавить (сейчас может быть через `PATCH /worker-profiles/me` — уточнить).

### 2.6 Публичный профиль по slug

- **Actor:** Любой (вкл. Guest)
- **Trigger:** Клик на карточку воркера/работодателя, прямой URL `/u/:slug`
- **Шаги:**
  1. `GET /client-profiles/:slug`.
  2. Backend отдаёт публичные поля + preview портфолио + рейтинг + verification badge.
  3. CTA: «Send message» (авторизованный), «Start collaboration», «Apply to job».
- **API:** `GET /client-profiles/:slug`
- **⚠ Gap:** **страницы публичного профиля нет во фронте**. Есть карточки в поиске, но нет детального экрана.

### 2.7 Обновление телефона

- **Actor:** Авторизованный
- **Trigger:** ⚠ нет UI. Endpoint `PATCH /account/me` существует.
- **Планируемо:** Settings → Contact → Phone → ввод номера → `PATCH /account/me { phone }`. После — запуск 1.11 (OTP-верификация).

---

## 3. Верификация и документы

### Feature overview

Пятиуровневая прогрессия доверия:
1. **UNVERIFIED** — дефолт, только зарегистрировался.
2. **EMAIL_VERIFIED** — подтверждённая почта (gap, см. §17).
3. **PHONE_VERIFIED** — SMS-OTP (gap).
4. **IDENTITY_VERIFIED** — Stripe Identity (селфи + документ). Автоматически через webhook.
5. **HMRC_VERIFIED** — ручная проверка HMRC-статуса (CIS registration, UTR). Нет интеграции — только manual staff.

Документы (`Document`) — отдельная сущность, загружаются пользователем, проходят staff-модерацию. Типы: `ID_CARD`, `PROOF_OF_ADDRESS`, `CERTIFICATE`, `INSURANCE`, `COMPANY_REGISTRATION` и др. Связываются с `PortfolioItem` через M:M junction `PortfolioItemDocument`.

### 3.1 Загрузка документа

- **Actor:** Авторизованный (обычно Worker, но Employer тоже может)
- **Trigger:** `ProfilePage` → Documents → «Upload»
- **Шаги:**
  1. Пользователь выбирает файл (PDF, JPG, PNG — до 10MB), указывает `doc_type`.
  2. `POST /documents/upload` (multipart/form-data).
  3. Backend сохраняет файл (локально / S3), создаёт `Document` со `status = PENDING`.
  4. Автоматически создаёт `ModerationItem` с `queue_type = DOCUMENT_REVIEW`, `entity_type = DOCUMENT`, `entity_id = document.id`.
  5. Возвращает `Document`.
- **API:** `POST /documents/upload`
- **Notify:** уведомление staff — новый документ в очереди.
- **⚠ Gap:** Нет drag-n-drop, нет превью, нет прогресс-бара, нет валидации размера на клиенте.

### 3.2 Список своих документов

- **Actor:** Авторизованный
- **Trigger:** `ProfilePage` → Documents
- **Шаги:** `GET /documents/me` → список с статусами (`PENDING` / `APPROVED` / `REJECTED`), датой загрузки, reviewed_at.
- **API:** `GET /documents/me`

### 3.3 Удаление своего PENDING документа

- **Actor:** Owner документа
- **Trigger:** Documents → ряд документа → «Delete» (только если `status = PENDING`)
- **Шаги:**
  1. `DELETE /documents/:id`.
  2. Backend проверяет owner + статус.
  3. Удаляет документ + связанные `PortfolioItemDocument` + `ModerationItem`.
- **API:** `DELETE /documents/:id`
- **Альтернативы:** если `APPROVED` / `REJECTED` — 400 (нельзя удалить, есть audit trail).

### 3.4 Старт Stripe Identity verification

- **Actor:** Авторизованный
- **Trigger:** `ProfilePage` → Verification → «Verify identity»
- **Шаги:**
  1. `POST /verification/start` без body.
  2. Backend создаёт Stripe Identity verification session, возвращает `{ url, client_secret, session_id }`.
  3. Фронт редиректит пользователя на Stripe URL (hosted flow).
  4. Пользователь загружает ID + селфи → Stripe проверяет.
  5. Stripe шлёт webhook `identity.verification_session.verified` → backend апгрейдит `client_profile.verification_level = IDENTITY_VERIFIED`, создаёт `VerificationMilestone`.
- **API:** `POST /verification/start` + webhook
- **Notify:** уведомление пользователю «Identity verified» после webhook.

### 3.5 Проверка статуса верификации

- **Actor:** Авторизованный
- **Trigger:** ProfilePage загрузилась или пользователь вернулся со Stripe
- **Шаги:** `GET /verification/status` → возвращает текущий level + milestones array + pending sessions.
- **API:** `GET /verification/status`

### 3.6 HMRC-верификация *(gap)*

⚠ Нет интеграции с HMRC API (или её не существует для сторонних). Текущий план — ручная проверка staff-ом:
1. Пользователь загружает документы (UTR letter, CIS status).
2. Staff вручную проверяет и выставляет `verification_level = HMRC_VERIFIED`.

---

## 4. Портфолио воркера

### Feature overview

Портфолио — три типа элементов (shared-PK inheritance):
- **Experience** — места работы (company, role, даты).
- **Project** — выполненные проекты (тип, постcode, стоимость, дата).
- **Certification** — сертификаты (CSCS, Gas Safe, NICEIC и т.д. — тип, номер, issuing_body, сроки).

К каждому item можно прикрепить **media** (фото работ) и привязать **документы** (например, к сертификату — скан самого документа). `verified` флаг ставится staff-ом при проверке.

### 4.1 Добавить Experience

- **Actor:** Worker
- **Trigger:** `ProfilePage` → Portfolio → «Add Experience»
- **Шаги:**
  1. Пользователь вводит: `title`, `description`, `company_name`, `role`, `start_date`, `end_date`.
  2. `POST /portfolio/experience`.
  3. Backend создаёт `PortfolioItem` (item_type=`EXPERIENCE`) + `ExperienceDetail` с тем же id.
- **API:** `POST /portfolio/experience`

### 4.2 Добавить Project

- **Actor:** Worker
- **Шаги:** Аналогично 4.1, поля: `title`, `description`, `project_type`, `site_postcode`, `completed_at`, `project_value`.
- **API:** `POST /portfolio/project`

### 4.3 Добавить Certification

- **Actor:** Worker
- **Шаги:** Поля: `title`, `cert_type`, `cert_number`, `issuing_body`, `issued_at`, `expires_at`.
- **API:** `POST /portfolio/certification`

### 4.4 Редактирование portfolio-item *(gap в UI)*

- **Actor:** Owner (worker)
- **Trigger:** ⚠ кнопки нет в UI. Backend endpoints есть.
- **Планируемо:**
  - `PATCH /portfolio/:id` — базовые поля (title, description, sort_order).
  - `PATCH /portfolio/:id/experience` — детали experience.
  - `PATCH /portfolio/:id/project` — детали project.
  - `PATCH /portfolio/:id/certification` — детали certification.
- **⚠ Gap:** кнопка «Edit» на каждом item в фронте отсутствует. Сейчас только Create + Delete.

### 4.5 Добавить media к item *(gap в UI)*

- **Actor:** Worker (owner)
- **Trigger:** ⚠ UI отсутствует
- **Планируемо:** Item detail → «Add photo» → upload → `POST /portfolio/:id/media` с `media_url` + `caption`.
- **API:** `POST /portfolio/:id/media`, `DELETE /portfolio/media/:mediaId`

### 4.6 Привязать документ к item *(gap в UI)*

- **Actor:** Worker
- **Trigger:** ⚠ UI отсутствует
- **Планируемо:** На Certification item → «Attach proof» → список своих approved documents → чек → `POST /portfolio/:id/documents/:documentId`.
- **API:** `POST /portfolio/:id/documents/:documentId`, `DELETE /portfolio/:id/documents/:documentId`

### 4.7 Удалить portfolio-item

- **Actor:** Owner
- **Trigger:** Portfolio item → «Delete» → confirm
- **Шаги:** `DELETE /portfolio/:id`. Каскадно удаляются media и detail.
- **API:** `DELETE /portfolio/:id`

### 4.8 Просмотр чужого портфолио (public)

- **Actor:** Любой (вкл. Guest)
- **Trigger:** Публичный профиль → таб «Portfolio»
- **Шаги:** `GET /portfolio/worker/:workerId` или `GET /portfolio/:id`.
- **API:** `GET /portfolio/worker/:workerId`, `GET /portfolio/:id`
- **⚠ Gap:** кнопка «Load portfolio» на текущей `ProfilePage` — портфолио не подгружается автоматически.

---

## 5. Поиск и дискавери

### Feature overview

Три публичных поисковых экрана (доступны guest-ам):
- **Job Board** — поиск вакансий (для воркеров).
- **Worker Search** — поиск воркеров (для работодателей / рефереров).
- **Employer Search** — поиск работодателей (для воркеров / при research).

Плюс публичный поиск рефералов и просмотр публичных профилей по slug.

Параметры везде: постcode area, специализация, теги, рейтинг, пагинация.

### 5.1 Гостевой просмотр Job Board

- **Actor:** Guest / Worker
- **Trigger:** `/jobs` (или `JobBoardPage`)
- **Шаги:**
  1. `GET /job-posts?q=&postcode_area=&specialisation_id=&tag_id=&page=&limit=`.
  2. Backend фильтрует `status=OPEN`, не expired, возвращает список с employer-preview + рейтингом.
  3. Карточки рендерятся через `JobCard`.
- **API:** `GET /job-posts`
- **⚠ Gap:** `<pre>JSON.stringify(lastActionJson)</pre>` в самом низу страницы. Нет пагинации-контролов.

### 5.2 Детали вакансии

- **Actor:** Любой
- **Trigger:** Клик по `JobCard` → диалог или страница
- **Шаги:** `GET /job-posts/:id` → полное описание + specialisations + tags + employer data + CTA «Apply».
- **API:** `GET /job-posts/:id`
- **⚠ Gap:** JSON-dump внизу диалога (`JobBoardPage:479`). CTA «Apply» виден всем залогиненным, не только воркерам.

### 5.3 Поиск воркеров

- **Actor:** Любой
- **Trigger:** `/workers` (`WorkerSearchPage`)
- **Шаги:**
  1. Фильтры: q (текст), postcode, specialisation_id, min_rating, is_available, tag_id.
  2. `GET /worker-profiles?q=...`.
  3. Backend возвращает воркеров с сортировкой по `rating_avg DESC, rating_count DESC`.
- **API:** `GET /worker-profiles`
- **⚠ Gap:** фильтры по специализации — текстовое поле вместо чипов. `<pre>` дампы в UI.

### 5.4 Детали воркера *(gap)*

- **Trigger:** клик по `WorkerCard`
- **⚠ Gap:** нет отдельной страницы. Есть `GET /worker-profiles/:id`, но фронт не использует. Должна быть страница профиля воркера: bio + rating + portfolio preview + отзывы + CTA «Message» / «Invite to job» / «Start collab».

### 5.5 Поиск работодателей

- **Actor:** Любой
- **Trigger:** `/employers` (`EmployerSearchPage`)
- **Шаги:** `GET /employer-profiles?q=&postcode=&min_rating=`. Сортировка по рейтингу.
- **API:** `GET /employer-profiles`
- **⚠ Gap:** `<pre>` дамп (`EmployerSearchPage:170`). Детальная страница работодателя отсутствует.

### 5.6 Воркеры по специализации

- **Actor:** Любой
- **Trigger:** Клик по чипу специализации где-либо
- **Шаги:** `GET /specialisations/:id/workers` → список воркеров с primary/secondary.
- **API:** `GET /specialisations/:id/workers`
- **⚠ Gap:** нет UI-триггера.

### 5.7 Публичный поиск рефералов

- **Actor:** Worker (ищет лиды)
- **Trigger:** `ReferralsPage` → таб «Browse»
- **Шаги:** `GET /referrals?status=OPEN&postcode_area=&project_type=&page=&limit=`.
- **API:** `GET /referrals`
- **⚠ Gap:** `<pre>` дампы, нет пагинации-UI, фильтры как plain inputs без селектов.

---

## 6. Job posts — работодатель

### Feature overview

Вакансия (`JobPost`) — создаётся работодателем. Поля: title, description, postcode_area, site_address, pay_type (`DAY_RATE` / `FIXED`), min/max day rate или fixed_price, duration, start_date, is_urgent, expires_at. К вакансии крепятся specialisations (M:M) и tags (M:M).

Статус: `OPEN` → `CLOSED` / `EXPIRED` / `FILLED`. Работодатель видит свои вакансии в `MyApplicationsPage` (да, странно называется, но там комбинированная страница).

### 6.1 Создать вакансию

- **Actor:** Employer
- **Trigger:** `JobBoardPage` → «Post a job» (только видна работодателю) или с dashboard
- **Шаги:**
  1. Форма: title, description, postcode, site_address, pay_type, rates, duration, start_date, urgency, specialisations (multi), tags (multi).
  2. `POST /job-posts` с DTO.
  3. Backend валидирует (employer owns), создаёт `JobPost` + junction records для specialisations и tags.
- **API:** `POST /job-posts`
- **Notify:** (опционально) — matching воркерам по специализациям/постcode.
- **⚠ Gap:** поля `Specialisation IDs (comma-separated)` и `Tag IDs (comma-separated)` — нужен multiselect.

### 6.2 Редактировать свою вакансию *(gap в UI)*

- **Actor:** Owner employer
- **Trigger:** ⚠ нет UI. Endpoint есть.
- **Планируемо:** «My jobs» → item → «Edit» → форма → `PATCH /job-posts/:id`.
- **API:** `PATCH /job-posts/:id`

### 6.3 Удалить свою вакансию *(gap в UI)*

- **Actor:** Owner employer
- **Trigger:** ⚠ нет UI
- **Планируемо:** «My jobs» → item → «Delete» → confirm → `DELETE /job-posts/:id`. Каскадно удаляются applications (если не в `ACCEPTED`).
- **API:** `DELETE /job-posts/:id`

### 6.4 Список своих вакансий

- **Actor:** Employer
- **Trigger:** `MyApplicationsPage` → таб «My job posts»
- **Шаги:** `GET /job-posts/me` → список.
- **API:** `GET /job-posts/me`
- **⚠ Gap:** выводится сырым `<pre>JSON.stringify</pre>` в debug-секции.

### 6.5 Просмотр откликов на вакансию

- **Actor:** Owner employer
- **Trigger:** `MyApplicationsPage` → выбрать свою вакансию → «View applications»
- **Шаги:** `GET /job-applications/jobs/:jobPostId`. Возвращает список с воркер-превью, cover_message, proposed_rate, статусом.
- **API:** `GET /job-applications/jobs/:jobPostId`
- **⚠ Gap:** выводится как `<pre>`.

### 6.6 Принять / отклонить отклик

- **Actor:** Owner employer
- **Trigger:** На списке откликов → ряд → «Accept» / «Reject»
- **Шаги:**
  1. `PATCH /job-applications/:id/status` с `{ status: "ACCEPTED" | "REJECTED" }`.
  2. Backend ставит статус + `responded_at`.
- **API:** `PATCH /job-applications/:id/status`
- **Notify:** воркер получает notification «Application accepted/rejected».

### 6.7 Конвертировать отклик в коллаборацию

- **Actor:** Owner employer
- **Trigger:** Принятый отклик → «Start collaboration»
- **Шаги:**
  1. `POST /job-applications/:id/to-collaboration` с `{ agreed_amount, start_date?, project_type? }`.
  2. Backend создаёт `Collaboration` (status=`PENDING`) c ссылками на `job_post_id` и worker/employer из application.
  3. Обновляет `JobApplication.status = CONVERTED` (или аналог).
  4. Возможно закрывает вакансию `status=FILLED`.
- **API:** `POST /job-applications/:id/to-collaboration`
- **Notify:** воркер — «Collaboration started».

### 6.8 Пригласить воркера на вакансию (employer invite)

- **Actor:** Employer
- **Trigger:** Worker search → карточка воркера → «Invite to job» → выбор одной из своих OPEN вакансий
- **Шаги:**
  1. `POST /job-applications/jobs/:jobPostId/invite` с `{ worker_id, message? }`.
  2. Backend создаёт `JobApplication` c `initiated_by = EMPLOYER`, status=`PENDING`.
  3. **Автоматически создаётся `Conversation`** между employer и worker (если не существует) + системное message `JOB_INVITATION` с metadata = jobPostId, applicationId.
- **API:** `POST /job-applications/jobs/:jobPostId/invite`
- **Notify:** воркер — «New invitation for job XYZ».

---

## 7. Applications — воркер

### Feature overview

Воркер видит свои activity: отклики, отправленные сам (`initiated_by = WORKER`), и приглашения от работодателей (`initiated_by = EMPLOYER`). Может их фильтровать по статусу.

### 7.1 Откликнуться на вакансию

- **Actor:** Worker
- **Trigger:** `JobBoardPage` → деталь вакансии → «Apply»
- **Шаги:**
  1. Форма: `cover_message`, `proposed_rate?`.
  2. `POST /job-applications/jobs/:jobPostId/apply`.
  3. Backend проверяет: воркер, вакансия открыта, не истёк, ещё не откликался (`@@unique([job_post_id, worker_id])`).
  4. Создаёт `JobApplication` с `initiated_by = WORKER`, status=`PENDING`.
- **API:** `POST /job-applications/jobs/:jobPostId/apply`
- **Notify:** employer — «New application for your job XYZ».
- **⚠ Gap:** кнопка «Apply» видна всем залогиненным, а не только воркерам.

### 7.2 Принять / отклонить приглашение

- **Actor:** Worker
- **Trigger:** `MyApplicationsPage` → таб «Invitations» → ряд → «Accept»/«Decline»
- **Шаги:**
  1. `PATCH /job-applications/:id/status { status: ACCEPTED | REJECTED }`.
  2. Backend ставит статус + `responded_at`.
- **API:** `PATCH /job-applications/:id/status`
- **Notify:** employer уведомляется.
- **Next:** если `ACCEPTED`, работодатель обычно запускает флоу 6.7 (конвертация в коллаборацию).

### 7.3 Список своих откликов и приглашений

- **Actor:** Worker (или Employer — эндпоинт общий)
- **Trigger:** `MyApplicationsPage` → таб «My applications» / «Invitations»
- **Шаги:** `GET /job-applications/me`.
- **API:** `GET /job-applications/me`
- **⚠ Gap:** `<pre>JSON.stringify</pre>` (3 секции), нет фильтров по статусу.

### 7.4 Отозвать свой отклик

- **Actor:** Worker (owner)
- **Trigger:** `MyApplicationsPage` → item → «Withdraw»
- **Шаги:** `PATCH /job-applications/:id/status { status: WITHDRAWN }`.
- **API:** `PATCH /job-applications/:id/status`

---

## 8. Коллаборации

### Feature overview

Коллаборация — основная сущность «сделка». Создаётся тремя путями:
1. Employer конвертирует application.
2. Employer напрямую приглашает воркера (без job post).
3. Worker инициирует collab с employer.
4. Accept referral offer → auto-create collab.

Жизненный цикл: `PENDING` → `CONFIRMED` (обе стороны подтвердили условия) → `IN_PROGRESS` (старт работы) → `COMPLETED` (обе стороны пометили завершение). Ветки: `CANCELLED`, `DISPUTED`.

На коллаборации висит эскроу (1:0..1) и отзывы (до 2: одна от worker, одна от employer).

### 8.1 Создать коллаборацию — worker инициирует

- **Actor:** Worker
- **Trigger:** Публичный профиль employer → «Start collaboration»
- **Шаги:**
  1. Форма: `employer_id`, `project_type?`, `site_postcode?`, `agreed_amount?`.
  2. `POST /collaborations { employer_id, ... }` (без worker_id — инициатор сам).
  3. Backend проверяет `isWorker`, создаёт с `initiated_by = WORKER`, status=`PENDING`.
- **API:** `POST /collaborations`
- **Notify:** employer — «Worker X wants to collaborate».

### 8.2 Создать коллаборацию — employer инициирует

- **Actor:** Employer
- **Trigger:** Публичный профиль worker → «Start collaboration» / из accepted application
- **Шаги:** `POST /collaborations { worker_id, ... }`. Backend: `initiated_by = EMPLOYER`.
- **API:** `POST /collaborations`
- **Notify:** worker уведомляется.

### 8.3 Список своих коллабораций

- **Actor:** Участник (worker / employer)
- **Trigger:** `CollaborationsPage`
- **Шаги:** `GET /collaborations/me?status=&page=`. Возвращает коллаборации, где ты worker или employer.
- **API:** `GET /collaborations/me`
- **⚠ Gap:** «Raw list JSON» блок внизу (`CollaborationsPage:440`).

### 8.4 Детали коллаборации

- **Actor:** Участник или Staff
- **Trigger:** Клик по ряду из списка
- **Шаги:** `GET /collaborations/:id` → возвращает + reviews preview + escrow.
- **API:** `GET /collaborations/:id`
- **⚠ Gap:** нет отдельной страницы/диалога. Escrow показан как `<pre>JSON.stringify</pre>`.

### 8.5 Смена статуса коллаборации

- **Actor:** Участник
- **Trigger:** Details → кнопки «Confirm» / «Start» / «Complete» / «Cancel»
- **Шаги:**
  1. `PATCH /collaborations/:id/status { status }`.
  2. Backend валидирует переход (`PENDING → CONFIRMED`, `CONFIRMED → IN_PROGRESS`, `IN_PROGRESS → COMPLETED` и т.д.).
  3. Опционально заполняет `started_at`, `ended_at`, `confirmed_at`.
- **API:** `PATCH /collaborations/:id/status`
- **Notify:** контрагент уведомляется о смене.
- **Branch:** `COMPLETED` разблокирует возможность оставить отзыв (§11).

### 8.6 Флаг коллаборации

- **Actor:** Участник
- **Trigger:** Details → «Report issue»
- **Шаги:**
  1. Диалог с reason (текст).
  2. `POST /collaborations/:id/flag { reason }`.
  3. Backend: `flagged=true`, `flag_reason`. Создаёт `ModerationItem` `entity_type=COLLABORATION`.
- **API:** `POST /collaborations/:id/flag`
- **Notify:** staff — новый item в очереди.
- **⚠ Gap:** нет предустановленных причин, placeholder «payment dispute».

---

## 9. Эскроу и платежи

### Feature overview

Эскроу поверх коллаборации (1:0..1). Employer создаёт, депонирует через Stripe (PaymentIntent к платформе), средства удерживаются (status=`HELD`). После `COMPLETED` коллаборации staff (или автомат) инициирует release — `transfers.create` на Stripe Connect аккаунт воркера. Комиссия платформы (`platform_fee`) и комиссия referrer-а (`referral_commission`) вычитаются из суммы.

Branch: refund (возврат employer-у) или dispute (блокировка средств).

⚠ **Критично:** сейчас эскроу-эндпоинты (кроме deposit) — **моки**, они только меняют статус в БД без реальных Stripe-вызовов. Реальные transfer/refund проходят только через webhook-и.

### 9.1 Создать эскроу

- **Actor:** Employer
- **Trigger:** CollaborationsPage → деталь `IN_PROGRESS`/`CONFIRMED` коллаборации → «Set up escrow»
- **Шаги:**
  1. Форма: `job_amount`, `platform_fee` (⚠ сейчас руками), `referral_commission` (если есть referral_id).
  2. `POST /escrow/collaboration/:collaborationId`.
  3. Backend вычисляет `worker_payout = job_amount - platform_fee - referral_commission`.
  4. Создаёт `EscrowTransaction` со status=`CREATED`.
- **API:** `POST /escrow/collaboration/:collaborationId`
- **⚠ Gap:** `platform_fee` — должен считаться автоматически (например, % от `job_amount` по плану подписки).

### 9.2 Инициировать депозит (employer платит)

- **Actor:** Employer
- **Trigger:** Escrow card → «Deposit funds»
- **Шаги:**
  1. `POST /escrow/:id/deposit`.
  2. Backend создаёт Stripe PaymentIntent с `amount = job_amount`, `capture_method = manual`, `transfer_group = ESCROW_:id`.
  3. Возвращает `client_secret` → фронт показывает Stripe Elements / Checkout.
  4. Employer вводит карту/оплачивает.
  5. Stripe шлёт webhook `payment_intent.succeeded`.
  6. Backend через webhook: `escrow.status = HELD`, `deposit_confirmed_at = now()`, `stripe_charge_id` заполняется.
- **API:** `POST /escrow/:id/deposit` + webhook `payment_intent.succeeded`
- **Notify:** worker — «Employer deposited X GBP. Work can start.»

### 9.3 Staff подтверждает депозит *(мок)*

- **Actor:** Staff
- **Trigger:** ⚠ нет UI
- **Шаги:** `POST /escrow/:id/confirm-deposit` — только меняет `status = HELD` в БД, **без Stripe-вызова**.
- **API:** `POST /escrow/:id/confirm-deposit`
- **⚠ Gap:** реальный side-effect только через webhook. Staff-эндпоинт ведёт к рассинхрону с Stripe.

### 9.4 Release воркеру

- **Actor:** Staff (сейчас); по-правильному — автомат после `COMPLETED` + обоюдного confirm
- **Trigger:** ⚠ нет UI в AdminPage
- **Шаги (идеально):**
  1. Коллаборация → `COMPLETED`, обе стороны подтвердили.
  2. Backend вызывает `stripe.transfers.create` на `worker.stripe_connect_account_id` сумма = `worker_payout`.
  3. Обновляет `escrow.status = RELEASED`, `released_at`, `stripe_transfer_id`.
  4. (Опционально) отдельный transfer для referrer commission.
- **API:** `POST /escrow/:id/release`
- **⚠ Gap:** сейчас — мок, без реального transfer. Нет UI.

### 9.5 Refund

- **Actor:** Staff (при disputed/cancelled)
- **Trigger:** ⚠ нет UI
- **Шаги (идеально):**
  1. `POST /escrow/:id/refund`.
  2. Backend вызывает `stripe.refunds.create` на `stripe_charge_id`.
  3. Обновляет `status = REFUNDED`, `refunded_at`, `stripe_refund_id`.
- **API:** `POST /escrow/:id/refund`
- **⚠ Gap:** сейчас — мок.

### 9.6 Открыть спор (dispute)

- **Actor:** Worker или Employer
- **Trigger:** ⚠ нет UI
- **Шаги:**
  1. «Open dispute» → reason.
  2. `POST /escrow/:id/dispute { reason }`.
  3. Backend: `status = DISPUTED`, `disputed_at`. Создаёт `ModerationItem` `entity_type=ESCROW`.
- **API:** `POST /escrow/:id/dispute`
- **Notify:** staff + другая сторона.
- **⚠ Gap:** нет UI, не создаёт Stripe dispute автоматически.

### 9.7 Просмотр статуса эскроу

- **Actor:** Участник или staff
- **Trigger:** Collaboration details → Escrow section
- **Шаги:** `GET /escrow/collaboration/:collaborationId` → весь `EscrowTransaction`.
- **API:** `GET /escrow/collaboration/:collaborationId`
- **⚠ Gap:** рендерится как JSON-dump.

### 9.8 Stripe Connect onboarding (воркер) *(gap)*

⚠ **Флоу полностью отсутствует.** Нужен:
1. ProfilePage → Worker → Payments → «Set up payouts».
2. Backend создаёт Stripe Connect Express account → возвращает onboarding link.
3. Worker проходит KYC Stripe.
4. Webhook `account.updated` → `stripe_onboarding_complete = true`.

Без этого release физически невозможен — некуда переводить.

---

## 10. Рефералы

### Feature overview

Referral marketplace — любой клиентский профиль (worker или employer) может разместить лид (`Referral`): «у меня есть работа, которую я сам не делаю, передам за комиссию». Лид виден публично, referrer может таргетно отправить **offers** конкретным воркерам.

Workflow:
1. Референт создаёт `Referral` (`OPEN`).
2. Отправляет offers по 1 или списку воркеров.
3. Воркер видит offers в своём разделе, может принять/отклонить.
4. Accept → автоматически создаётся `Collaboration` с линком на referral + `referral_commission`.
5. После `COMPLETED` коллаборации + release эскроу — referrer получает transfer своей комиссии.

### 10.1 Создать реферал

- **Actor:** Любой клиент
- **Trigger:** `ReferralsPage` → «Create referral»
- **Шаги:**
  1. Форма: title, description, project_type, postcode_area, estimated_value, commission_pct, client_name/phone/email (опц. — контакты клиента).
  2. `POST /referrals` с DTO.
  3. Backend создаёт с `referrer_id = current.clientProfileId`, `status = OPEN`, `platform_fee_pct = 2.00` (дефолт).
- **API:** `POST /referrals`

### 10.2 Публичный поиск рефералов

См. 5.7. `GET /referrals`.

### 10.3 Список своих рефералов

- **Actor:** Referrer
- **Trigger:** `ReferralsPage` → таб «My referrals»
- **Шаги:** `GET /referrals/me?status=`.
- **API:** `GET /referrals/me`
- **⚠ Gap:** «Raw — my referrals» JSON-блок.

### 10.4 Редактировать свой открытый реферал *(gap в UI)*

- **Actor:** Owner
- **Trigger:** ⚠ нет UI
- **Шаги:** `PATCH /referrals/:id`. Только если `status = OPEN`.
- **API:** `PATCH /referrals/:id`

### 10.5 Отменить свой реферал

- **Actor:** Owner
- **Trigger:** «Cancel referral»
- **Шаги:** `DELETE /referrals/:id`. Backend: `status = CANCELLED`, все `PENDING` offers → `EXPIRED`.
- **API:** `DELETE /referrals/:id`

### 10.6 Отправить offer воркеру

- **Actor:** Referrer
- **Trigger:** Свой реферал → «Send to worker» → выбор из worker search
- **Шаги:**
  1. `POST /referrals/:id/offers { recipient_id, message? }`.
  2. Backend проверяет uniq `[referral_id, recipient_id]`, создаёт `ReferralOffer` (status=`PENDING`).
- **API:** `POST /referrals/:id/offers`
- **Notify:** воркер — «New referral offer from X».

### 10.7 Список полученных offers (воркер)

- **Actor:** Worker
- **Trigger:** `ReferralsPage` → таб «Offers for me»
- **Шаги:** `GET /referrals/offers/me?status=`.
- **API:** `GET /referrals/offers/me`

### 10.8 Принять / отклонить offer

- **Actor:** Worker (recipient)
- **Trigger:** Offer → «Accept» / «Decline»
- **Шаги:**
  1. `PATCH /referrals/offers/:offerId/respond { status: ACCEPTED | DECLINED, message? }`.
  2. Backend: обновляет `status`, `responded_at`.
  3. **Если ACCEPTED:**
     - Если offer уникален (первый принятый) → реферал становится `MATCHED`.
     - **Автоматически создаётся `Collaboration`** с `referral_id`, нужно будет выбрать employer-а отдельно (через messaging или referrer проксирует).
- **API:** `PATCH /referrals/offers/:offerId/respond`
- **Notify:** referrer — «Worker X accepted your offer».

### 10.9 Детали реферала

- **Actor:** Любой (возможно, только авторизованный — смотрит код `getById`)
- **Trigger:** Клик по реферал-карточке
- **Шаги:** `GET /referrals/:id` → + список offers (только referrer + admin видят полный list).
- **API:** `GET /referrals/:id`
- **⚠ Gap:** нет UI-страницы.

---

## 11. Отзывы

### Feature overview

Двусторонние отзывы привязаны к **коллаборации** (не к профилю напрямую). После `COMPLETED` обе стороны могут создать по одному отзыву (`@@unique([collaboration_id, reviewer_role])`). Отзыв содержит общий рейтинг 1-5 + (опц.) детализация по 5 измерениям: quality, reliability, communication, payment (для работодателя), safety (для воркера).

Отзыв создаётся с `is_published = false`, идёт на staff-модерацию. После publish — попадает в публичный листинг + пересчитывается `worker_profile.rating_avg/rating_count` и аналогично employer.

### 11.1 Создать отзыв после завершённой коллаборации

- **Actor:** Участник завершённой коллаборации
- **Trigger:** `ReviewsPage` (или на детали коллаборации) → «Leave review»
- **Precond.:** `collaboration.status = COMPLETED` И ты participant И ещё не оставлял отзыв в этой роли.
- **Шаги:**
  1. Форма: overall_rating (1-5), опциональные: quality/reliability/communication/payment/safety, comment.
  2. `POST /reviews/collaboration/:collaborationId { overall_rating, ..., comment }`.
  3. Backend определяет `reviewer_role` (worker/employer) по participant-у. Создаёт с `is_published=false`.
  4. Создаёт `ModerationItem` `entity_type=REVIEW` → очередь staff.
- **API:** `POST /reviews/collaboration/:collaborationId`
- **⚠ Gap:** результат показывается как `createResult` JSON на странице.

### 11.2 Publish отзыва (staff)

- **Actor:** Staff
- **Trigger:** ⚠ нет UI в AdminPage
- **Шаги:**
  1. Модератор смотрит `ModerationItem` для отзыва → кликает «Publish».
  2. `PATCH /reviews/:id/publish`.
  3. Backend: `is_published=true`, `published_at=now()`. Пересчитывает `rating_avg / rating_count` целевого профиля.
- **API:** `PATCH /reviews/:id/publish`
- **⚠ Gap:** **без этого действия отзыв никогда не попадает в публичный листинг**. Критичный UI-пробел — отзывы создаются, но авторы их не видят публично.

### 11.3 Просмотр отзывов о воркере / работодателе

- **Actor:** Любой (guest)
- **Trigger:** Публичный профиль → таб «Reviews»
- **Шаги:** `GET /reviews/worker/:workerId` или `GET /reviews/employer/:employerId`. Возвращает только `is_published=true`.
- **API:** `GET /reviews/worker/:workerId`, `GET /reviews/employer/:employerId`
- **⚠ Gap:** выводится как `<pre>JSON.stringify</pre>`.

### 11.4 Просмотр отзывов по коллаборации

- **Actor:** Участник коллаборации
- **Trigger:** Коллаб-деталь → «Reviews»
- **Шаги:** `GET /reviews/collaboration/:collaborationId` → 0, 1 или 2 отзыва.
- **API:** `GET /reviews/collaboration/:collaborationId`

### 11.5 Детали одного отзыва

- **Actor:** Любой, если опубликован
- **Trigger:** Клик на preview отзыва
- **Шаги:** `GET /reviews/:id`.
- **API:** `GET /reviews/:id`

---

## 12. Мессенджер (Inbox)

### Feature overview

1:1 диалоги между двумя `Account`. `Conversation` + `ConversationParticipant` (M:M, но на практике 2 участника). `Message` с типами `TEXT` / `JOB_INVITATION` / `SYSTEM`. Last-read tracking через `ConversationParticipant.last_read_at`.

Realtime: Socket.IO (`/chat` namespace) с Redis adapter для горизонтального масштаба. Аутентификация по JWT в socket handshake. Events: `message:new`, `conversation:read`, `typing` (планируется).

### 12.1 Начать диалог

- **Actor:** Авторизованный
- **Trigger:** Публичный профиль → «Message» / новый чат в Inbox
- **Шаги:**
  1. `POST /conversations { recipient_account_id, initial_message? }`.
  2. Backend ищет существующий conversation между двумя accounts (по обоим `ConversationParticipant`).
  3. Если нет — создаёт `Conversation` + 2 `ConversationParticipant` + (опц.) первое `Message`.
  4. Возвращает conversation + последние сообщения.
- **API:** `POST /conversations`

### 12.2 Открыть Inbox

- **Actor:** Авторизованный
- **Trigger:** `/inbox` (`InboxPage`)
- **Шаги:** `GET /conversations?page=&limit=` → список с собеседниками, последним сообщением, unread count, sorted by `last_message_at DESC`.
- **API:** `GET /conversations`

### 12.3 Unread counter (бейдж в навбаре)

- **Actor:** Авторизованный
- **Trigger:** Поллинг каждые ~30с или realtime событие
- **Шаги:** `GET /conversations/unread-count` → `{ total: N }`.
- **API:** `GET /conversations/unread-count`

### 12.4 Открыть диалог + подгрузить сообщения

- **Actor:** Участник
- **Trigger:** Клик по ряду conversation
- **Шаги:**
  1. `GET /conversations/:id/messages?before=&limit=50` — cursor-based, newest first.
  2. Рендерит. Сразу → `PATCH /conversations/:id/read` — обновляет `last_read_at` текущего participant-а.
- **API:** `GET /conversations/:id/messages`, `PATCH /conversations/:id/read`

### 12.5 Отправить сообщение

- **Actor:** Участник
- **Trigger:** Textarea → «Send»
- **Шаги:**
  1. `POST /conversations/:id/messages { content, message_type?, metadata? }`.
  2. Backend проверяет, что sender — participant. Создаёт `Message`. Обновляет `conversation.last_message_at`.
  3. Публикует в Redis → Socket.IO событие `message:new` всем подключённым участникам conversation.
- **API:** `POST /conversations/:id/messages` + WS broadcast
- **Notify:** если другой участник не онлайн — `Notification` создаётся (тип `NEW_MESSAGE`).

### 12.6 Real-time получение (WebSocket)

- **Actor:** Любой онлайн участник
- **Trigger:** WS-подключение установлено при загрузке `InboxPage`
- **Шаги:**
  1. Socket.IO connect на `/chat` с JWT в handshake.
  2. Фронт подписывается на свои conversations (join rooms по `conversation_id`).
  3. При событии `message:new` — фронт обновляет список + диалог.
- **⚠ Gap:** индикация «печатает», группировка по датам, превью вложений.

### 12.7 Системные JOB_INVITATION сообщения

- **Actor:** Employer (автоматически при invite — 6.8)
- **Trigger:** `POST /job-applications/jobs/:jobPostId/invite` создаёт под капотом conversation + системное message с `message_type=JOB_INVITATION` и `metadata = { job_post_id, application_id }`.
- **Поведение во фронте:** `ConversationListItem` / chat bubble рендерит специальную карточку с кнопкой «View job» / «Respond».

---

## 13. Уведомления

### Feature overview

In-app нотификации (table `notification`, channel=`IN_APP`). Поля: `type`, `title`, `body`, `data` (JSON с ссылками / id-шками), `read_at`. Канал `EMAIL` зарезервирован (требует Resend).

Типичные типы: `NEW_MESSAGE`, `NEW_APPLICATION`, `APPLICATION_ACCEPTED`, `APPLICATION_REJECTED`, `COLLAB_CONFIRMED`, `COLLAB_COMPLETED`, `ESCROW_DEPOSITED`, `ESCROW_RELEASED`, `REFERRAL_OFFER_NEW`, `REFERRAL_OFFER_ACCEPTED`, `REVIEW_PUBLISHED`, `IDENTITY_VERIFIED`.

### 13.1 Просмотр списка уведомлений

- **Actor:** Авторизованный
- **Trigger:** `/notifications` (`NotificationsPage`) или клик по иконке-колокольчику
- **Шаги:** `GET /notifications?page=&limit=` → sorted by `created_at DESC`.
- **API:** `GET /notifications`
- **⚠ Gap:** `<pre>JSON.stringify(listRes)</pre>` в самом низу.

### 13.2 Счётчик непрочитанных

- **Actor:** Авторизованный
- **Trigger:** Poll каждые 30с или WS-событие
- **Шаги:** `GET /notifications/unread-count`.
- **API:** `GET /notifications/unread-count`

### 13.3 Отметить одно прочитанным

- **Actor:** Получатель
- **Trigger:** Клик на notification item
- **Шаги:** `PATCH /notifications/:id/read`.
- **API:** `PATCH /notifications/:id/read`

### 13.4 Отметить все прочитанными

- **Actor:** Получатель
- **Trigger:** «Mark all read»
- **Шаги:** `PATCH /notifications/read-all`.
- **API:** `PATCH /notifications/read-all`

### 13.5 Клик → переход

- **Actor:** Получатель
- **Trigger:** Клик по уведомлению
- **Шаги:** Фронт читает `data.link` (например `/collaborations/:id`) и редиректит. `read_at` ставится автоматически.
- **⚠ Gap:** `data.link` не кликабельный, нет нормальной навигации.

---

## 14. Подписки

### Feature overview

`SubscriptionPlan` — справочник тарифов (admin CRUD). Поля: name, price_monthly/yearly, max_referrals (лимит реферраллов в месяц по плану), features (JSON с флагами), is_active. `UserSubscription` — активная подписка клиента со Stripe-id-шкой.

⚠ Текущее состояние: backend-модели есть, но Stripe-вызовы в `subscribe()` не сделаны — только запись в БД. Нет Customer portal. Нет prorated upgrade. Нет enforcement лимитов.

### 14.1 Просмотр тарифных планов *(gap в UI)*

- **Actor:** Любой (вкл. Guest)
- **Trigger:** ⚠ нет страницы `/pricing`
- **Планируемо:** `GET /subscriptions/plans` → рендер 3-4 планов в сравнительной таблице.
- **API:** `GET /subscriptions/plans`

### 14.2 Подписаться на план *(gap в UI)*

- **Actor:** Авторизованный
- **Trigger:** ⚠ нет кнопки «Subscribe»
- **Планируемый флоу:**
  1. `POST /subscriptions/subscribe { plan_id, interval: month|year }`.
  2. Backend должен создать Stripe Customer (если нет) + Stripe Subscription + вернуть Checkout session URL.
  3. После успеха — webhook `checkout.session.completed` → `UserSubscription` активируется.
- **API:** `POST /subscriptions/subscribe`
- **⚠ Gap:** Stripe-вызов отсутствует.

### 14.3 Текущая подписка *(gap в UI)*

- **Actor:** Авторизованный
- **Trigger:** Settings → Billing
- **Шаги:** `GET /subscriptions/me` → текущий `UserSubscription` + plan.
- **API:** `GET /subscriptions/me`

### 14.4 Отменить подписку *(gap в UI)*

- **Actor:** Owner
- **Trigger:** Billing → «Cancel»
- **Шаги:** `DELETE /subscriptions/:id` → `status = cancelled`. (По-правильному: Stripe `subscriptions.update({ cancel_at_period_end: true })`.)
- **API:** `DELETE /subscriptions/:id`

### 14.5 Использование фич плана *(gap в логике)*

- **Actor:** Любой подписчик
- **Пример:** worker пытается создать 11-й реферал при `max_referrals = 10`.
- **⚠ Gap:** enforcement не реализован. Нужен guard / interceptor, проверяющий `user_subscription.plan.max_referrals` в `POST /referrals`.

---

## 15. Staff / Admin

### Feature overview

Staff-интерфейс — `/admin` (`AdminPage`). Основные функции: очередь модерации, CRUD справочников (specialisations, tags, subscription plans), просмотр audit-лога. Разница admin/moderator: admin может всё, moderator — только модерация (без CRUD справочников и планов).

⚠ **Масштаб gap-ов:** большая часть staff-действий существует как endpoint-ы, но не вызывается в AdminPage. Сейчас реализовано: очередь + действия модерации + create/delete специализаций + audit-лог (без фильтров).

### 15.1 Staff login

См. 1.4. `/internal/login` → `POST /auth/staff/login`.

### 15.2 Очередь модерации

- **Actor:** Staff
- **Trigger:** AdminPage → таб «Moderation queue»
- **Шаги:** `GET /moderation/queue?queue_type=&status=&page=` → полиморфный список с `entity_type` (`DOCUMENT` / `REVIEW` / `COLLABORATION` / `ESCROW` / `PROFILE`), priority, age.
- **API:** `GET /moderation/queue`
- **⚠ Gap:** нет фильтров по queue_type в UI, нет SLA/age индикатора, нет bulk-операций.

### 15.3 Детали моd-item

- **Actor:** Staff
- **Trigger:** Клик по ряду queue
- **Шаги:** `GET /moderation/:id` → item + связанная сущность (документ/отзыв/коллаб) + история actions.
- **API:** `GET /moderation/:id`
- **⚠ Gap:** JSON-pre блоки в деталях.

### 15.4 Запись модерационного действия

- **Actor:** Staff
- **Trigger:** Mod-item detail → форма «Add action»
- **Шаги:**
  1. Staff выбирает `action_type` (`APPROVE` / `REJECT` / `REQUEST_INFO` / `ESCALATE` / `BAN`) + `notes`.
  2. `POST /moderation/:id/actions { action_type, notes }`.
  3. Backend создаёт `ModerationAction` + обновляет `ModerationItem.status` в зависимости от action_type.
  4. **Применяет side-effect** на целевую сущность (например, при REJECT документа — ставит `document.status = REJECTED`; при APPROVE — `APPROVED`).
- **API:** `POST /moderation/:id/actions`, `GET /moderation/:id/actions`
- **Notify:** владелец сущности.

### 15.5 Публикация отзыва *(gap в UI)*

- **Actor:** Staff
- **Trigger:** ⚠ нет отдельной UI-секции
- **Планируемо:** AdminPage → «Unpublished reviews» → кнопка «Publish» на каждом → `PATCH /reviews/:id/publish`.
- **API:** `PATCH /reviews/:id/publish`

### 15.6 Staff actions по эскроу *(gap в UI)*

- **Actor:** Staff
- **Trigger:** ⚠ нет UI
- **Планируемо:** AdminPage → «Escrow ops» → список HELD/DISPUTED → actions (release / refund / confirm).
- **API:** `POST /escrow/:id/release`, `POST /escrow/:id/refund`, `POST /escrow/:id/confirm-deposit`

### 15.7 Approve/reject документа *(gap в UI)*

- **Actor:** Staff
- **Trigger:** ⚠ прямой endpoint не вызывается. Сейчас идёт через `ModerationAction`.
- **Планируемо:** отдельная секция «Document queue» → кнопки «Approve» / «Reject» → `PATCH /documents/:id/status`.
- **API:** `PATCH /documents/:id/status`

### 15.8 CRUD специализаций

- **Actor:** Staff
- **Trigger:** AdminPage → «Specialisations» таб
- **Шаги:**
  - `GET /specialisations` — список.
  - Создание: форма → `POST /specialisations { name, slug }`.
  - ⚠ Edit: endpoint `PATCH /specialisations/:id` есть, UI-кнопки нет.
  - Удаление: `DELETE /specialisations/:id`.
- **API:** `GET|POST|PATCH|DELETE /specialisations`

### 15.9 CRUD тегов *(gap в UI)*

- **Actor:** Staff
- **Trigger:** ⚠ UI полностью отсутствует
- **Endpoints:** `GET /tags`, `POST /tags`, `PATCH /tags/:id`, `DELETE /tags/:id`.

### 15.10 CRUD тарифных планов *(частичный gap)*

- **Actor:** Admin
- **Trigger:** AdminPage → «Plans»
- **Шаги:**
  - `GET /subscriptions/plans`.
  - `POST /subscriptions/plans { name, price_monthly, price_yearly, max_referrals, features, is_active }`.
  - ⚠ `PATCH /subscriptions/plans/:id` — endpoint есть, UI нет.
  - (удаление через `is_active=false`, не hard-delete).
- **⚠ Gap:** `features` — нужен JSON-редактор (или чек-бокс список фич).

### 15.11 Просмотр audit-лога

- **Actor:** Staff
- **Trigger:** AdminPage → «Audit»
- **Шаги:** `GET /audit?action=&entity_type=&account_id=&page=` → таблица с `action`, `entity_type`, `entity_id`, `metadata`, `ip_address`, `created_at`.
- **API:** `GET /audit`
- **⚠ Gap:** нет фильтров по action/entity_type в UI.

### 15.12 Просмотр всех пользователей / бан *(gap)*

⚠ Не реализовано. Нужно:
- `GET /admin/users` с фильтрами.
- `PATCH /admin/users/:id/status` — деактивация.
- Аналогичное для профилей.

---

## 16. End-to-end сценарии

Собранные «склеенные» флоу, демонстрирующие продуктовую ценность.

### E2E-1. Новый воркер — от регистрации до первой оплаты

1. Guest → **1.1 Регистрация** как Worker.
2. → **3.1 Загрузка ID-документа** + **3.4 Stripe Identity** → верификация до `IDENTITY_VERIFIED`.
3. → **2.3 Обновление worker-profile** (day rate, availability) + **2.5 Специализации**.
4. → **4.1-4.3 Создание portfolio** (experience + 1-2 projects + certifications) + **4.5 медиа**.
5. → **9.8 Stripe Connect onboarding** (gap).
6. → **5.1/5.7 Найти работу**: `JobBoardPage` или `ReferralsPage`.
7. → **7.1 Apply** на вакансию.
8. → Employer принимает (6.6) → конвертирует (6.7) → создаётся `Collaboration` (PENDING).
9. → **12.5 Мессенджер** — обсуждение деталей.
10. → Обе стороны меняют статус до `IN_PROGRESS` (8.5).
11. → Employer создаёт **9.1 Escrow** + **9.2 Deposit**.
12. → Выполнение работы offline.
13. → Обе стороны → `COMPLETED` (8.5).
14. → Staff → **9.4 Release** → payout на Stripe Connect worker-а.
15. → **11.1 Обоюдные отзывы** → staff publish (11.2) → рейтинг растёт.

### E2E-2. Работодатель — от регистрации до hire

1. → **1.1 Регистрация** как Employer.
2. → **2.4 Employer profile** (company name, number).
3. → **6.1 Создание вакансии**.
4. → Воркеры откликаются (входящие через `GET /job-posts/:id` + **7.1**).
5. → **6.5 Просмотр applications** → **6.6 Accept лучшего** → **6.7 Конвертация в коллаборацию**.
6. → Дальше как E2E-1 шаги 9-15 (с employer-стороны).

**Альтернатива:** без job post — employer находит воркера в search (5.3), инвайтит напрямую → **8.2 Создание коллаборации**.

### E2E-3. Реферальная цепочка

1. У референта (worker или employer) — лид (сторонний клиент хочет ремонт).
2. → **10.1 Создать Referral** (OPEN, commission_pct = 10%).
3. → **5.3 Поиск воркеров** по специализации в нужном постcode.
4. → **10.6 Отправить offer** 3-5 воркерам.
5. → Один воркер → **10.8 Accept**. Остальные offers → `EXPIRED`.
6. → Авто-создаётся `Collaboration` с `referral_id`, но пока без employer-части (или referrer сам выступает proxy).
7. → Employer конвертируется (воркер с клиентом-заказчиком заключают коллаб с участием платформы).
8. → Эскроу создаётся с `referral_commission = estimated_value * commission_pct`.
9. → После release — **9.4** делает 2 Stripe transfer-а: воркеру (payout) и referrer-у (commission).
10. → Оба пишут отзывы.

### E2E-4. Спор

1. Коллаборация в `IN_PROGRESS`, эскроу `HELD`.
2. Воркер считает, что работа сделана → `COMPLETED`. Employer отказывается.
3. → **9.6 Open dispute** → staff уведомлён.
4. → Staff связывается с обеими сторонами через мессенджер (или внешние средства).
5. → Staff принимает решение:
   - В пользу воркера → **9.4 Release**.
   - В пользу employer-а → **9.5 Refund**.
   - Сплит — требует отдельного manual flow (не реализовано в MVP).
6. → Коллаборация → `CANCELLED` или `COMPLETED` + соответствующий отзыв-флаг.

### E2E-5. HMRC-верификация как trust signal

1. Воркер достиг `IDENTITY_VERIFIED`.
2. → Загружает UTR letter / CIS registration через **3.1**.
3. → Staff вручную проверяет → `verification_level = HMRC_VERIFIED`.
4. → В публичных карточках показывается топ-бейдж «HMRC verified» → выше conversion rate на applications.

---

## 17. Gap-ы и неполные флоу

Сводная карта того, что ещё предстоит спроектировать и реализовать, сгруппированная по приоритету. Источник — `tasks/in-progress/README.md` + визуальный аудит кода.

### P0 — блокируют production launch

| Gap | Категория | Что сломано |
|-----|-----------|-------------|
| Email подтверждение | §1.9 | Нет endpoint, нет email-шаблона, аккаунт сразу ACTIVE |
| Password reset | §1.10 | Ни endpoint, ни UI |
| Escrow — реальные Stripe вызовы | §9 | confirm-deposit / release / refund — моки |
| Stripe Connect onboarding для воркера | §9.8 | Без этого release физически невозможен |
| Publish отзыва в UI | §11.2 | Отзывы создаются, но никогда не публикуются → пользователь не видит свой отзыв |
| Debug JSON-блоки в 13+ страницах | все | `<pre>JSON.stringify()</pre>` в продакшен UI |
| Input полей `ID через запятую` | §6.1 | Specialisation / Tag IDs в JobBoard — нужен multiselect |
| Edit/delete своей вакансии | §6.2, 6.3 | Нет UI |
| Аватар через URL-текст | §2.2 | Нет file upload |

### P1 — critical UX gaps

| Gap | Категория |
|-----|-----------|
| Страница публичного профиля воркера/работодателя (`/u/:slug`) | §2.6 |
| Детальная страница вакансии (не диалог, а роут) | §5.2 |
| Страница тарифов `/pricing` + кнопка Subscribe | §14.1, 14.2 |
| Страница «My jobs» (как нормальный экран, а не дебаг) | §6.4 |
| Edit portfolio items | §4.4 |
| Admin: document queue, review queue, escrow ops | §15.5-15.7 |
| Tag CRUD UI | §15.9 |
| Dispute UI для участника | §9.6 |
| Роле-чувствительные CTA (Apply только воркерам и т.д.) | §5.2 |

### P2 — nice-to-have для MVP / полезно, но не блок

| Gap | Категория |
|-----|-----------|
| Phone OTP (Twilio/MessageBird) | §1.11 |
| 2FA | §1 |
| "Remember me", CAPTCHA | §1.3 |
| `logout-all` UI | §1.7 |
| Deactivate account UI | §1.8 |
| Drag-n-drop upload + превью + прогресс | §3.1 |
| Realtime индикация «печатает» | §12.6 |
| Pagination-контролы везде | §5, §10 |
| Автоматический расчёт platform_fee | §9.1 |
| Enforcement лимитов подписки | §14.5 |
| HMRC integration (или нормальный manual flow) | §3.6 |

### P3 — техдолг / инфраструктура

- Нет тестов (unit / e2e).
- Нет i18n (жёстко en-GB).
- Нет a11y-пасса.
- Нет error boundaries в React.
- Нет Sentry / observability.
- Нет CI (только ручные build + lint:tokens).
- Открытый CORS, нет helmet/security headers.
- Нет rate-limit на sensitive endpoints отдельно от global throttler.
- Нет Resend webhook (bounces / complaints).

### P4 — продуктовые расширения (после MVP)

- Разные валюты (сейчас жёстко GBP).
- Multi-participant conversations (групповые чаты по коллаборации).
- Репутационная система уровнями (бронза/серебро/золото).
- Вложения в сообщениях.
- Push-уведомления (Web Push / Firebase).
- Календарь availability воркера (не только boolean).
- Рекомендательная система — matching воркеров под job post / наоборот.
- Статистика в дашборде (доходы, кол-во коллабораций, рейтинг динамика).
- API для внешних агентств / интеграций.
- Mobile app (React Native).

---

## Приложение A. Справочник endpoint-ов

### Auth
- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`, `POST /auth/staff/login`
- `GET /auth/google`, `GET /auth/google/callback`

### Account / Profile
- `GET /account/me`, `PATCH /account/me`, `DELETE /account/me`
- `GET /client-profiles`, `GET /client-profiles/:slug`, `PATCH /client-profiles/me`
- `GET /worker-profiles`, `GET /worker-profiles/:id`, `PATCH /worker-profiles/me`
- `GET /employer-profiles`, `GET /employer-profiles/:id`, `PATCH /employer-profiles/me`

### Verification / Documents
- `POST /verification/start`, `GET /verification/status`
- `POST /documents/upload`, `GET /documents/me`, `GET /documents/:id`, `PATCH /documents/:id/status` (staff), `DELETE /documents/:id`

### Portfolio
- `GET /portfolio/worker/:workerId`, `GET /portfolio/:id`
- `POST /portfolio/experience`, `POST /portfolio/project`, `POST /portfolio/certification`
- `PATCH /portfolio/:id`, `PATCH /portfolio/:id/experience`, `PATCH /portfolio/:id/project`, `PATCH /portfolio/:id/certification`
- `DELETE /portfolio/:id`
- `POST /portfolio/:id/media`, `DELETE /portfolio/media/:mediaId`
- `POST /portfolio/:id/documents/:documentId`, `DELETE /portfolio/:id/documents/:documentId`

### Job posts / Applications
- `POST /job-posts`, `GET /job-posts`, `GET /job-posts/:id`, `GET /job-posts/me` (employer), `PATCH /job-posts/:id`, `DELETE /job-posts/:id`
- `POST /job-applications/jobs/:jobPostId/apply` (worker), `POST /job-applications/jobs/:jobPostId/invite` (employer)
- `GET /job-applications/jobs/:jobPostId` (employer), `GET /job-applications/me`
- `PATCH /job-applications/:id/status`, `POST /job-applications/:id/to-collaboration` (employer)

### Collaborations / Escrow
- `POST /collaborations`, `GET /collaborations/me`, `GET /collaborations/:id`, `PATCH /collaborations/:id/status`, `POST /collaborations/:id/flag`
- `POST /escrow/collaboration/:collaborationId`, `GET /escrow/collaboration/:collaborationId`
- `POST /escrow/:id/deposit`, `POST /escrow/:id/confirm-deposit` (staff), `POST /escrow/:id/release` (staff), `POST /escrow/:id/refund` (staff), `POST /escrow/:id/dispute`

### Referrals
- `POST /referrals`, `GET /referrals`, `GET /referrals/me`, `GET /referrals/offers/me` (worker), `GET /referrals/:id`, `PATCH /referrals/:id`, `DELETE /referrals/:id`
- `POST /referrals/:id/offers`, `PATCH /referrals/offers/:offerId/respond` (worker)

### Reviews
- `POST /reviews/collaboration/:collaborationId`, `GET /reviews/collaboration/:collaborationId`
- `GET /reviews/worker/:workerId`, `GET /reviews/employer/:employerId`, `GET /reviews/:id`
- `PATCH /reviews/:id/publish` (staff)

### Messaging
- `POST /conversations`, `GET /conversations`, `GET /conversations/unread-count`
- `GET /conversations/:id/messages`, `POST /conversations/:id/messages`, `PATCH /conversations/:id/read`
- WS: `/chat` namespace

### Notifications
- `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`

### Subscriptions
- `GET /subscriptions/plans`, `POST /subscriptions/plans` (admin), `PATCH /subscriptions/plans/:id` (admin)
- `POST /subscriptions/subscribe`, `GET /subscriptions/me`, `DELETE /subscriptions/:id`

### Reference data
- `GET /specialisations`, `GET /specialisations/:id/workers`, `POST /specialisations` (staff), `PATCH /specialisations/:id` (staff), `DELETE /specialisations/:id` (staff)
- `GET /tags`, `POST /tags` (staff), `PATCH /tags/:id` (staff), `DELETE /tags/:id` (staff)

### Moderation / Audit
- `GET /moderation/queue` (staff), `GET /moderation/:id` (staff), `POST /moderation/:id/actions` (staff), `GET /moderation/:id/actions` (staff)
- `GET /audit` (staff)

### Webhooks
- `POST /webhooks/stripe` — events: `payment_intent.*`, `charge.refunded`, `charge.dispute.*`, `transfer.*`, `checkout.session.completed`, `payout.*`, `account.*`, `capability.updated`, `identity.verification_session.*`

---

_Документ сгенерирован по состоянию репозитория на 2026-04-20. При изменении схемы Prisma или контроллеров — обновлять разделы 0 (lifecycles), 16 (E2E) и Приложение A._
