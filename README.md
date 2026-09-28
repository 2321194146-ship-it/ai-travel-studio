# 型男制造机

AI 男性形象诊断与展示面创作应用。当前产品包含照片档案、形象诊断、发型与穿搭试用、展示面生成、作品管理、圈子和运营后台。

## 技术栈

- Next.js 16.3.6、React 19
- PostgreSQL、Prisma 7
- NextAuth：手机号密码登录，Google 登录为可选配置
- AI 服务：阿里云百炼与火山方舟；按 `.env.example` 配置所需模型和密钥
- 支付：Stripe 与易支付接口；是否可用取决于服务端配置
- 自托管部署：Node.js 20、PM2、Nginx

## 本地开发

需要 Node.js 20+ 和 PostgreSQL。

```bash
npm ci
cp .env.example .env
# 编辑 .env：至少设置数据库连接和 NextAuth 密钥；按需配置 AI、OAuth 和支付服务
npx prisma generate
npm run dev
```

开发站点默认运行在 `http://localhost:3000`。首次连接全新空数据库时，可应用 Prisma 迁移：

```bash
npx prisma migrate deploy
```

已有数据库可能由早期 `prisma db push` 创建，且没有迁移历史。此类数据库必须先备份、比对当前结构并处理基线，再部署迁移；不要直接对已有业务库执行 `migrate deploy` 或 `db push`。

## 常用检查

```bash
npm run lint -- --quiet
npm run test:report
npm run build
```

`npm run test:report` 运行 `tests/` 下的纯逻辑和接口策略测试。生产构建需要可用的应用配置；日志中不要粘贴数据库连接、API 密钥、Cookie 或支付凭证。

## 数据和文件

- Prisma 数据模型及增量迁移位于 `prisma/`。
- 上传照片与生成结果存放在 `IMAGE_STORAGE_DIR` 指定的私有目录，默认是项目根目录下的 `.data/uploads/`、`.data/outputs/`；生产环境应将其设为站点目录之外的持久化目录。用户图片通过登录与所有权检查后的路由读取，不放在 Next.js 的 `public/` 静态目录中。
- 服务器发布前应备份数据库和当前应用，保留上传目录、生成结果、`.env` 与回滚版本。线上迁移或发布按单独的发布清单执行，不要直接运行未经核对的通用安装脚本。
- `deploy/deploy.sh` 仅用于经批准的新服务器初始化；执行前必须显式设置 `BOOTSTRAP_NEW_SERVER=yes`。检测到已有 PM2 服务或 Next.js 构建时会拒绝覆盖。它会安装系统软件、配置 Nginx/HTTPS 并运行数据库迁移，不是常规更新命令。
- `.env.example` 只放占位值。真实密钥和私有联系资料留在受保护的运行环境配置中。

## 主要目录

- `src/app/`：页面与 API 路由
- `src/components/`：界面组件
- `src/lib/`：认证、AI、存储、支付和业务逻辑
- `prisma/`：数据库模型与迁移
- `deploy/`：Nginx 配置、数据库脚本和服务器部署辅助文件
- `tests/`：逻辑与策略测试
