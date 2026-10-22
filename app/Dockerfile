# Stage 1: Cài đặt dependency phục vụ môi trường Production
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts

# Stage 2: Môi trường chạy tối giản, an toàn, non-root
FROM node:20-alpine AS runner
WORKDIR /app

# Cài đặt dữ liệu múi giờ Asia/Ho_Chi_Minh
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Ho_Chi_Minh /etc/localtime && \
    echo "Asia/Ho_Chi_Minh" > /etc/timezone

ENV NODE_ENV=production \
    TZ=Asia/Ho_Chi_Minh \
    PORT=3000

# Sao chép các tệp với quyền của người dùng node (non-root)
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node views ./views
COPY --chown=node:node public ./public
COPY --chown=node:node db ./db

# Chạy ứng dụng dưới user không phải root để bảo vệ máy chủ
USER node

EXPOSE 3000

CMD ["node", "src/server.js"]
