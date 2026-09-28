import Link from "next/link";

const rules = [
  ["服务内容", "型男制造机提供 AI 形象诊断、发型与穿搭试穿、生活展示面生成、照片档案和相关内容服务。AI 结果需要你自行判断和使用，平台不保证特定颜值、脱单、涨粉、变现或商业结果。"],
  ["账号与支付", "请使用真实、可联系的账号信息并妥善保管密码。套餐、生成额度、会员档位和失败退款以产品页面及服务端实际记录为准。订单、支付、退款和对账可能需要保留必要记录。"],
  ["图片与内容", "你必须拥有上传照片、穿搭图和其他素材的合法使用权。不得上传违法、侵权、骚扰、欺诈、色情或危害他人的内容。平台可对违反规则的内容限制处理或停止服务。"],
  ["生成结果", "生成结果可能存在脸部、手部、文字、服装或场景错误。平台会按实际服务记录处理失败退款，但不对第三方模型输出的完整性、准确性或适用性作绝对保证。"],
  ["服务中心与合作", "训练营、资料课、咨询、社群和合作申请必须以页面显示的开放状态为准。合作申请不等于加盟成立；在合同、收款、审核和开站流程完成前，不代表已经获得分站或代理资格。平台不提供多级返佣或以发展人员作为收益依据。"],
  ["联系我们", "如遇订单、数据或内容问题，请通过应用内服务中心提交反馈。条款与隐私说明会根据产品和法律要求更新，继续使用服务即表示你已看到更新后的内容。"],
];

export default function TermsPage() {
  return <main className="mf-policy-shell"><header className="mf-policy-topbar"><Link href="/">‹ 返回首页</Link><span>型男制造机</span></header><article className="mf-policy-card"><span className="mf-auth-kicker">TERMS OF SERVICE</span><h1>服务条款</h1><p className="mf-policy-lede">请在使用 AI 诊断、图片生成、课程服务或合作申请前阅读本条款。</p>{rules.map(([title, text]) => <section key={title}><h2>{title}</h2><p>{text}</p></section>)}<div className="mf-policy-links"><Link href="/privacy">查看隐私说明</Link><Link href="/">返回产品</Link></div></article></main>;
}
