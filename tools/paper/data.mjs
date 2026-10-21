// 纸牌版数据：角色、棋盘、事件、机遇、困境沿用线上版（js/data-*.js），这里只放纸牌版改动和新增的内容
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const load = (files, names) => new Function(files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n') + `;return {${names}}`)();

export const { ROLES, TILE_TYPES, ZONES, BOARD, AVATARS, MEMBERS, DILEMMAS: ONLINE_DILEMMAS, LENSES, EVENTS, CHANCES, ICONS } = load(
  ['js/icons-data.js', 'js/data-board.js', 'js/data-dilemma.js', 'js/data-event.js'],
  'ROLES, TILE_TYPES, ZONES, BOARD, AVATARS, MEMBERS, DILEMMAS, LENSES, EVENTS, CHANCES, ICONS');

export const GAME_URL = 'https://pxr-66.github.io/ethics-boardgame/';

// 纸牌版资源：金币、技术、星星（声誉）、奖杯（项目）；隐患改成面朝下的隐患卡
export const RES = {
  m: { icon: 'coins', name: '金币', pts: 1, color: '#e0952a' },
  t: { icon: 'cpu', name: '技术', pts: 1, color: '#3b9fba' },
  r: { icon: 'star', name: '星星', pts: 2, color: '#de6f94' },
  p: { icon: 'trophy', name: '奖杯', pts: 5, color: '#e2703f' },
  h: { icon: 'bomb', name: '隐患卡', color: '#6f6585' },
};

// 格子上直接印出效果，玩家不用翻规则书
export const TILE_FX = {
  start: '经过或停下<br>领工资 +2[m]',
  project: '交 3[t] 攻关<br>得 1[p] 和 2[m]<br><small>不够就接外包 +1[m]</small>',
  event: '抽 1 张事件卡<br>大声读出来',
  learn: '自学 +2[t]<br><small>或交 2[m] 培训 +4[t]</small>',
  dilemma: '抽 1 张困境卡<br>大家猜，你来选',
  chance: '抽 1 张机遇卡',
  audit: '翻开你所有隐患卡<br><small>一张都没有：+1[r]<br>没有且[r]≥5：再 +2[m]</small>',
  mentor: '老师傅带你<br>+1[t] +1[r]',
  summit: '上台分享<br>+1[m] +1[r]',
};

// 纸牌版角色技能：和线上版一致，只改了措辞
export const ROLE_SKILL = {
  design: '停在「学习」格时，额外 +1[t]',
  process: '攻关项目只要交 2[t]（别人要 3[t]）',
  equip: '领工资时拿 3[m]（别人拿 2[m]）',
  pack: '事件卡让你失去东西时，每一种少失去 1 个',
  ai: '停在「机遇」和「行业峰会」时，额外 +1[t]',
  qa: '困境卡里得到[r]时，额外 +1[r]',
};

// 困境卡：线上版 12 张。纸牌版把其中 4 张的 A/B 对调，免得大家记住「A 总是捷径」
const SWAP = new Set([2, 5, 7, 11]);
export const DILEMMAS = ONLINE_DILEMMAS.map((c, i) => SWAP.has(i) ? { ...c, A: c.B, B: c.A } : c);

// 事件卡效果：d 自己，all 所有人，hz 质量暴雷，cond 条件
export const EVENT_FX = EVENTS.map(e => e.all ? { all: e.all } : e.hzBoom ? { hz: true } : e.cond ? { cond: e.cond } : { d: e.d });
export const EVENT_TEXT = EVENTS.map(e => e.hzBoom ? '行业爆出造假丑闻，监管全面排查！' : e.cond ? '高薪抢人，有技术的人身价倍增。' : e.text.replace(/，?所有人.*$/, '。').replace(/。。$/, '。'));

// 机遇卡：线上版 8 张 + 纸牌版新增 1 张互动卡
export const CHANCES_P = [
  ...CHANCES.map(c => ({ ...c, text: c.again ? '运气爆棚，马上再掷一次骰子！' : c.fixHz ? '你自查发现了问题，主动修好了。' : c.text })),
  { title: '热心帮忙', icon: 'heart-handshake', text: '你帮同事解决了一个大难题。', help: true },
];
export const CHANCE_FX = CHANCES_P.map(c => c.again ? { note: '马上再掷一次骰子' } : c.fixHz ? { note: '把 1 张面朝下的隐患卡放回牌堆底；一张都没有就 +1[r]' } : c.help ? { note: '选一位同学，你们俩各 +1[r]' } : { d: c.d });

// 隐患卡 18 张：翻开后照做，然后面朝上放在自己面前（结束时数一数）
// k：罚款 / 曝光 / 事故 / 侥幸
export const HIDDEN = [
  { k: 'fine', title: '返修罚款', text: '没测完就发货的芯片在客户手里坏了，全部返修。', d: { m: -3 } },
  { k: 'fine', title: '律师函', text: '客户发现数据被拿去训练模型，要求赔偿。', d: { m: -3 } },
  { k: 'fine', title: '环保罚款', text: '环保督察来了，报表数据对不上，工厂被罚款。', d: { m: -3 } },
  { k: 'fine', title: '产线停工', text: '被掩盖的工艺问题在量产时集中爆发。', d: { m: -3 } },
  { k: 'fine', title: '被告上法庭', text: '原公司发现资料外泄，起诉你侵犯商业秘密。', d: { m: -3 } },
  { k: 'fine', title: '下架整改', text: '未授权的开源代码被发现，产品被要求下架。', d: { m: -3 } },
  { k: 'expose', title: '上了热搜', text: '记者顺着线索查到了你们，新闻上了热搜。', d: { r: -2 } },
  { k: 'expose', title: '谁拍的板？', text: '供应商的货频频出问题，大家开始追问当初是谁选的。', d: { r: -2 } },
  { k: 'expose', title: '没人想合作', text: '同事们知道了真相，不太愿意再和你一起干活。', d: { r: -2 } },
  { k: 'expose', title: '被点名批评', text: '行业协会通报了这件事，你的名字也在里面。', d: { r: -2 } },
  { k: 'expose', title: '客户流失', text: '老客户听说了这件事，转身找了别家。', d: { r: -2 } },
  { k: 'boom', title: '寒潮事故', text: '一辆车在寒潮中出了事故，调查指向那批芯片。', d: { m: -2, r: -2 } },
  { k: 'boom', title: '河道污染', text: '河道里检出含氟废液，周围居民非常愤怒。', d: { m: -2, r: -2 } },
  { k: 'luck', title: '侥幸过关', text: '这次没出事……但隐患还在，你心里清楚。' },
  { k: 'luck', title: '暂时没人发现', text: '暂时没人发现。可是下一次呢？' },
  { k: 'luck', title: '躲过一劫', text: '运气好，躲过一劫。别把运气当本事。' },
  { k: 'luck', title: '风平浪静', text: '风平浪静。但真正的工程师不靠运气。' },
  { k: 'luck', title: '睡不踏实', text: '什么也没发生，可你最近总是睡不踏实。' },
];
export const HIDDEN_KIND = {
  fine: { name: '隐患爆发 · 罚款', color: '#d9625e', icon: 'triangle-alert' },
  expose: { name: '隐患爆发 · 曝光', color: '#c76aa0', icon: 'newspaper' },
  boom: { name: '隐患爆发 · 事故', color: '#b2453f', icon: 'flame' },
  luck: { name: '侥幸过关', color: '#7f9a86', icon: 'hourglass' },
};

// 事件卡底部的「小知识」：给第一次接触芯片行业的同学补一句背景
export const EVENT_FACT = [
  '出口管制是一个国家限制某些商品卖给别国。芯片供应链跨越很多国家，一环断了，全链都受影响。',
  'EUV 光刻机是造最先进芯片的关键设备，目前全世界只有荷兰的一家公司能造。',
  '「双碳」指碳达峰和碳中和：力争 2030 年前碳排放达到峰值，2060 年前实现碳中和。',
  '训练一个大模型，需要成千上万块 AI 芯片一起连续工作好几个月。',
  '一辆现代汽车里有上千颗芯片，少了其中一颗，整辆车就可能造不出来。',
  '国家集成电路产业投资基金俗称「大基金」，2014 年成立，专门投资芯片产业。',
  '把旧芯片打磨翻新冒充新品，是常见的造假手段，可能让设备在关键时刻失灵。',
  '芯片行业需要大量工程师，设计、制造、封测各个环节都缺人。',
  '晶圆厂要 24 小时不停电，突然断电，正在加工的晶圆可能整批报废。',
  'RISC-V 是一套开源的芯片指令集，任何人都可以免费使用和修改。',
  '光刻机非常精密，一点点震动都会影响生产，所以晶圆厂特别怕地震。',
  '国家对集成电路企业有减免税收等优惠，鼓励芯片产业发展。',
];
