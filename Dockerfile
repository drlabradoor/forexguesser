FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm install --no-save typescript && npx tsc && npm uninstall typescript
EXPOSE 3000
CMD ["node", "dist/server.js"]
