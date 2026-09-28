"use client";

import { useState } from "react";
import { FaCheck } from "react-icons/fa";
import { MAIN_PLANS } from "@/lib/plan-display";

export default function PurchasePromptModal({ onClose }) {
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [error, setError] = useState("");

  async function checkout(planId, type) {
    const key = `${planId}:${type}`;
    setLoadingPlan(key);
    setError("");
    try {
      const response = await fetch("/api/checkout/epay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, type }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.location.assign(`/login?callbackUrl=${encodeURIComponent("/")}`);
        return;
      }
      if (!response.ok || !data.url) throw new Error(data.error || "订单创建失败，请稍后重试");
      window.location.assign(data.url);
    } catch (checkoutError) {
      setError(checkoutError.message || "订单创建失败，请稍后重试");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div className="mf-purchase-overlay" role="dialog" aria-modal="true" aria-labelledby="mf-purchase-title">
      <section className="mf-purchase-card">
        <button className="mf-purchase-close" type="button" onClick={onClose} aria-label="关闭购买提示">×</button>
        <span className="mf-auth-kicker">WELCOME TO YOUR STUDIO</span>
        <h2 id="mf-purchase-title">先选一个生成方案</h2>
        <p className="mf-purchase-intro">生成额度可以通用于换发型、换衣服、生活展示面和超出免费次数后的 AI 诊断。</p>
        <div className="mf-purchase-grid">
          {MAIN_PLANS.map((plan) => (
            <article className={`mf-purchase-plan${plan.popular ? " featured" : ""}`} key={plan.id}>
              {plan.popular && <span className="mf-purchase-ribbon">最受欢迎</span>}
              <div className="mf-purchase-plan-head"><span>{plan.tier}</span><h3>{plan.name}</h3></div>
              <strong className="mf-purchase-price">{plan.price}</strong>
              <b className="mf-purchase-credits">{plan.credits} 次生成额度</b>
              <p>{plan.shots}</p>
              <small><FaCheck /> {plan.membershipDays ? `会员有效 ${plan.membershipDays} 天` : "不改变当前会员档位"}</small>
              <div className="mf-purchase-actions">
                <button type="button" className="primary" disabled={loadingPlan !== null} onClick={() => checkout(plan.id, "alipay")}>{loadingPlan === `${plan.id}:alipay` ? "跳转中…" : "支付宝购买"}</button>
                <button type="button" disabled={loadingPlan !== null} onClick={() => checkout(plan.id, "wxpay")}>{loadingPlan === `${plan.id}:wxpay` ? "跳转中…" : "微信购买"}</button>
              </div>
            </article>
          ))}
        </div>
        {error && <p className="mf-purchase-error" role="alert">{error}</p>}
        <button type="button" className="mf-purchase-later" onClick={onClose}>先看看，暂时关闭</button>
      </section>
    </div>
  );
}
