-- 分站代理系统（2026-09-08 定稿）
-- 模式：880 开户送 88 积分；代理自收款（客户钱直达代理）；每单扣代理积分；1元=1积分，200起充
-- 规则：积分不足拦截下单；积分账本复用 CreditLedger（sourceType SITE_*）；提现概念不存在（钱不过平台）

-- 1) 分站表：一个代理一条
CREATE TABLE "Subsite" (
  id            String   @id @default(cuid())
  ownerId       String   @unique          // 代理用户（User.id）
  owner         User     @relation("SubsiteOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  slug          String   @unique          // 子域前缀，如 xiaoming → xiaoming.face.shuqizhisou.cc
  siteName      String                    // 分站显示名
  status        String   @default("ACTIVE") // ACTIVE / SUSPENDED
  // 代理自己的易支付收款配置（客户钱直达代理）
  epayPid       String
  epayKey       String                    // 代理商户密钥（明文存库仅代理本人/管理员可见）
  epayApiUrl    String
  // 充值套餐指引文案（代理在分站中心看到）
  note          String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([slug])
)

-- 2) User 反向关系
-- SubsiteOwner Subsite[]

-- 3) ManualOrder 增加分站归属（channel=EPAY 时，若下单人在分站域名下则记 subsiteId）
ALTER TABLE "ManualOrder" ADD COLUMN "subsiteId" String?;
ALTER TABLE "ManualOrder" ADD COLUMN "siteCreditsCost" Int @default(0); // 该订单扣了代理多少积分

-- 4) CreditLedger 新增 sourceType（无表结构变更）：
--    SITE_OPEN_BONUS   开户赠送（正）
--    SITE_ORDER_HOLD   分站订单扣积分（负）
--    SITE_GRANT        管理员划拨/充值（正）
--    SITE_ADJUST       管理员调整（正负均可）
--    sourceId = ManualOrder.id 或操作说明
