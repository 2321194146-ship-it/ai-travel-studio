# 分站代理系统 · 开发契约（所有开发者必读）

项目：/Users/lijie/DoubaoWork/chats/2026-08-27/new-chat/face-maker/ai-travel-studio
技术栈：Next.js 16 App Router + React 19 + Tailwind 4 + Prisma 7(@prisma/adapter-pg) + NextAuth v4 JWT（手机号+密码）
生产：https://face.shuqizhisou.cc（PM2/服务器部署由总控负责，**你禁止 deploy**）

## 业务模型（2026-09-25 更新，以此为准）

- 开户：管理员在 admin 创建 Subsite（代理必须已注册），默认送 88 积分。
  历史上的"880 元开户费"是**系统外人工收款**，系统不做收款核验；两者不得混同表述。
- 收款二选一，创建时冻结，创建后由收款方式决定：
  - **自有商户（AGENT）**：填代理自己的易支付 PID/KEY/网关（三件必须同时填写）。客户钱直达代理。
    分账规则 = **按客户实付金额 70/30**：平台 30% 在下单时从代理积分余额预扣（1 积分=100 分，向上取整），
    支付成功转已扣；订单取消释放预扣；退款冲回。余额不足 → 下单直接拒绝（积分不足）。
  - **平台代收（PLATFORM）**：三字段全空，客户钱进平台主商户。客户照常拿权益；**代理 70% 份额记入
    订单 `agentShareAmount`、状态 PENDING**，由管理员在后台逐单登记实际结算金额（SETTLED）后闭环。
    系统不做自动打款/提现。
- 分站可售 SKU：single_std ¥29.90 / single_hd ¥39.90 / single_flag ¥69.90（tenantOnly）。
  注意：SKU 的 credits(2/4/6) 只是客户获得的生成次数，**不再是代理扣款数**；代理扣款一律用订单上的
  platformFeeCredits 快照。
- 代理充值：agent_pack_200/500（1元=1积分），仅分站主人可购，走平台主收款。
- 积分账本统一 CreditLedger：SITE_OPEN_BONUS / SITE_ORDER_RESERVE / SITE_ORDER_RELEASE /
  SITE_ORDER_REVERSAL / SITE_GRANT / PAYMENT / INVITE_REWARD 等。

## 分站订单账务状态机（siteLedgerStatus）

- NOT_REQUIRED：非分站单或历史单（未参与新账务）
- RESERVED：下单预扣平台 30%（仅 AGENT，事务内扣积分+流水）
- CHARGED：支付成功（回调或人工确认，同一结算函数）
- RELEASED：PENDING 取消，释放预扣
- PLATFORM_DUE：平台代收已付、代理 70% 待人工结算
- REVERSED：已退款冲正（AGENT 回补预扣；PLATFORM 关闭待结算，已结算单必须人工处理）

人工确认收款（admin orders PATCH PAID）与网关回调共用 `settleSiteOrderOnPaid`；
退款登记（PATCH REFUNDED）必须带 `refundConfirmed: true`（表示网关/线下已实际退款），同一事务内：
1. `clawbackCredits` 收回买家该订单发放的生成次数（余额不足扣到 0；会员天数/档位不自动收回，人工个案处理）
2. `reverseSiteOrderOnRefund` 冲正代理侧（AGENT 回补预扣平台份额；PLATFORM 关闭待结算，已 SETTLED 的单拒绝自动冲正）；
PENDING 取消（PATCH CANCELLED）释放 `releaseSiteFee` 预扣。

## 数据模型要点

- `ManualOrder` 新增：collectionMode(PLATFORM/AGENT)、collectionPid、platformFeeBps/Amount、
  agentShareAmount、platformFeeCredits、siteCreditsReservedAt/ReleasedAt、
  settlementStatus(NOT_REQUIRED/PENDING/SETTLED)、settlementAmount/Note、settledAt/ById、
  siteLedgerStatus。迁移：20260925040000_subsite_order_accounting（单次前滚）。
- `Subsite.epayPid/Key/ApiUrl` 可空；own 判定 = 三件齐全（部分填写是配置错误，创建 API 已拒绝）。
- 历史分站订单只回填可推断的 collectionMode，不伪造 70/30 快照。

## 租户识别（唯一真相源）

- 生产：nginx 泛域名 vhost（sites-enabled/face-tenant.nginx）把 `{slug}.face.shuqizhisou.cc`
  的请求注入 `x-tenant-slug` 头 → `src/lib/subsite.js getSubsiteFromRequest`。
- 返回 { kind: MAIN|ACTIVE|SUSPENDED|INVALID }：MAIN=无头；带头但未知/暂停 = INVALID/SUSPENDED，
  checkout 对租户专属商品明确拒绝（404/403），**绝不降级为主站交易**。
- 分站地址统一 `{slug}.face.shuqizhisou.cc`（pages.dev 已废弃）。

## HTTPS 状态（发布门槛）

- 当前证书只覆盖 face.shuqizhisou.cc，`*.face.shuqizhisou.cc` 通配符证书未签发；
  子域目前只有 HTTP 可用。**未签发通配符证书前，不生成 HTTPS 支付回跳以外的新承诺，
  不对外宣称分站正式上线。** 需要 Cloudflare Zone DNS-01 权限才能补齐。

## 支付验签与回调校验

- 先按 out_trade_no 查订单 → AGENT 订单用该 Subsite.epayKey 验签，其余用平台 env 密钥。
- 校验回调 pid：AGENT 必须等于订单 collectionPid（= 代理 PID）；PLATFORM/主站必须等于平台 EPAY_PID。
- 金额校验：回调 money == order.amount；订单创建时已冻结分账快照，回调不再重算比例。

## 代理充值

- agent_pack_*：仅分站主人可购，永远平台主收款，订单不挂 subsiteId（回调不会误扣供货）。

## 新 API 契约

- GET /api/subsite/center（登录+拥有Subsite）：{ subsite:{slug,siteName,status,siteUrl,payMode}, credits,
  orders:[{id,planName,amount,status,createdAt,buyerTail,tradeTail,platformFeeCredits,settlementStatus,settlementAmount}] }
- GET /api/subsite/info（公开，读 x-tenant-slug）：{ slug, siteName, status }；MAIN 返回 data:null
- GET /api/admin/subsites：[{ id,slug,siteName,status,siteUrl,payMode,ownerPhoneTail,ownerPhone,credits,
  ownPaidOrders,ownPaidSum,platformPaidOrders,platformPaidSum,pendingSettleCount,pendingSettleAmount,createdAt }]
- POST /api/admin/subsites：{ ownerPhone,slug,siteName,payMode,epayPid?,epayKey?,epayApiUrl?,grantCredits=88,note? }
  （响应永不包含 epayKey）
- PATCH /api/admin/subsites/[id]：{ action:"SUSPEND"|"ACTIVATE"|"GRANT", credits?, note? }
- GET /api/admin/subsites/[id]/settlements?status=PENDING|SETTLED|ALL：平台代收结算明细
- PATCH /api/admin/subsites/[id]/settlements：{ orderId, settlementAmount, note? }（SETTLED 登记，审计留痕）
- PATCH /api/admin/orders/[id]：{ status:"PAID"|"CANCELLED"|"REFUNDED", refundConfirmed?（退款必填 true，登记后自动收回买家生成次数）, ... }

## 代码风格

- 跟随现有文件风格（中文注释稀疏、双引号、同样错误处理模式），禁止顺手重构，禁止超范围改动
- 所有新金额单位=分；积分增减必须写 CreditLedger（balance=变更后余额）
- 安全：admin API 必须校验 ADMIN 角色；subsite center 校验会话本人；任何 API 不回传 epayKey

## 已知边界 / 未做

- 平台代收的"打款给代理"是系统外动作，系统只登记；没有自动分账、没有提现。
- 退款：系统只做账务冲正与状态登记，网关退款需人工在易支付后台操作后勾选 refundConfirmed。
- 多级返佣 / 代理推荐奖励：未实现也不在分站体系内。
