FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
# SheetJS 0.20.x é distribuída pela CDN oficial (não pelo npm); o pacote fica versionado em vendor/
COPY vendor ./vendor
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3456
EXPOSE 3456

CMD ["node", "server/index.js"]
