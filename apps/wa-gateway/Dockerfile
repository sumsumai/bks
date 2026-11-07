# BKS WhatsApp gateway: one long-running process holding every business's linked-device session.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
USER node
EXPOSE 3300
CMD ["npx", "tsx", "src/main.ts"]
