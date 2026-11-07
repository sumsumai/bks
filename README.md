# BKS

An AI-native, multi-tenant booking platform for service businesses. Every business gets a branded booking page, a management workspace, an owner mobile app, and its own isolated **NanoClaw** AI agent that serves customers on WhatsApp, Telegram and web chat.

**Deploying to production? See [DEPLOY.md](DEPLOY.md)** (one server with Docker Compose, or managed platforms; includes how the database works).

## The four interfaces

| Interface | Where | Who |
|---|---|---|
| Customer marketplace | `/`, `/discover`, `/b/[slug]`, `/manage/[token]` | Customers: discover, book, chat with the business's agent, reschedule/cancel |
| Business workspace | `/app/*` | Owners, managers, staff: calendar, inbox, approvals, agent, knowledge, channels, services, team, customers, settings, billing, VIP community |
| Platform administration | `/admin/*` | Platform staff (by role): businesses, users & memberships, sign in as a user, AI agents, plans & pricing, subscriptions, Telegram bot, WhatsApp sessions, community, platform settings, team & access, system status, audit log |
| Owner mobile app | `apps/mobile` (Expo, iOS + Android) | Owners on the go: today, calendar, inbox + takeover, approvals, agent settings & knowledge, hours, WhatsApp linking by code, push notifications |

## Quick start

```sh
docker compose up -d                 # Postgres 17 on 127.0.0.1:5436
cd apps/web
cp .env.example .env.local           # DATABASE_URL is prefilled for the compose database
npm install
npm run db:seed                      # migrations + demo data
npm run dev                          # http://localhost:3200
npm test                             # core guarantees, against an in-memory database

# WhatsApp gateway (second terminal)
cd apps/wa-gateway && cp .env.example .env && npm install && npm start   # 127.0.0.1:3300
```

Demo logins (password `demo-password`): `owner@atelier.example` (VIP salon), `owner@ironhouse.example` (Standard barber), `owner@lumen.example` (VIP spa), `admin@bks.example` (platform admin).

The agent runs **live on Claude** when `ANTHROPIC_API_KEY` is set (model via `AGENT_MODEL`, default `claude-opus-5-5`; `AGENT_EFFORT` default `medium`). Without a key it runs in **offline mode**: a rule-based responder on the same data, tools and audit trail, so every flow is demoable.

Mobile: see `apps/mobile/README.md` (`npx expo start`, point `EXPO_PUBLIC_API_URL` at the web app).

## Architecture

```
apps/web     Next.js 16 (App Router): marketplace, workspace, admin, and the API (/api/v1) shared with mobile
apps/mobile  Expo + expo-router owner app, talks to /api/v1 with a bearer token + X-Business-Id
apps/wa-gateway  WhatsApp linked-device sessions (Baileys), one socket per business; internal HTTP API
Postgres     Drizzle ORM; migrations in apps/web/drizzle
Claude       NanoClaw agent runtime (apps/web/src/lib/agent)
```

**Multi-tenancy.** Every tenant table carries `business_id`. Requests resolve a `Tenant` (business + role) once: from the session and `bks_biz` cookie on the web, or from `X-Business-Id` on the API. Every query filters by that id; ids from request bodies or the model are never trusted for scoping. Cross-tenant access answers 404.

**RBAC.** Platform role `admin`; business roles `owner` / `manager` / `staff` mapped to permissions in `src/lib/rbac.ts` (`business.manage`, `catalog.manage`, `bookings.manage`, `agent.manage`, `agent.approve`, `inbox.reply`, …). API routes declare their permission in `tenantRoute(permission, …)`; server actions use `tenantFor(permission)`.

**Double-booking prevention.** Availability is computed from weekly hours, time off, buffers, notice and horizon (`src/lib/availability.ts`, DST-safe). Booking re-checks the slot, and a Postgres exclusion constraint (`btree_gist`, `tstzrange` per staff member over live bookings) is the final guarantee under concurrency: web, owner app and every agent channel race safely.

**NanoClaw agents** (`src/lib/agent/`):
- Provisioned automatically with the business: isolated runtime namespace (`runtime_ref`), persona, permissions, starter knowledge, web-chat channel.
- Learns from the business: services, prices, team, hours, booking policy and short knowledge entries go into a cached system prompt; long documents are reached through `search_knowledge` (Postgres full-text, tenant-scoped).
- Personality: tone, formality, language (mirrors the customer), emoji, greeting, sign-off, plus free-form owner instructions.
- Tools: list services, check availability, create / reschedule / cancel bookings, look up the customer's bookings, search knowledge, remember customer facts, escalate to a human. Booking tools only see the conversation's own customer.
- Permissions per tool: `auto`, `approve` (queued to the Approvals inbox and pushed to the owner app; executed exactly once when approved), or `off` (not offered to the model). Escalation can never be switched off.
- Every tool call is written to `agent_actions` (audit + approval queue). Escalation keywords, refusals and errors hand the conversation to a human; while a human has taken over the agent stays silent.
- Memory: conversation history per thread plus durable per-customer facts, both keyed by business.
- Runtime: manual Claude tool-use loop with prompt caching and server-side refusal fallback. Every channel goes through one entry point, `handleInbound()`, so a remote or containerised runtime can replace the in-process one without touching channels or UI.

**Channels.**
- *WhatsApp: each business's own WhatsApp Business app, linked as a device.* From Channels (web: QR code; mobile app: pairing code typed on the same phone), the business links its WhatsApp Business app like WhatsApp Web. Sessions run in `apps/wa-gateway` (Baileys, one socket per business, auth keys encrypted in Postgres `wa_auth`, restored on restart, auto-reconnect with backoff). The gateway is a thin transport: it posts events to the web app (`/api/internal/whatsapp`, Bearer `WA_GATEWAY_SECRET`) and the web app sends replies through it.
  - Customer messages go to the business's agent. Messages delivered late after a reconnect (`WA_STALE_MINUTES`, 120 by default) are stored without an auto-reply.
  - The owner keeps using WhatsApp on their phone. Their own replies arrive as *echoes*, show in the inbox as team messages, and pause the agent for that customer until it's handed back or the owner has been quiet for `AGENT_TAKEOVER_TIMEOUT_HOURS` (12).
  - Recent chats (`WA_HISTORY_DAYS`, 30) are imported at link time so the agent and inbox have context. Groups, broadcasts, status and channels are ignored. The device never shows as "online", so the owner's phone keeps its notifications.
  - Unlinking from the phone (Linked devices → Log out) disconnects the channel and notifies the owner.
  - **Risk:** Baileys is an unofficial client; WhatsApp can restrict numbers that behave like bots. Keep it conversational (answers to inbound messages), avoid bulk or unsolicited sends, and expect occasional relinks.
- *Telegram: one shared platform bot.* Every business gets a deep link `t.me/<bot>?start=<slug>` (shown on its booking page and Channels page). Each Telegram chat has an *active business*: the deep link binds it, `/switch` lists the businesses that person has talked to as buttons, and a proactive message from another business (reminder, approval outcome) is prefixed with that business's name and re-binds the chat. After routing everything is per business: separate customer records, conversations, agent and memory. One webhook (`/api/webhooks/telegram`, secret-header verified), registered from `/admin/integrations`.
- Inbound messages are idempotent on the channel message id and acknowledged immediately; the agent runs after the response.

**Platform administration.** Everything operational is managed from `/admin`, not env vars:
- *Settings* (`platform_settings`, `lib/settings.ts`): public URL, sign-ups open/closed, self-publishing, global AI switch, Anthropic key, default model and effort, takeover timeout, Stripe keys, reminders (on/off, hours before, on WhatsApp or not). Database value → env var → default; secrets AES-GCM encrypted and only shown masked. Only infrastructure stays in env: `DATABASE_URL`, `APP_ENCRYPTION_KEY`, `WA_GATEWAY_URL`/`WA_GATEWAY_SECRET`, `CRON_SECRET`.
- *Plans & pricing* (`plans` table): name, price, currency, monthly/yearly, trial, features, Stripe price id, visibility, and entitlements enforced across the app: monthly AI conversations (new conversations past the limit wait for the owner), team-member limit, WhatsApp/Telegram, VIP community, featured listing. Plans in use are archived, never deleted.
- *Telegram bot*: connect/replace the shared bot token (validated with Telegram), register the webhook, rotate its secret, edit the bot's name and descriptions, switch Telegram off platform-wide. Business deep links refresh automatically.
- *WhatsApp*: every linked number with its gateway session; restart or unlink; platform switch; stale-message window.
- *Users*: create users (with business membership and optional staff role), edit, reset password, sign out everywhere, disable, manage memberships, and **sign in as a user** for support (1-hour session, no staff powers while impersonating, banner, every action tagged `impersonatedBy` in the audit log).
- *Businesses*: edit name/slug/category, publish/suspend, change plan/subscription status/renewal date, team members, agent pause/provision.
- *Team & access* (`lib/platform-rbac.ts`): roles Administrator, Operator, Support, Finance, Moderator with a permission matrix; every admin page and action checks its permission; at least one administrator always remains.

**Real time.** Notifications table → SSE stream (`/api/v1/events`) for the web workspace, Expo push for the mobile app.

**Billing.** Standard (€29) and VIP (€79) plans. Stripe Checkout + webhook when `STRIPE_*` is set; otherwise a test mode applies plan changes immediately. VIP unlocks the community forum.

**GDPR.** Consent at booking, customer data export (JSON) and erasure (personal data removed, bookings anonymised) from the workspace, per-business data isolation, audit log, privacy notice at `/privacy`.

**Reminders.** `GET /api/cron/reminders` (Bearer `CRON_SECRET`) sends day-before reminders on the customer's messaging channel, claim-once so overlapping runs never double-send.

## Production checklist

- Postgres 15+ with `btree_gist` available (standard in managed Postgres).
- Set `APP_ENCRYPTION_KEY` and `CRON_SECRET` in the environment; then in Admin → Settings set the public https URL and the Anthropic key.
- WhatsApp gateway: run exactly one instance of `apps/wa-gateway` (long-running Node process, not serverless) next to Postgres, on a private network. Set `DATABASE_URL`, `APP_ENCRYPTION_KEY` (same as web), `WEB_URL`, `WA_GATEWAY_SECRET`; on the web set `WA_GATEWAY_URL` and the same secret.
- Telegram: create the bot with @BotFather, then paste its token in Admin → Telegram bot (the webhook registers automatically once the public URL is https).
- Stripe: add the secret key and webhook secret in Admin → Settings, and a Stripe price id on each paid plan in Admin → Plans & pricing; webhook to `/api/webhooks/stripe`.
- Schedule the reminders cron every 10–15 minutes.
- Mobile push: `eas init` for a project id, then a development/production build.

## Known gaps / next steps

- Live Claude path is typechecked but not yet exercised against the API on this machine (no key configured). Offline mode, tools, permissions and approvals are tested.
- Online payment for bookings (`requirePayment`) is modelled but checkout for individual bookings isn't wired; subscriptions are.
- Rate limiting and the SSE stream are per-process (fine for one instance; use Redis / LISTEN-NOTIFY when scaling out).
- Postgres row-level security as defence in depth on top of app-level tenant scoping.
- Email delivery (no email provider wired).
- WhatsApp: media (photos, voice notes) reach the agent only as placeholders like "[photo]"; the gateway is a single instance (fine for many hundreds of businesses; shard by business id beyond that).
- Agent conversations are processed one turn at a time per message; a per-conversation lock would serialise rapid bursts.
- Team invitations (multi-user businesses work in the data model; there's no invite UI yet).
- Platform admins without their own business can moderate from `/admin/community` but not browse `/app/community`.
