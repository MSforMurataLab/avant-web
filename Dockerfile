# Gemini LLM プロキシのみ（server/proxy.mjs）。HTTPS は Railway / Fly.io / Render などが終端します。
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server

ENV NODE_ENV=production
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const p=process.env.PORT||8787;require('http').get({host:'127.0.0.1',port:p,path:'/',timeout:4000},r=>process.exit(r.statusCode===404?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server/proxy.mjs"]
