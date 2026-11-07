# BKS web app (marketplace, workspace, admin, API). Runs migrations on start.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time placeholder: no connection is opened during the build.
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app ./
USER node
EXPOSE 3000
# Apply pending database migrations, then serve.
CMD ["sh", "-c", "npm run db:migrate && npm start"]
