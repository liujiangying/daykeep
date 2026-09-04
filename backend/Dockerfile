# Daykeep backend image
# 必须在仓库根目录构建（需带上 shared/ + subpackages/shared/ + website/）：
#   docker build -f backend/Dockerfile -t daykeep-backend:latest .
FROM node:20-alpine AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY backend/tsconfig.json ./
COPY backend/src ./src
COPY shared /app/shared
COPY subpackages/shared/dailyQuestionBank.ts /app/subpackages/shared/dailyQuestionBank.ts
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/backend/dist ./dist
# 官网静态页与 API 同域托管（不带 README 等文档进镜像）
COPY website /app/website
RUN rm -f /app/website/README.md /app/website/.env /app/website/.env.* \
  && find /app/website -name '.DS_Store' -delete
EXPOSE 3000 3001
USER node
# tsconfig rootDir=.. → 产物在 dist/backend/src 与 dist/subpackages/shared
CMD ["node", "dist/backend/src/index.js"]
