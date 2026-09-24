FROM node:24-alpine

WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node . .
RUN mkdir -p /data /workspace && chown node:node /data /workspace

ENV NODE_ENV=production \
    AGAS_HOST=0.0.0.0 \
    AGAS_PORT=4310 \
    AGAS_DB_PATH=/data/agas.db \
    AGAS_WORKSPACE_ROOT=/workspace \
    AGAS_RUNTIME_EXECUTION=simulator

USER node
EXPOSE 4310
VOLUME ["/data", "/workspace"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:4310/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/control-plane/src/server.js"]
