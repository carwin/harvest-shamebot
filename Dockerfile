FROM node:14.16.0
ENV NODE_ENV=production
WORKDIR /app

COPY ["package.json", "package-lock.json", "tsconfig.json", "./"]

RUN npm install -g typescript
RUN npm install

COPY . .

RUN npm run build

CMD ["node", "dist/main.js"]
