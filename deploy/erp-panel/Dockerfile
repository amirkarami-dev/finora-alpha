# Serves the pre-built Vite SPA via nginx. Static only — the API is its own service.
#
# Build context is the REPO ROOT, so this can reach into apps/. The previous version copied
# a bare `dist/` while compose set `build: .` from deploy/, which never actually resolved.
# Build the SPA first:  npm run build -w @finora/erp-panel
FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/erp-panel/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/erp-panel/dist/ /usr/share/nginx/html/
EXPOSE 80
