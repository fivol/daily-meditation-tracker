FROM node:22-alpine
WORKDIR /app
ENV TZ=Europe/Moscow
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npx", "tsx", "src/index.ts"]
