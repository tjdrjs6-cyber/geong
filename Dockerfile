FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN mkdir -p public/assets && cp -R assets/. public/assets/ && npx vite build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund
COPY server/*.mjs ./server/
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "server/index.mjs"]
