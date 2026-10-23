# Backend image. Three stages:
#   base    - install deps + generate the Prisma client
#   test    - runs the unit tests (Jenkins builds this stage; a failure stops the pipeline)
#   runtime - what actually runs in production
FROM node:20-slim AS base
WORKDIR /app
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh

FROM base AS test
ENV NODE_ENV=test
RUN npm test

FROM base AS runtime
ENV NODE_ENV=production
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
