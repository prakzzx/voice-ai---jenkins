# Frontend image: build the React app, then serve it with Caddy.
# Caddy also gets the HTTPS certificate automatically and forwards
# /api, /webhooks and /health to the backend container.
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# VITE_* values are baked into the JavaScript at build time.
ARG VITE_API_URL
ARG VITE_VAPI_PUBLIC_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_VAPI_PUBLIC_KEY=$VITE_VAPI_PUBLIC_KEY
RUN npm run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
