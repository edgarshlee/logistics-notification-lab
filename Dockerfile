FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY web ./web
RUN npm run build && cp web/index.html web/style.css dist/public/
CMD ["node","dist/api.js"]
