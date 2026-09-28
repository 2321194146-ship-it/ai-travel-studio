"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "face-maker-install-guide-dismissed-v2";
const AUTO_CLOSE_SECONDS = 8;

export default function InstallGuide() {
  const [mode, setMode] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CLOSE_SECONDS);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const inAppBrowser = /micromessenger|wechat|aweme|douyin|bytedancewebview/.test(ua);
    if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) return;
    const previewMode = process.env.NODE_ENV === "development"
      ? new URLSearchParams(window.location.search).get("installGuide")
      : null;
    if (previewMode === "browser" || previewMode === "install") {
      const timer = window.setTimeout(() => {
        setPreviewing(true);
        setMode(previewMode);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (window.sessionStorage.getItem(DISMISS_KEY)) return;

    const mobileBrowser = /iphone|ipad|android/.test(ua);
    if (inAppBrowser) {
      const timer = window.setTimeout(() => setMode("browser"), 900);
      return () => window.clearTimeout(timer);
    }
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
      setMode("install");
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    const fallbackTimer = mobileBrowser
      ? window.setTimeout(() => setMode("install"), 1400)
      : null;
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (mode !== "browser" || previewing) return;
    const resetTimer = window.setTimeout(() => setSecondsLeft(AUTO_CLOSE_SECONDS), 0);
    const countdown = window.setInterval(() => {
      setSecondsLeft((value) => Math.max(0, value - 1));
    }, 1000);
    const timer = window.setTimeout(() => setMode(null), AUTO_CLOSE_SECONDS * 1000);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearInterval(countdown);
      window.clearTimeout(timer);
    };
  }, [mode, previewing]);

  if (!mode) return null;

  const close = () => {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
    setMode(null);
  };

  const install = async () => {
    if (!installPrompt) return close();
    await installPrompt.prompt();
    await installPrompt.userChoice;
    close();
  };

  return (
    <div
      className="pointer-events-none fixed right-[10px] top-[58px] z-[100] w-[222px] max-w-[calc(100vw-20px)]"
      role="dialog"
      aria-label="添加到桌面提示"
    >
      <div
        className="pointer-events-auto relative overflow-visible rounded-[22px] border px-[21px] pb-[19px] pt-[23px] text-left shadow-[0_14px_40px_rgba(0,0,0,0.38)] backdrop-blur-[14px]"
        style={{
          borderColor: "rgba(180, 142, 78, 0.68)",
          background: "linear-gradient(145deg, rgba(43,34,22,0.97), rgba(26,21,15,0.97))",
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-[7px] top-[-54px] select-none text-[30px] leading-none drop-shadow-[0_2px_7px_rgba(221,173,75,0.42)]"
        >
          ☝️
        </span>
        {mode === "browser" ? (
          <>
            <h2 className="whitespace-nowrap text-[16px] font-medium leading-[28px] tracking-[0.02em] text-[#c7aa7a]">
              点击 <strong className="font-bold text-[#ddb76f]">右上角 ···</strong>
            </h2>
            <p className="mt-[2px] whitespace-nowrap text-[15px] font-medium leading-[27px] text-[#b89a6b]">
              选择 <strong className="font-bold text-[#d8b16b]">「用浏览器打开」</strong>
              <br />
              <span className="text-[#90764f]">添加桌面，如 App 般使用</span>
            </p>
            <div className="mt-[13px] h-px bg-[rgba(151,117,65,0.34)]" />
            <div className="mt-[13px] flex items-center justify-between text-[12px] leading-5 text-[#876f4d]">
              <span>{secondsLeft}s 后自动关闭</span>
              <button type="button" onClick={close} className="px-1 py-0.5 text-[#a88957] transition-colors hover:text-[#d8b16b]">
                关闭
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-[16px] font-bold leading-7 text-[#d8b16b]">添加到桌面</h2>
            <p className="mt-1 text-[13px] leading-6 text-[#b89a6b]">
              {installPrompt ? "添加后可像 App 一样快速打开型男制造机。" : "点击浏览器菜单，选择“添加到主屏幕”或“添加到桌面”。"}
            </p>
            {installPrompt && (
              <button type="button" onClick={install} className="mt-3 w-full rounded-full bg-[#b98a43] py-2 text-xs font-bold text-[#21180f]">
                添加到桌面
              </button>
            )}
            <div className="mt-3 h-px bg-[rgba(151,117,65,0.34)]" />
            <div className="mt-2 flex justify-end">
              <button type="button" onClick={close} className="px-1 py-0.5 text-xs text-[#a88957]">
                关闭
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
