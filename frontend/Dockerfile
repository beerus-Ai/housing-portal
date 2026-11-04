# syntax=docker/dockerfile:1
# Stage 1: build the React app.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: nginx (unprivileged, non-root, listens on 8080) serving dist/ with SPA fallback and an /api proxy.
FROM nginxinc/nginx-unprivileged:1.27-alpine
# Rendered by the image entrypoint (envsubst) into /etc/nginx/conf.d/default.conf. Only BACKEND_URL is substituted
# (NGINX_ENVSUBST_FILTER), so nginx's own $variables are left alone.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV BACKEND_URL=http://backend:8080 \
    NGINX_ENVSUBST_FILTER=BACKEND_URL
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/nginx-health || exit 1
