"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { SERVICE_PLAN_CATALOG } from "@/lib/service-catalog";

const navItems = [
  ["dashboard", "总览", "今天要处理的事"],
  ["users", "用户", "会员与用户详情"],
  ["orders", "订单", "收款与权益发放"],
  ["generations", "生成记录", "失败排查与成本"],
  ["circle", "圈子审核", "内容发布"],
  ["subsites", "分站", "代理与积分"],
  ["audit", "操作日志", "管理员动作追踪"],
];
const servicePlans = Object.keys(SERVICE_PLAN_CATALOG);
const plans = ["trial", "high", "flagship", "refill", ...servicePlans];
const grantablePlans = ["trial", "high", "flagship", "refill"];
const planLabels = { trial: "体验卡", high: "高清生成卡", flagship: "旗舰精修卡", refill: "次数补充包", ...Object.fromEntries(Object.values(SERVICE_PLAN_CATALOG).map((plan) => [plan.id, plan.name])) };
const deliveryLabels = { NOT_REQUIRED: "无需交付", NOT_STARTED: "待联系", WAITING_CUSTOMER: "等待资料", IN_PROGRESS: "制作中", DELIVERED: "已交付", CANCELLED: "已取消" };

function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { dateStyle: "short", timeStyle: "short" });
}
function money(cents) { return `¥${((Number(cents) || 0) / 100).toFixed(2)}`; }
function displayUser(user) { return user?.phone || user?.email || user?.name || user?.id?.slice(0, 10) || "未绑定用户"; }
function statusText(status) {
  return { PAID: "已支付", PENDING: "待处理", CANCELLED: "已取消", REFUNDED: "已退款", completed: "成功", processing: "处理中", failed: "失败", PUBLISHED: "已发布", REJECTED: "已驳回" }[status] || status || "未知";
}
function StatusBadge({ status }) { return <span className={`admin-badge admin-badge-${String(status || "unknown").toLowerCase()}`}>{statusText(status)}</span>; }

function Empty({ title = "暂无数据", text = "当前筛选条件下没有记录" }) {
  return <div className="admin-empty-state"><b>{title}</b><span>{text}</span></div>;
}

function Loading() { return <div className="admin-loading"><span className="admin-spinner" />正在读取后台数据…</div>; }

export default function AdminPage() {
  const { status } = useSession();
  const router = useRouter();
  const [view, setView] = useState("dashboard");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [generations, setGenerations] = useState([]);
  const [circlePosts, setCirclePosts] = useState([]);
  const [subsites, setSubsites] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [filters, setFilters] = useState({ q: "", status: "", tier: "", membership: "", orderType: "", deliveryStatus: "" });
  const [orderForm, setOrderForm] = useState({ userId: "", channel: "APPRECIATION", planId: "trial", note: "" });
  const [orderUserQuery, setOrderUserQuery] = useState("");
  const [orderUserMatches, setOrderUserMatches] = useState([]);

  const notify = useCallback((text, type = "success") => {
    setToast({ text, type });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const fetchJson = useCallback(async (url, options) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "请求失败");
    return data;
  }, []);

  const loadView = useCallback(async (nextView = view) => {
    setLoading(true);
    try {
      if (nextView === "dashboard") {
        const dashboardData = await fetchJson("/api/admin/dashboard");
        setStats(dashboardData.data);
        setOrders(dashboardData.data?.pendingOrderRows || []);
      } else if (nextView === "users") {
        const params = new URLSearchParams({ limit: "50" });
        if (filters.q) params.set("q", filters.q);
        if (filters.membership) params.set("membership", filters.membership);
        setUsers((await fetchJson(`/api/admin/users?${params}`)).data || []);
      } else if (nextView === "orders") {
        const params = new URLSearchParams();
        if (filters.status) params.set("status", filters.status);
        if (filters.orderType) params.set("orderType", filters.orderType);
        if (filters.deliveryStatus) params.set("deliveryStatus", filters.deliveryStatus);
        if (filters.q) params.set("q", filters.q);
        setOrders((await fetchJson(`/api/admin/orders${params.toString() ? `?${params}` : ""}`)).data || []);
      } else if (nextView === "generations") {
        const params = new URLSearchParams({ limit: "50" });
        if (filters.q) params.set("q", filters.q);
        if (filters.status) params.set("status", filters.status);
        if (filters.tier) params.set("tier", filters.tier);
        setGenerations((await fetchJson(`/api/admin/generations?${params}`)).data || []);
      } else if (nextView === "circle") {
        setCirclePosts((await fetchJson("/api/admin/circle")).data || []);
      } else if (nextView === "subsites") {
        setSubsites((await fetchJson("/api/admin/subsites")) || []);
      } else if (nextView === "audit") {
        const params = filters.q ? `?q=${encodeURIComponent(filters.q)}` : "";
        setAuditLogs((await fetchJson(`/api/admin/audit${params}`)).data || []);
      }
    } catch (error) {
      notify(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [fetchJson, filters.deliveryStatus, filters.membership, filters.orderType, filters.q, filters.status, filters.tier, notify, view]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login?next=/admin");
    if (status === "authenticated") {
      const timer = window.setTimeout(() => loadView(view), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [loadView, router, status, view]);

  function changeView(next) {
    setView(next);
    setMobileNav(false);
    setFilters({ q: "", status: "", tier: "", membership: "", orderType: "", deliveryStatus: "" });
  }

  async function openUser(userId) {
    try { setSelectedUser((await fetchJson(`/api/admin/users/${userId}`)).data); } catch (error) { notify(error.message, "error"); }
  }

  async function searchOrderUsers(value) {
    setOrderUserQuery(value);
    if (value.trim().length < 2) {
      setOrderUserMatches([]);
      return;
    }
    try {
      const data = await fetchJson(`/api/admin/users?q=${encodeURIComponent(value.trim())}&limit=8`);
      setOrderUserMatches(data.data || []);
    } catch (error) {
      notify(error.message, "error");
    }
  }

  function chooseOrderUser(user) {
    setOrderForm((form) => ({ ...form, userId: user.id }));
    setOrderUserQuery(displayUser(user));
    setOrderUserMatches([]);
  }

  async function createOrder(event) {
    event.preventDefault();
    try {
      await fetchJson("/api/admin/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(orderForm) });
      setOrderForm({ userId: "", channel: "APPRECIATION", planId: "trial", note: "" });
      setOrderUserQuery("");
      setOrderUserMatches([]);
      notify("人工订单已登记");
      loadView("orders");
    } catch (error) { notify(error.message, "error"); }
  }

  async function updateOrder(order, nextStatus, extra = {}) {
    try {
      await fetchJson(`/api/admin/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus, ...extra }) });
      notify(order.orderType === "SERVICE" && nextStatus === "PAID" ? "服务订单已确认收款，等待人工交付" : nextStatus === "PAID" ? "订单已确认，权益已发放" : nextStatus === "REFUNDED" ? "退款已登记，该订单发放的生成次数已收回" : "订单状态已更新");
      loadView("orders");
    } catch (error) { notify(error.message, "error"); }
  }

  function requestRefund(order) {
    if (!window.confirm(`确认已完成向客户的退款 ¥${money(order.amount)}？\n登记后系统将收回该订单发放的生成次数（余额不足扣到 0 为止）。`)) return;
    onUpdate(order, "REFUNDED", { refundConfirmed: true });
  }

  async function updateDelivery(order, deliveryStatus) {
    try {
      await fetchJson(`/api/admin/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliveryStatus }) });
      notify(`交付状态已更新为${deliveryLabels[deliveryStatus] || deliveryStatus}`);
      loadView("orders");
    } catch (error) { notify(error.message, "error"); }
  }

  async function grantUser(user) {
    const planId = window.prompt(`给 ${displayUser(user)} 开通哪个套餐？\ntrial / high / flagship / refill`, "trial");
    if (!grantablePlans.includes(planId)) return;
    try {
      await fetchJson(`/api/admin/users/${user.id}/grant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
      notify(`已开通${planLabels[planId]}`);
      loadView("users");
    } catch (error) { notify(error.message, "error"); }
  }

  async function moderate(post, nextStatus) {
    try {
      await fetchJson("/api/admin/circle", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: post.id, status: nextStatus }) });
      notify(nextStatus === "PUBLISHED" ? "内容已发布" : "内容已驳回");
      loadView("circle");
    } catch (error) { notify(error.message, "error"); }
  }

  const pendingOrders = useMemo(() => orders.filter((order) => order.status === "PENDING"), [orders]);
  const pendingCircle = useMemo(() => circlePosts.filter((post) => post.status === "PENDING"), [circlePosts]);

  if (status === "loading") return <main className="admin-page"><Loading /></main>;

  return <main className="admin-page admin-workspace">
    <aside className={`admin-sidebar${mobileNav ? " open" : ""}`}>
      <div className="admin-brand"><span>型</span><div><b>型男制造机</b><small>ADMIN WORKSPACE</small></div></div>
      <div className="admin-nav-label">工作台</div>
      <nav>{navItems.map(([key, label, hint]) => <button key={key} className={view === key ? "active" : ""} onClick={() => changeView(key)}><strong>{label}</strong><small>{hint}</small></button>)}</nav>
      <div className="admin-sidebar-foot"><span>管理员模式</span><button onClick={() => router.push("/")}>返回前台 ↗</button></div>
    </aside>
    {mobileNav && <button className="admin-nav-scrim" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}
    <section className="admin-main">
      <header className="admin-topbar">
        <button className="admin-menu-button" onClick={() => setMobileNav(true)}>☰</button>
        <div><span className="admin-eyebrow">型男制造机 · ADMIN</span><h1>{navItems.find(([key]) => key === view)?.[1]}</h1></div>
        <div className="admin-top-actions"><span className="admin-live-dot">系统正常</span><button onClick={() => loadView(view)}>刷新</button></div>
      </header>
      {toast && <div className={`admin-toast ${toast.type}`} role="status">{toast.type === "error" ? "!" : "✓"}<span>{toast.text}</span></div>}
      <div className="admin-content">
        {loading ? <Loading /> : <>
          {view === "dashboard" && <Dashboard stats={stats} onOrders={() => changeView("orders")} onGenerations={() => changeView("generations")} onUsers={() => changeView("users")} onAudit={() => changeView("audit")} onSubsites={() => changeView("subsites")} onCircle={() => changeView("circle")} />}
          {view === "users" && <Users users={users} filters={filters} setFilters={setFilters} onSearch={() => loadView("users")} onOpen={openUser} onGrant={grantUser} />}
          {view === "orders" && <Orders orders={orders} filters={filters} setFilters={setFilters} onSearch={() => loadView("orders")} onUpdate={updateOrder} onUpdateDelivery={updateDelivery} form={orderForm} setForm={setOrderForm} onCreate={createOrder} userQuery={orderUserQuery} userMatches={orderUserMatches} onUserQuery={searchOrderUsers} onChooseUser={chooseOrderUser} />}
          {view === "generations" && <Generations rows={generations} filters={filters} setFilters={setFilters} onSearch={() => loadView("generations")} onOpen={openUser} />}
          {view === "circle" && <Circle posts={circlePosts} pending={pendingCircle} onModerate={moderate} />}
          {view === "subsites" && <Subsites subsites={subsites} notify={notify} onReload={() => loadView("subsites")} />}
          {view === "audit" && <Audit logs={auditLogs} filters={filters} setFilters={setFilters} onSearch={() => loadView("audit")} />}
        </>}
      </div>
    </section>
    {selectedUser && <UserDrawer user={selectedUser} onClose={() => setSelectedUser(null)} onOpenUser={openUser} />}
  </main>;
}

function Dashboard({ stats, onOrders, onGenerations, onUsers, onAudit, onSubsites, onCircle }) {
  if (!stats) return <Empty title="暂时没有总览数据" />;
  const funnel = stats.registrationFunnel?.funnel || {};
  const activation = funnel.activation7d || {};
  const paid = funnel.paid30d || {};
  const today = stats.registrationFunnel?.today || {};
  const revenueTypes = stats.revenueByOrderType || {};
  const moneyFromCents = (value) => money(Number(value) || 0);
  const rateText = (rate) => rate == null ? "样本积累中" : `${rate}%`;
  const recentAudits = Array.isArray(stats.recentAudit) ? stats.recentAudit.slice(0, 5) : [];
  const pendingRows = Array.isArray(stats.pendingOrderRows) ? stats.pendingOrderRows : [];

  return (
    <div className="admin-dashboard">
      <section className="admin-welcome admin-dashboard-hero">
        <div>
          <span className="admin-eyebrow">BUSINESS OVERVIEW · ASIA/SHANGHAI</span>
          <h2>经营驾驶舱</h2>
          <p>先看收入，再处理待办；增长漏斗按正式账号统计，游客体验单独列示。</p>
        </div>
        <div className="admin-quick-actions">
          <button className="primary" onClick={onOrders}>处理订单 <span>→</span></button>
          <button onClick={onUsers}>查看用户</button>
        </div>
      </section>

      <section className="admin-revenue-grid">
        <article className="admin-revenue-primary">
          <span>今日主站净收款</span>
          <b>{money(Number(stats.todayRevenue || 0) * 100)}</b>
          <small>会员/次数 + 人工服务 · 减当日退款 · {stats.todayOrders || 0} 笔 · 上海时间</small>
        </article>
        <article className="admin-revenue-secondary">
          <span>累计主站净收款</span>
          <b>{money(Number(stats.paidRevenue || 0) * 100)}</b>
          <small>会员/次数与人工服务 · 已支付减退款 · 分站另列</small>
        </article>
        <article className="admin-revenue-secondary">
          <span>今日正式注册</span>
          <b>{today.registered ?? 0}</b>
          <small>手机号 / 正式邮箱 · 游客 {today.guests ?? 0} 个另计</small>
        </article>
      </section>

      <section className="admin-panel admin-priority-panel">
        <div className="admin-panel-head"><div><span className="admin-eyebrow">ACTION QUEUE</span><h2>现在需要处理</h2></div><span className="admin-count">线上总待处理 {stats.pendingOrders ?? 0} 笔</span></div>
        <div className="admin-priority-grid">
          <button className="admin-priority-card" onClick={onOrders}><span>人工待核款</span><b>{stats.manualPendingOrders ?? 0}</b><small>赞赏码 / 微店 / 人工单</small></button>
          <button className="admin-priority-card is-warning" onClick={onOrders}><span>线上支付待处理</span><b>{stats.epayPendingOrders ?? 0}</b><small>待支付 · 其中 {stats.autoExpireEligible ?? 0} 笔超 48 小时待复核</small></button>
          <button className="admin-priority-card" onClick={onOrders}><span>服务待交付</span><b>{stats.serviceDeliveryPending ?? 0}</b><small>已付但尚未交付</small></button>
          <button className="admin-priority-card" onClick={onUsers}><span>7 天内会员到期</span><b>{stats.expiringMemberships ?? 0}</b><small>可联系提醒续费</small></button>
          <button className="admin-priority-card is-danger" onClick={onGenerations}><span>生成失败</span><b>{stats.failedGenerations ?? 0}</b><small>累计失败任务，点击查看排查</small></button>
          <button className="admin-priority-card" onClick={onGenerations}><span>生成处理中</span><b>{stats.processingGenerations ?? 0}</b><small>当前尚未完成的任务</small></button>
          <button className="admin-priority-card" onClick={onSubsites}><span>代理待打款</span><b>{moneyFromCents(stats.platformSettlementPendingAmount)}</b><small>{stats.platformSettlementPendingCount ?? 0} 笔已提交申请（不含旧单）</small></button>
          <button className="admin-priority-card" onClick={onCircle}><span>圈子待审核</span><b>{stats.circlePending ?? 0}</b><small>用户投稿</small></button>
        </div>
        <div className="admin-panel-head admin-queue-list-head"><div><span className="admin-eyebrow">LATEST PENDING</span><h2>最新待处理订单</h2></div><span className="admin-count">显示 {Math.min(pendingRows.length, 5)} / 共 {stats.pendingOrders ?? 0} 笔</span><button onClick={onOrders}>进入订单中心 →</button></div>
        {pendingRows.length ? <div className="admin-list">{pendingRows.slice(0, 5).map((order) => <div className="admin-list-row" key={order.id}><div className="admin-row-main"><div className="admin-order-queue-title"><StatusBadge status={order.status} /><b>{order.planName}</b></div><small>{(order.user ? displayUser(order.user) : "未关联账号")} · {order.orderType === "SERVICE" ? "人工服务" : order.orderType === "AGENT_RECHARGE" ? "代理充值" : "会员/次数"} · {order.channel === "EPAY" ? "线上支付" : "人工核款"} · {fmtDate(order.createdAt)}</small></div><strong>{money(order.amount)}</strong></div>)}</div> : <Empty title="没有待处理订单" />}
      </section>

      <section className="admin-panel admin-revenue-breakdown">
        <div className="admin-panel-head"><div><span className="admin-eyebrow">REVENUE MIX</span><h2>收入结构</h2></div><span className="admin-count">金额单位：元</span></div>
        <div className="admin-revenue-rows">
          {[
            ["会员 / 次数", "MEMBERSHIP"], ["人工服务", "SERVICE"], ["分站客户单", "SITE_ORDER"], ["代理充值", "AGENT_RECHARGE"],
          ].map(([label, type]) => {
            const row = revenueTypes[type] || { paidOrders: 0, netAmount: 0, refundedOrders: 0, refundedAmount: 0 };
            return <div className="admin-revenue-row" key={type}><b>{label}</b><span>{row.paidOrders || 0} 笔已付</span><strong>{moneyFromCents(row.netAmount)}</strong>{row.refundedOrders > 0 && <small>含退款 {row.refundedOrders} 笔 / {moneyFromCents(row.refundedAmount)}</small>}</div>;
          })}
        </div>
        <p className="admin-form-hint">各类型均按已支付金额减已登记退款；分站客户实收进入代理或平台代收账，单独列示，不混入主站累计净收款。</p>
      </section>

      <section className="admin-panel admin-funnel-panel">
        <div className="admin-panel-head"><div><span className="admin-eyebrow">GROWTH FUNNEL</span><h2>注册 → 首次成功生成 → 首次会员付费</h2></div><span className="admin-count">正式账号 cohort</span></div>
        <p className="admin-form-hint">游客体验独立统计，不与手机号/正式邮箱账号混算；历史估算注册时间不进入转化分母。</p>
        <div className="admin-funnel-stages">
          <article><span>注册后满 7 日用户</span><b>{activation.denominator ?? 0}</b><small>成熟观察样本</small></article>
          <i>→</i>
          <article><span>7 日内成功生成</span><b>{activation.numerator ?? 0}</b><small>{rateText(activation.rate)} · 按用户去重</small></article>
          <i>→</i>
          <article><span>注册后满 30 日用户</span><b>{paid.denominator ?? 0}</b><small>成熟观察样本</small></article>
          <i>→</i>
          <article><span>30 日内会员 / 次数付费</span><b>{paid.numerator ?? 0}</b><small>{rateText(paid.rate)} · 退款排除</small></article>
        </div>
        <small className="admin-funnel-footnote">激活=注册后 7 天内至少 1 条 completed 生成；付费=注册后 30 天内至少 1 笔有效 MEMBERSHIP 订单。服务、分站和代理充值不计入该付费转化。</small>
      </section>

      <div className="admin-dashboard-grid">
        <section className="admin-panel"><div className="admin-panel-head"><div><span className="admin-eyebrow">NEEDS ATTENTION</span><h2>最近生成失败</h2></div><button onClick={onGenerations}>查看记录 →</button></div>{stats.recentFailures?.length ? <div className="admin-list">{stats.recentFailures.map((row) => <div className="admin-list-row" key={row.id}><div className="admin-row-main"><StatusBadge status="failed" /><b>{row.templateName || row.modelName || "生成任务"}</b><small>{displayUser(row.user)} · {fmtDate(row.createdAt)}{row.count > 1 ? ` · 最近样本重复 ${row.count} 次` : ""}</small></div><span className="admin-error-text">{row.failureReason || "未记录失败原因"}</span></div>)}</div> : <Empty title="暂时没有失败任务" text="近期没有新增失败" />}</section>
        <section className="admin-panel"><div className="admin-panel-head"><div><span className="admin-eyebrow">RECENT ACTIVITY</span><h2>最近管理操作</h2></div><button onClick={onAudit}>查看日志 →</button></div>{recentAudits.length ? <div className="admin-list">{recentAudits.map((row) => <div className="admin-list-row" key={row.id}><div className="admin-row-main"><b>{row.action}</b><small>{row.actor?.phone || row.actor?.name || "管理员"} · {row.targetType} · {fmtDate(row.createdAt)}</small></div></div>)}</div> : <Empty title="暂无近期操作" />}</section>
      </div>
      <section className="admin-panel admin-latest-signups"><div className="admin-panel-head"><div><span className="admin-eyebrow">LATEST ACCOUNTS</span><h2>最近新账号</h2></div><button onClick={onUsers}>用户管理 →</button></div><div className="admin-dashboard-grid"><div><b className="admin-subsection-title">正式注册</b>{stats.recentRegistrations?.length ? stats.recentRegistrations.map((u) => <div className="admin-list-row" key={u.id}><div className="admin-row-main"><b>{displayUser(u)}</b><small>{fmtDate(u.createdAt)} · {u.phone ? "手机" : "邮箱"}</small></div></div>) : <Empty title="暂无正式注册" />}</div><div><b className="admin-subsection-title">游客体验</b>{stats.recentGuests?.length ? stats.recentGuests.map((u) => <div className="admin-list-row" key={u.id}><div className="admin-row-main"><b>{u.email}</b><small>{fmtDate(u.createdAt)} · 游客账号</small></div></div>) : <Empty title="暂无游客体验" />}</div></div><small className="admin-funnel-footnote">历史估算账号：{stats.estimatedUsers ?? 0} 个，日期不用于转化率计算。</small></section>
    </div>
  );
}


function Filters({ children, onSearch }) { return <div className="admin-filters">{children}<button className="primary" onClick={onSearch}>应用筛选</button></div>; }

function Users({ users, filters, setFilters, onSearch, onOpen, onGrant }) {
  return <section className="admin-panel"><div className="admin-panel-head"><div><span className="admin-eyebrow">CUSTOMERS</span><h2>用户管理</h2></div><span className="admin-count">{users.length} 条</span></div><Filters onSearch={onSearch}><input placeholder="手机号 / 邮箱 / 昵称 / 邀请码" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /><select value={filters.membership} onChange={(e) => setFilters({ ...filters, membership: e.target.value })}><option value="">全部会员</option><option value="NONE">未开通</option><option value="STANDARD">体验卡</option><option value="HIGH">高清</option><option value="FLAGSHIP">旗舰</option></select></Filters><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>用户</th><th>注册时间</th><th>会员</th><th>余额</th><th>邀请</th><th>订单/生成</th><th>操作</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><button className="admin-link" onClick={() => onOpen(user.id)}><b>{displayUser(user)}</b><small>{user.name || user.email || user.id.slice(0, 12)}{user.email?.endsWith("@guest.local") ? " · 游客" : ""}</small></button></td><td>{user.createdAt ? fmtDate(user.createdAt) : "—"}</td><td><StatusBadge status={user.membership} /><small>{user.membershipExpiresAt ? `${fmtDate(user.membershipExpiresAt)} 到期` : "无到期时间"}</small></td><td><strong className={user.credits <= 3 ? "admin-warn-text" : ""}>{user.credits}</strong> 次</td><td>{user._count?.referrals || 0} 人</td><td>{user._count?.orders || 0} / {user._count?.generations || 0}</td><td><button className="admin-small-button" onClick={() => onGrant(user)}>开通权益</button></td></tr>)}</tbody></table>{!users.length && <Empty />}</div></section>;
}

function Orders({ orders, filters, setFilters, onSearch, onUpdate, onUpdateDelivery, form, setForm, onCreate, userQuery, userMatches, onUserQuery, onChooseUser }) {
  return <div className="admin-stack">
    <section className="admin-panel">
      <div className="admin-panel-head"><div><span className="admin-eyebrow">PAYMENTS & DELIVERY</span><h2>订单中心</h2></div><span className="admin-count">{orders.length} 条</span></div>
      <Filters onSearch={onSearch}>
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">全部支付状态</option><option value="PENDING">待处理</option><option value="PAID">已支付</option><option value="REFUNDED">已退款</option><option value="CANCELLED">已取消</option></select>
        <select value={filters.orderType} onChange={(e) => setFilters({ ...filters, orderType: e.target.value })}><option value="">全部商品类型</option><option value="MEMBERSHIP">会员/次数</option><option value="SERVICE">人工服务</option><option value="SITE_ORDER">分站订单</option><option value="AGENT_RECHARGE">代理充值</option></select>
        <select value={filters.deliveryStatus} onChange={(e) => setFilters({ ...filters, deliveryStatus: e.target.value })}><option value="">全部交付状态</option>{Object.entries(deliveryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <input placeholder="搜索用户、服务、订单或备注" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
      </Filters>
      <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>订单</th><th>用户 / 联系</th><th>金额</th><th>支付</th><th>交付</th><th>时间</th><th>操作</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><b>{order.planName}</b><small>{order.orderType || "MEMBERSHIP"} · {order.channel} · {order.id.slice(0, 12)}</small></td><td>{displayUser(order.user)}{order.accountHint && <small>{order.accountHint}</small>}{!order.user && <small>需要绑定用户</small>}</td><td><strong>{money(order.amount)}</strong></td><td><StatusBadge status={order.status} /></td><td>{order.orderType === "SERVICE" ? <select className="admin-inline-select" value={order.deliveryStatus || "NOT_STARTED"} onChange={(event) => onUpdateDelivery(order, event.target.value)}>{Object.entries(deliveryLabels).filter(([value]) => value !== "NOT_REQUIRED").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <span className="admin-muted">无需交付</span>}</td><td>{fmtDate(order.createdAt)}{order.note && <small title={order.note}>{order.note.slice(0, 28)}</small>}</td><td>{order.status === "PENDING" ? <button className="admin-small-button" disabled={order.orderType !== "SERVICE" && !order.userId} onClick={() => onUpdate(order, "PAID")}>{order.orderType === "SERVICE" || order.userId ? "确认收款" : "未绑定用户"}</button> : order.status === "PAID" ? <button className="admin-small-button" onClick={() => requestRefund(order)}>登记退款</button> : <span className="admin-muted">—</span>}</td></tr>)}</tbody></table>{!orders.length && <Empty />}</div>
    </section>
    <section className="admin-panel"><div className="admin-panel-head"><div><span className="admin-eyebrow">MANUAL ENTRY</span><h2>登记人工订单</h2></div></div><form className="admin-form-grid" onSubmit={onCreate}><label className="admin-user-picker-label">付款用户<input value={userQuery} onChange={(e) => onUserQuery(e.target.value)} placeholder="输入手机号 / 邮箱 / 昵称搜索" />{userMatches.length > 0 && <div className="admin-user-picker">{userMatches.map((user) => <button type="button" key={user.id} onClick={() => onChooseUser(user)}><b>{displayUser(user)}</b><small>{user.membership} · {user.credits} 次 · ID {user.id.slice(0, 8)}</small></button>)}</div>}{form.userId && <small className="admin-selected-user">已绑定用户：{form.userId.slice(0, 12)}</small>}</label><label>渠道<select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}><option value="APPRECIATION">赞赏码</option><option value="WEIDIAN">微店</option><option value="MANUAL">人工兜底</option></select></label><label>商品<select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>{plans.map((plan) => <option key={plan} value={plan}>{planLabels[plan]}</option>)}</select></label><label>备注 / 微信号<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="微信号、付款留言、外部订单号" /></label><button className="primary" type="submit">创建待处理订单</button></form><p className="admin-form-hint">服务订单确认收款后不会发放会员或生成次数，需要在上方单独推进交付状态。</p></section>
  </div>;
}

function Generations({ rows, filters, setFilters, onSearch, onOpen }) {
  return <section className="admin-panel"><div className="admin-panel-head"><div><span className="admin-eyebrow">AI JOBS</span><h2>生成记录</h2></div><span className="admin-count">{rows.length} 条</span></div><Filters onSearch={onSearch}><input placeholder="用户 / 场景 / 任务 ID" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">全部状态</option><option value="completed">成功</option><option value="processing">处理中</option><option value="failed">失败</option></select><select value={filters.tier} onChange={(e) => setFilters({ ...filters, tier: e.target.value })}><option value="">全部档位</option><option value="standard">标准</option><option value="high">高清</option><option value="flagship">旗舰</option></select></Filters><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>任务</th><th>用户</th><th>档位/模型</th><th>状态</th><th>消耗</th><th>时间</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.templateName || row.category || "生活展示面"}</b><small>{row.id.slice(0, 12)} · {row.provider || "—"}</small></td><td><button className="admin-link" onClick={() => onOpen(row.userId)}>{displayUser(row.user)}</button></td><td><StatusBadge status={row.modelName} /><small>{row.actualModel || "模型待记录"}</small></td><td><StatusBadge status={row.status} />{row.failureReason && <small className="admin-error-text">{row.failureReason.slice(0, 80)}</small>}</td><td>{row.creditCost} 次</td><td>{fmtDate(row.createdAt)}</td></tr>)}</tbody></table>{!rows.length && <Empty />}</div></section>;
}

function Circle({ posts, pending, onModerate }) { return <section className="admin-panel"><div className="admin-panel-head"><div><span className="admin-eyebrow">COMMUNITY</span><h2>圈子审核</h2></div><span className="admin-count">待审 {pending.length}</span></div><div className="admin-review-list">{posts.map((post) => <article className="admin-review-card" key={post.id}>{post.imageUrl && <img src={post.imageUrl} alt="" />}<div><div className="admin-review-meta"><StatusBadge status={post.status} /><span>{post.isSeed ? "精选示例" : displayUser(post.user)} · {fmtDate(post.createdAt)}</span></div><p>{post.content}</p>{post.status === "PENDING" && <div className="admin-row-actions"><button className="admin-small-button" onClick={() => onModerate(post, "PUBLISHED")}>通过发布</button><button className="admin-danger-button" onClick={() => onModerate(post, "REJECTED")}>驳回</button></div>}</div></article>)}{!posts.length && <Empty />}</div></section>; }

function Subsites({ subsites, notify, onReload }) {
  const emptyForm = { ownerPhone: "", slug: "", siteName: "", payMode: "platform", epayPid: "", epayKey: "", epayApiUrl: "", grantCredits: "88", note: "" };
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [grantTarget, setGrantTarget] = useState(null);
  const [grantCredits, setGrantCredits] = useState("");
  const [grantNote, setGrantNote] = useState("");
  const [settleTarget, setSettleTarget] = useState(null);
  const [settleOrders, setSettleOrders] = useState([]);
  const [settleAmounts, setSettleAmounts] = useState({});
  const [settleLoading, setSettleLoading] = useState(false);
  const [payRequests, setPayRequests] = useState([]);
  const [qrViewer, setQrViewer] = useState(null);
  useEffect(() => { fetch("/api/admin/site-settlement-requests?status=PENDING").then(async (r) => { const d = await r.json().catch(() => ({})); if (r.ok) setPayRequests(d.data || []); }).catch(() => {}); }, []);
  async function markRequestPaid(req) {
    if (!window.confirm(`确认已向 ${req.siteName}（${req.agentPhoneTail}）打款 ¥${(req.amount / 100).toFixed(2)}？`)) return;
    try {
      const r = await fetch(`/api/admin/site-settlement-requests/${req.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "MARK_PAID" }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      notify(`已登记打款 ¥${(req.amount / 100).toFixed(2)}，${data.data.ordersSettled} 笔订单转为已结算`);
      setPayRequests((list) => list.filter((item) => item.id !== req.id));
      onReload();
    } catch (e) { notify(e.message, "error"); }
  }
  async function toggle(subsite) { try { const action = subsite.status === "ACTIVE" ? "SUSPEND" : "ACTIVATE"; const r = await fetch(`/api/admin/subsites/${subsite.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); const data = await r.json(); if (!r.ok) throw new Error(data.error); notify(action === "SUSPEND" ? "分站已停用" : "分站已启用"); onReload(); } catch (e) { notify(e.message, "error"); } }
  async function createSubsite(event) {
    event.preventDefault();
    setCreating(true);
    try {
      const r = await fetch("/api/admin/subsites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      notify(`分站已开通：${data.data.siteUrl} · HTTPS 证书自动签发中，约 20 秒后生效`);
      setForm(emptyForm);
      onReload();
    } catch (e) { notify(e.message, "error"); } finally { setCreating(false); }
  }
  async function submitGrant(event) {
    event.preventDefault();
    if (!grantTarget) return;
    const credits = Math.trunc(Number(grantCredits));
    if (!Number.isFinite(credits) || credits === 0) { notify("划转积分必须是非 0 整数", "error"); return; }
    if (credits < 0 && !window.confirm(`确认从 ${grantTarget.siteName} 的代理账户扣减 ${Math.abs(credits)} 积分？`)) return;
    try {
      const r = await fetch(`/api/admin/subsites/${grantTarget.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "GRANT", credits, note: grantNote }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      notify(`已划转 ${credits} 积分`);
      setGrantTarget(null); setGrantCredits(""); setGrantNote("");
      onReload();
    } catch (e) { notify(e.message, "error"); }
  }
  async function openSettle(subsite) {
    setSettleTarget(subsite);
    setSettleLoading(true);
    try {
      const r = await fetch(`/api/admin/subsites/${subsite.id}/settlements?status=PENDING`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setSettleOrders(data.data || []);
      setSettleAmounts(Object.fromEntries((data.data || []).map((o) => [o.id, String(o.agentShareAmount ?? o.amount ?? "")])));
    } catch (e) { notify(e.message, "error"); } finally { setSettleLoading(false); }
  }
  async function settleOrder(order) {
    const amount = Math.trunc(Number(settleAmounts[order.id]));
    if (!Number.isFinite(amount) || amount < 0) { notify("应结金额需为非负整数（分）", "error"); return; }
    try {
      const r = await fetch(`/api/admin/subsites/${settleTarget.id}/settlements`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, settlementAmount: amount, note: `按实付 70% 登记应结代理款` }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      notify(`订单 ${order.id.slice(-6)} 已登记结算`);
      setSettleOrders((list) => list.filter((item) => item.id !== order.id));
      onReload();
    } catch (e) { notify(e.message, "error"); }
  }
  return <section className="admin-panel">
    <div className="admin-panel-head"><div><span className="admin-eyebrow">PARTNERS</span><h2>分站管理</h2></div><span className="admin-count">{subsites.length} 个</span></div>
    {payRequests.length > 0 && (
      <section className="admin-panel" style={{ marginBottom: 14, borderColor: "rgba(213,170,96,.5)" }}>
        <div className="admin-panel-head"><div><span className="admin-eyebrow">PAYOUT REQUESTS</span><h2>代理打款申请</h2></div><span className="admin-count">{payRequests.length} 笔</span></div>
        {payRequests.map((req) => (
          <div className="admin-list-row" key={req.id} style={{ borderTop: "1px solid #2a2d2d", paddingTop: 10, marginTop: 10 }}>
            <img src={req.collectQrUrl} alt="代理收款码" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, cursor: "pointer" }} onClick={() => setQrViewer(req.collectQrUrl)} />
            <div className="admin-row-main"><b>{req.siteName} · ¥{(req.amount / 100).toFixed(2)}</b><small>{req.siteUrl} · {req.agentPhoneTail} · {req.orderCount} 单 · {fmtDate(req.createdAt)}{req.note ? ` · ${req.note}` : ""}</small></div>
            <button className="primary" onClick={() => markRequestPaid(req)}>已打款</button>
          </div>
        ))}
        <p className="admin-form-hint">点收款码可放大查看；线下扫码打款后点「已打款」，该批订单自动转为已结算并写审计日志。</p>
      </section>
    )}
    {qrViewer && (
      <div onClick={() => setQrViewer(null)} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.82)", display: "grid", placeItems: "center", cursor: "zoom-out" }}>
        <img src={qrViewer} alt="收款码大图" style={{ maxWidth: "86vw", maxHeight: "86vh", borderRadius: 12, background: "#fff", padding: 8 }} />
      </div>
    )}
    <form className="admin-form-grid" onSubmit={createSubsite}>
      <label>代理手机号（需已注册）<input value={form.ownerPhone} onChange={(e) => setForm({ ...form, ownerPhone: e.target.value.trim() })} placeholder="代理在本站的注册手机号" /></label>
      <label>子域前缀 slug<input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.trim().toLowerCase() })} placeholder="仅小写字母/数字/中划线" />{form.slug && <small>站址：{form.slug}.face.shuqizhisou.cc</small>}</label>
      <label>站名<input value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} placeholder="如：阿磊的形象小站" /></label>
      <label>收款方式<select value={form.payMode} onChange={(e) => setForm({ ...form, payMode: e.target.value })}><option value="platform">平台代收（用我的商户 · 人工结算）</option><option value="own">代理自有易支付商户</option></select></label>
      {form.payMode === "own" && (<>
        <label>商户 PID<input value={form.epayPid} onChange={(e) => setForm({ ...form, epayPid: e.target.value.trim() })} placeholder="代理的易支付商户 ID" /></label>
        <label>商户密钥<input type="password" value={form.epayKey} onChange={(e) => setForm({ ...form, epayKey: e.target.value.trim() })} placeholder="代理的易支付商户密钥" /></label>
        <label>易支付网关（可选）<input value={form.epayApiUrl} onChange={(e) => setForm({ ...form, epayApiUrl: e.target.value.trim() })} placeholder="默认与平台相同" /></label>
      </>)}
      <label>开户赠送积分<input type="number" min="0" value={form.grantCredits} onChange={(e) => setForm({ ...form, grantCredits: e.target.value })} /></label>
      <label>备注（可选）<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="分成比例、联系方式、协议要点" /></label>
      <button className="primary" type="submit" disabled={creating}>{creating ? "开通中…" : "开通分站"}</button>
    </form>
    <p className="admin-form-hint">分账规则：按客户实付 70/30。平台代收：货款进平台，代理 70% 记入待结算，由你在下方逐单登记打款；自有商户：货款直达代理，下单即预扣代理积分余额的 30% 平台供货费（积分不足拒绝下单）。</p>
    {grantTarget && (
      <form className="admin-form-grid" onSubmit={submitGrant}>
        <label>给「{grantTarget.siteName}」划转积分（正数划入 / 负数扣回）<input value={grantCredits} onChange={(e) => setGrantCredits(e.target.value)} placeholder="如 200 或 -50" /></label>
        <label>备注<input value={grantNote} onChange={(e) => setGrantNote(e.target.value)} placeholder="充值到账、活动补贴、协议扣回等" /></label>
        <button className="primary" type="submit">确认划转</button>
        <button className="admin-small-button" type="button" onClick={() => { setGrantTarget(null); setGrantCredits(""); setGrantNote(""); }}>取消</button>
      </form>
    )}
    {settleTarget && (
      <div className="admin-panel" style={{ marginTop: 12 }}>
        <div className="admin-panel-head"><div><span className="admin-eyebrow">SETTLEMENT</span><h3>{settleTarget.siteName} · 平台代收待结算</h3></div><button className="admin-small-button" onClick={() => setSettleTarget(null)}>收起</button></div>
        {settleLoading ? <Loading /> : settleOrders.length ? settleOrders.map((order) => (
          <div className="admin-form-grid" key={order.id} style={{ borderTop: "1px solid #2a2d2d", paddingTop: 10, marginTop: 10 }}>
            <label>订单（{order.paidAt ? new Date(order.paidAt).toLocaleDateString("zh-CN") : "—"} · 实付 {money(order.amount)} · 代理 70% 建议值 {money(order.agentShareAmount ?? 0)}）<input value={settleAmounts[order.id] ?? ""} onChange={(e) => setSettleAmounts({ ...settleAmounts, [order.id]: e.target.value })} placeholder="实际打给代理的金额（分）" />{order.buyerTail && <small>买家 {order.buyerTail}{order.tradeTail ? ` · 流水尾号 ${order.tradeTail}` : ""}</small>}</label>
            <button className="primary" type="button" onClick={() => settleOrder(order)}>确认已打款</button>
          </div>
        )) : <Empty title="没有待结算订单" text="平台代收的已付订单结算后都会归档在这里" />}
      </div>
    )}
    <p className="admin-intro">这里管理代理分站、代理积分和分站状态。涉及积分划转时请同时核对审计日志。</p>
    <div className="admin-subsite-grid">{subsites.map((subsite) => <article className="admin-subsite-card" key={subsite.id}><div><StatusBadge status={subsite.status} /><h3>{subsite.siteName}</h3><p>{subsite.siteUrl} · {subsite.ownerPhoneTail}{subsite.payMode === "platform" ? " · 平台代收" : " · 自有收款"}</p>{subsite.payMode === "platform" && (subsite.pendingSettleCount > 0 ? <small>待结算 {subsite.pendingSettleCount} 单 · 约 {money(subsite.pendingSettleAmount)}</small> : <small>暂无待结算订单</small>)}</div><strong className={subsite.credits <= 20 ? "admin-balance-low" : ""}>{subsite.credits} <small>积分</small></strong><span>自有 {subsite.ownPaidOrders || 0} 单 {money(subsite.ownPaidSum || 0)} · 代收 {subsite.platformPaidOrders || 0} 单 {money(subsite.platformPaidSum || 0)}</span><button className="admin-small-button" onClick={() => { setGrantTarget(subsite); setGrantCredits(""); setGrantNote(""); }}>划转积分</button>{subsite.payMode === "platform" && <button className="admin-small-button" onClick={() => openSettle(subsite)}>结算登记{subsite.pendingSettleCount > 0 ? `（${subsite.pendingSettleCount}）` : ""}</button>}<button className="admin-small-button" onClick={() => toggle(subsite)}>{subsite.status === "ACTIVE" ? "停用分站" : "重新启用"}</button></article>)}</div>
    {!subsites.length && <Empty />}
  </section>;
}

function Audit({ logs, filters, setFilters, onSearch }) { return <section className="admin-panel"><div className="admin-panel-head"><div><span className="admin-eyebrow">AUDIT TRAIL</span><h2>操作日志</h2></div><span className="admin-count">{logs.length} 条</span></div><Filters onSearch={onSearch}><input placeholder="操作、对象、管理员" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></Filters><div className="admin-audit-list">{logs.map((log) => <details key={log.id}><summary><b>{log.action}</b><span>{log.actor?.phone || log.actor?.name || "管理员"} · {log.targetType} · {fmtDate(log.createdAt)}</span></summary><pre>{JSON.stringify(log.detail || {}, null, 2)}</pre></details>)}{!logs.length && <Empty />}</div></section>; }

function UserDrawer({ user, onClose, onOpenUser }) { return <div className="admin-drawer-layer"><button className="admin-drawer-scrim" onClick={onClose} aria-label="关闭用户详情" /><aside className="admin-drawer"><header><div><span className="admin-eyebrow">USER PROFILE</span><h2>{displayUser(user)}</h2><small>{user.email || user.name || user.id}</small></div><button onClick={onClose}>×</button></header><div className="admin-drawer-summary"><div><span>会员</span><b>{user.membership}</b></div><div><span>余额</span><b>{user.credits} 次</b></div><div><span>邀请</span><b>{user.referralCount || user.referrals?.length || 0} 人</b></div></div><section><h3>基本状态</h3><p><StatusBadge status={user.role} /> {user.membershipExpiresAt ? `${fmtDate(user.membershipExpiresAt)} 到期` : "暂无会员到期时间"}</p></section><section><h3>最近订单</h3>{user.orders?.slice(0, 5).map((order) => <div className="admin-drawer-row" key={order.id}><span>{order.planName}<small>{fmtDate(order.createdAt)}</small></span><strong>{money(order.amount)} <StatusBadge status={order.status} /></strong></div>) || <Empty />}</section><section><h3>最近生成</h3>{user.generations?.slice(0, 5).map((row) => <div className="admin-drawer-row" key={row.id}><span>{row.templateName || row.modelName}<small>{fmtDate(row.createdAt)}</small></span><StatusBadge status={row.status} /></div>) || <Empty />}</section><section><h3>积分流水</h3>{user.ledger?.slice(0, 8).map((row) => <div className="admin-drawer-row" key={row.id}><span>{row.reason}<small>{fmtDate(row.createdAt)}</small></span><strong className={row.amount < 0 ? "admin-warn-text" : "admin-success-text"}>{row.amount > 0 ? "+" : ""}{row.amount}</strong></div>) || <Empty />}</section><section><h3>邀请关系</h3><p className="admin-intro">邀请码：{user.inviteCode || "未生成"} · 已邀请 {user.referralCount || 0} 人</p>{user.referredBy && <button className="admin-link" onClick={() => onOpenUser(user.referredBy.id)}>由 {displayUser(user.referredBy)} 邀请</button>}</section></aside></div>; }
