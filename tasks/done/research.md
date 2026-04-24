# Done — Production-ready

**Критерий:** бекенд работает без моков, UI вылизан, нет debug JSON-блоков, нет полей типа "ID через запятую".

По этому критерию **реально готовых фич сейчас нет**.

Ниже — всё, что близко к production, но требует финальной доработки перед переносом сюда. Пока ничего не перенесено — это справочник для PM, на что опереться.

---

## Близко к production (нужна косметика)

### Auth — регистрация и вход
- `POST /auth/register` — email + пароль, bcrypt, валидация DTO — **backend готов**
- `POST /auth/login` — возврат access + refresh токенов — **backend готов**
- `POST /auth/staff/login` — отдельный endpoint для admin/moderator — **backend готов**
- `POST /auth/refresh` — ротация refresh-токена — **backend готов**
- Страницы `LoginPage`, `RegisterPage`, `InternalLoginPage` — UI рабочий, без debug-блоков
- **Косметика до production:** «remember me», «забыл пароль», подтверждение email, CAPTCHA / rate-limit на login, маски телефона

### Messaging (Inbox)
- Полный CRUD для conversations + messages на backend
- Socket.IO + Redis Pub/Sub — реальное realtime
- `GET /conversations` + `/unread-count` + `/:id/messages` + `PATCH /:id/read` — все endpoints работают
- `InboxPage` — основной флоу (список, чат, отправка, отметка прочитано, новый чат) — рабочий
- **Косметика до production:** убрать блок `{JSON.stringify(lastActionJson)}` внизу страницы, индикация «печатает», дата-группы сообщений, превью вложений, ссылки на профиль участника

### Notifications
- `GET /notifications` + `/unread-count` + `PATCH /read-all` + `PATCH /:id/read` — backend готов
- `NotificationsPage` — список с отметкой прочитано
- **Косметика:** убрать `<pre>JSON.stringify(listRes)</pre>` в самом низу страницы, кликабельные `data.link`, звуковые/push-уведомления

### Verification (Stripe Identity)
- `POST /verification/start` → Stripe Identity session URL
- `GET /verification/status`
- Webhook `identity.verification_session.verified` → автоматически ставит `verification_level = IDENTITY_VERIFIED`
- Секция на `ProfilePage` + `VerificationBadge` компонент
- **Косметика:** лейблы градаций (`UNVERIFIED / EMAIL / PHONE / IDENTITY_VERIFIED / HMRC_VERIFIED`), пояснения «что даёт каждый уровень»

### Public job board (гостевой доступ)
- `GET /job-posts` — поиск по title + postcode, пагинация
- `GET /job-posts/:id` — детали
- `JobBoardPage` фильтры + карточки + диалог деталей
- **Косметика:** убрать `<pre>JSON.stringify(detail)</pre>` внутри диалога, `<pre>JSON.stringify(lastActionJson)</pre>` внизу страницы, пагинация-контролы, сортировка

### Admin: moderation queue
- `GET /moderation/queue`, `GET /moderation/:id`, `POST /moderation/:id/actions`, `GET /moderation/:id/actions` — backend готов
- `AdminPage` — queue + детали + запись action
- **Косметика:** убрать JSON-pre блоки в детали, SLA/возраст тикета, фильтры по queue_type, bulk-operations

### Seed + docker compose
- `docker compose up -d` поднимает Postgres + Redis
- `npx prisma migrate dev` + `npm run db:seed` — работает
- Тестовые аккаунты (admin, moderator, 5 воркеров, 3 работодателя) с паролем `Password123!`

---

## Общие проблемы, мешающие признать что-либо готовым

1. **Везде `<pre>JSON.stringify(...)</pre>`** — debug-блоки в продакшен-UI:
   `DashboardPage:206,214`, `EmployerSearchPage:170`, `JobBoardPage:343,479,519`,
   `CollaborationsPage:319,440,519`, `MyApplicationsPage:244,308,410,455`,
   `NotificationsPage:234`, `ReferralsPage:350,412,571,581`,
   `ReviewsPage:263,300,377`, `WorkerSearchPage:266,297`,
   `AdminPage:73,1010`, `InboxPage:502`, `ProfilePage:469`
2. **Ввод ID «через запятую»** вместо дропдаунов: `Specialisation IDs`, `Tag IDs` в `JobBoardPage`
3. **Аватар — текстовое поле `Avatar URL`**, а не upload (`ProfilePage:516`)
4. **Нет email verification** после регистрации
5. **Нет password reset flow** (ни endpoint, ни UI)
6. **Нет тестов** (unit / integration / e2e)
