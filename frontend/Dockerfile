# ---------- Stage 1: build the React app ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
# --legacy-peer-deps: do not stop on harmless peer-version warnings. (package.json pins vite 5, which fits the React plugin.)
RUN npm install --no-audit --no-fund --legacy-peer-deps
COPY . .
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---------- Stage 2: serve the static files with nginx ----------
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
