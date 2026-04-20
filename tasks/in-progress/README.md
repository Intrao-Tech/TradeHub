# In Progress — Не production-ready

**Критерий:** не готово к проду если UI черновой (JSON-блоки, ручной ввод ID), бекенд мокнут (статус меняется без реальных side-effects), нет ключевых флоу.

Сгруппировано по домену. PM берёт каждую строку и превращает в `brief.md` + `spec.md`.

---

## 1. AUTH & ACCOUNT

### Бекенд неполный
- `POST /auth/register` — нет подтверждения email, пользователь сразу `ACTIVE`
- Нет password reset / forgot password (ни endpoint, ни email-шаблон)
- Google OAuth: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` пустые в `.env` — флоу не работает без ручной настройки
- Phone verification: колонка `account.phone_verified` есть, OTP/SMS-провайдер не интегрирован, нет endpoint `/account/phone/send-otp` и `/account/phone/verify`
- `POST /auth/logout` ожидает `refresh_token` в body, но фронт его не шлёт → refresh-токен в БД не удаляется, сессия остаётся валидной до TTL (см. `App.tsx:83`)
- Нет 2FA
- Нет rate-limit / CAPTCHA на login (есть только общий throttler 60 req/min)

### Фронтенд отсутствует
- Страница «забыл пароль» + email с токеном сброса
- Страница подтверждения email после регистрации
- UI для `PATCH /account/me` (обновление телефона, `phone_verified`)
- UI для `DELETE /account/me` (деактивация аккаунта) — endpoint есть
- UI для `POST /auth/logout-all` (разлогинить все устройства) — endpoint есть
- Передача `refresh_token` в body при logout (сейчас не передаётся)
- UI выбора роли (WORKER / EMPLOYER) при Google OAuth первичной регистрации — сейчас state читается в callback, но формы выбора нет

---

## 2. PROFILES (Client / Worker / Employer)

### Бекенд готов, но фронтенд не использует
- `GET /client-profiles` — публичный поиск клиентских профилей → **не вызывается нигде**
- `GET /client-profiles/:slug` — публичный профиль по slug → **нет страницы**
- `GET /worker-profiles/:id` — детальная страница воркера → **нет страницы** (только карточка в поиске)
- `GET /employer-profiles/:id` — детальная страница работодателя → **нет страницы**

### Фронтенд черновой (ProfilePage)
- Карточка «Account» целиком рендерит `<pre>{JSON.stringify(account, null, 2)}</pre>` с подписью «Raw account data for debugging»
- Поле `Avatar URL` вместо загрузки файла
- Portfolio вкладка: кнопка «Load portfolio» — портфолио не подгружается автоматически
- Portfolio items: есть только create (Experience / Project / Certification) и delete. **Нет edit** (хотя backend имеет `PATCH /portfolio/:id`, `/:id/experience`, `/:id/project`, `/:id/certification`)
- Portfolio media: нет UI для `POST /portfolio/:id/media` и `DELETE /portfolio/media/:id`
- Portfolio ↔ Documents linkage: нет UI для `POST/DELETE /portfolio/:id/documents/:documentId`
- Documents: нет UI для staff `PATCH /documents/:id/status` (approve/reject) — админка не использует endpoint
- Нет смены роли (стать воркером / работодателем), нет Stripe Connect onboarding UI (поле `stripe_connect_account_id` существует)

---

## 3. JOBS & APPLICATIONS

### Бекенд готов, фронтенд не даёт доступ
- `PATCH /job-posts/:id` — редактирование своего job-поста → **нет UI**
- `DELETE /job-posts/:id` — удаление → **нет UI**
- `GET /job-posts/me` — свои посты → используется только на `MyApplicationsPage` в debug-секции, нет полноценного «мои вакансии» экрана работодателя

### Фронтенд черновой (JobBoardPage)
- Поле `Specialisation IDs (comma-separated)` при создании поста — нужен дропдаун/мультиселект (`specialisations` endpoint есть)
- Поле `Tag IDs (comma-separated)` — нужен дропдаун (`/tags` endpoint есть на бекенде, но CRUD для админа тоже отсутствует в UI, см. §5)
- Блок «Last action response» с JSON внизу страницы (`JobBoardPage:519`)
- JSON-dump в диалоге деталей поста (`:479`)
- Нет роли-ориентированного CTA: «Apply (worker only)» — кнопка видна всем залогиненным, а не только воркерам

### MyApplicationsPage
- Три секции (воркер applications / employer posts / applications by post) выводят сырой `<pre>{JSON.stringify(...)}</pre>` (`:244, 308, 410`)
- Нет фильтров по статусу, нет группировок

---

## 4. COLLABORATIONS

### Бекенд готов, UI не раскрывает
- `GET /collaborations/:id` — отдельная страница/диалог деталей → **нет UI** (только список)

### Фронтенд черновой (CollaborationsPage)
- Блок escrow показывает `<pre>{JSON.stringify(escrow, null, 2)}</pre>` (`:319`)
- Блок внизу «Raw list JSON» (`:440`) + «Last action response» (`:519`)
- Поля `job_amount` / `platform_fee` / `referral_commission` при создании escrow — без валидации и подсказок, placeholder равен имени поля
- Диалог «Flag» — примитивный текст `placeholder="e.g. payment dispute"`, нет предустановленных причин

---

## 5. ESCROW (Stripe Connect)

### Бекенд — ЧАСТИЧНЫЙ МОК
- `POST /escrow/:id/confirm-deposit` (staff) — только `UPDATE status = HELD` в БД, **без реального Stripe-вызова** (`escrow.service.ts:165-174`)
- `POST /escrow/:id/release` (staff) — только `UPDATE status = RELEASED` в БД, **нет `transfers.create`** на Connect-аккаунт воркера (`:176-185`)
- `POST /escrow/:id/refund` (staff) — только `UPDATE status = REFUNDED`, **нет `refunds.create`** (`:187-196`)
- `POST /escrow/:id/dispute` — только `UPDATE status = DISPUTED`, не создаёт Stripe dispute
- Реальные side-effects проходят ТОЛЬКО через webhook-и (`payment_intent.succeeded`, `charge.refunded`, `transfer.created`) — staff endpoints расходятся с реальностью, можно создать рассинхрон
- Нет Stripe Connect onboarding flow для воркера (`stripe_connect_account_id` создаётся вручную)
- Нет расчёта `platform_fee` автоматически (передаётся руками в DTO)

### Фронтенд отсутствует
- UI staff-actions: confirm-deposit / release / refund — **нет в AdminPage**
- UI для участника «открыть спор» — **нет** (endpoint `POST /escrow/:id/dispute` не вызывается)
- Публичный статус escrow для клиента (employer видит только технический JSON)
- Нет страницы «мой кошелёк / выплаты» для воркера (Stripe Connect балансы, история)

---

## 6. REFERRALS

### Бекенд готов, UI не раскрывает
- `GET /referrals/:id` — детальная страница → **нет UI**
- `PATCH /referrals/:id` — редактирование своего открытого реферала → **нет UI** (только DELETE)

### Фронтенд черновой (ReferralsPage)
- Детали «Raw — my referrals», «Raw — search result», «Raw — offers mine» — JSON блоки (`:350, 412, 571`)
- «Last response» JSON (`:581`)
- Форма поиска: поля Status, Postcode, Page, Limit как ручные `Input` — нет селектов статусов, нет пагинатора

---

## 7. REVIEWS

### Бекенд готов, фронтенд не использует
- `POST /reviews/collaboration/:id` — создать отзыв (только для COMPLETED), is_published=false по умолчанию
- `GET /reviews/collaboration/:id` — нет UI
- `GET /reviews/:id` — нет UI (детальный отзыв)
- `PATCH /reviews/:id/publish` (staff) — нет UI (AdminPage не имеет «непроверенные отзывы» секции) → **отзывы создаются, но без staff-publish не попадают в публичный листинг → пользователь не видит свой отзыв**

### Фронтенд черновой (ReviewsPage)
- `<pre>{JSON.stringify(workerReviews)}</pre>` + `employerReviews` + `createResult` — все три листинга и результат создания как сырой JSON (`:263, 300, 377`)
- Поиск по `worker_id` / `employer_id` как ручной `Input` — нет автокомплита

---

## 8. TAGS

### Бекенд готов
- `GET /tags` — публичный список
- `POST /tags` (staff), `PATCH /tags/:id`, `DELETE /tags/:id`

### Фронтенд полностью отсутствует
- **Нет admin CRUD** для тегов в AdminPage
- **Нет picker-компонента** — в JobBoardPage теги вводятся как «Tag IDs (comma-separated)»
- Нет UI для worker_tag (назначить тег воркеру)

---

## 9. SPECIALISATIONS

### Бекенд готов, UI частично
- `GET /specialisations` — используется в WorkerSearchPage (JSON-dump) и AdminPage
- `POST /specialisations` (staff) — есть в AdminPage
- `PATCH /specialisations/:id` — **нет UI** (только create + delete в админке)
- `DELETE /specialisations/:id` — есть в AdminPage
- `GET /specialisations/:id/workers` — **нет UI**

### Фронтенд черновой
- WorkerSearchPage: `<pre>{JSON.stringify(specialisations)}</pre>` + `<pre>{JSON.stringify(results)}</pre>` (`:266, 297`)
- Нет чипсов/фильтров по специализациям в поиске воркеров (только текстовое поле)

---

## 10. SUBSCRIPTIONS

### Бекенд готов
- `GET /subscriptions/plans`, `POST /subscriptions/plans` (admin), `PATCH /subscriptions/plans/:id` (admin)
- `POST /subscriptions/subscribe` — пользователь выбирает план
- `GET /subscriptions/me` — текущая подписка
- `DELETE /subscriptions/:id` — отмена

### Фронтенд отсутствует (user-side)
- **Нет страницы «Планы / Pricing»** для пользователя
- **Нет кнопки «Подписаться»** (endpoint `/subscribe` не вызывается)
- **Нет отображения текущей подписки** в профиле / dashboard
- **Нет UI отмены подписки**
- Админская часть: `PATCH` плана отсутствует (только create). По всем планам нет поля `features` JSON-редактора

### Бекенд неполный
- `subscribe()` не делает `stripe.subscriptions.create` — только запись в БД (нужно проверить в subscription.service.ts, но быстрый просмотр показывает отсутствие Stripe-вызова)
- Нет Stripe Customer portal link
- Нет prorated upgrade/downgrade логики
- Нет enforcement по `max_referrals` из плана

---

## 11. DOCUMENTS

### Бекенд готов, UI не раскрывает
- `GET /documents/:id` — детали документа → **нет UI** (только список)
- `PATCH /documents/:id/status` (staff) — approve/reject → **AdminPage не вызывает**; вместо этого moderation actions работают через `/moderation/:id/actions` по связанному ModerationItem, но прямой status-update документа из админки недоступен

### Фронтенд косвенно
- Upload через FormData работает, но нет превью, нет прогресс-бара, нет валидации размера на клиенте (backend лимит 10MB)
- Нет drag-n-drop

---

## 12. STAFF / ADMIN

### Не покрыто в AdminPage
- Очередь документов на approve / reject (`PATCH /documents/:id/status`)
- Очередь отзывов на publish (`PATCH /reviews/:id/publish`)
- Staff escrow actions (confirm-deposit / release / refund)
- Tag CRUD
- Specialisation edit (только create + delete)
- Просмотр audit-лога есть, но без фильтров по action/entity_type

### Черновые блоки в AdminPage
- `<pre>{JSON.stringify(data)}</pre>` универсальный renderer (`:73`) для каждой таблицы
- Строчный `<pre>` для каждого ряда (`:1010`)

---

## 13. WEBHOOKS & INTEGRATIONS

- Stripe webhook `POST /webhooks/stripe` реализован на события: `payment_intent.succeeded|failed|canceled`, `charge.refunded`, `charge.dispute.created|closed`, `transfer.created|reversed`, `checkout.session.completed`, `payout.*`, `account.*`, `capability.updated`, `identity.verification_session.*`
- Требует `STRIPE_WEBHOOK_SECRET` и/или `STRIPE_CONNECT_WEBHOOK_SECRET` — иначе падает
- **Нет Resend webhook** (bounces / complaints)
- **Нет HMRC verification integration** (третья ступень `verification_level`)
- **Нет SMS-провайдера** (Twilio / MessageBird) для phone OTP

---

## 14. ОБЩИЕ (cross-cutting)

- Нет тестов (unit / e2e) — в CLAUDE.md указано как known gap
- Нет i18n (жёстко en-GB)
- Нет accessibility-пасса (aria, keyboard nav частично)
- Нет error boundaries в React
- Нет observability (Sentry / logs export) на фронте
- Нет CI (только ручные npm run build + lint:tokens)
- Нет политик CORS кроме `enableCors()` (открыт всем)
- Нет `helmet` / security headers на backend
- `.env.prod` не заполнен (это ок, но деплой-чеклист не документирован)
- Нет seed с реальными фото / аватарами (seed.ts не проверен, но CLAUDE.md не упоминает media seed)
- Нет rate-limit на чувствительные endpoints (login, upload) отдельно от глобального throttler
