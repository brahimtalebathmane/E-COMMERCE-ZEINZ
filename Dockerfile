# Railway / Docker: avoids Nixpacks mounting a cache on node_modules/.cache, which breaks `npm ci` (EBUSY).
# Node 22.13+ matches eslint-visitor-keys engine range.
FROM node:22.13-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .

RUN npm run build

RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "start"]
