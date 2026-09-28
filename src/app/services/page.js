"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { SERVICE_CATALOG, SERVICE_PLAN_CATALOG, formatCents, getServiceById } from "@/lib/service-catalog";

const loginUrl = "/login?callbackUrl=%2Fservices";

function ServicePurchase({ planId, onBuy, loading }) {
  const plan = SERVICE_PLAN_CATALOG[planId];
  return (
    <div className="mf-service-price-row">
      <div><b>{plan.name}</b><small>{formatCents(plan.amount)}</small></div>
      <div className="mf-service-payment-actions">
        <button className="mf-service-pay-button" type="button" onClick={() => onBuy(planId, "alipay")} disabled={loading}>
          {loading ? "跳转中…" : "支付宝支付"}
        </button>
        <button className="mf-service-pay-button mf-service-pay-button-wx" type="button" onClick={() => onBuy(planId, "wxpay")} disabled={loading}>
          {loading ? "跳转中…" : "微信支付"}
        </button>
      </div>
    </div>
  );
}

function ServicePosterCard({ service, onOpen }) {
  return (
    <button type="button" className={`mf-service-poster-card mf-service-poster-card-${service.id}`} onClick={() => onOpen(service.id)}>
      <span className="mf-service-poster-card-glow" />
      <span className="mf-service-poster-card-top"><b>{service.eyebrow}</b><em>{service.mode}</em></span>
      <span className="mf-service-poster-card-number">0{SERVICE_CATALOG.findIndex((item) => item.id === service.id) + 1}</span>
      <span className="mf-service-poster-card-title">{service.title}</span>
      <span className="mf-service-poster-card-line" />
      <span className="mf-service-poster-card-short">{service.short}</span>
      <span className="mf-service-poster-card-action">查看服务详情 <strong>→</strong></span>
    </button>
  );
}

function ServicePoster({ service, onBack, onBuy, loading }) {
  return (
    <article className={`mf-service-poster mf-service-poster-${service.id}`} id={`service-${service.id}`}>
      <div className="mf-service-poster-cover">
        <button type="button" className="mf-service-poster-back" onClick={onBack}>‹ 返回服务中心</button>
        <div className="mf-service-poster-cover-meta"><span>{service.eyebrow}</span><em>{service.mode}</em></div>
        <span className="mf-service-poster-cover-number">0{SERVICE_CATALOG.findIndex((item) => item.id === service.id) + 1}</span>
        <p className="mf-service-poster-cover-brand">型男制造机 <span>PERSONAL IMAGE SERVICE</span></p>
        <h1>{service.title}</h1>
        <p>{service.short}</p>
        <div className="mf-service-cover-highlights">
          <span>内容清晰</span><i /><span>交付明确</span><i /><span>按约执行</span>
        </div>
        <span className="mf-service-poster-cover-rule" />
        <small>先了解服务内容，再选择适合自己的方案</small>
      </div>
      <div className="mf-service-poster-body">
        <div className="mf-service-poster-section-heading"><span>01 / SERVICE OVERVIEW</span><h2>这项服务适不适合你？</h2><p>{service.short} 我们会按页面列出的内容、周期和交付边界，通过微信完成后续资料收集与人工交付。</p></div>
        <div className="mf-service-poster-columns">
          <section className="mf-poster-copy-block"><span className="mf-poster-block-index">02 / FOR YOU</span><h2>适合人群</h2><ul>{service.audience.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section className="mf-poster-copy-block"><span className="mf-poster-block-index">03 / WHAT YOU GET</span><h2>服务内容</h2><ul>{service.content.map((item) => <li key={item}>{item}</li>)}</ul></section>
        </div>
        <section className="mf-poster-copy-block mf-poster-deliverables"><span className="mf-poster-block-index">04 / DELIVERABLES</span><h2>最终交付</h2><ul>{service.deliverables.map((item) => <li key={item}>{item}</li>)}</ul></section>
        <div className="mf-service-poster-specs"><span><b>服务周期</b>{service.duration}</span><span><b>服务边界</b>{service.boundary}</span></div>
        <section className="mf-service-poster-buy"><div><span className="mf-service-poster-buy-label">选择服务方案</span><h2>确认后付款，付款成功再添加微信</h2></div><div className="mf-service-purchase-list">{service.productIds.map((planId) => <ServicePurchase key={planId} planId={planId} onBuy={onBuy} loading={loading === planId} />)}</div></section>
        <p className="mf-service-poster-footnote">不承诺脱单、涨粉、匹配、成交或固定形象结果；所有公开发布内容由用户最终确认。</p>
      </div>
    </article>
  );
}

export default function ServicesPage() {
  const { status } = useSession();
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState("");
  const [order, setOrder] = useState(null);
  const [notice, setNotice] = useState("");
  const wechat = process.env.NEXT_PUBLIC_SERVICE_WECHAT || "微信昵称：孤的败（比利时）";
  const wechatQr = process.env.NEXT_PUBLIC_SERVICE_WECHAT_QR_URL || "/service-wechat-qr.jpg";
  const [orderLoading, setOrderLoading] = useState(false);

  useEffect(() => {
    function syncHash() {
      const hash = window.location.hash.replace(/^#service-/, "");
      setSelectedServiceId(getServiceById(hash)?.id || null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("orderId");
    if (!orderId || params.get("success") !== "true") return;
    let cancelled = false;
    async function loadOrder(attempt = 0) {
      if (cancelled) return;
      setOrderLoading(true);
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
        const data = response.ok ? await response.json() : null;
        if (data?.data && !cancelled) {
          setOrder(data.data);
          if (data.data.status === "PENDING" && attempt < 2) window.setTimeout(() => loadOrder(attempt + 1), 1500);
          return;
        }
        if (!cancelled) setNotice("订单正在同步，请稍后查看购买记录。");
      } catch {
        if (!cancelled) setNotice("订单状态正在同步，请稍后在购买记录中查看。");
      } finally {
        if (!cancelled) setOrderLoading(false);
      }
    }
    loadOrder();
    return () => { cancelled = true; };
  }, []);

  const wechatHint = useMemo(() => wechat || "微信交付信息待管理员配置", [wechat]);
  const selectedService = getServiceById(selectedServiceId);

  function openService(serviceId) {
    window.history.pushState({}, "", `/services#service-${serviceId}`);
    setSelectedServiceId(serviceId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeService() {
    window.history.pushState({}, "", "/services");
    setSelectedServiceId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function buy(planId, requestedType) {
    if (status !== "authenticated") {
      window.location.assign(loginUrl);
      return;
    }
    setLoadingPlan(planId);
    try {
      const response = await fetch("/api/checkout/epay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, type: requestedType || "alipay", context: "services" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "订单创建失败");
      window.location.assign(data.url);
    } catch (error) {
      setNotice(error.message || "订单创建失败，请稍后重试");
    } finally {
      setLoadingPlan("");
    }
  }

  return (
    <main className="mf-services-page">
      <header className="mf-services-topbar"><Link href="/">‹ 返回首页</Link><span>型男制造机 · 服务中心</span><Link href="/pricing">充值中心</Link></header>
      {!selectedService ? (
        <>
          <section className="mf-services-hero"><span className="mf-auth-kicker">PERSONAL IMAGE & SOCIAL PROFILE</span><h1>男生形象与社交展示方案</h1><p>四种服务方式，先看清楚内容，再决定适合自己的那一项。</p><div className="mf-services-route"><span>自己学<br /><b>资料课</b></span><i>→</i><span>跟着做<br /><b>7 天启动营</b></span><i>→</i><span>专门问<br /><b>一对一咨询</b></span><i>→</i><span>交给我们做<br /><b>全案陪跑</b></span></div></section>
          <section className="mf-service-poster-shelf"><div className="mf-service-shelf-heading"><span className="mf-auth-kicker">CHOOSE A SERVICE</span><h2>选择适合你的服务</h2><p>了解每项服务的内容、交付和服务边界，再进入详情确认方案。</p></div><div className="mf-service-poster-grid">{SERVICE_CATALOG.map((service) => <ServicePosterCard key={service.id} service={service} onOpen={openService} />)}</div></section>
      </>
      ) : <ServicePoster service={selectedService} onBack={closeService} onBuy={buy} loading={loadingPlan} />}
      {notice && <div className="mf-services-notice" role="status">{notice}</div>}
      {order && <section className="mf-service-order-success"><span className="mf-auth-kicker">ORDER RECEIVED</span><h2>{order.status === "PAID" ? "订单已支付，下一步添加微信" : orderLoading ? "订单状态同步中" : "订单已创建，等待支付确认"}</h2><p>服务：{order.planName} · 订单号：{order.id}</p><p>支付状态：{order.status === "PAID" ? "已支付" : "待确认"} · 交付状态：{order.deliveryStatus === "DELIVERED" ? "已交付" : "待人工联系"}</p>{order.status === "PAID" && (wechatQr ? <img src={wechatQr} alt="微信交付二维码" /> : <div className="mf-service-wechat-placeholder">{wechatHint}</div>)}{order.status === "PAID" && <><b>添加后备注：服务名称 + 订单号后四位</b><small>添加微信后发送支付成功页面，并按提示提交照片和基本资料。具体开始时间以人工确认信息为准。</small></>}</section>}
      <section className="mf-services-note"><h2>购买前说明</h2><p>服务交付以对应服务海报列出的内容、周期、平台数量、素材数量、沟通次数和修改轮数为准。所有公开发布内容由用户最终确认。</p><p>服务订单支付成功后，通过微信完成资料收集和人工交付。</p></section>
    </main>
  );
}
