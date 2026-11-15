FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000
WORKDIR /app
COPY --chown=node:node trade/package.json trade/package-lock.json ./trade/
RUN cd trade && npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node trade/server ./trade/server
COPY --chown=node:node trade/*.html trade/*.js trade/*.css trade/*.svg trade/*.webmanifest ./trade/
COPY --chown=node:node style.css media.js ./
COPY --chown=node:node assets ./assets
COPY --chown=node:node data/catalog.json ./data/catalog.json
USER node
EXPOSE 10000
CMD ["node","trade/server/sandbox-main.mjs"]
