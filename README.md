# 织思 WeaveMind

[![Built with Trae](https://img.shields.io/badge/Built%20with-Trae-32F08C?style=flat-square)](https://www.trae.ai/)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6f9f?style=flat-square)](./LICENSE)
[![Deploy with EdgeOne](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/makers/new?repository-url=https://github.com/iCxin/weavemind)

离线优先、零运行时依赖的本地思维导图工作台。使用原生 ES Modules 与 Canvas 实现，所有文档保存在浏览器本地，无需账号、无需联网，也不会上传任何内容。

## 功能

- **四种视图**：导图、大纲、演说、甘特，共享同一份文档，切换不产生副本。
- **十种结构**：思维导图、逻辑图（左右）、组织结构图（上下）、树形图（左右）、鱼骨图（左右）、时间轴。
- **完整主题能力**：多行富文本、自动换行、主题高度调整、六种形状、填充与文字色、粗体 / 斜体 / 下划线 / 删除线、对齐、29 种标记。
- **结构化元素**：外框、联系、概要、专区、浮动主题、图片、附件、语音备注、LaTeX 公式。
- **任务与排期**：待办、进度、优先级、起止日期、逾期提示，并在甘特视图中汇总。
- **组织效率**：多选与框选、整枝拖动、复制 / 剪切 / 粘贴 / 副本、查找替换、筛选、折叠、专注模式、撤销重做（100 步）。
- **多画布**：同一文档内新增、重命名、删除与切换画布，可自定义画布名称颜色。
- **本地存储**：IndexedDB 主存储 + localStorage 备份，自动保存并在下次打开时恢复。
- **互通格式**：`.wvm`（ZIP + MessagePack）、XMind、Markdown、OPML、SVG、PNG、打印 / PDF。
- **演示模式**：16:9 画幅自适应放大，每页以渲染后的思维导图呈现，可打开独立演示窗口并全屏放映。
- **多语言**：简体中文 / English，可随时切换并记住偏好。
- **响应式界面**：桌面双栏、平板抽屉、手机紧凑布局；自定义下拉、右键菜单与对话框，工具栏放不下时自动折叠为 `>>>`。

## 快速开始

要求 Node.js 22 或更高版本（开发服务器使用内置的 TypeScript 类型剥离能力）。

```bash
git clone https://github.com/iCxin/weavemind.git
cd weavemind
npm run dev
```

打开 <http://127.0.0.1:5173>。项目没有第三方运行时依赖，因此无需 `npm install`。

## 构建与部署

```bash
npm run build
```

构建产物输出到 `dist/`，可直接部署到任意静态托管服务。

仓库内置 [`edgeone.json`](./edgeone.json)，在 EdgeOne Makers 中导入本仓库即可一键部署：

- 构建命令：`node --experimental-strip-types tools/build-static.mjs`
- 输出目录：`dist`
- Node 版本：22

也可以使用 GitHub Pages、Cloudflare Pages、Netlify、Vercel 等平台，构建命令与输出目录相同。

## 快捷键

| 操作 | 快捷键 |
| --- | --- |
| 新建 / 打开 / 保存 | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` |
| 撤销 / 重做 | `Ctrl+Z` / `Ctrl+Shift+Z` |
| 子主题 / 同级主题 | `Tab` / `Enter` |
| 编辑选中主题 | `F2` 或空格 |
| 删除主题 | `Delete` / `Backspace` |
| 复制 / 剪切 / 粘贴 / 副本 | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` / `Ctrl+D` |
| 画布缩放 | `Ctrl+=` / `Ctrl+-` |
| 框选 | 空白处拖拽（右 → 左为交叉选择） |
| 平移画布 | 中键拖拽或滚轮 |
| 演说翻页 | `←` / `→` / `Space` |
| 退出专注 / 关闭面板 | `Esc` |

## 项目结构

```text
apps/web          应用主控、四视图、属性面板、导入导出、本地存储与多语言
packages/core     文档模型、不可变更新、历史记录、查询、富文本、LaTeX
packages/layout   十种结构布局、文本度量与换行、自动排斥
packages/render   Canvas 渲染、命中测试、框选、SVG 导出
packages/io       .wvm、XMind、Markdown、OPML 编解码
tools             开发服务器、静态构建、基准与按钮审计脚本
```

## 架构

- **不可变文档模型**：每次编辑生成新版本，结构共享，配合 100 步历史记录实现可靠撤销。
- **分层设计**：`core` 只描述数据，`layout` 计算几何，`render` 负责绘制，`apps/web` 处理交互，层间单向依赖。
- **双 Canvas 渲染**：静态层与交互层分离，按视口剔除，并提供三档细节层级（LOD）。
- **零运行时依赖**：开发时由 Node 剥离 TypeScript 类型，浏览器直接运行原生 ES Modules。
- **本地优先**：没有后端与账号体系，文档仅保存在当前浏览器。

## 数据与隐私

文档保存在浏览器的 IndexedDB 中，并以 localStorage 作为兼容备份。清除站点数据会同时删除已保存的文档，请在需要长期保留时导出 `.wvm` 或 XMind 文件。

## 浏览器支持

最新版本的 Chrome、Edge、Firefox 与 Safari。推荐使用桌面浏览器获得完整体验；移动端提供自适应布局与抽屉式属性面板。

## 参与贡献

欢迎提交 Issue 与 Pull Request。请保持零运行时依赖，并在提交前运行：

```bash
npm test
npm run build
```

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。

## 致谢

- 使用 [Trae](https://www.trae.ai/) 构建。
- 交互与功能设计参考 XMind 的本地工作流。
