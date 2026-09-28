// 对外传播链接的域名选择：默认主域名；主域名被微信拦截时，把 QR_POSTER_BASE_URL
// 指向备用线（如 pages.dev 镜像），两张海报的二维码即可整体切换，无需改代码。
const FALLBACK = "https://face.shuqizhisou.cc";

export function publicLineUrl(pathname) {
  const base = (process.env.QR_POSTER_BASE_URL || FALLBACK).replace(/\/+$/, "");
  return `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
