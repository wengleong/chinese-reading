FROM node:22-slim
WORKDIR /app

# Install API dependencies
COPY api/package.json api/package-lock.json ./api/
RUN cd api && npm ci --production

# Copy API source and migrations
COPY api/src/ ./api/src/
COPY api/migrations/ ./api/migrations/

# Copy frontend static files into /app/public/
COPY index.html styles.css manifest.webmanifest sw.js phone-upload.html mic-check.html ./public/
COPY src/ ./public/src/
COPY stories/ ./public/stories/
COPY compositions/ ./public/compositions/
# Verify asset directories are present (also invalidates Docker cache each build).
# Without this the server's SPA fallback answers every missing asset with
# index.html — a 200 carrying HTML, which looks fine until an image never loads.
RUN ls /app/public/stories/images/ || (echo "ERROR: stories/images missing from build context" && exit 1)
RUN ls /app/public/compositions/images/ || (echo "ERROR: compositions/images missing from build context" && exit 1)
COPY icons/ ./public/icons/

EXPOSE 3001

CMD ["node", "api/src/index.js"]
