FROM node:alpine

WORKDIR /usr/src/app
COPY . .

RUN ["yarn"]

EXPOSE 5000
ENV MONGODB mongodb://localhost/tribes

CMD ["yarn", "start"]
