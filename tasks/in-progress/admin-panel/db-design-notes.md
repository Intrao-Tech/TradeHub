# DB design notes — Admin panel (v4)

Companion to `db-schema-proposal.sql` v4.

## Design principles (locked in v4)

1. **Existing tables stay unchanged in shape.** The only modifications are:
   - `staff_member`: DROP `staff_role` VARCHAR column after backfill into the new `staff_member_role` junction.
   - `escrow_dispute`: ADD `assigned_to_staff_id` BIGINT column + index.
   No restructuring of `conversation` / `message` / anything else.

2. **Support chat is isolated** from collab chat. Its own pair of tables (`support_thread`, `support_message`). Different bounded context (`client↔staff` vs `worker↔employer`), different evolution path, different GDPR/retention policies. UI components and DTOs can be shared in code; data lives separately.

3. **Table inheritance only where there's real subtyping** — `account → client_profile / staff_member` (existing) and `staff_approval_rule_condition → 4 typed subtypes` (new). All subtypes share PK via `id` column. No fake inheritance for "just 1:1 with extra fields".

4. **No polymorphic-nullable-FK + CHECK patterns anywhere.** Every relationship is exactly one of: 1:1, 1:N, or M:N.

5. **3NF throughout.** Lookup tables for repeated string values (no Postgres ENUM). Junctions with composite PK for M:N. No transitive dependencies.

6. **JSONB only for opaque payloads** never queried in DB (`staff_action_approval.context`, `audit_log.metadata`, etc.). Never for queryable data.

7. **One documented exception: polymorphic `target_id`** on `staff_action_approval` and `staff_sla_breach`. No DB-level FK; `target_kind` discriminator references `admin_target_kind` lookup. Reason: 7 alternative per-kind FK columns would create the nullable-polymorphic antipattern we're explicitly avoiding. App layer enforces target validity.

## Why v4 dropped the `chat_thread` parent from v3

In v3 I introduced a `chat_thread` parent table with `conversation` and `support_thread` as subtypes, so `message` could have a single FK. That would have required:
- Refactoring existing `conversation` (drop shared PK with `collaboration`, add separate `collaboration_id` FK).
- Renaming `message.conversation_id → thread_id`, retargeting the FK to `chat_thread`.
- Retargeting `message.sender_id` from `client_profile` to `account`.
- Non-trivial migration of existing chat data.

**This was overengineering** — chasing speculative future-proofing ("what if we add a 3rd chat type one day?") at the cost of touching tables that work today. YAGNI says: don't introduce a parent abstraction until there are 3+ subtypes.

**Better answer (v4):** treat collab chat and support chat as two separate bounded contexts. They share UI components and code patterns, but live in independent tables. Existing schema untouched.

## Relationship-kind summary

After v4 every relationship in the schema is one of these three kinds, with no exotic patterns mixed in:

| Kind | Examples |
|---|---|
| **1:1** (shared PK / table inheritance) | `client_profile.id → account.id` (existing), `staff_member.id → account.id` (existing), `approval_condition_amount.id → staff_approval_rule_condition.id`, `approval_condition_tag.id → staff_approval_rule_condition.id` etc. |
| **1:N** (single FK) | `staff_approval_rule.required_approver_role_id → staff_role`, `staff_internal_note.client_profile_id → client_profile`, `support_message.support_thread_id → support_thread`, `support_message.sender_account_id → account`, `escrow_dispute.assigned_to_staff_id → staff_member`, … |
| **M:N** (junction with composite PK) | `staff_member_role(staff_member_id, staff_role_id)`, `client_profile_admin_tag(client_profile_id, admin_tag_id)` |

## The "triangles" still in the diagram (and why they're fine)

Two junctions carry one extra FK for audit (a "who did this M:N assignment" record). Visually triangular, but standard pattern:

| Junction | Audit FK | Why it's not a 3NF violation |
|---|---|---|
| `staff_member_role` | `granted_by_staff_id → staff_member` | PK is `(staff_member_id, staff_role_id)`. Same pair cannot appear with two different `granted_by` values; `granted_by` is metadata, not part of the relationship's identity. |
| `client_profile_admin_tag` | `added_by_staff_id → staff_member` | PK is `(client_profile_id, admin_tag_id)`. Same client cannot have the same tag from two different `added_by` values; metadata, not identity. |

**Test for legitimacy**: can the same (entity_A, entity_B) pair appear multiple times with different values for the third FK? If yes → it's a ternary relationship (third FK belongs in PK). If no → it's a junction with audit metadata. Both above pass the test as metadata.

## Lookups used in M:N **and** 1:N at the same time (still fine)

`admin_tag` and `staff_role` are referenced from both junctions and from 1:N rule columns. This is **the point of lookups** — they're referenced wherever the value is needed:

- `admin_tag` ↔ `client_profile` via the junction `client_profile_admin_tag` (M:N)
- `admin_tag` ← `approval_condition_tag.admin_tag_id` (1:N, condition uses tag as value)
- `staff_role` ↔ `staff_member` via the junction `staff_member_role` (M:N)
- `staff_role` ← `staff_approval_rule.required_approver_role_id` (1:N)
- `staff_role` ← `staff_sla_rule.notify_role_id` (1:N)
- `staff_role` ← `approval_condition_role.staff_role_id` (1:N)

Each individual relationship is 3NF on its own. The lookup is just doing its job — being looked up.

## Tables I added (final v4 inventory)

| Group | Tables | Cardinality role |
|---|---|---|
| **Lookups (6)** | `staff_role`, `admin_action_type`, `admin_target_kind`, `admin_queue_type`, `admin_tag`, `approval_condition_type` | Referenced (1:N from many tables) |
| **Junctions (2)** | `staff_member_role`, `client_profile_admin_tag` | M:N with composite PK + audit metadata |
| **Per-client data (1)** | `staff_internal_note` | 1:N from client to notes |
| **Approval engine (6)** | `staff_approval_rule`, `staff_approval_rule_condition` + 4 subtypes (`approval_condition_amount/_tag/_role/_doc_type`), `staff_action_approval` | Subtypes use shared PK with parent. Approval has polymorphic target_id (documented exception). |
| **SLA engine (2)** | `staff_sla_rule`, `staff_sla_breach` | 1:N. Breach has same polymorphic target_id. |
| **Support chat (2)** | `support_thread`, `support_message` | 1:N thread→message. Both isolated from existing `conversation`/`message`. |
| **Macros (1)** | `chat_macro` | Standalone reference data, editable by admins. |

**Total: 20 new tables. 2 existing tables touched (`staff_member` drop column, `escrow_dispute` add column).**

## Open questions for PM

1. **Subtype-row enforcement on approval conditions.** DB doesn't enforce that each `staff_approval_rule_condition` parent row has exactly one matching subtype row of the right type. Three options: (a) app layer only — recommend; (b) Postgres trigger — more complex; (c) deferred constraint via parent.subtype_id back-pointer. Going with (a) by default.
2. **Approval auto-expire window.** Default for `staff_action_approval.expires_at` — recommend 7 days. Hard-coded or in `platform_setting`?
3. **Macros starter set.** Seed default macros ("Need more docs", "Verification approved", "Dispute resolved in your favour", "Dispute resolved in their favour") or leave the table empty?
4. **`is_on_duty` + SLA notifications.** When SLA fires, notify only `is_on_duty=TRUE` staff with matching role, or all staff with role? Recommend on-duty first, fallback to any-role if none on-duty.
5. **`admin_tag` deletion.** Currently `ON DELETE RESTRICT` (can't delete a tag in use). Confirm? Alternative `CASCADE` would silently drop all assignments.

## What v4 still does NOT change

No structural change to `account`, `client_profile`, `worker_profile`, `employer_profile`, `contract`, `collaboration`, `conversation`, `message`, `escrow_milestone`, `payment`, `referral_intent`, `job_post`, `job_application`, `review`, `notification`, `audit_log`, `platform_setting`, `tag` (worker-skill tag, distinct from `admin_tag`).

`notification.type` will get new string values (`SUPPORT_THREAD_REPLY`, `APPROVAL_REQUESTED`, `APPROVAL_APPROVED`, `APPROVAL_REJECTED`, `SLA_BREACH`). Table shape unchanged.

`audit_log.action` will get new string values (`admin.*` family). Table shape unchanged.
