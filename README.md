# financial-ai-web

金融研报智能分析 Agent 的浏览器界面。后端在同一个父目录下的 `financial-ai-project`（Spring Boot 4 + PostgreSQL/pgvector）。

- 技术栈：Vue 3 + TypeScript + Vite 8 + Element Plus + Pinia + vue-router（hash 模式）
- 产物直接输出到后端的 `../financial-ai-project/src/main/resources/static`，单端口即可使用（http://localhost:8080）
- 实测产物体积：24 个文件，raw 784.7 KB / gzip 236.8 KB（Element Plus 按需引入）

## 开发

```powershell
# 终端 1：后端
cd ..\financial-ai-project
. .\scripts\load-env.ps1
mvn spring-boot:run

# 终端 2：前端热更新（5173，/api 自动代理到 8080，不需要后端开 CORS）
npm install      # 首次；镜像源写在 .npmrc
npm run dev
```

打开 <http://localhost:5173>。登录页有三个本机种子 token（分析师 / 管理员 / 外租户），点一下即填入。

## 构建（产出到后端 static/）

```powershell
npm run build    # vue-tsc + vite build
```

也可以在后端仓库跑 `scripts/build-ui.ps1`（它会定位本目录、必要时 `npm ci`、并先删掉 `target/classes/static` 里的旧 hash 产物）。

## 测试

```powershell
npx vitest run   # 答案 tokenizer 7 例
npm run lint     # oxlint + eslint
```

## 四页

| 页面 | 路由 | 能做什么 |
|---|---|---|
| 问答 | `#/chat`、`#/chat/{id}` | 提问 / 追问、引用卡片、数值表、诊断面板、作用域三模式、会话改名删除 |
| 文档 | `#/documents` | 上传 PDF（带进度）、看 PENDING/PARSING/DONE/FAILED、2 秒自动刷新 |
| 记忆 | `#/memories` | 写 / 删长期偏好（同 key 升版本）、按类型筛选 |
| 登录 | `#/login` | 粘贴 API token |

## 结构

```
src/api/         fetch 封装（client.ts）、与后端 record 一一对应的类型（types.ts）、XHR 上传（uploads.ts）
src/views/       四个页面
src/components/  会话列表、消息气泡、答案渲染、引用卡、数值表、诊断面板、作用域选择、上下文抽屉
src/stores/      session（身份）、conversation（会话列表）
src/utils/       answer.ts（答案 tokenizer，纯函数，永不产生 HTML）
src/labels.ts    警告码 → 中文、状态与类型文案
```

约定：**答案文本一律按结构渲染，不走 `v-html`** —— answer 逐字包含 PDF 原文，任何 innerHTML 路径都是 XSS 缺口。详见后端仓库 `docs/阶段10-前端报告.md`。