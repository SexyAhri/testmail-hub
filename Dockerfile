FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=development
ENV CI=true

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 4173

CMD ["sh", "/app/docker/entrypoint.sh"]
