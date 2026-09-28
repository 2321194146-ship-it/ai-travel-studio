"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import Footer from "@/components/Footer";
import { FaCheck } from "react-icons/fa";
import axios from "axios";
import { MAIN_PLANS } from "@/lib/plan-display";
import toast, { Toaster } from "react-hot-toast";

// 分站单张 SKU：仅在分站域名下展示（后端同款定价，客户钱进站长商户）
const TENANT_PLANS = [
  { id: "single_std", name: "AI 写真·标准单张", price: "¥29.9", credits: 2, membershipDays: 0, shots: "1 张标准质感成片", expires: "成片永久保存", tier: "标准质感", popular: false, description: "先试一张，满意再拍。" },
  { id: "single_hd", name: "AI 写真·高清单张", price: "¥39.9", credits: 4, membershipDays: 0, shots: "1 张高清质感成片", expires: "成片永久保存", tier: "高清质感", popular: true, description: "社交头像、展示面首选。" },
  { id: "single_flag", name: "AI 写真·旗舰单张", price: "¥69.9", credits: 6, membershipDays: 0, shots: "1 张旗舰质感成片", expires: "成片永久保存", tier: "旗舰质感", popular: false, description: "人脸一致性最好，精修交付。" }
];

// 需要登录的操作一律直接跳登录页，登录完回到充值页
const PRICING_LOGIN_URL = `/login?callbackUrl=${encodeURIComponent("/pricing")}`;

export default function Pricing() {
  const { status } = useSession();
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [manualOrder, setManualOrder] = useState(null);

  useEffect(() => {
    // 易支付付款成功后跳回 ?success=true，提示到账（积分以后端入账为准）
    if (typeof window !== "undefined" && window.location.search.includes("success=true")) {
      toast("已返回支付页面，到账状态请以购买记录为准。", { duration: 6000 });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // 分站域名下（反代注入 __TENANT_NAME__）展示单张 SKU 货架，隐藏主站套餐与人工转账入口
  const [tenantName, setTenantName] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/subsite/info")
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => { if (!cancelled && payload?.data?.siteName) setTenantName(payload.data.siteName); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const visiblePlans = tenantName ? TENANT_PLANS : MAIN_PLANS;

  const handleCheckout = async (planId, type = "alipay") => {
    if (status !== "authenticated") {
      window.location.assign(PRICING_LOGIN_URL);
      return;
    }
    const key = `${planId}:${type}`;
    setLoadingPlan(key);
    try {
      const { data } = await axios.post("/api/checkout/epay", { planId, type });
      window.location.assign(data.url);
    } catch (err) {
      if (err.response?.status === 401) {
        window.location.assign(PRICING_LOGIN_URL);
        return;
      }
      toast.error(err.response?.data?.error || "订单创建失败，请稍后重试。");
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleManualOrder = async (planId) => {
    if (status !== "authenticated") {
      window.location.assign(PRICING_LOGIN_URL);
      return;
    }
    setLoadingPlan(`${planId}:manual`);
    try {
      const { data } = await axios.post("/api/manual-orders", { planId });
      setManualOrder(data);
    } catch (err) {
      if (err.response?.status === 401) {
        window.location.assign(PRICING_LOGIN_URL);
        return;
      }
      toast.error(err.response?.data?.error || "订单创建失败，请稍后重试。");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="mf-pricing-shell">
      <Toaster position="top-right" toastOptions={{ style: { background: "#211b15", color: "#f4ead7", border: "1px solid rgba(220,178,103,.28)" } }} />

      <main className="mf-pricing-main">
        <div className="mf-pricing-header">
          <Link className="mf-pricing-back" href="/">‹ 返回首页</Link>
          <div className="mf-pricing-mark"><span>型</span><b>型男制造机</b></div>
          <span className="mf-auth-kicker">PERSONAL IMAGE STUDIO</span>
          <h1>{tenantName ? `${tenantName} · AI 写真` : "让改变，真正发生在照片里"}</h1>
          <p>{tenantName
            ? "拍一张算一张，付款即拍，成片永久保存，失败自动全额退款。"
            : "三档差价不大，就是效果不同——日常够用选 ¥39.9，质量要求高直接 ¥99，别纠结。生成次数可混用：照片 / 试穿 / 诊断都行，失败自动退回。"}
          </p>
        </div>

        <div className="mf-plan-grid">
          {visiblePlans.map((plan) => (
            <div
              key={plan.id}
              className={`mf-plan-card ${plan.popular ? "mf-plan-card-popular" : ""}`}
            >
              {plan.popular && (
                <span className="mf-plan-ribbon">🔥 9 成用户选这档</span>
              )}

              <div className="mf-plan-body">
                <div className="mf-plan-title"><span>{plan.tier}</span><h2>{plan.name}</h2></div>
                <p className="mf-plan-hook">{plan.hook}</p>
                <div className="mf-plan-price">{plan.price}<small> / 套</small></div>
                <div className="mf-plan-credits"><strong>{plan.credits} 次生成额度</strong><span style={{ display: "block", marginTop: 3, fontSize: 10, color: "#9e9281" }}>{plan.shots}</span></div>
                <p className="mf-plan-description">{plan.description}</p>

                <ul className="mf-plan-features">
                  {plan.membershipDays > 0 && <li><FaCheck />会员期内每日 3 次 AI 形象诊断</li>}
                  <li><FaCheck />{plan.tier}</li>
                  <li><FaCheck />{plan.expires}</li>
                  <li><FaCheck />失败自动退回次数</li>
                </ul>
              </div>

              <div className="mf-plan-actions">
                <button
                  onClick={() => handleCheckout(plan.id, "alipay")}
                  disabled={loadingPlan !== null}
                  className={`mf-plan-action ${plan.popular ? "mf-plan-action-primary" : ""}`}
                >
                  {loadingPlan === `${plan.id}:alipay` ? "正在跳转…" : "支付宝购买"}
                </button>
                <button
                  onClick={() => handleCheckout(plan.id, "wxpay")}
                  disabled={loadingPlan !== null}
                  className="mf-plan-action"
                >
                  {loadingPlan === `${plan.id}:wxpay` ? "正在跳转…" : "微信购买"}
                </button>
              </div>
              {!tenantName && (
                <button
                  onClick={() => handleManualOrder(plan.id)}
                  disabled={loadingPlan !== null}
                  className="mf-manual-link"
                >
                  {loadingPlan === `${plan.id}:manual` ? "正在创建…" : "无法在线支付？转账+人工开通"}
                </button>
              )}
            </div>
          ))}
        </div>
      </main>

      {manualOrder && (
        <div className="mf-payment-overlay">
          <div className="mf-payment-card">
            <button className="mf-payment-close" onClick={() => setManualOrder(null)} aria-label="关闭">×</button>
            <span className="mf-auth-kicker">ORDER READY</span><h2>转账开通</h2>
            <p className="mf-payment-order">订单号：{manualOrder.data.id}</p>
            <p className="mf-payment-price">¥{(manualOrder.data.amount / 100).toFixed(2)}</p>
            {manualOrder.qrUrl ? (
              <img src={manualOrder.qrUrl} alt="收款码" className="mf-payment-qr" />
            ) : (
              <p className="mf-payment-warning">收款码尚未配置，请联系管理员获取收款方式。</p>
            )}
            <p className="mf-payment-hint">付款后请保留订单号。管理员核对到账后，会手动为账号开通生成额度。</p>
            <button onClick={() => setManualOrder(null)} className="mf-plan-action">知道了</button>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
