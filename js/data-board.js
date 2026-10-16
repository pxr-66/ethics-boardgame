// 资源定义：w 为计分权重；文本里用 [m] [t] [r] [p] [h] 表示资源图标
const RES = {
  m: { icon: 'coins', name: '资金', w: 1, color: '#f0a53a' },
  t: { icon: 'cpu', name: '技术', w: 1, color: '#4fb3c8' },
  r: { icon: 'star', name: '声誉', w: 2, color: '#e88aa8' },
  p: { icon: 'trophy', name: '项目', w: 5, color: '#e9804e' },
  h: { icon: 'bomb', name: '隐患', w: -3, color: '#8a7f99' },
};

// 角色卡：源自第2周岗位画像，初始资源与专属技能有差异
const ROLES = [
  { id: 'design', name: '芯片设计工程师', icon: 'brain-circuit', color: '#5bb5d6', start: { m: 3, t: 4, r: 2 },
    skill: 'EDA 高手', desc: '在「学习」格额外 +1[t]', quote: '把想法画成电路' },
  { id: 'process', name: '工艺工程师', icon: 'flask-conical', color: '#a68bd8', start: { m: 3, t: 3, r: 3 },
    skill: '工艺优化', desc: '攻关项目只需 2[t]（别人要 3[t]）', quote: '良率每提升 1%，都是硬功夫' },
  { id: 'equip', name: '设备工程师', icon: 'cog', color: '#eea24a', start: { m: 4, t: 3, r: 2 },
    skill: '稳定运维', desc: '经过「入职报到」时工资额外 +1[m]', quote: '机台不停，产线不停' },
  { id: 'pack', name: '封装测试工程师', icon: 'package', color: '#6fbf8a', start: { m: 3, t: 3, r: 3 },
    skill: '质量把关', desc: '行业事件造成的每项损失减 1', quote: '最后一道关，我来守' },
  { id: 'ai', name: 'AI 算法工程师', icon: 'bot', color: '#ec8fb2', start: { m: 2, t: 5, r: 2 },
    skill: '算力加持', desc: '在「机遇」和「行业峰会」额外 +1[t]', quote: '让芯片学会思考' },
  { id: 'qa', name: '质量安全工程师', icon: 'shield', color: '#7a9fe0', start: { m: 3, t: 2, r: 4 },
    skill: '安全第一', desc: '伦理困境中获得[r]时额外 +1[r]', quote: '安全没有下不为例' },
];

// 格子类型
const TILE_TYPES = {
  start:   { name: '入职报到', icon: 'flag', color: '#f2b544', tip: '每次经过或停在这里，领工资 +2[m]' },
  project: { name: '项目',     icon: 'drafting-compass', color: '#6b9de0', tip: '花 3[t] 攻关项目，拿 1[p] 和 2[m]；或者接个外包小活 +1[m]' },
  event:   { name: '行业事件', icon: 'newspaper', color: '#ef9a5a', tip: '抽一张改编自真实新闻的行业事件卡，按卡面结算' },
  learn:   { name: '学习',     icon: 'graduation-cap', color: '#74bf7e', tip: '自学 +2[t]；或花 2[m] 参加培训 +4[t]' },
  dilemma: { name: '伦理困境', icon: 'scale', color: '#e57b7b', tip: '遇到两难抉择，选 A 或 B，没有标准答案' },
  chance:  { name: '机遇',     icon: 'clover', color: '#b28ad9', tip: '抽一张机遇卡，好运降临' },
  audit:   { name: '安全审计', icon: 'search-check', color: '#d9b347', tip: '有隐患会被罚款；零隐患且声誉 ≥5 获表彰 +2[m]' },
  mentor:  { name: '导师指导', icon: 'handshake', color: '#59b8a8', tip: '老师傅带你：+1[t] +1[r]' },
  summit:  { name: '行业峰会', icon: 'mic', color: '#e48bb8', tip: '上台分享：+1[m] +1[r]' },
};

// 棋盘：沿产业链（设计 → 制造 → 封测 → 应用）走一圈，共 24 格
const ZONES = [
  { name: '芯片设计', color: '#5bb5d6' },
  { name: '晶圆制造', color: '#a68bd8' },
  { name: '封装测试', color: '#6fbf8a' },
  { name: '终端应用', color: '#ec8fb2' },
];
const BOARD = [
  { type: 'start' },
  { type: 'project', name: '架构定义' },
  { type: 'event' },
  { type: 'learn', name: 'EDA 培训' },
  { type: 'dilemma' },
  { type: 'project', name: '芯片流片' },
  { type: 'audit' },
  { type: 'project', name: '光刻工艺' },
  { type: 'event' },
  { type: 'dilemma' },
  { type: 'learn', name: '工艺研修' },
  { type: 'chance' },
  { type: 'mentor' },
  { type: 'project', name: '先进封装' },
  { type: 'dilemma' },
  { type: 'event' },
  { type: 'learn', name: '可靠性课程' },
  { type: 'project', name: '测试验证' },
  { type: 'summit' },
  { type: 'dilemma' },
  { type: 'project', name: '智能汽车芯片' },
  { type: 'event' },
  { type: 'chance' },
  { type: 'dilemma' },
].map((t, i) => ({ ...t, i, zone: Math.min(3, Math.floor(i / 6)), name: t.name || TILE_TYPES[t.type].name }));

// 7x7 外圈坐标：0 在右下角，顺着产业链逆时针走
function tileRC(i) {
  if (i <= 6) return [6, 6 - i];
  if (i <= 12) return [6 - (i - 6), 0];
  if (i <= 18) return [0, i - 12];
  return [i - 18, 6];
}

// 头像：卡通插画（img/avatars/*.svg，来自 DiceBear Big Smile，CC BY 4.0）
const AVATARS = ['mochi', 'pudding', 'sunny', 'maple', 'biscuit', 'peach', 'cocoa', 'bubble', 'lychee', 'taro', 'mango', 'cookie', 'panda', 'cloud', 'honey', 'berry'];
const AV_COLORS = ['#f2b544', '#5bb5d6', '#ec8fb2', '#74bf7e', '#a68bd8', '#ef9a5a', '#7a9fe0', '#e57b7b'];
const MEMBERS = ['蒙浩煦', '文俊杰', '林龙鑫', '罗家宇', '杨帆', '罗富元'];
const BOT_NAMES = ['阿晶', '硅仔', '光刻君', '封测姐', '算力哥', '电路宝'];
