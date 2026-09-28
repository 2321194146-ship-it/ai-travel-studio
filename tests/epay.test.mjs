import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { signEpayParams, buildSubmitUrl, verifyNotifyParams } from "../src/lib/services/epay.js";

test("易支付签名：参数 ASCII 升序、空值与 sign 字段剔除、密钥直接拼接", () => {
  // 规范串按规则手写：money,name,out_trade_no,pid,type 升序；notify_url 为空不参与；sign/sign_type 剔除
  const spec = "money=29.90&name=标准生成卡&out_trade_no=abc123&pid=1000&type=alipay";
  const expected = crypto.createHash("md5").update(spec + "SECRETKEY", "utf8").digest("hex");
  const sign = signEpayParams(
    {
      pid: "1000",
      type: "alipay",
      out_trade_no: "abc123",
      notify_url: "",
      name: "标准生成卡",
      money: "29.90",
      sign: "TAMPERED",
      sign_type: "MD5",
    },
    "SECRETKEY",
  );
  assert.equal(sign, expected);
  assert.equal(sign.length, 32);
});

test("下单链接：指向网关 submit.php，携带签名与 MD5 类型", () => {
  const prev = { ...process.env };
  process.env.EPAY_PID = "1000";
  process.env.EPAY_KEY = "SECRETKEY";
  process.env.EPAY_API_URL = "https://pay.example.com/submit.php";
  process.env.EPAY_NOTIFY_URL = "https://app.example.com/api/checkout/epay/notify";
  process.env.EPAY_RETURN_URL = "https://app.example.com/pricing";
  try {
    const url = buildSubmitUrl({ orderNo: "ORDER1", name: "标准生成卡", moneyYuan: 29.9, type: "alipay" });
    assert.ok(url.startsWith("https://pay.example.com/submit.php?"));
    const u = new URL(url);
    assert.equal(u.searchParams.get("pid"), "1000");
    assert.equal(u.searchParams.get("out_trade_no"), "ORDER1");
    assert.equal(u.searchParams.get("money"), "29.90");
    assert.equal(u.searchParams.get("sign_type"), "MD5");
    assert.equal(u.searchParams.get("sign").length, 32);
  } finally {
    process.env = prev;
  }
});

test("回调验签：合法签名通过，篡改金额被拒绝", () => {
  const prev = process.env.EPAY_KEY;
  process.env.EPAY_KEY = "SECRETKEY";
  try {
    const params = {
      pid: "1000",
      trade_no: "GATE123",
      out_trade_no: "ORDER1",
      type: "alipay",
      name: "标准生成卡",
      money: "29.90",
      trade_status: "TRADE_SUCCESS",
    };
    const sign = signEpayParams(params, "SECRETKEY");
    const qs = new URLSearchParams({ ...params, sign, sign_type: "MD5" });

    const ok = verifyNotifyParams(qs);
    assert.ok(ok);
    assert.equal(ok.out_trade_no, "ORDER1");
    assert.equal(ok.trade_status, "TRADE_SUCCESS");

    const bad = new URLSearchParams({ ...params, money: "0.01", sign, sign_type: "MD5" });
    assert.equal(verifyNotifyParams(bad), null);

    const missing = new URLSearchParams({ ...params });
    assert.equal(verifyNotifyParams(missing), null);
  } finally {
    if (prev === undefined) delete process.env.EPAY_KEY;
    else process.env.EPAY_KEY = prev;
  }
});
