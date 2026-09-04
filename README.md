# 只我们（Daykeep）

一个记录个人生活与共同回忆的跨端应用，包含 uni-app 客户端、Node.js 后端和静态官网。

这是个人版独立代码库，不包含原仓库历史、线上数据、专有基础设施配置或生成式功能。

## 本地开发

要求 Node.js 20.19 或更高版本，并准备 PostgreSQL 数据库。

```bash
npm install
npm install --prefix backend
cp .env.example .env.local
cp backend/.env.example backend/.env
npm run dev:backend
npm run dev:h5
```

小程序调试前，在 `.env.local` 中填写个人 API 地址，并在 `manifest.json` 中填写个人微信小程序 AppID。发布配置、域名、对象存储和密钥均由部署环境注入，不提交到仓库。

## 常用命令

```bash
npm run type-check
npm test
npm run build:h5
npm run build:mp-weixin
npm run build --prefix backend
```

## 配置原则

- 仅提交 `.env.example`，不提交真实 `.env` 文件。
- 数据库、微信密钥、对象存储和公网地址均通过环境变量提供。
- `website/site-config.js` 默认为空配置，部署时再填写个人环境信息。
- 仓库不包含特定部署平台的配置文件。

## License

MIT
