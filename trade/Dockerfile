FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 TRADE_DATA_DIR=/data
WORKDIR /app
COPY --chown=node:node trade/package.json trade/package-lock.json ./trade/
RUN cd trade && npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node trade/server ./trade/server
COPY --chown=node:node trade/*.html trade/*.js trade/*.css trade/*.svg trade/*.webmanifest ./trade/
COPY --chown=node:node style.css ./style.css
COPY --chown=node:node media.js ./media.js
COPY --chown=node:node assets ./assets
COPY --chown=node:node data/catalog.json ./data/catalog.json
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
VOLUME /data
CMD ["node", "trade/server/main.mjs"]

