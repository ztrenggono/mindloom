# Node 24 runs the TypeScript sources directly, so there is no build step.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

USER node
EXPOSE 8787
CMD ["node", "src/index.ts"]
