FROM node:22-alpine AS base

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY package.json ./
RUN npm install

COPY app ./app
COPY lib ./lib
COPY next.config.mjs tsconfig.json next-env.d.ts ./

RUN npm run build && chown -R app:app /app

USER app

EXPOSE 3000
CMD ["npm", "start"]
