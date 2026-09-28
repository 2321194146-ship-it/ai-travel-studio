"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FaInfoCircle, FaMobileAlt } from "react-icons/fa";
import toast, { Toaster } from "react-hot-toast";

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("callbackUrl") || searchParams.get("next") || "/";

  const [phoneInput, setPhoneInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [inviteInput, setInviteInput] = useState("");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const ref = window.localStorage.getItem("mf_ref");
        if (ref) setInviteInput(ref);
      } catch {}
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePhoneLogin = async (e) => {
    e.preventDefault();
    if (!/^1[3-9]\d{9}$/.test(phoneInput)) return toast.error("请输入正确的手机号");
    if (passwordInput.length < 8) return toast.error("密码至少需要8位");
    setIsSubmitting(true);
    try {
      if (isRegistering) {
        const registerRes = await fetch("/api/auth/phone/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone: phoneInput, password: passwordInput, inviteCode: inviteInput.trim() || undefined }),
        });
        const registerData = await registerRes.json();
        if (!registerRes.ok) throw new Error(registerData.error || "注册失败");
      }
      const res = await signIn("phone-password", { phone: phoneInput, password: passwordInput, redirect: false, callbackUrl: next });
      if (res?.error) throw new Error(isRegistering ? "注册成功但登录失败，请重试" : "手机号或密码错误");
      try {
        const returnPath = new URL(next, window.location.origin).pathname;
        if (returnPath === "/") window.sessionStorage.setItem("mf_show_purchase_prompt", "1");
      } catch {}
      toast.success(isRegistering ? "注册并登录成功" : "登录成功");
      router.push(next);
    } catch (error) {
      toast.error(error.message || "操作失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      router.push(next);
    }
  }, [status, router, next]);

  return (
    <div className="mf-auth-shell">
      <Toaster position="top-right" toastOptions={{ style: { background: "#211b15", color: "#f4ead7", border: "1px solid rgba(220,178,103,.28)" } }} />
      <div className="mf-auth-glow mf-auth-glow-left" />
      <div className="mf-auth-glow mf-auth-glow-right" />
      <Link className="mf-auth-back" href="/">‹ <span>返回首页</span></Link>
      <div className="mf-auth-card">
        <div className="mf-auth-brand"><span>型</span><div><b>型男制造机</b><small>PERSONAL IMAGE STUDIO</small></div></div>
        <div className="mf-auth-heading"><span className="mf-auth-kicker">YOUR STYLE, YOUR STORY</span><h1>{isRegistering ? "建立你的形象档案" : "进入你的形象档案"}</h1><p>保存照片、同步生成额度，开启专属形象改造方案</p></div>

        <form onSubmit={handlePhoneLogin} className="mf-auth-form">
          <label>手机号<div className="mf-auth-field"><FaMobileAlt /><input type="tel" autoComplete="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="输入手机号" maxLength={11} /></div></label>
          <label>登录密码<div className="mf-auth-field"><span className="mf-auth-lock">◈</span><input type="password" autoComplete={isRegistering ? "new-password" : "current-password"} value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="至少 8 位字符" /></div></label>
          {isRegistering && (
            <label>好友邀请码（选填）<div className="mf-auth-field"><input type="text" value={inviteInput} onChange={(e) => setInviteInput(e.target.value.toUpperCase())} placeholder="有邀请码就填，双方都得次数" maxLength={8} style={{ textTransform: "uppercase" }} /></div></label>
          )}
          <button type="submit" disabled={isSubmitting} className="mf-auth-submit">{isSubmitting ? "处理中…" : isRegistering ? "注册并登录" : "登录并继续"}<span>→</span></button>
          <button type="button" onClick={() => setIsRegistering((value) => !value)} className="mf-auth-switch">{isRegistering ? "已有账号？直接登录" : "还没有账号？立即注册"}</button>
        </form>

        <div className="mf-auth-note"><FaInfoCircle /><span>登录即表示同意服务条款。你的照片仅用于生成你的专属形象方案，不会对外展示，你也可以随时在应用内删除。</span></div>
      </div>
      <p className="mf-auth-footer">从看见自己开始，建立更好的形象表达</p>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense
      fallback={
        <div className="mf-auth-shell mf-auth-loading">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
