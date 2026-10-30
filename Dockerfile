# syntax=docker/dockerfile:1
FROM node:22-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma/schema.prisma ./prisma/schema.prisma

RUN --mount=type=cache,target=/root/.npm \
    mkdir -p extensions \
 && if [ -f package-lock.json ]; then npm ci --ignore-scripts; else npm install --ignore-scripts; fi \
 && npx prisma generate

COPY . .

RUN npm run build \
 && chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=11004

EXPOSE 11004

CMD ["./docker-entrypoint.sh"]
