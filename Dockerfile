FROM node:22-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN mkdir -p extensions \
  && npm install \
  && npx prisma generate

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=11004

EXPOSE 11004

CMD ["npm", "run", "docker-start"]
