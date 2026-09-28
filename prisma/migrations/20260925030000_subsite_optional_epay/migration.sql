-- 分站支持平台代收：epay 三字段改为可空，空 = 用平台主收款、不扣代理积分、与代理人工结算
ALTER TABLE "Subsite" ALTER COLUMN "epayPid" DROP NOT NULL;
ALTER TABLE "Subsite" ALTER COLUMN "epayKey" DROP NOT NULL;
ALTER TABLE "Subsite" ALTER COLUMN "epayApiUrl" DROP NOT NULL;
