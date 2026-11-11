# 织思 WeaveMind

离线优先的本地思维导图工作台。零运行时依赖，原生 ES Modules + Canvas 实现，支持导图 / 大纲 / 演说 / 甘特四视图、多画布、主题样式、标记、筛选、剪贴板、浮动主题、外框 / 联系 / 概要 / 专区，以及 `.wvm`、XMind、Markdown、OPML、SVG、PNG 等格式。

## 一键部署到 EdgeOne

[![使用 EdgeOne Makers 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/makers/new?repository-url=https://github.com/iCxin/weavemind)

仓库内置 [`edgeone.json`](./edgeone.json)，EdgeOne Makers 会自动使用：

- 构建命令：`node --experimental-strip-types tools/build-static.mjs`
- 输出目录：`dist`
- Node 版本：22

首次部署时登录腾讯云并授权 GitHub 即可。项目与 Git 仓库关联后，推送到 `main` 分支会自动触发重新部署。

## 本地开发

```bash
npm run dev        # http://127.0.0.1:5173
npm test           # Node 原生测试
npm run build      # 生成 dist/ 静态产物
```

`npm run dev` 使用 `tools/dev-server.mjs` 实时剥离 TypeScript 类型；生产构建会把 `apps/`、`packages/` 下的 `.ts` 转成 `.js` 并复制 `index.html`、样式与图标到 `dist/`。

## 自动上传 GitHub

```bash
npm run push:github -- "feat: 更新说明"
```

该脚本通过 GitHub Git Data API 上传当前工作区，适合本机无法直连 `github.com:443` 但可访问 `api.github.com` 的网络环境。凭据从 `git credential fill` 读取，也支持 `GH_TOKEN` 环境变量。

## 目录

- `apps/web`：主应用、视图、UI、存储与导入导出
- `packages/core`：文档模型、撤销、查询、富文本
- `packages/layout`：布局引擎与文本换行
- `packages/render`：Canvas 渲染与 SVG 导出
- `packages/io`：`.wvm`、XMind、Markdown、OPML 编解码
- `tools`：开发服务器、静态构建、基准与审计脚本
