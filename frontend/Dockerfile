FROM nginx:alpine

# Tạo thư mục static để chứa các file tĩnh khớp với cấu trúc URL /static/
RUN mkdir -p /usr/share/nginx/html/static

# Copy index.html vào root html
COPY index.html /usr/share/nginx/html/

# Copy các file tĩnh (style.css, app.js, xlsx.full.min.js, chart.umd.min.js, dinhvi) vào thư mục static và root html
COPY style.css app.js xlsx.full.min.js chart.umd.min.js /usr/share/nginx/html/static/
COPY style.css app.js xlsx.full.min.js chart.umd.min.js /usr/share/nginx/html/
COPY dinhvi /usr/share/nginx/html/static/dinhvi
COPY dinhvi /usr/share/nginx/html/dinhvi

# Copy cấu hình Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
