FROM node:20-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

# .git is deliberately NOT copied. Bothost puts the sources into the build
# context without git metadata, and COPY of a missing path is a fatal error --
# `COPY .git ./.git` killed the whole build at this exact step. The admin panel
# resolves the running commit from COMMIT_SHA / GIT_COMMIT / GIT_SHA /
# APP_VERSION instead; see "Какой коммит сейчас работает" in the README.

EXPOSE 3000
# Types are stripped at runtime by tsx; type checking happens in CI (npm run typecheck).
CMD ["npm", "start"]
