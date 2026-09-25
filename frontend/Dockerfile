FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS dev
EXPOSE 5173
CMD ["sh", "-c", "npm install --no-audit --no-fund && npm run copy-opencv && npm run dev"]

FROM deps AS build
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Pre-compress once so nginx never gzips the 13 MB opencv.js on the fly.
RUN find /usr/share/nginx/html -type f \( -name '*.js' -o -name '*.css' -o -name '*.svg' -o -name '*.html' -o -name '*.json' \) \
      -size +1k -exec gzip -9 -k {} \;
EXPOSE 80
