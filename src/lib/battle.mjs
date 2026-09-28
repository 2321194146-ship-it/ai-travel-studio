// 比帅大赛：邀请码、称号、槽点、奖励规则。
// 红线：奖励只发生成次数，不发钱不提现；邀请关系只做一层（referredById），无多级。

export function generateInviteCode() {
  // 8 位无易混淆字符（去 0O1I），读得出口、打得对
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

// 称号库：低分也要有梗、有面子——自嘲同样是传播
export function scoreTitle(score) {
  if (score >= 90) return "校级门面担当";
  if (score >= 80) return "街区刘德华";
  if (score >= 70) return "潜力股男一号";
  if (score >= 60) return "朴素老实人";
  return "神秘卧底";
}

export function scoreTitleSub(score) {
  if (score >= 90) return "建议直接出道，兄弟们跟我混";
  if (score >= 80) return "这条 gai 最帅的仔，不服来战";
  if (score >= 70) return "改造一下，直接起飞";
  if (score >= 60) return "帅得很低调，低调得有点过分";
  return "帅得太隐蔽，连 AI 都没找着";
}

// 惜败槽点库：随机抽取，具体槽点本身就是转发梗
export const TAUNT_LINES = [
  "AI 说你输在发际线管理",
  "AI 说你输在黑眼圈",
  "AI 说你拍照角度偷懒了",
  "AI 说你穿搭还在穿去年的",
  "AI 说你表情管理上线了但发型没上线",
  "AI 说你输在没睡醒的眼神里",
  "AI 说你差的是一杯奶茶的锐气",
];

export function pickTauntLine() {
  return TAUNT_LINES[Math.floor(Math.random() * TAUNT_LINES.length)];
}

// 降维打击：分差 >= 20 触发
export const CRUSH_GAP = 20;
export const CRUSH_LINE = "这不是比赛，这是降维打击";

// C 端裂变奖励：注册小甜头，付费才是大头。次数发到 CreditLedger，账目可查。
export const INVITE_REWARDS = {
  REGISTER_BONUS_INVITEE: 4, // 被邀请人注册额外 +4 次
  PAYMENT: {
    trial: 3,
    high: 10,
    flagship: 20,
    refill: 5,
  },
};

export function paymentRewardFor(planId) {
  return INVITE_REWARDS.PAYMENT[planId] || 0;
}
