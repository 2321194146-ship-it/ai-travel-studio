const MEMBERSHIP_NAMES = {
  STANDARD: "标准会员",
  HIGH: "高清会员",
  FLAGSHIP: "旗舰会员",
};

export function membershipCopy(user) {
  if (!user) {
    return { title: "未登录", subtitle: "登录后同步会员与生成次数" };
  }
  const title = MEMBERSHIP_NAMES[user.membership] || "未开通会员";
  const subtitle = user.membershipExpiresAt
    ? `有效期至 ${new Date(user.membershipExpiresAt).toLocaleDateString("zh-CN")}`
    : "购买套餐后开通会员";
  return { title, subtitle };
}

export function profileToolNames() {
  return ["照片档案", "生成记录", "购买记录", "兑换码"];
}
