FROM node:8-alpine AS runtime
RUN apk add --no-cache curl

WORKDIR /app
ENV NODE_ENV=production
EXPOSE 5000
HEALTHCHECK --interval=5s --timeout=1s CMD curl -sSf "http://localhost:5000/status.json" || exit 1 

COPY package.json yarn.lock /app/
RUN yarn install --production --pure-lockfile

COPY dist /app/dist
COPY static /app/static
COPY views /app/views
COPY public /app/public

USER node
CMD ["node", "dist/index.js"]
