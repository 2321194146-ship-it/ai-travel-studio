import "./globals.css";
import "./services/services.css";
import { Providers } from "./providers";
import Navbar from "../components/Navbar";
import InstallGuide from "../components/InstallGuide";
import publicConfig from "@/lib/config.public";

export const metadata = {
  title: "型男制造机 - AI男性形象改造工具",
  description:
    "上传照片，AI诊断形象，一键生成高质感展示面。咖啡厅、健身房、旅行、商务、日常、街拍六大场景，让普通人也能拥有帅气展示面。",
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  const theme = publicConfig?.theme || "slate-indigo";

  return (
    <html lang="zh-CN" className="h-full w-full" data-theme={theme}>
      <body className="h-full w-full flex flex-col antialiased bg-bg-page text-primary-text lg:overflow-hidden overflow-y-auto">
        <Providers>
          <Navbar />
          <InstallGuide />
          <div className="flex-1 flex flex-col lg:overflow-hidden overflow-visible lg:min-h-0 min-h-0">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
