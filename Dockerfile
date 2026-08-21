FROM node:20-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

EXPOSE 3000
# Types are stripped at runtime by tsx; type checking happens in CI (npm run typecheck).
CMD ["npm", "start"]
