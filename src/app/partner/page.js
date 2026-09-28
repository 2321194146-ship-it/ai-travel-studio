import Link from "next/link";

// 招代理落地页（专业招商风，移动优先）。
// /pricing 的做法是 Navbar 按 pathname 返回 null；Navbar.js 非本页所有权，
// 故 /partner 由 globals.css 的 body:has(.partner-shell) 规则隐藏同一全局导航壳。
export default function PartnerPage() {
  return (
    <div className="partner-shell">
      <header className="partner-topbar">
        <Link href="/">‹ 返回首页</Link>
        <b>区域合伙人招募</b>
      </header>

      <section className="partner-hero">
        <img src="/partner-poster.jpg" alt="男性情感赛道 AI 写真蓝海项目 · 区域合伙人招募海报（含微信二维码）" />
      </section>

      <main className="partner-main">
        <span className="partner-kicker">AI 展示面合作申请</span>
        <h1 className="partner-title">AI 展示面分站店主</h1>
        <p className="partner-lede">
          面向摄影师、形象顾问、健身教练、穿搭博主和本地工作室的合作申请。平台提供 AI 工具、产品模板、素材和技术支持，合作方自行获客、交付并承担经营结果。
        </p>

        <h2 className="partner-section-head">合作权益</h2>
        <div className="partner-benefits">
          <div className="partner-benefit">
            <b>独立站点 · 自有客源</b>
            <small>专属独立站点，客户注册、下单、复购全部沉淀在你自己的阵地，做的是自己的品牌。</small>
          </div>
          <div className="partner-benefit">
            <b>全套系统 · 总部供货</b>
            <small>AI 生成、订单、售后全部由总部系统托管，总部持续供货，合伙人零技术门槛、零库存。</small>
          </div>
          <div className="partner-benefit">
            <b>素材话术 · 专人陪跑</b>
            <small>总部提供投放级海报素材、成片案例与销售话术包，从开单到复购有专人陪跑。</small>
          </div>
          <div className="partner-benefit">
            <b>合作申请 · 人工审核</b>
            <small>提交合作资料后由人工确认，是否开站、合作周期和交付内容以双方确认的协议为准。</small>
          </div>
        </div>

        <h2 className="partner-section-head">合作模式</h2>
        <div className="partner-modes">
          <div className="partner-mode">
            <b>合作费用 · 人工报价</b>
            <small>费用与结算方式根据合作方案单独说明，申请通过后人工沟通确认；当前为合作申请，不是在线加盟支付。</small>
          </div>
          <div className="partner-mode">
            <b>真实产品 · 自主经营</b>
            <small>合作方可销售 AI 展示面和形象改造服务，收入取决于获客、成交、交付和售后，平台不保证收益。</small>
          </div>
          <div className="partner-mode">
            <b>供货与技术支持</b>
            <small>按确认的产品规则使用平台工具和额度，不设置多级返佣，也不以发展人员作为收益依据。</small>
          </div>
          <div className="partner-mode partner-mode-example">
            <b>先申请，再确认</b>
            <small>请先提交城市、客群和渠道信息；平台会说明收款主体、客户数据责任、退款和售后边界。</small>
          </div>
        </div>

        <h2 className="partner-section-head">合作流程</h2>
        <ol className="partner-steps">
          <li>
            <b>提交合作申请</b>
            <small>扫码或联系客服，提交城市、客群、现有渠道和预计使用场景。</small>
          </li>
          <li>
            <b>人工审核与说明</b>
            <small>平台说明产品交付、收款主体、数据责任、退款和售后边界。</small>
          </li>
          <li>
            <b>书面确认后开站</b>
            <small>合作内容、费用、启动额度和支持周期确认后，再由管理员创建分站。</small>
          </li>
          <li>
            <b>自主获客与交付</b>
            <small>合作方销售真实 AI 形象产品，自负获客、交付、售后和经营结果。</small>
          </li>
        </ol>

        <p className="partner-redline">合作申请不等于加盟成立 · 平台不保证收益 · 不设置多级返佣 · 具体合作内容以书面协议为准</p>
      </main>
    </div>
  );
}
