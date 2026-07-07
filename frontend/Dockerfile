# Frontend image for the dev compose stack (#9): the Vite dev server with HMR.
# node_modules is kept in an anonymous volume (see compose.yaml) so the source
# bind-mount for live reload doesn't clobber the container's install.
FROM node:24-slim

WORKDIR /app

# Install deps first (cached until the lockfile changes), source second.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite dev server default port.
EXPOSE 5173

# --host binds 0.0.0.0 so the server is reachable from outside the container.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
