# WebRTC Screen Share Demo

基于 WebRTC + WebCodecs 的实时屏幕共享应用。

## 功能特点

- 实时屏幕共享（支持音频）
- 多种编码器支持：H.264、HEVC (H.265)、VP8、VP9、AV1
- 可配置分辨率：720p / 1080p / 1440p / 原始
- 可配置帧率：15 / 30 / 60 fps
- 可配置码率
- 设置自动保存（localStorage）
- 支持多观众同时观看
- 全屏播放
- 实时统计信息（分辨率、帧率、码率、解码器）

## 技术栈

**客户端**
- Vue 3 + TypeScript
- Vite
- TailwindCSS
- Socket.io-client
- WebCodecs API
- WebRTC DataChannel

**服务端**
- Node.js
- Socket.io

## 项目结构

```
demo/
├── client/                     # 前端应用
│   ├── src/
│   │   ├── App.vue            # 主应用
│   │   ├── components/
│   │   │   ├── VideoPlayer.vue    # 视频播放器
│   │   │   ├── SettingsPanel.vue  # 编码设置
│   │   │   └── RoomPanel.vue      # 房间管理
│   │   ├── composables/
│   │   │   ├── useSignaling.ts    # 信令通信
│   │   │   ├── useWebRTC.ts       # WebRTC 连接
│   │   │   ├── useWebCodecs.ts    # 视频编解码
│   │   │   └── useScreenCapture.ts # 屏幕捕获
│   │   ├── utils/
│   │   │   ├── logger.ts          # 日志工具
│   │   │   └── storage.ts         # 设置持久化
│   │   └── types/
│   │       └── index.ts           # 类型定义
│   └── package.json
│
└── server/                     # 信令服务器
    ├── src/
    │   └── index.ts
    └── package.json
```

## 快速开始

### 1. 安装依赖

```bash
# 安装服务端依赖
cd server
npm install

# 安装客户端依赖
cd ../client
npm install
```

### 2. 启动服务

```bash
# 启动信令服务器（端口 3000）
cd server
npm run dev

# 启动客户端（新终端）
cd client
npm run dev
```

### 3. 使用

1. 打开浏览器访问 `http://localhost:5173`
2. 输入房间号，选择角色（主持人/观众）加入房间
3. 主持人点击「开始共享」选择要共享的屏幕
4. 观众点击「请求观看」接收画面

## 数据流

```
主持人端:
屏幕捕获 → MediaStreamTrackProcessor → VideoEncoder → DataChannel

观众端:
DataChannel → VideoDecoder → VideoFrame → Canvas 渲染
```

## 配置说明

编码设置会自动保存到浏览器 localStorage，刷新页面后自动恢复。

| 参数 | 选项 | 说明 |
|------|------|------|
| 编码器 | H.264 / HEVC / VP8 / VP9 / AV1 | 视频编码格式 |
| 分辨率 | 720p / 1080p / 1440p / 原始 | 输出分辨率 |
| 帧率 | 15 / 30 / 60 fps | 每秒帧数 |
| 码率 | 1-20 Mbps | 视频码率 |

## 开发说明

- 开发环境显示所有日志
- 生产环境只保留 error 级别日志
- 使用 `npm run build` 构建生产版本

## 生产部署

### 方式一：传统部署

#### 1. 构建客户端

```bash
cd client
npm run build
```

构建产物在 `client/dist/` 目录。

#### 2. 构建服务端

```bash
cd server
npm run build
```

构建产物在 `server/dist/` 目录。

#### 3. 配置信令服务器地址

修改客户端信令服务器地址（构建前修改）：

```typescript
// client/src/composables/useSignaling.ts
const SIGNALING_SERVER = 'https://your-server.com'  // 改为你的服务器地址
```

#### 4. 部署

**Nginx 配置示例**（客户端静态文件）：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 客户端静态文件
    location / {
        root /var/www/screen-share/client/dist;
        try_files $uri $uri/ /index.html;
    }

    # 信令服务器代理（可选，如果在同一台服务器）
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

**启动信令服务器**：

```bash
cd server
node dist/index.js
# 或使用 PM2
pm2 start dist/index.js --name screen-share-server
```

### 方式二：Docker 部署

#### Dockerfile（服务端）

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --only=production
COPY server/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

#### docker-compose.yml

```yaml
version: '3.8'
services:
  signaling:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    restart: unless-stopped

  client:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./client/dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - signaling
    restart: unless-stopped
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 信令服务器端口 |

### HTTPS 要求

**重要**：生产环境必须使用 HTTPS，因为：
- `getDisplayMedia` API 需要安全上下文
- WebRTC 在非安全环境下可能无法正常工作

使用 Let's Encrypt 获取免费 SSL 证书：

```bash
certbot --nginx -d your-domain.com
```

### TURN 服务器（可选）

如果用户在 NAT 或防火墙后面无法直连，需要配置 TURN 服务器：

```typescript
// client/src/composables/useWebRTC.ts
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:your-turn-server.com:3478',
    username: 'user',
    credential: 'password'
  }
]
```

推荐使用 [coturn](https://github.com/coturn/coturn) 搭建 TURN 服务器。

## 浏览器支持

需要支持以下 API：
- WebCodecs (VideoEncoder/VideoDecoder)
- MediaStreamTrackProcessor
- WebRTC DataChannel
- getDisplayMedia

推荐使用 Chrome 94+ 或 Edge 94+。

## License

MIT
