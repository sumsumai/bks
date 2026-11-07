# BKS Business (owner mobile app)

Expo / React Native app for business owners and their team: today's schedule, calendar, customer inbox,
the NanoClaw assistant (approvals, permissions, voice, knowledge) and business settings. It talks to the
same `/api/v1` as the web workspace (`apps/web`).

## Stack

- Expo SDK 58, React Native 0.88, TypeScript, Expo Router (routes in `src/app/`)
- `expo-secure-store` for the session token, `expo-notifications` for push (Expo push service)
- No UI kit: components in `src/components/ui.tsx`, light/dark theme in `src/lib/theme.ts`

## Setup

```sh
cd apps/mobile
npm install
cp .env.example .env        # set EXPO_PUBLIC_API_URL
npx expo start              # scan the QR code with Expo Go (iOS / Android)
```

The web app must be running (`cd apps/web && npm run dev`, port 3200). On a physical device set
`EXPO_PUBLIC_API_URL` to your machine's LAN address (e.g. `http://192.168.1.20:3200`); `localhost`
only works in the iOS simulator. Sign in with an owner, manager or staff account of a business.

Checks:

```sh
npm run typecheck           # tsc --noEmit
npx expo-doctor             # dependency / config sanity
```

## Push notifications

The app registers an Expo push token with `POST /api/v1/me/push-tokens` after sign-in. This needs a
physical device and an EAS project id: run `npx eas-cli@latest init` once (it writes
`extra.eas.projectId` into `app.json`). Without it, registration is skipped silently and the app falls
back to polling `/api/v1/notifications` every 20 s while open (tab badges for approvals and
escalations). Tapping a push opens the matching booking, conversation or approvals screen.

Expo Go has limited push support on Android; use a development build
(`npx eas-cli@latest build --profile development`) to test push end to end.

## Structure

```
src/app/                 routes (Expo Router)
  _layout.tsx            session gate (login / no business / app), push tap navigation
  login.tsx
  (tabs)/                Today · Calendar · Inbox · Assistant · More
  booking/[id].tsx       booking detail: confirm, complete, no-show, cancel, reschedule
  booking/new.tsx        create a booking (slot picker or manual time override)
  conversation/[id].tsx  thread with customer/agent/team bubbles, take over / hand back, reply
  approvals.tsx          pending and decided agent actions
  assistant/             voice & instructions, permissions, knowledge, activity log
  settings/              business info, booking policies, services, team hours
  notifications.tsx, switch-business.tsx, no-business.tsx
src/lib/
  api.ts                 typed fetch client (Bearer token + X-Business-Id, problem+json errors)
  session.tsx            auth, selected business, unread counts polling
  hooks.ts               useApi (focus refresh, pull-to-refresh), useMutation
  format.ts              timezone-aware dates and currency (Intl)
  push.ts, links.ts, theme.ts, types.ts, config.ts
src/components/          ui primitives, booking/approval components, slot picker
```

## Roles

Owners see everything. Managers can't edit business info or policies. Staff see the schedule, inbox and
assistant status but not approvals, permissions or catalog settings (the API enforces the same rules).

## Building for the stores

`npx eas-cli@latest build --platform ios|android` with bundle id / package `app.bks.business`
(change in `app.json` before the first store build).
