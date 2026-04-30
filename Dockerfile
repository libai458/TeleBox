# 换成标准版镜像，基础工具更全
FROM node:24-bookworm

WORKDIR /app

# 安装 canvas 模块必需的系统级编译依赖和图像引擎
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

# 安装项目依赖
RUN npm install

COPY . .

CMD ["npm", "start"]