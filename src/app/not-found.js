import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mf-notfound">
      <b>404</b>
      <h1>这个页面走丢了</h1>
      <p>你访问的地址不存在或已下线。回到首页继续你的形象改造。</p>
      <Link href="/">返回首页</Link>
    </main>
  );
}
