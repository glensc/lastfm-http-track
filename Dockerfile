FROM node:24-alpine AS base
WORKDIR /app

COPY package.json ./
COPY src ./src

FROM base AS validate
COPY test ./test
RUN npm test

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000
EXPOSE $PORT
CMD ["npm", "start"]

COPY --from=base /app ./
USER node
