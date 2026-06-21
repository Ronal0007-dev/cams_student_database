FROM node:24.13.1

WORKDIR /school-admission

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "app.js"]