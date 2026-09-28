#!/usr/bin/env bash
# ============================================================
# 型男制造机 · Ubuntu 22.04 部署脚本（在服务器上以 root 运行）
# 用法：
#   1) 将项目代码上传到服务器 /var/www/face-maker（不含 node_modules/.next）
#   2) 在服务器上配置 /var/www/face-maker/.env（含新建的 QWEN/ARK Key）
#   3) 运行：bash /var/www/face-maker/deploy/deploy.sh
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/face-maker}"
DOMAIN="face.shuqizhisou.cc"
NODE_MAJOR=20

# This script bootstraps a new server and replaces system-level Nginx/PM2
# configuration. It is not the routine release path for an existing service.
if [[ "${BOOTSTRAP_NEW_SERVER:-}" != "yes" ]]; then
  echo "Refusing to run: set BOOTSTRAP_NEW_SERVER=yes only for an explicitly approved new-server installation." >&2
  exit 64
fi
if command -v pm2 >/dev/null 2>&1 && pm2 describe face-maker >/dev/null 2>&1; then
  echo "Refusing to overwrite an existing face-maker PM2 service; use the backed-up release workflow." >&2
  exit 65
fi
if [ -f "${APP_DIR}/.next/BUILD_ID" ]; then
  echo "Refusing to overwrite an existing build at ${APP_DIR}; use the backed-up release workflow." >&2
  exit 65
fi

echo "==> [1/7] 安装基础依赖 (curl git nginx)"
apt-get update -y
apt-get install -y curl git nginx ca-certificates build-essential

echo "==> [2/7] 安装 Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

echo "==> [3/7] 安装依赖并构建"
cd "${APP_DIR}"
if [ ! -f .env ]; then
  echo "!! 未找到 .env，请先创建 ${APP_DIR}/.env（可参考 .env.example）" >&2
  exit 1
fi
npm ci
npx prisma generate
npx prisma migrate deploy
# Keep the HTML document and the client chunks on the same deployment version.
# PM2 inherits this value below, so restarts continue to serve the build that
# was just produced. An explicit value can be supplied by the release system.
if [ -z "${NEXT_DEPLOYMENT_ID:-}" ]; then
  export NEXT_DEPLOYMENT_ID="$(date -u +%Y%m%d%H%M%S)"
fi
echo "Deployment ID: ${NEXT_DEPLOYMENT_ID}"
npm run build

echo "==> [4/7] 配置 PM2"
npm install -g pm2
pm2 delete face-maker >/dev/null 2>&1 || true
pm2 start npm --name face-maker -- start
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

echo "==> [5/7] 配置 Nginx"
NGINX_CONFIG="/etc/nginx/sites-available/face-maker.nginx"
NGINX_ENABLED="/etc/nginx/sites-enabled/face-maker.nginx"
if [ -f "${NGINX_CONFIG}" ] && ! cmp -s "${APP_DIR}/deploy/face-maker.nginx" "${NGINX_CONFIG}"; then
  cp "${NGINX_CONFIG}" "${NGINX_CONFIG}.bak.$(date -u +%Y%m%d%H%M%S)"
fi
install -m 0644 "${APP_DIR}/deploy/face-maker.nginx" "${NGINX_CONFIG}"
ln -sfn "${NGINX_CONFIG}" "${NGINX_ENABLED}"
rm -f /etc/nginx/sites-enabled/face-maker
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> [6/7] 配置 HTTPS (certbot)"
if ! command -v certbot >/dev/null 2>&1; then
  apt-get install -y certbot python3-certbot-nginx
fi
# 幂等：已有证书则续期，否则签发
if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  certbot renew --nginx --quiet || true
else
  certbot --nginx -d "${DOMAIN}" --redirect --agree-tos --register-unsafely-without-email -n || \
  certbot --nginx -d "${DOMAIN}" --redirect -n
fi
systemctl reload nginx

echo "==> [7/7] 自检"
sleep 3
pm2 status | grep -E "face-maker|online" || true
echo "--- localhost:3000 ---"
curl -s -o /dev/null -w "http_code=%{http_code}\n" http://localhost:3000/
echo "--- https://${DOMAIN} ---"
curl -s -o /dev/null -w "http_code=%{http_code}\n" "https://${DOMAIN}/"
ROOT_HEADERS="$(curl -fsSI "https://${DOMAIN}/")"
if ! grep -qi '^cache-control: no-store' <<<"${ROOT_HEADERS}"; then
  echo "!! 首页仍返回可共享缓存头，请清理 CDN/Nginx 缓存后再放量" >&2
  exit 1
fi
ROOT_HTML="$(curl -fsSL "https://${DOMAIN}/")"
if ! grep -q 'data-dpl-id="' <<<"${ROOT_HTML}"; then
  echo "!! 首页未包含 deployment id，版本一致性保护未生效" >&2
  exit 1
fi
echo "首页缓存头与 deployment id 自检通过"

echo ""
echo "部署完成。请继续执行功能测试清单（见 README 或任务说明）。"
