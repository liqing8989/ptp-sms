// 内容合规校验：批量发送前对消息内容做敏感词/违规词检测。
// coreWords 为核心违规词（冒充公检法、欺诈、涉黄涉政等），始终拦截；
// extendedWords 为扩展词库，仅当“内容审核”开关开启时额外校验。
const coreWords = [
  '公检法', '公安局', '检察院', '法院传票', '通缉令', '通缉', '洗黑钱', '洗钱', '安全账户',
  '资金冻结', '保证金', '公证费', '手续费先付', '冒充', '刷单', '兼职刷单', '博彩', '赌博',
  '六合彩', '时时彩', '彩票代购', '代开发票', '办证', '无抵押贷款', '套现', '信用卡提额',
  '中奖', '领奖先交', '验证码', '裸聊', '色情', '招嫖', '卖淫', '嫖娼', '约炮', '性服务',
  '吸毒', '冰毒', '枪支', '军火', '毒品', '钓鱼网站', '钓鱼链接', '盗号', '高收益', '稳赚不赔'
];

const extendedWords = [
  '领导人', '中央军委', '国务院', '中央纪委', '中南海', '两会', '党代会', '阅兵', '军费',
  '台湾独立', '藏独', '疆独', '法轮功', '退党', '全能神', '血腥', '恐怖袭击', '恐怖主义',
  '成人用品', '黄色视频', 'AV资源', '一夜情', '外围女', '包养', '代孕', '迷药', '催情',
  '股票内幕', '荐股', '原始股', '虚拟币投资', '外汇投资', '原油期货', '现货白银', 'P2P理财',
  '众筹返利', '拉人头', '发展下线', '金字塔', '高额返利', '充值返现', '秒到账'
];

function checkContent(text, needReview) {
  const t = String(text || '');
  const hit = (list) => list.find((w) => t.includes(w));
  const core = hit(coreWords);
  if (core) return { blocked: true, matched: core, level: 'core' };
  if (needReview) {
    const ext = hit(extendedWords);
    if (ext) return { blocked: true, matched: ext, level: 'extended' };
  }
  return { blocked: false, matched: null };
}

module.exports = { checkContent, coreWords, extendedWords };
