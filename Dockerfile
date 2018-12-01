FROM node:8-alpine AS build
WORKDIR /app

COPY package.json yarn.lock /app/
RUN yarn install

COPY tsconfig.json /app/
COPY src /app/src
COPY scripts /app/scripts
COPY data /app/data
RUN yarn build


FROM node:8-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 5000
HEALTHCHECK --interval=5s --timeout=1s CMD curl -sSf "http://localhost:5000/status.json" || exit 1 
RUN apk add --no-cache curl

COPY package.json yarn.lock /app/
RUN yarn install
RUN yarn cache clean

COPY --from=build /app/dist/src /app/dist
COPY --from=build /app/dist/scripts /app/scripts
COPY static /app/static
COPY views /app/views
COPY public /app/public
COPY data /app/data

USER node
CMD ["node", "dist/index.js"]
