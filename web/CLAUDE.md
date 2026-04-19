# web/ — Frontend AI Contract

## Rules

1. **Semantic tokens only.** `bg-primary` ✅ — `bg-orange-500` ❌ — `#E07A3B` ❌. Default Tailwind palette is disabled (`--color-*: initial`), so default scales silently compile to nothing.
2. **Never reach past a semantic alias.** Components reference `color.*` aliases, never `brand.*` / `neutral.*` primitives. If the alias doesn't exist, add it — don't bypass it.
3. **Light + dark.** Every token has both. Toggle and verify.
4. **Mobile-first.** 375px first. Tap targets ≥ 48×48.
5. **Compose; don't duplicate.** Primitives in `src/components/ui/`, domain in `src/components/`. Use shadcn MCP if a primitive is missing — don't hallucinate props.
6. **If stuck**, read `src/tokens/semantic.json` (aliases) or `src/index.css` (runtime vars). Then ask.

## Where things live

- `src/tokens/` — DTCG JSON (`primitives.json`, `semantic.json`, `themes/{light,dark}.json`). **Source of truth.**
- `src/index.css` — `@theme` exposes semantic tokens as Tailwind utilities + `:root` / `.dark` vars.
- `src/components/ui/` — 16 primitives: button, input, textarea, label, card, badge, avatar, dialog, sheet, toast (sonner), select, dropdown-menu, tabs, table, skeleton, form.
- `src/components/` — domain: AppShell, AuthShell, JobCard, WorkerCard, EmployerCard, ConversationListItem, VerificationBadge (+ `verificationFromLevel`), StarRating, EmptyState.
- `src/lib/utils.ts` (`cn()`) · `src/lib/theme.ts` (`useTheme()`).

## Banned in `components/**` (caught by `npm run lint:tokens`)

Raw hex, default Tailwind scales (`bg-blue-500` etc.), `text-black|white` / `bg-black|white`, arbitrary `bg-[#...]`, inline `style={{ color }}`, `rgba(0,0,0,0.x)` shadows. Pages/** are not linted (Google-logo SVG exception).

## Gotchas

- Modal / sheet scrims: `bg-overlay`, not `bg-black/60`.
- Radix `Select` rejects `value=""` — use sentinel (`__any__`) and map back before request.
- Brand is Option A Amber, primary `#E07A3B` (`brand.600`). Locked. Don't re-pick.

## Adding a new color

Almost always the answer is "use an existing alias". If truly new:
- Pick in OKLCH, hue ≥ 25° from every anchor (brand 45° · neutral 240° · success 150° · warning 85° · danger 25° · info 230°).
- Build the full 50–950 scale + a dark-mode counterpart. 600 must hit ≥ 4.5:1 on white and ≥ 3:1 on page bg.
- Add as primitive scale + semantic alias + light/dark theme entries. Never drop a single hex into a component.
- Avoid competitor hues: corporate blue / Checkatrade navy, MyBuilder / Rated People / TrustATrader greens, Monzo coral, Klarna pink, Stripe purple, Toolstation / Bark yellow, ScrewFix hi-vis orange.

If it's a new brand category (subscription tiers, per-trade pills), **stop and ask the user** — brand decision, not implementation.

## Before declaring done

`npm run lint:tokens` + `./node_modules/.bin/vite build`. Toggle dark mode. Resize to 375px.
