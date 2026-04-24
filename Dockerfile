FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
ENV WEB_DIST_PATH=/app/web/dist

COPY --from=build /app/package*.json ./
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

EXPOSE 3000

CMD ["node", "server/dist/server/src/index.js"]
