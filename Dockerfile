FROM node:22-alpine
WORKDIR /app

# Install API dependencies
COPY api/package.json api/package-lock.json ./api/
RUN cd api && npm ci --production

# Copy API source
COPY api/src/ ./api/src/

# Copy frontend static files into /app/public/
COPY index.html styles.css manifest.webmanifest sw.js ./public/
COPY src/ ./public/src/
COPY stories/ ./public/stories/
COPY icons/ ./public/icons/

EXPOSE 3001

CMD ["node", "api/src/index.js"]
