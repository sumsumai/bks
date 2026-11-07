# Deploying BKS

Two ways to run BKS in production:

- **[One click on Vercel](#one-click-on-vercel)**: web app, database, login, cron and HTTPS hosted for you.
  WhatsApp (optional) adds a one-click service on Render.
- **[One server with Docker Compose](#3-recommended-one-server-with-docker-compose)**: everything on a VM
  you control, including WhatsApp.

- [One click on Vercel](#one-click-on-vercel)
- [1. What you are deploying](#1-what-you-are-deploying)
- [2. How the database works](#2-how-the-database-works)
- [3. Recommended: one server with Docker Compose](#3-recommended-one-server-with-docker-compose)
- [4. First-run configuration (in the admin)](#4-first-run-configuration-in-the-admin)
- [5. Updating, migrations and rollback](#5-updating-migrations-and-rollback)
- [6. Backups and restore](#6-backups-and-restore)
- [7. Alternative: managed platforms](#7-alternative-managed-platforms)
- [8. Mobile app (iOS / Android)](#8-mobile-app-ios--android)
- [9. Security checklist](#9-security-checklist)
- [10. Scaling](#10-scaling)
- [11. Troubleshooting](#11-troubleshooting)

---

## One click on Vercel

### What Vercel hosts, and what it can't

| Piece | Where | Notes |
|---|---|---|
| Web app: marketplace, workspace, admin, API, AI agents | **Vercel** | Next.js, HTTPS and a `*.vercel.app` domain included |
| Database | **Neon Postgres via the Vercel Marketplace** | Created and connected in the same click; free tier to start |
| Login and accounts | **Built in** | BKS has its own sign-in (sessions stored in Postgres); no auth service to buy |
| Telegram bot, Stripe webhooks | **Vercel** | Configured later in the admin |
| Appointment reminders | **Vercel Cron** | Hobby: once a day (the app looks a day ahead, so nothing is missed). Pro: optional every 10 minutes |
| WhatsApp gateway | **Render** (separate click, optional) | Must stay connected 24/7; Vercel functions scale to zero, so it can't run there |

### Step 1: deploy the web app and database

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsumsumai%2Fbks%2Ftree%2Fmain%2Fapps%2Fweb&project-name=bks&repository-name=bks-web&env=APP_ENCRYPTION_KEY%2CCRON_SECRET%2CADMIN_EMAIL%2CADMIN_PASSWORD&envDescription=APP_ENCRYPTION_KEY%20and%20CRON_SECRET%3A%20any%20long%20random%20strings%20%2832%2B%20letters%20and%20digits%29.%20ADMIN_EMAIL%20%2F%20ADMIN_PASSWORD%3A%20your%20first%20administrator%20account%20%288%2B%20characters%29.&envLink=https%3A%2F%2Fgithub.com%2Fsumsumai%2Fbks%2Fblob%2Fmain%2FDEPLOY.md%23one-click-on-vercel&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%5D)

The button:

1. copies the web app into a new GitHub repository on your account (`bks-web`),
2. creates a **Neon Postgres** database and connects it (accept the Neon step in the flow),
3. asks for four values:

   | Variable | What to enter |
   |---|---|
   | `APP_ENCRYPTION_KEY` | 32+ random letters/digits. Keep a copy: it encrypts stored keys (see [§2](#2-how-the-database-works)). |
   | `CRON_SECRET` | 32+ random letters/digits (Vercel sends it to the reminders job). |
   | `ADMIN_EMAIL` | Your email: the first administrator. |
   | `ADMIN_PASSWORD` | 8+ characters. Change it after the first sign-in. |

   Generate random values with `openssl rand -hex 24`, or any password manager.
4. builds: the build applies database migrations and creates your administrator automatically.

Open `https://<your-project>.vercel.app/login` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Then
follow [§4 First-run configuration](#4-first-run-configuration-in-the-admin) (AI key, plans, Telegram,
Stripe…). The public URL is detected automatically; set it in Admin → Settings once you add a custom domain.

> **If the build stops with "No database connected"**: Vercel occasionally skips the database step. Open
> the project → **Storage** → **Create Database** → **Neon** → connect it to the project, then
> **Deployments → Redeploy**. Nothing else changes.

**Want sample data to look around?** Add the environment variable `DEMO_DATA=true` and redeploy: three
demo businesses are created (their owners sign in with `demo-password`). Only for testing; remove it and
don't use it on a real site.

**Custom domain:** Project → Settings → Domains → add `bks.yourdomain.com`, then Admin → Settings →
Public URL. **Reminders every 10 minutes** (Pro plan): add
`{ "path": "/api/cron/reminders", "schedule": "*/10 * * * *" }` to `crons` in `vercel.json`.

**Keeping one repository instead of a copy (recommended if you develop BKS):** instead of the button,
use Vercel → **Add New → Project** → import `sumsumai/bks`, set **Root Directory** to `apps/web`, add a
Neon database from the Storage tab, add the four variables above, and deploy. Every `git push` to `main`
then redeploys.

### Step 2 (optional): WhatsApp

Businesses link their own WhatsApp Business app through the WhatsApp gateway, an always-on service.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/sumsumai/bks)

1. Click the button (Render reads `render.yaml`; the service costs about $7/month on the Starter plan,
   which never sleeps).
2. Fill in:
   - `DATABASE_URL`: the same database. In Vercel → Storage → your Neon database → copy the
     **unpooled** connection string (`DATABASE_URL_UNPOOLED`).
   - `APP_ENCRYPTION_KEY`: the same value as on Vercel.
   - `WEB_URL`: your app URL, e.g. `https://bks.vercel.app`.
   - `WA_GATEWAY_SECRET` is generated for you.
3. When it's live, copy its URL (`https://bks-wa-gateway-xxxx.onrender.com`) and, in Render → Environment,
   the generated `WA_GATEWAY_SECRET`.
4. In BKS: **Admin → WhatsApp → Settings**, paste *Gateway URL* and *Gateway secret*, save. The page shows
   the gateway "Online", and businesses can now link WhatsApp from their Channels page.

### Updating

- Button deployment: your `bks-web` repository is a copy. Pull updates from `sumsumai/bks` (`apps/web`)
  into it, or switch to the "one repository" setup above.
- Imported repository: `git push` deploys. Migrations run during every build.
- Render redeploys the gateway on every push to `main` (`autoDeploy`).

---

## 1. What you are deploying

```
                       Internet (HTTPS)
                              │
                        ┌─────▼─────┐
                        │   Caddy   │  automatic Let's Encrypt certificates
                        └─────┬─────┘  blocks /api/internal/* from outside
                              │
   Telegram ─webhook─►  ┌─────▼─────┐  ◄── browsers, owner mobile app (/api/v1)
   Stripe   ─webhook─►  │    web    │      Next.js: marketplace, workspace, admin, API,
                        │  :3000    │      NanoClaw agent runtime (calls Claude)
                        └──┬─────┬──┘
              SQL          │     │  HTTP (private, shared secret)
                  ┌────────▼┐   ┌▼────────────┐
                  │ Postgres│◄──│ wa-gateway  │  one WhatsApp linked-device session
                  │  :5432  │   │   :3300     │  per business (Baileys), long-running
                  └─────────┘   └─────────────┘
                        ▲
                  ┌─────┴─────┐
                  │   cron    │  calls /api/cron/reminders every 10 min
                  └───────────┘
```

| Service | Source | Notes |
|---|---|---|
| `web` | `apps/web` | Stateless. Runs DB migrations on start. Can run several copies (see [Scaling](#10-scaling)). |
| `wa-gateway` | `apps/wa-gateway` | **Exactly one instance.** A WhatsApp session can only live in one process. Never exposed publicly. |
| `db` | Postgres 17 | Single source of truth, including WhatsApp session keys. |
| `caddy` | Caddy 2 | TLS termination and reverse proxy. |
| `cron` | curl loop | Reminders. Replace with any scheduler you like. |

Everything product-level (AI key, model, Telegram bot, Stripe, plans and prices, sign-ups, reminders) is
configured **in the admin** after the first boot. The environment holds only infrastructure secrets.

---

## 2. How the database works

**Engine.** Plain PostgreSQL (15+; the stack ships 17). The app talks to it through
[Drizzle ORM](https://orm.drizzle.team) with the `pg` driver. Any Postgres works: the bundled container,
Neon, Supabase, RDS, Cloud SQL… The only extension used is `btree_gist`, which every managed provider has.

**Schema.** Defined in TypeScript in `apps/web/src/db/schema.ts`. Main groups:

| Area | Tables |
|---|---|
| Identity | `users`, `sessions` (only SHA-256 of tokens is stored), `push_tokens` |
| Tenants | `businesses`, `memberships` (user ↔ business with owner/manager/staff), `subscriptions`, `plans` |
| Catalog | `services`, `service_staff`, `staff`, `availability_rules`, `time_off`, `locations` |
| Bookings | `customers`, `bookings`, `payments` |
| AI agents | `agents`, `knowledge_items`, `customer_memories`, `agent_actions` (audit + approval queue), `usage_events` |
| Messaging | `channels`, `conversations`, `messages`, `telegram_chats`, `wa_auth` (WhatsApp keys) |
| Platform | `platform_settings`, `notifications`, `audit_log`, `forum_*` (VIP community) |

**Multi-tenancy.** Every tenant-owned row carries `business_id`. Each request resolves *one* business
(from the session or the `X-Business-Id` header) after checking membership, and every query filters by it.
The AI agent's tools are built around that business and the conversation's own customer, so an agent can't
reach another business's data even if a model asked for it. Cross-tenant requests answer 404.

**Double booking is impossible at the database level.** Besides the application check, migration `0001`
adds an exclusion constraint:

```sql
EXCLUDE USING gist (staff_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status IN ('pending','confirmed'))
```

Two overlapping live bookings for the same staff member are rejected by Postgres itself, even under
concurrent requests from the web, the mobile app and every agent channel.

**Migrations.** SQL files in `apps/web/drizzle/` (generated by `drizzle-kit`, a few hand-written ones).
They are applied **automatically when the web container starts** (`npm run db:migrate`), and Postgres
records what ran in `drizzle.__drizzle_migrations`, so each runs once. To change the schema:

```sh
cd apps/web
# edit src/db/schema.ts, then:
npx drizzle-kit generate --name=describe_change   # writes drizzle/00xx_describe_change.sql
npm run db:migrate                                 # apply locally
git commit                                         # deploy applies it in production
```

**Secrets at rest.** Platform secrets (Anthropic, Telegram, Stripe keys in `platform_settings`) and the
WhatsApp session keys (`wa_auth`) are encrypted with AES-256-GCM using `APP_ENCRYPTION_KEY`.
**Back that key up with the database**: without it those values can't be decrypted (you would have to
re-enter keys and re-link WhatsApp numbers; everything else is unaffected).

**Tests** don't need Postgres running: they use PGlite (Postgres compiled to WebAssembly) in memory, with
the same migrations.

**Local development** uses the `docker-compose.yml` at the repository root (Postgres on `127.0.0.1:5436`).

---

## 3. Recommended: one server with Docker Compose

A single VM runs everything. This fits up to several hundred businesses comfortably.

### 3.1 Requirements

- A Linux server: 2 vCPU, 4 GB RAM, 40 GB disk (Ubuntu 24.04 or Debian 12). Any provider: Hetzner,
  DigitalOcean, OVH, Scaleway, AWS Lightsail, …
- A domain, e.g. `bks.example.com`, with an **A** (and optionally **AAAA**) record pointing at the server.
- Ports 80 and 443 open to the internet (Caddy needs both to get certificates).

### 3.2 Install Docker

```sh
ssh root@your-server
curl -fsSL https://get.docker.com | sh
docker compose version     # must print v2.x
```

Optional but recommended: create a non-root user in the `docker` group and enable a firewall
(`ufw allow OpenSSH && ufw allow 80 && ufw allow 443/tcp && ufw allow 443/udp && ufw enable`).

### 3.3 Get the code

```sh
git clone https://github.com/sumsumai/bks.git
cd bks/deploy
```

(For a private repository, use a deploy key or `gh auth login` on the server.)

### 3.4 Configure

```sh
cp .env.example .env
nano .env
```

| Variable | What to put |
|---|---|
| `DOMAIN` | Your domain, e.g. `bks.example.com` (no `https://`) |
| `POSTGRES_PASSWORD` | `openssl rand -base64 32` |
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` **and store it safely**, see [§2](#2-how-the-database-works) |
| `WA_GATEWAY_SECRET` | `openssl rand -base64 32` |
| `CRON_SECRET` | `openssl rand -base64 32` |
| `ANTHROPIC_API_KEY` | Optional now; can be set later in Admin → Settings |

Quick way to generate all secrets at once:

```sh
for k in POSTGRES_PASSWORD APP_ENCRYPTION_KEY WA_GATEWAY_SECRET CRON_SECRET; do
  sed -i "s|^$k=.*|$k=$(openssl rand -base64 32 | tr -d '/+=')|" .env
done
```

### 3.5 Start

```sh
docker compose up -d --build
docker compose ps                     # all services "Up", web "healthy" after ~30 s
docker compose logs -f web            # "Migrations applied." then "Ready"
```

Open `https://bks.example.com`. Caddy fetches the certificate on the first request (a few seconds).

### 3.6 Create your administrator

```sh
docker compose exec web npm run admin:create -- you@yourdomain.com "Your Name"
```

It prints a generated password (or set `ADMIN_PASSWORD=...` in front of the command to choose one).
Sign in at `https://bks.example.com/login`; you land in `/admin`. Change the password from
Admin → Users → you → Reset password.

> Don't run `npm run db:seed` in production: it creates demo businesses and demo accounts.

---

## 4. First-run configuration (in the admin)

All of this is done in the browser; changes apply within seconds, no redeploy.

1. **Admin → Settings → General**
   - *Public URL*: `https://bks.example.com` (already bootstrapped from `DOMAIN`; check it).
   - *Business sign-ups open*: on to let businesses register themselves, off for invite-only.
   - *New businesses can publish themselves*: off if you want to approve listings first.
2. **Admin → Settings → AI agents**
   - Paste the *Anthropic API key* (from console.anthropic.com). Without it agents run in a basic offline
     mode.
   - Choose the *default model* and *effort*. Every agent follows this default.
3. **Admin → Plans & pricing**: set names, prices, currency, trial length, features and limits
   (AI conversations per month, team size, WhatsApp/Telegram, VIP community, featured listing).
4. **Admin → Settings → Billing** (when you're ready to charge):
   - In Stripe, create one recurring **Price** per paid plan and paste its id (`price_…`) on each plan.
   - Paste the Stripe *secret key*.
   - In Stripe → Developers → Webhooks, add `https://bks.example.com/api/webhooks/stripe` with events
     `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, and
     paste the *signing secret* in Settings.
   - Without Stripe, plan changes apply immediately for free (useful for testing and comped accounts).
5. **Admin → Telegram bot**
   - In Telegram, talk to [@BotFather](https://t.me/BotFather): `/newbot`, choose a name and username.
   - Paste the token. BKS checks it, generates a webhook secret and registers
     `https://bks.example.com/api/webhooks/telegram` automatically.
   - Set the bot's name, short description and description from the same page.
   - Businesses then turn Telegram on from their Channels page and share their link
     `https://t.me/<your_bot>?start=<their-slug>`.
6. **Admin → WhatsApp**: nothing to configure. Each business links its own WhatsApp Business app from
   *Channels* (QR code on desktop, pairing code in the mobile app). This page lists the linked numbers
   with restart/unlink, and the platform switch.
   - WhatsApp linking uses an unofficial client (Baileys). WhatsApp may restrict numbers that behave like
     bots: keep it conversational, avoid bulk or unsolicited sending, and consider turning off
     *Settings → Reminders → Send reminders on WhatsApp*.
7. **Admin → Team & access**: give your colleagues roles (Administrator, Operator, Support, Finance,
   Moderator). They need an account first (Admin → Users → New user).
8. **Admin → System status**: every row should be OK.

---

## 5. Updating, migrations and rollback

```sh
cd bks
git pull
cd deploy
docker compose up -d --build        # rebuilds web + gateway; migrations run on web start
docker compose logs -f web
```

- Downtime is a few seconds while `web` restarts. The WhatsApp gateway reconnects every session by itself
  (customer messages that arrive during the restart are delivered after reconnecting; replies to messages
  older than the *stale window* in Admin → WhatsApp are skipped on purpose).
- Migrations only move forward. Before an update that includes new files in `apps/web/drizzle/`,
  **take a backup** ([§6](#6-backups-and-restore)).
- Rollback: `git checkout <previous-tag-or-commit>` then `docker compose up -d --build`. If the newer
  version had already applied a migration the old code can't handle, restore the backup taken before
  the update.
- Tip: tag releases (`git tag v1.2.0 && git push --tags`) so rollbacks are one command.

---

## 6. Backups and restore

**What to back up:** the Postgres database **and** `APP_ENCRYPTION_KEY` (in your password manager).
Caddy's certificates (`caddy_data` volume) are re-issued automatically if lost.

Nightly dump, kept 14 days (run `crontab -e` on the server as a user that can use Docker):

```cron
30 3 * * * cd /root/bks/deploy && docker compose exec -T db pg_dump -U bks -Fc bks > /root/backups/bks-$(date +\%F).dump && find /root/backups -name 'bks-*.dump' -mtime +14 -delete
```

Copy `/root/backups` off the server (e.g. `rclone` to S3/B2, or your provider's volume snapshots).

**Restore:**

```sh
cd bks/deploy
docker compose stop web wa-gateway cron
docker compose exec -T db dropdb -U bks bks
docker compose exec -T db createdb -U bks bks
docker compose exec -T db pg_restore -U bks -d bks < /root/backups/bks-2026-11-07.dump
docker compose up -d
```

**Moving to a managed Postgres later:** dump as above, `pg_restore` into the new database, then point
`DATABASE_URL` at it (edit the compose file's `DATABASE_URL` lines and remove the `db` service).

---

## 7. Alternative: managed platforms

The [One click on Vercel](#one-click-on-vercel) setup is the managed option: Vercel (web), Neon (database),
Render (WhatsApp gateway). Other combinations work the same way: any Next.js host for `apps/web`, any
Postgres 15+, and any always-on container host for `apps/wa-gateway` (Railway, Fly.io, a small VM). The
web app needs `DATABASE_URL`, `APP_ENCRYPTION_KEY` and `CRON_SECRET`; it runs `npm run vercel-build`
(migrations + first admin) or `npm run db:migrate && npm run build`. Call
`/api/cron/reminders` every 10–15 minutes (or `/api/cron/reminders/daily` once a day) with
`Authorization: Bearer $CRON_SECRET`.

---

## 8. Mobile app (iOS / Android)

The owner app lives in `apps/mobile` (Expo). It talks to `https://your-domain/api/v1`.

```sh
cd apps/mobile
npm install
npm install -g eas-cli          # or use npx eas-cli@latest
eas login
eas init                        # creates the EAS project and writes its id into app.json (enables push)
```

Point the app at production. In `eas.json` (created by `eas build:configure`) add to each profile:

```json
"env": { "EXPO_PUBLIC_API_URL": "https://bks.example.com" }
```

Then:

```sh
eas build --platform ios --profile production        # needs an Apple Developer account
eas build --platform android --profile production    # needs a Google Play Console account
eas submit --platform ios
eas submit --platform android
```

- Change the bundle identifier / package (`app.json` → `ios.bundleIdentifier`, `android.package`) to one
  you own before the first store build.
- Push notifications work once `eas init` has run and the build is installed on a real device. iOS needs
  push credentials, which `eas build` offers to create for you.
- For internal testing first: `eas build --profile preview` produces an installable build (TestFlight /
  APK) without store review.

---

## 9. Security checklist

- [ ] All four secrets in `deploy/.env` are long random values; `.env` is never committed (it's ignored).
- [ ] `APP_ENCRYPTION_KEY` is stored outside the server (password manager).
- [ ] Only ports 22, 80 and 443 are open. Postgres and the gateway are not published (the compose file
      doesn't publish them).
- [ ] SSH with keys only; automatic security updates on (`unattended-upgrades` on Ubuntu/Debian).
- [ ] Nightly backups copied off the server, and a restore tested once.
- [ ] Your admin password changed after `admin:create`; colleagues get the narrowest role that works.
- [ ] Stripe webhook signing secret set (otherwise Stripe events are rejected).
- [ ] Review Admin → Audit log periodically (admin actions, "sign in as", plan changes).

---

## 10. Scaling

- **Web**: stateless. Run more copies behind the proxy (`docker compose up -d --scale web=3` with Caddy
  load-balancing, or a managed platform). Rate limiting and the live-updates stream are per process; move
  them to Redis/Postgres LISTEN-NOTIFY if you scale out a lot.
- **Gateway**: one process handles many hundreds of WhatsApp sessions. Beyond that, shard by business
  (run several gateways, each owning a range of business ids) — the web app would then route by business.
- **Database**: the hot queries are indexed by `business_id` + time. Move to a managed Postgres with
  backups/point-in-time recovery as you grow.
- **AI cost**: choose the default model in Admin → Settings → AI, and cap usage per plan with
  "AI conversations / month".

---

## 11. Troubleshooting

| Symptom | Check |
|---|---|
| Browser can't reach the site / certificate error | DNS points at the server (`dig +short bks.example.com`), ports 80/443 open, `docker compose logs caddy`. |
| `web` keeps restarting | `docker compose logs web`. A missing env var or a migration error is printed there. |
| "DATABASE_URL is required" | The `web` service didn't get `DATABASE_URL`: check `deploy/.env` (`POSTGRES_PASSWORD`). |
| Agents answer with basic canned replies | No Anthropic key: Admin → Settings → AI agents. Admin → System status shows "Offline mode". |
| Telegram bot doesn't answer | Admin → Telegram bot: webhook "Registered", no "Last error". Public URL must be https. Press *Register webhook* again. |
| WhatsApp shows "Linking…" forever | Admin → WhatsApp → gateway "Online"? `docker compose logs wa-gateway`. QR codes expire after ~20 s; the page refreshes them. |
| WhatsApp disconnected by itself | The business unlinked the device from their phone, or WhatsApp logged it out. They link again from Channels. |
| Reminders not sent | `docker compose logs cron` should print `{"due":…,"sent":…}` every 10 min; Admin → Settings → Reminders enabled. |
| Stripe payments don't change the plan | Stripe webhook URL and signing secret; event delivery log in the Stripe dashboard. |

---

### Local development

```sh
docker compose up -d                      # repo root: Postgres on 127.0.0.1:5436
cd apps/web && cp .env.example .env.local && npm install && npm run db:seed && npm run dev
cd apps/wa-gateway && cp .env.example .env && npm install && npm start
cd apps/mobile && npm install && npx expo start
```

Demo accounts (password `demo-password`): `admin@bks.example`, `owner@atelier.example`,
`owner@ironhouse.example`, `owner@lumen.example`.
