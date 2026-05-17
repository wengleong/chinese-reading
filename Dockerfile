FROM node:22-slim
WORKDIR /app

# Install API dependencies
COPY api/package.json api/package-lock.json ./api/
RUN cd api && npm ci --production

# Copy API source and migrations
COPY api/src/ ./api/src/
COPY api/migrations/ ./api/migrations/

# Copy frontend static files into /app/public/
COPY index.html styles.css manifest.webmanifest sw.js ./public/
COPY src/ ./public/src/
COPY stories/ ./public/stories/
# verify images directory is present (invalidates Docker cache on each build)
RUN ls /app/public/stories/images/ || (echo "ERROR: stories/images missing from build context" && exit 1)
COPY icons/ ./public/icons/

EXPOSE 3001

CMD ["node", "api/src/index.js"]
