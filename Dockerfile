FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Só as dependências de produção, instaladas exatamente como no package-lock
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Não roda como root
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
