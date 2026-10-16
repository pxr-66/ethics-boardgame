// 行业事件卡：改编自真实行业事件，注明出处
// d: 对抽卡者的资源变化；all: 对所有人；hzBoom: 有隐患者额外受罚
const EVENTS = [
  { title: '芯片断供', icon: 'ban', text: '关键供应商受出口管制停止供货，产线告急。', d: { m: -2 }, src: '改编自 2019 年以来美国对华为等企业的出口管制' },
  { title: '技术封锁', icon: 'lock', text: '先进光刻机进口受限，只能另辟蹊径自主研发。', d: { m: -1, t: 2 }, src: '改编自 2023 年荷兰对 EUV/DUV 光刻机的出口限制' },
  { title: '双碳政策', icon: 'leaf', text: '国家推进碳达峰、碳中和，绿色工厂获得补贴。', d: { r: 1, m: 1 }, src: '改编自 2020 年中国"双碳"目标的提出' },
  { title: 'AI 算力爆发', icon: 'rocket', text: '大模型浪潮带来算力芯片订单暴涨！', d: { m: 3 }, src: '改编自 2023 年 ChatGPT 带动的 AI 芯片需求激增' },
  { title: '缺芯潮', icon: 'car', text: '全球汽车芯片短缺，车企高价抢货，你的产线满负荷。', d: { m: 2, t: 1 }, src: '改编自 2021 年全球汽车"缺芯潮"' },
  { title: '大基金入场', icon: 'landmark', text: '国家集成电路产业投资基金注资行业，所有人受益。', all: { m: 1 }, src: '改编自 2014 年起国家大基金一、二、三期' },
  { title: '质量暴雷', icon: 'triangle-alert', text: '行业爆出产品造假丑闻，监管全面排查。每个有隐患[h]的人 −3[m]，并清除隐患。', hzBoom: true, src: '改编自多起元器件翻新造假与质量事件' },
  { title: '人才争夺战', icon: 'magnet', text: '高薪抢人，有技术的人身价倍增。技术 ≥5 的你 +2[m]。', cond: { t: 5, d: { m: 2 } }, src: '改编自近年半导体行业人才薪资上涨' },
  { title: '工厂停电', icon: 'plug-zap', text: '突发限电，晶圆报废一批。', d: { m: -1, t: -1 }, src: '改编自 2021 年多地拉闸限电对制造业的影响' },
  { title: '开源 RISC-V', icon: 'puzzle', text: '开源指令集兴起，学习门槛降低，所有人 +1[t]。', all: { t: 1 }, src: '改编自 RISC-V 开源指令集在国内的快速推广' },
  { title: '地震冲击', icon: 'mountain', text: '某地地震导致晶圆厂停工，供应链受冲击，原材料涨价。', d: { m: -2, t: 1 }, src: '改编自 2024 年台湾花莲地震对晶圆厂的影响' },
  { title: '产业政策扶持', icon: 'scroll-text', text: '国产化替代政策落地，你的团队拿到专项补贴。', d: { m: 2, r: 1 }, src: '改编自集成电路产业税收优惠等扶持政策' },
];

// 机遇卡：轻松好运
const CHANCES = [
  { title: '专利授权', icon: 'file-badge', text: '你的发明专利获得授权！', d: { r: 1, m: 2 } },
  { title: '技术突破', icon: 'lightbulb', text: '深夜灵感乍现，攻克了一个难题。', d: { t: 3 } },
  { title: '获得投资', icon: 'banknote', text: '天使投资人看好你的点子。', d: { m: 3 } },
  { title: '优秀员工', icon: 'medal', text: '年终被评为优秀员工。', d: { r: 2 } },
  { title: '开源贡献', icon: 'globe', text: '你给开源社区贡献的代码被广泛使用。', d: { t: 1, r: 1 } },
  { title: '直接立项', icon: 'trophy', text: '客户点名要和你合作，直接完成一个项目！', d: { p: 1 } },
  { title: '再来一次', icon: 'dices', text: '运气爆棚，立刻再掷一次骰子！', again: true },
  { title: '主动整改', icon: 'brush', text: '你自查发现并修复了问题，清除 1 个隐患[h]（没有则 +1[r]）。', fixHz: true },
];
