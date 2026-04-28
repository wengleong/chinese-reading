FROM nginx:alpine

# Copy static frontend files
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY manifest.webmanifest /usr/share/nginx/html/
COPY sw.js /usr/share/nginx/html/
COPY src/ /usr/share/nginx/html/src/
COPY stories/ /usr/share/nginx/html/stories/
COPY icons/ /usr/share/nginx/html/icons/

# nginx config with $PORT substitution for Railway
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE $PORT

CMD ["nginx", "-g", "daemon off;"]
