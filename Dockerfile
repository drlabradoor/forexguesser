FROM node:20-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

# The admin panel reports which commit is running, and it resolves that by
# reading .git directly -- node:20-slim ships without the git binary, so the
# checkout is the only thing left to read. Without this COPY the panel can
# only ever say "unknown".
COPY .git ./.git

EXPOSE 3000
# Types are stripped at runtime by tsx; type checking happens in CI (npm run typecheck).
CMD ["npm", "start"]
