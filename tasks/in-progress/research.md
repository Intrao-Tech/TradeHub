# In Progress — Не production-ready

**Критерий:** не готово к проду если UI черновой (JSON-блоки, ручной ввод ID), бекенд мокнут (статус меняется без реальных side-effects), нет ключевых флоу.

Сгруппировано по домену. PM берёт каждую строку и превращает в `brief.md` + `spec.md`.

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
