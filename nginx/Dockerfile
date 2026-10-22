FROM nginx:alpine

# Cấu hình thư mục ghi tạm và phân quyền cho người dùng non-root (nginx)
RUN mkdir -p /var/cache/nginx /var/log/nginx /etc/nginx/certs /tmp /var/run && \
    touch /tmp/nginx.pid && \
    chown -R nginx:nginx /var/cache/nginx /var/log/nginx /etc/nginx /tmp /var/run /tmp/nginx.pid

COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Vận hành Nginx dưới tài khoản non-root
USER nginx

EXPOSE 80 443 8082

CMD ["nginx", "-g", "daemon off;"]
