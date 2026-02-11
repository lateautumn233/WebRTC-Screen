# WebRTC Screen Share

基于 **WebRTC DataChannel + WebCodecs** 的实时屏幕共享应用，支持经典模式（单人共享）和会议模式（多人共享）。

## 功能特点

### 屏幕共享
- 两种模式：**经典模式**（一对多）和 **会议模式**（多对多）
- 实时屏幕捕获，支持系统音频同步传输
- 双全屏模式：网页全屏（保留地址栏）+ 浏览器全屏
- 中途加入观看：新观众加入后自动请求关键帧，即时开始显示画面

### 编码与传输
- 多编解码器支持：**H.264**、**HEVC (H.265)**、**VP8**、**VP9**、**AV1**（运行时自动检测可用编解码器）
- CBR / VBR 码率模式切换
- 可配置分辨率：720p / 1080p / 1440p / 原始
- 可配置帧率：15 / 30 / 60 fps
- 可配置码率：1 ~ 20 Mbps
- 编码器队列背压控制（高负载时自动跳帧，避免延迟累积）
- 屏幕捕获端帧率限制，降低 CPU 占用

### 监控与统计
- 实时统计面板：分辨率、编解码器、帧率、码率
- 编码延迟、解码延迟、网络延迟（RTT/2）实时监测
- 基于 EMA 平滑的延迟指标展示

### 用户体验
- 编码设置自动保存到 localStorage，刷新页面自动恢复
- 用户名和房间历史记录持久化
- 会话恢复支持
- 分环境日志：开发环境显示全部日志，生产环境仅保留 error 级别

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | Vue 3（Composition API + `<script setup>`）、TypeScript、Vue Router 5 |
| 构建工具 | Vite 7 |
| 样式 | Tailwind CSS 4 |
| 信令 | Socket.IO 4 |
| 视频编解码 | WebCodecs API（VideoEncoder / VideoDecoder） |
| 帧传输 | WebRTC DataChannel（16KB 分块传输） |
| NAT 穿透 | STUN（Google）+ 可选 TURN |
| 服务端 | Node.js + Socket.IO、tsx（开发）、tsc（构建） |

## 项目结构

```
webrtc-share/
├── client/                              # 前端应用 (Vue 3 SPA)
│   └── src/
│       ├── views/                       # 页面路由
│       │   ├── HomePage.vue             # 首页 - 模式选择
│       │   ├── ClassicMode.vue          # 经典模式 - 单人共享 + 多人观看
│       │   └── ConferenceMode.vue       # 会议模式 - 多人同时共享
│       ├── components/                  # 可复用组件
│       │   ├── RoomPanel.vue            # 经典模式房间面板
│       │   ├── ConferenceRoomPanel.vue  # 会议模式房间面板
│       │   ├── SettingsPanel.vue        # 编码设置面板
│       │   ├── VideoPlayer.vue          # 经典模式视频播放器（含统计覆盖层）
│       │   └── VideoGrid.vue            # 会议模式多路视频网格（含统计覆盖层）
│       ├── composables/                 # 核心逻辑 (Composition API)
│       │   ├── useSignaling.ts          # 经典模式信令通信
│       │   ├── useConferenceSignaling.ts# 会议模式信令与房间管理
│       │   ├── useWebRTC.ts             # WebRTC PeerConnection、DataChannel、ICE
│       │   ├── useWebCodecs.ts          # 经典模式视频编解码
│       │   ├── useConferenceWebCodecs.ts# 会议模式多路编解码管理
│       │   └── useScreenCapture.ts      # getDisplayMedia 屏幕捕获封装
│       ├── types/
│       │   └── index.ts                 # TypeScript 类型定义与常量
│       ├── utils/
│       │   ├── logger.ts                # 分环境日志工具
│       │   └── storage.ts              # localStorage 持久化工具
│       └── router/
│           └── index.ts                 # Vue Router（Hash 模式）
│
├── server/                              # 信令服务器
│   └── src/
│       └── index.ts                     # Socket.IO 信令服务（内存房间管理）
│
└── package.json                         # Monorepo 根配置（concurrently）
```

## 数据流

```
共享端:
  屏幕捕获 (getDisplayMedia)
    → MediaStreamTrackProcessor（逐帧读取 VideoFrame）
    → VideoEncoder（编码为 EncodedVideoChunk）
    → 序列化 + 16KB 分块
    → WebRTC DataChannel 发送

观看端:
  WebRTC DataChannel 接收
    → 分块重组（校验完整性）
    → 反序列化为 EncodedVideoChunk
    → VideoDecoder 解码
    → VideoFrame → Canvas 2D 渲染
```

## 信令协议

### 经典模式

```
客户端                          服务端                          客户端
(主持人)                                                       (观众)
  │                                                              │
  ├── join-room (host) ──────────►│                              │
  │                               ├── room-state ──────────────►│
  │                               │◄──────────── join-room (viewer)
  │◄────────── room-state ────────┤                              │
  │                               │◄──────────── request-stream ─┤
  │◄────── stream-requested ──────┤                              │
  │                               │                              │
  ├── offer ─────────────────────►│── offer ────────────────────►│
  │◄──────────────── answer ──────┤◄──────────────── answer ─────┤
  │◄──── ice-candidate (双向) ────┤──── ice-candidate (双向) ───►│
```

### 会议模式

```
参与者 A                        服务端                        参与者 B
  │                                                              │
  ├── join-room ─────────────────►│◄─────────────── join-room ───┤
  │◄────── conference-state ──────┤──── conference-state ────────►│
  │                               │                              │
  ├── start-sharing ─────────────►│── sharer-started ───────────►│
  │                               │◄──── request-peer-stream ────┤
  │◄──── peer-stream-requested ───┤                              │
  │                               │                              │
  ├── offer ─────────────────────►│── offer ────────────────────►│
  │◄──────────────── answer ──────┤◄──────────────── answer ─────┤
```

## 快速开始

### 环境要求

- **Node.js** >= 18
- **npm** >= 9
- **浏览器**: Chrome 94+ 或 Edge 94+

### 1. 安装依赖

```bash
# 一键安装所有依赖（根目录 + client + server）
npm run install:all
```

### 2. 启动开发服务

```bash
# 同时启动客户端和信令服务器
npm run dev

# 或分别启动
npm run dev:client    # Vite 开发服务器 → http://localhost:5173
npm run dev:server    # 信令服务器 → http://localhost:3000
```

### 3. 使用方式

#### 经典模式（一对多）
1. 打开浏览器访问 `http://localhost:5173`
2. 选择「经典模式」
3. 输入用户名和房间号，选择「创建房间」（主持人）或「加入房间」（观众）
4. 主持人点击「开始共享」选择要共享的屏幕
5. 观众点击「请求观看」接收画面

#### 会议模式（多对多）
1. 选择「会议模式」
2. 输入用户名和房间号，加入房间
3. 任何参与者都可以点击「开始共享」共享自己的屏幕
4. 其他参与者在参与者列表中点击「观看」接收对应画面
5. 支持同时观看多路屏幕共享

## 编码配置

编码设置自动保存到浏览器 localStorage，刷新页面后自动恢复。

| 参数 | 选项 | 说明 |
|------|------|------|
| 编码器 | H.264 / HEVC / VP8 / VP9 / AV1 | 视频编码格式（不支持的编码器会自动置灰） |
| 分辨率 | 720p / 1080p / 1440p / 原始 | 编码输出分辨率 |
| 帧率 | 15 / 30 / 60 fps | 每秒编码帧数（捕获端同步限制） |
| 码率模式 | CBR / VBR | 恒定码率 / 可变码率 |
| 码率 | 1 ~ 20 Mbps | 目标视频码率 |

### 编解码器参数

| 编码器 | Codec String | Profile |
|--------|-------------|---------|
| H.264 | `avc1.640028` | High Profile Level 4.0 |
| HEVC | `hvc1.1.6.L120.90` | Main Profile Level 4.0 |
| VP8 | `vp8` | - |
| VP9 | `vp09.00.10.08` | Profile 0 |
| AV1 | `av01.0.04M.08` | Main Profile |

> **注意**: HEVC 在 Chrome 107+ 上需要系统硬件解码支持（Windows 需安装 HEVC 视频扩展）。

## 生产部署

### 方式一：传统部署

#### 1. 构建

```bash
# 构建客户端（产物 → client/dist/）
npm run build

# 构建服务端（产物 → server/dist/）
cd server && npm run build
```

#### 2. 配置信令服务器地址

```bash
# client/.env.production
VITE_SIGNALING_SERVER=https://your-server.com
```

或在构建时指定：

```bash
VITE_SIGNALING_SERVER=https://your-server.com npm run build
```

#### 3. Nginx 配置示例

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # 客户端静态文件
    location / {
        root /var/www/webrtc-share/client/dist;
        try_files $uri $uri/ /index.html;
    }

    # 信令服务器反向代理
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### 4. 启动信令服务器

```bash
cd server
node dist/index.js

# 或使用 PM2 守护进程
pm2 start dist/index.js --name webrtc-share-server
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
| `PORT` | `3000` | 信令服务器监听端口 |
| `VITE_SIGNALING_SERVER` | `http://localhost:3000` | 客户端连接的信令服务器地址 |
| `VITE_TURN_URL` | - | TURN 服务器地址（如 `turn:your-turn-server.com:3478`） |
| `VITE_TURN_USER` | - | TURN 用户名 |
| `VITE_TURN_PASS` | - | TURN 密码 |

### HTTPS 要求

**生产环境必须使用 HTTPS**：
- `getDisplayMedia` API 需要安全上下文
- WebRTC 在非安全环境下可能无法正常工作

```bash
# 使用 Let's Encrypt 获取免费 SSL 证书
certbot --nginx -d your-domain.com
```

### TURN 服务器

如果用户处于对称 NAT 或严格防火墙后无法直连，需要配置 TURN 服务器。

在 `client/.env` 或 `client/.env.production` 中设置：

```bash
VITE_TURN_URL=turn:your-turn-server.com:3478
VITE_TURN_USER=user
VITE_TURN_PASS=password
```

推荐使用 [coturn](https://github.com/coturn/coturn) 自建 TURN 服务器。

## 浏览器兼容性

| API | 最低版本 |
|-----|---------|
| WebCodecs（VideoEncoder / VideoDecoder） | Chrome 94+ / Edge 94+ |
| MediaStreamTrackProcessor | Chrome 94+ / Edge 94+ |
| WebRTC DataChannel | Chrome 26+ / Edge 79+ |
| getDisplayMedia | Chrome 72+ / Edge 79+ |

> Firefox 和 Safari 目前不支持 WebCodecs API，暂不兼容。

## License

MIT
