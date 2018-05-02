FROM node:alpine

WORKDIR /app

COPY package.json /app
COPY yarn.lock /app

RUN ["yarn"]

COPY . /app

EXPOSE 5000
ENV MONGODB mongodb://localhost/tribes

CMD ["yarn", "start"]
