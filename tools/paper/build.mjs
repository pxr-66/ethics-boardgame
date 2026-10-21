// 生成纸牌版 PDF：在项目根目录运行  node tools/paper/build.mjs
// 输出到 docs/paper/：rules.pdf（规则书）、print-kit.pdf（打印素材，A4）、board-a3.pdf（A3 整张棋盘，可选）
// 依赖本机的 Chrome 或 Edge（用无头模式把 HTML 打印成 PDF）
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import * as D from './data.mjs';

const { ROOT, RES, ICONS } = D;
const OUT = path.join(ROOT, 'docs/paper');
const TMP = path.join(ROOT, 'tools/paper/.build');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
// HTML 写在 tools/paper/.build/ 里，素材用相对路径引用（本地文件、本地服务器都能打开）
const url = p => '../../../' + p;

// ---------- 小工具 ----------
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ICONS['circle-help']}</svg>`;
const ri = k => `<span class="ri" style="color:${RES[k].color}">${ic(RES[k].icon)}</span>`;
const rt = s => s.replace(/\[(m|t|r|p|h)\]/g, (_, k) => ri(k));
const fx = (k, v) => `<span class="fx ${v < 0 ? 'neg' : ''}" style="--k:${RES[k].color}">${v > 0 ? '+' : '−'}${Math.abs(v)}${ic(RES[k].icon)}</span>`;
const fxRow = d => ['m', 't', 'r', 'p'].filter(k => d[k]).map(k => fx(k, d[k])).join('') + (d.h ? `<span class="fx bomb">${ic('bomb')}抽 ${d.h} 张隐患卡</span>` : '');
const trustFx = v => `<span class="fx trust ${v < 0 ? 'neg' : ''}">${ic('heart-handshake')}信任${v > 0 ? '+' : '−'}${Math.abs(v)}</span>`;
const mascot = (w = 20) => `<img src="${url('img/mascot.svg')}" style="width:${w}mm" alt="">`;
const avatar = a => url(`img/avatars/${a}.svg`);
const page = (inner, cls = '') => `<section class="page ${cls}">${inner}</section>`;
const html = (title, pages, cls = '', size = 'A4') => `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>${title}</title>
<link rel="stylesheet" href="${url('fonts/fonts.css')}"><link rel="stylesheet" href="${url('tools/paper/style.css')}">
<style>@page { size: ${size}; margin: 0; }</style></head><body class="${cls}">${pages.join('')}</body></html>`;

// 二维码：线上版网址
const require = createRequire(import.meta.url);
const qrcode = require(path.join(ROOT, 'lib/qrcode.js'));
const qrSvg = () => { const q = qrcode(0, 'M'); q.addData(D.GAME_URL); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }).replace(/fill="black"/g, 'fill="#4a3426"'); };

// ---------- 棋盘 ----------
const T = 42;
// 8×6 外圈共 24 格：0 在右下角，沿底边向左、左边向上、顶边向右、右边向下（顺时针）
function tilePos(i) {
  if (i <= 7) return [7 - i, 5];
  if (i <= 11) return [0, 5 - (i - 7)];
  if (i <= 19) return [i - 12, 0];
  return [7, i - 19];
}
function boardHTML() {
  const tiles = D.BOARD.map(t => {
    const [c, r] = tilePos(t.i), tt = D.TILE_TYPES[t.type], z = D.ZONES[t.zone];
    return `<div class="tile t-${t.type}" style="left:${c * T}mm;top:${r * T}mm;--tc:${tt.color};--zc:${z.color}">
      <div class="zs">${z.name}</div>${t.i ? `<span class="no">${t.i}</span>` : ''}
      <div class="ti">${ic(tt.icon)}</div><div class="tn">${t.name}</div><div class="tf">${rt(D.TILE_FX[t.type])}</div>
      ${t.i === 0 ? `<div class="go">${ic('chevron-left')}从这里出发，按数字往前走</div>` : ''}</div>`;
  }).join('');
  const tb = Array.from({ length: 11 }, (_, k) => `<div class="tbox ${k === 0 ? 'bad' : k >= 6 ? 'ok' : ''} ${k === 6 ? 'st' : ''}" style="left:${36 + k * 18}mm">${k}
    ${k === 0 ? '<small>信任危机</small>' : k === 6 ? '<small>开局放这</small>' : k === 10 ? '<small>满分</small>' : ''}</div>`).join('');
  const spots = [['#e57b7b', 'scale', '困境卡'], ['#ef9a5a', 'newspaper', '事件卡'], ['#b28ad9', 'clover', '机遇卡'], ['#6f6585', 'bomb', '隐患卡']]
    .map(([c, i, n], k) => `<div class="spot" style="left:${5 + k * 62}mm;--c:${c}">${ic(i)}<b>${n}</b><span>洗匀后<br>面朝下放这里${n === '隐患卡' ? '<br><b style="font-size:8pt">抽到后不许偷看！</b>' : '<br>用过的放旁边'}</span></div>`).join('');
  return `<div class="board">${tiles}
    <div class="center">
      <div class="c-title">${mascot(20)}<div><h1>芯途抉择<span class="tag">纸牌版</span></h1>
        <div class="sub">沿着芯片产业链成长 · 在没有标准答案的选择里做决定</div></div></div>
      <div class="trust-track"><div class="tl"><b>行业信任</b>大家共用一条，信任标记开局放在 6</div>${tb}
        <div class="tr">选了带 ${ri('h')} 的选项：信任 −2　·　放弃了带 ${ri('h')} 的选项：信任 +1　·　降到 0：信任危机（规则书第 4 页）　·　游戏结束时 ≥ 6：所有人 +3 ${ri('m')}</div></div>
      ${spots}
    </div></div>`;
}
function boardHalf(side) {
  // A4 竖放：每半 168×252mm；右半左侧多留 12mm 胶水区，左半盖在上面
  const left = side === 'L';
  const x = left ? 21 : 30, y = 26;
  return page(`<div class="pg-label"><b>棋盘 · ${left ? '左半' : '右半'}</b>　请用「实际大小 / 100%」打印，不要选「适合页面」</div>
    ${left ? '' : `<div class="glue" style="left:${x - 12}mm;top:${y}mm"><span>胶水区 · 左半盖在这里</span></div>`}
    <iframe class="half" src="board-${side}.html" style="left:${x}mm;top:${y}mm;width:168mm;border:0" scrolling="no"></iframe>
    <div class="cutline" style="left:${x}mm;top:${y}mm;width:168mm;height:252mm"></div>
    <div class="how">${left ? '沿着灰色细线把左半剪下来（四条边都剪）。' : '右半只剪上、下、右三条边，左边的胶水区留着。'}然后把左半的右边缘对齐，盖在右半的胶水区上，粘好。背面再贴一条胶带更结实。</div>`);
}
function boardA3() {
  return page(`<div style="position:absolute;left:21.8mm;top:7.4mm;transform:scale(1.12);transform-origin:0 0">${boardHTML()}</div>`);
}

// ---------- 卡牌 ----------
function dilemmaCard(c, i) {
  const L = D.LENSES[c.lens];
  const opt = (k, o, other) => `<div class="opt"><b class="k">${k}</b><div><div class="ol">${o.label}</div>
    <div class="of">${fxRow(o.d)}${o.d.h ? trustFx(-2) : other.d.h ? trustFx(1) : ''}</div></div></div>`;
  return `<div class="card cd" style="--c:#e57b7b"><div class="band">${ic('scale')}伦理困境<span class="lens" style="--l:${L.color}">${c.lens}</span></div>
    <div class="ttl">${c.title}</div><div class="scene">${c.scene}</div><div class="who">${ic('users-round')}牵动：${c.who}</div>${opt('A', c.A, c.B)}${opt('B', c.B, c.A)}
    <div class="think">${ic('message-circle-question')}<span>想一想：${c.think}</span></div></div>`;
}
function eventCard(e, i) {
  const f = D.EVENT_FX[i];
  const eff = f.all ? `<span class="who">所有人</span>${fxRow(f.all)}` : f.hz ? `<span class="note">所有人翻开自己全部的隐患卡，照卡上做</span>`
    : f.cond ? `<span class="note">如果你的${ri('t')}≥ ${f.cond.t}：${fxRow(f.cond.d)}<br><small style="font-weight:400">不够就没赶上</small></span>` : fxRow(f.d);
  return `<div class="card ce" style="--c:#ef9a5a"><div class="band">${ic('newspaper')}行业事件<span class="num">${i + 1}/12</span></div>
    <div class="bigic">${ic(e.icon)}</div><div class="ttl">${e.title}</div><div class="txt">${D.EVENT_TEXT[i]}</div>
    <div class="eff">${eff}</div><div class="fact">${ic('lightbulb')}<span>小知识：${D.EVENT_FACT[i]}</span></div><div class="src">${e.src}</div></div>`;
}
function chanceCard(c, i) {
  const f = D.CHANCE_FX[i];
  return `<div class="card cc" style="--c:#b28ad9"><div class="band">${ic('clover')}机遇<span class="num">${i + 1}/9</span></div>
    <div class="bigic">${ic(c.icon)}</div><div class="ttl">${c.title}</div><div class="txt">${c.text}</div>
    <div class="eff">${f.note ? `<span class="note">${rt(f.note)}</span>` : fxRow(f.d)}</div></div>`;
}
function hiddenCard(h) {
  const K = D.HIDDEN_KIND[h.k];
  return `<div class="card ch ${h.k}" style="--c:${K.color}"><div class="band">${ic(K.icon)}${K.name}</div>
    <div class="bigic">${ic(h.k === 'luck' ? 'hourglass' : 'bomb')}</div><div class="ttl">${h.title}</div><div class="txt">${h.text}</div>
    <div class="eff">${h.d ? fxRow(h.d) : '<span class="note">这次什么也不用交</span>'}</div>
    <div class="foot">翻开后照做，然后<b>面朝上</b>放在自己面前，不再放回牌堆。结束时数一数，看看你是哪种工程师。</div></div>`;
}
const blankDilemma = () => `<div class="card cd blank" style="--c:#e57b7b"><div class="band">${ic('pencil')}自创困境卡<span class="lens" style="--l:#e57b7b">我们的</span></div>
  <div class="lines"><div class="ln">标题：</div><div class="ln">情境：</div><div class="ln"></div><div class="ln"></div>
  <div class="ln"><b>A</b></div><div class="ln">结果：</div><div class="ln"><b>B</b></div><div class="ln">结果：</div><div class="ln">想一想：</div></div>
  <div class="hint">两个选项都要有代价，不设标准答案。带 ${ri('h')} 的选项记得写「抽 1 张隐患卡」。</div></div>`;
const blankEvent = () => `<div class="card ce blank" style="--c:#ef9a5a;text-align:left"><div class="band">${ic('pencil')}自创事件卡</div>
  <div class="lines"><div class="ln">标题：</div><div class="ln">发生了什么：</div><div class="ln"></div><div class="ln"></div>
  <div class="ln">结果：</div><div class="ln"></div><div class="ln">改编自（来源）：</div><div class="ln"></div></div>
  <div class="hint">从真实新闻里找一件行业大事，写清楚来源。</div></div>`;
const guessCard = () => `<div class="card" style="padding:0">
  <div class="guess top" style="--c:#5bb5d6"><b>A</b><span>我猜 TA 会选 A</span></div>
  <div class="guess bot" style="--c:#ef8a5b"><b>B</b><span>我猜 TA 会选 B</span></div></div>`;
const firstCard = () => `<div class="card first" style="--c:#f2b544"><div class="bigic">${ic('flag')}</div><div class="ttl" style="text-align:center">先手玩家</div>
  <div class="txt" style="text-align:center">你第一个掷骰子。<br>标准局：有人第 2 次经过「入职报到」后，<br>打到你<b>右手边</b>那位为止，游戏结束。</div></div>`;

const BACK = {
  dilemma: ['#e57b7b', 'scale', '伦理困境'], event: ['#ef9a5a', 'newspaper', '行业事件'], chance: ['#b28ad9', 'clover', '机遇'],
  hidden: ['#6f6585', 'bomb', '隐患卡'], guess: ['#7a9fe0', 'users-round', '猜猜卡'], first: ['#f2b544', 'flag', '先手玩家'],
};
function backHTML(kind) {
  const [c, i, n] = BACK[kind];
  const one = cls => `<div class="back ${cls}" style="--c:${c}"><div class="bi">${ic(i)}</div><b>${n}</b><span>芯途抉择 · 纸牌版</span></div>`;
  if (kind === 'guess') return one('half1') + one('half2');
  return one('') ;
}

const CARDS = [
  ...D.DILEMMAS.map((c, i) => ({ kind: 'dilemma', html: dilemmaCard(c, i) })),
  ...[0, 1, 2].map(() => ({ kind: 'dilemma', html: blankDilemma() })),
  ...D.EVENTS.map((e, i) => ({ kind: 'event', html: eventCard(e, i) })),
  ...[0, 1].map(() => ({ kind: 'event', html: blankEvent() })),
  ...D.CHANCES_P.map((c, i) => ({ kind: 'chance', html: chanceCard(c, i) })),
  ...D.HIDDEN.map(h => ({ kind: 'hidden', html: hiddenCard(h) })),
  ...Array.from({ length: 6 }, () => ({ kind: 'guess', html: guessCard() })),
  { kind: 'first', html: firstCard() },
];
const crops = (W, H, cols, rows) => {
  // 外圈裁切标记
  const out = [];
  for (let c = 0; c <= cols; c++) { out.push(`<div class="crop" style="left:${c * W - .1}mm;top:-5mm;width:.2mm;height:3.5mm"></div>`, `<div class="crop" style="left:${c * W - .1}mm;top:${rows * H + 1.5}mm;width:.2mm;height:3.5mm"></div>`); }
  for (let r = 0; r <= rows; r++) { out.push(`<div class="crop" style="top:${r * H - .1}mm;left:-5mm;height:.2mm;width:3.5mm"></div>`, `<div class="crop" style="top:${r * H - .1}mm;left:${cols * W + 1.5}mm;height:.2mm;width:3.5mm"></div>`); }
  return out.join('');
};
function cardPages() {
  const pages = [];
  for (let s = 0; s * 9 < CARDS.length; s++) {
    const set = CARDS.slice(s * 9, s * 9 + 9);
    const names = [...new Set(set.map(c => BACK[c.kind][2]))].join('、');
    const slot = (k, inner, mirror) => { const r = Math.floor(k / 3), c = mirror ? 2 - k % 3 : k % 3; return `<div class="slot" style="left:${c * 63}mm;top:${r * 88}mm">${inner}</div>`; };
    pages.push(page(`<div class="pg-label"><b>卡牌 第 ${s + 1} 张 · 正面</b>　${names}</div><div class="sheet">${crops(63, 88, 3, 3)}${set.map((c, k) => slot(k, c.html)).join('')}</div>
      <div class="pg-foot">沿灰线裁开，每张 63×88mm（扑克牌大小）。建议用 160–200g 卡纸打印。</div>`));
    pages.push(page(`<div class="pg-label"><b>卡牌 第 ${s + 1} 张 · 背面</b>　双面打印时紧跟在正面后面（长边翻转）；单面打印可以跳过这一页</div>
      <div class="sheet">${set.map((c, k) => slot(k, backHTML(c.kind), true)).join('')}</div>`, 'back-page'));
  }
  return pages;
}

// ---------- 角色卡 ----------
function roleCard(r) {
  return `<div class="role" style="--c:${r.color}"><div class="rh"><div class="ric">${ic(r.icon)}</div>
    <div><div class="rk">角色卡</div><div class="rn">${r.name}</div><div class="rq">“${r.quote}”</div></div></div>
    <div class="rb"><div class="sk"><b>${ic('sparkles')}专属技能 · ${r.skill}</b><p>${rt(D.ROLE_SKILL[r.id])}</p></div>
    <div class="st">开局拿：${fxRow(r.start)}</div>
    <div class="laps">经过「入职报到」打个勾：<i></i>第 1 圈<i></i>第 2 圈</div>
    <div class="hz">${ic('bomb')}隐患卡放在这里<small>面朝下 · 自己也不许偷看</small></div>
    <div class="pts">计分：${ri('m')}1 分　${ri('t')}1 分　${ri('r')}2 分　${ri('p')}5 分</div></div></div>`;
}
const quickRef = () => `<div class="qref"><h3>${mascot(10)}规则速查</h3>
  <div class="q"><b>轮到你</b>① 掷骰子 ② 按格子上的数字往前走 ③ 做停下那格写的事 ④ 交给左手边的下一位</div>
  <div class="q"><b>经过入职报到</b>领工资 +2${ri('m')}，在角色卡上打个勾</div>
  <div class="q"><b>伦理困境格</b>右手边同学读卡 → 其他人把猜猜卡面朝下放好 → 你选 A 或 B，并说一句理由 → 一起翻开，猜对的 +1${ri('m')} → 照卡结算</div>
  <div class="q"><b>带${ri('h')}的选项</b>抽隐患卡，面朝下放好，不许偷看；信任 −2。放弃了带${ri('h')}的选项：信任 +1</div>
  <div class="q"><b>隐患卡什么时候翻开</b>停在安全审计格 · 抽到「质量暴雷」· 游戏结束</div>
  <div class="q"><b>信任降到 0</b>所有人 −2${ri('m')}，手里还有面朝下隐患卡的人再 −2${ri('r')}，标记放回 3</div>
  <div class="q"><b>结束</b>有人第 2 次经过入职报到 → 打完这一轮。翻开全部隐患卡；信任 ≥ 6 所有人 +3${ri('m')}</div>
  <div class="q"><b>算分</b>${ri('m')}×1 + ${ri('t')}×1 + ${ri('r')}×2 + ${ri('p')}×5</div></div>`;
function rolePages() {
  const items = [...D.ROLES.map(roleCard), quickRef(), quickRef()];
  const pages = [];
  for (let s = 0; s < 2; s++) {
    const set = items.slice(s * 4, s * 4 + 4);
    pages.push(page(`<div class="pg-label"><b>角色卡 ${s ? '（第 2 页，含两张规则速查）' : '（第 1 页）'}</b>　每张 95×135mm</div><div class="rsheet">${crops(95, 135, 2, 2)}
      ${set.map((h, k) => `<div class="rslot" style="left:${(k % 2) * 95}mm;top:${Math.floor(k / 2) * 135}mm">${h}</div>`).join('')}</div>`));
  }
  return pages;
}

// ---------- 代币 ----------
function tokenPages() {
  const tk = (k, v) => ({ k, v });
  const rep = (n, x) => Array.from({ length: n }, () => x);
  const sheets = [
    [...rep(54, tk('m', 1)), ...rep(18, tk('m', 5)), ...rep(45, tk('t', 1))],
    [...rep(9, tk('t', 1)), ...rep(9, tk('t', 5)), ...rep(54, tk('r', 1)), ...rep(27, tk('p', 1)), ...rep(9, tk('m', 5)), ...rep(2, tk('trust')), ...rep(7, tk('r', 1))],
  ];
  return sheets.map((list, s) => page(`<div class="pg-label"><b>代币 第 ${s + 1} 张</b>　每个 21×21mm，沿灰线裁开（也可以用硬币、豆子、乐高代替）</div>
    <div class="tsheet">${crops(21, 21, 9, 13)}${list.map((t, i) => {
      const x = (i % 9) * 21, y = Math.floor(i / 9) * 21;
      if (t.k === 'trust') return `<div class="tok five" style="left:${x}mm;top:${y}mm;--c:#4f9e5a">${ic('heart-handshake')}<span>信任标记</span></div>`;
      const R = RES[t.k];
      return `<div class="tok ${t.v === 5 ? 'five' : ''}" style="left:${x}mm;top:${y}mm;--c:${R.color}">${ic(R.icon)}<b>${t.v}</b><span>${R.name}</span></div>`;
    }).join('')}</div>`));
}

// ---------- 棋子、骰子 ----------
function pawnPage() {
  const pawns = D.ROLES.map((r, k) => `<div class="pawn" style="left:${9 + k * 32.5}mm;top:22mm;--c:${r.color}">
    <div class="base">底座 · 粘</div><div class="face"><img src="${avatar(D.AVATARS[k])}" alt=""><b>${r.name.replace('工程师', '')}</b></div>
    <div class="face flip"><img src="${avatar(D.AVATARS[k])}" alt=""><b>${r.name.replace('工程师', '')}</b></div><div class="base">底座 · 粘</div></div>`).join('');
  // 骰子展开图：竖排 1-2-6-5，两侧 3、4
  const P = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[25, 25], [50, 50], [75, 75]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]], 6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]] };
  const face = (n, x, y) => `<div class="df ${n === 1 ? 'one' : ''}" style="left:${x}mm;top:${y}mm">${P[n].map(([a, b]) => `<i style="left:${a}%;top:${b}%"></i>`).join('')}</div>`;
  const tab = (x, y, w, h) => `<div class="dtab" style="left:${x}mm;top:${y}mm;width:${w}mm;height:${h}mm">粘</div>`;
  const die = `<div class="die" style="left:52mm;top:150mm">
    ${face(1, 20, 0)}${face(2, 20, 20)}${face(6, 20, 40)}${face(5, 20, 60)}${face(3, 0, 20)}${face(4, 40, 20)}
    ${tab(0, 14, 20, 6)}${tab(40, 14, 20, 6)}${tab(0, 40, 20, 6)}${tab(40, 40, 20, 6)}${tab(14, 0, 6, 20)}${tab(40, 0, 6, 20)}${tab(14, 60, 6, 20)}${tab(40, 60, 6, 20)}</div>`;
  return page(`<div class="pg-label"><b>棋子和骰子</b></div>${pawns}
    <div class="doc" style="top:122mm;left:16mm;right:16mm;bottom:auto;gap:2mm">
      <p class="mini">棋子：沿四周实线剪下，沿虚线向里折，折成一个三角形「小帐篷」，两块底座叠在一起用胶水或胶带粘好，就能立在格子上。每个棋子的颜色和角色卡一样。</p>
      <p class="mini" style="margin-top:2mm">骰子（可选，用普通骰子更方便）：沿外轮廓剪下，灰色「粘」的部分是胶水片，折成正方体后粘好。相对两面的点数加起来是 7。</p></div>
    ${die}
    <div class="doc" style="top:240mm;bottom:auto"><div class="box tint" style="--c:#4f9e5a"><h3>${ic('lightbulb')}小贴士</h3>
      <p class="mini">找不到胶水也没关系：棋子可以用不同颜色的橡皮、瓶盖代替；代币可以用硬币、豆子代替。最重要的是卡牌和棋盘。</p></div></div>`);
}

// ---------- 计分表 ----------
function scorePage() {
  const head = ['玩家', '角色', `${ri('m')} 金币<br>×1`, `${ri('t')} 技术<br>×1`, `${ri('r')} 星星<br>×2`, `${ri('p')} 奖杯<br>×5`, '信任红利<br>（+3 或 0）', '总分', `${ri('h')} 面前的<br>隐患卡张数`, '我是哪种<br>工程师'];
  return page(`<div class="doc"><h1>${mascot(14)}计分表 & 赛后聊一聊</h1>
    <p class="muted">先翻开所有人剩下的隐患卡并照做，再算信任红利，最后填表。总分最高的是 <b>MVP 工程师</b>；平分时，面前隐患卡少的人赢。</p>
    <table class="score"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${Array.from({ length: 6 }, () => `<tr>${head.map(() => '<td></td>').join('')}</tr>`).join('')}</table>
    <div class="grid3">
      <div class="kit" style="--c:#74bf7e">${ic('shield-check')}<span><b style="margin:0;font-size:9pt">守护者</b><br>0 张隐患卡</span></div>
      <div class="kit" style="--c:#5bb5d6">${ic('scale')}<span><b style="margin:0;font-size:9pt">务实派</b><br>1–2 张隐患卡</span></div>
      <div class="kit" style="--c:#e57b7b">${ic('flame')}<span><b style="margin:0;font-size:9pt">冒险家</b><br>3 张或更多</span></div></div>
    <h2>${ic('message-circle-question')}赛后聊一聊（4F 复盘）</h2>
    <div class="grid2">
      ${[['Feeling 感受', '哪一张困境卡让你犹豫了最久？'], ['Fact 事实', '你最后选了什么？付出了什么代价？'], ['Finding 发现', '现实中，这样的取舍由谁来做？依据是什么？'], ['Future 未来', '以后真的遇到类似的事，你会怎么做？']]
        .map(([a, b]) => `<div class="box"><h3 style="--c:var(--pri)">${a}</h3><p class="mini">${b}</p><div class="lines-w"><div class="l"></div><div class="l"></div></div></div>`).join('')}
    </div>
    <div class="box"><h3>${ic('users-round')}这局大家选法最不一样的一张困境卡</h3>
      <p class="mini">卡名：＿＿＿＿＿＿＿＿　选 A 的有 ＿＿ 人，选 B 的有 ＿＿ 人。请两边各说一个理由：</p><div class="lines-w"><div class="l"></div><div class="l"></div></div></div>
  </div>`);
}

// ---------- 打印说明（素材包第 1 页） ----------
function kitCover(pageMap) {
  const row = (name, pages, qty, note) => `<tr><td><b>${name}</b></td><td style="white-space:nowrap">${pages}</td><td>${qty}</td><td class="mini">${note}</td></tr>`;
  return page(`<div class="doc"><h1>${mascot(16)}打印 & 制作说明</h1>
    <p class="muted">这份 PDF 是「芯途抉择 · 纸牌版」的全部打印素材。规则请看另一份《规则书》。打印时请选 <b>A4、实际大小（100%）</b>，<b>不要</b>勾选「适合页面 / 缩放」，否则卡牌和棋盘会变小。</p>
    <table class="t"><tr><th>内容</th><th>页码</th><th>数量</th><th>说明</th></tr>
      ${row('打印说明', '1', '—', '就是这一页')}
      ${row('棋盘', pageMap.board, '1 张', '两半拼起来，约 34×25cm。去打印店可以直接用 board-a3.pdf 打一张 A3，不用拼')}
      ${row('角色卡 + 规则速查', pageMap.roles, '6 + 2', '角色卡同时当作每个人的「个人面板」')}
      ${row('卡牌（正面）', pageMap.fronts, '63 张', '困境 12 + 自创困境 3、事件 12 + 自创事件 2、机遇 9、隐患 18、猜猜卡 6 套、先手卡 1')}
      ${row('卡牌（背面，可选）', pageMap.backs, '—', '双面打印用；单面打印就跳过')}
      ${row('代币', pageMap.tokens, '约 230 个', '金币、技术、星星、奖杯、信任标记')}
      ${row('棋子 + 骰子', pageMap.pawns, '6 + 1', '骰子也可以用普通骰子')}
      ${row('计分表', pageMap.score, '1 张', '每局用一张，可以多打几份')}
    </table>
    <div class="grid2">
      <div class="box tint" style="--c:#5bb5d6"><h3>${ic('copy')}两种打印方式</h3>
        <p class="mini"><b>① 双面打印（推荐，卡背好看，也看不透隐患卡）</b>：整份打印，选「双面 · 长边翻转」。<br>
        <b>② 只能单面打印</b>：在打印设置的「页码」里填 <b>${pageMap.single}</b>。单面打印的隐患卡要用厚一点的纸，免得从背面看透。</p></div>
      <div class="box tint" style="--c:#74bf7e"><h3>${ic('hammer')}需要准备</h3>
        <p class="mini">剪刀或裁纸刀、直尺、胶水或双面胶、透明胶带。卡牌和角色卡建议用 <b>160–200g 卡纸</b>（打印店都有），普通 A4 纸也能玩。</p></div>
    </div>
    <h2>${ic('scroll-text')}制作步骤（4 个人大约 40 分钟）</h2>
    <div class="steps" style="--c:var(--pri)">
      <div><span><b>拼棋盘：</b>剪下左半（四边都剪）和右半（只剪上、下、右），把左半盖在右半的胶水区上粘好，背面贴胶带。</span></div>
      <div><span><b>裁卡牌：</b>每页卡牌先沿外圈的裁切标记裁掉白边，再横着裁 2 刀、竖着裁 2 刀，就得到 9 张。猜猜卡再从中间虚线剪成 A、B 两张小卡。</span></div>
      <div><span><b>裁代币：</b>同样先横后竖裁开。不想裁的话，直接用硬币、豆子代替。</span></div>
      <div><span><b>折棋子：</b>剪下 6 个棋子，沿虚线折成三角形，底座粘好。</span></div>
      <div><span><b>分好类：</b>困境、事件、机遇、隐患四叠卡分别用夹子或小袋子装好，下次拿出来就能玩。</span></div>
    </div>
    <p class="mini" style="margin-top:auto">文件由 tools/paper/build.mjs 自动生成。要改卡牌文字，改 js/data-*.js（和线上版共用）或 tools/paper/data.mjs（纸牌版专用），再运行 <b>node tools/paper/build.mjs</b> 重新生成。</p>
  </div>`);
}

// ---------- 规则书 ----------
const tileRows = () => Object.entries(D.TILE_TYPES).map(([k, t]) => `<tr><td class="ic-cell"><div class="tic" style="--c:${t.color}">${ic(t.icon)}</div></td>
  <td style="white-space:nowrap"><b>${t.name}</b></td><td>${rt(D.TILE_FX[k].replace(/<br>/g, '，').replace(/<\/?small>/g, ''))}</td></tr>`).join('');
const resCard = (k, use) => `<div class="kit" style="--c:${RES[k].color}">${ri(k)}<span><b style="margin:0;font-size:9pt;font-family:inherit">${RES[k].name}</b>　${use}</span>${RES[k].pts ? `<b>${RES[k].pts} 分</b>` : ''}</div>`;
function rulePages() {
  const P = [];
  // 第 1 页：封面
  P.push(page(`<div class="doc" style="align-items:center;text-align:center;gap:4.4mm;top:20mm">
    <div class="pill">职业道德与工程伦理 · 课程桌游 · 纸牌版规则书</div>
    ${mascot(36)}
    <div class="cover-title">芯途抉择</div>
    <div style="font-family:var(--fz);font-size:16pt;color:var(--ink2);letter-spacing:1mm">一款关于成长与选择的工程伦理桌游</div>
    <div style="display:flex;gap:2.4mm;justify-content:center"><span class="pill">${ic('users')}2–6 人</span><span class="pill">${ic('smile')}10 岁以上</span><span class="pill">${ic('timer')}约 30 分钟</span></div>
    <div class="chain">${D.ZONES.map((z, i) => `<span style="--c:${z.color}">${z.name}</span>${i < 3 ? ic('chevron-right') : ''}`).join('')}</div>
    <div class="say" style="text-align:left;max-width:160mm">${mascot(18)}<div class="bub">你是一名刚入职的芯片工程师。沿着芯片产业链一路成长：攒技术、做项目、拿奖杯。路上会遇到<b>没有标准答案</b>的两难选择——走捷径来钱快，却会埋下「隐患」；守住底线要付出代价，却能赢得信任。<br>你会成为怎样的工程师？</div></div>
    <div class="box" style="width:100%;text-align:left"><h3 style="--c:var(--pri)">${ic('sparkles')}30 秒看懂怎么玩</h3>
      <div class="grid2 mini" style="font-size:8.6pt">
        <div>${ic('dices', 'inl')} <b>掷骰子走格子</b>，停在哪格做哪格的事</div><div>${ic('trophy', 'inl')} <b>攒技术做项目</b>，项目奖杯最值钱</div>
        <div>${ic('scale', 'inl')} <b>伦理困境二选一</b>，大家先猜你会选啥</div><div>${ic('bomb', 'inl')} <b>捷径会埋隐患卡</b>，什么时候爆、爆多大全靠运气</div></div></div>
    <div style="display:flex;gap:5mm;align-items:center;text-align:left;margin-top:auto" class="box">
      <div class="qr">${qrSvg()}</div>
      <div><b>还有线上版！</b><p class="mini">手机扫码或打开 ${D.GAME_URL}<br>3–6 人联机，带 3D 棋盘、新手教程和自动计分；线上版里也可以给游戏评分、写评论。</p>
      <p class="mini" style="margin-top:1.6mm">制作小组：${D.MEMBERS.join('　')}</p></div></div>
  </div>`));
  // 第 2 页：目标、配件、准备
  P.push(page(`<div class="doc"><h1><span class="n">1</span>目标和准备</h1>
    <h2>${ic('target')}你的目标</h2>
    <p>游戏结束时，<b>总分最高</b>的人成为「MVP 工程师」。</p>
    <div class="formula">总分 = ${ri('m')}金币×1 ＋ ${ri('t')}技术×1 ＋ ${ri('r')}星星×2 ＋ ${ri('p')}奖杯×5</div>
    <p class="muted">但要小心：选捷径拿到的<b>隐患卡</b>会在最后翻开扣分；<b>行业信任</b>是大家共用的，有人走捷径，所有人都可能受连累。</p>
    <h2>${ic('package')}配件</h2>
    <div class="grid3">
      <div class="kit" style="--c:#f2b544">${ic('flag')}棋盘（24 格）<b>1</b></div><div class="kit" style="--c:#5bb5d6">${ic('user-round')}角色卡<b>6</b></div><div class="kit" style="--c:#e57b7b">${ic('scale')}困境卡（+3 张空白）<b>12</b></div>
      <div class="kit" style="--c:#ef9a5a">${ic('newspaper')}事件卡（+2 张空白）<b>12</b></div><div class="kit" style="--c:#b28ad9">${ic('clover')}机遇卡<b>9</b></div><div class="kit" style="--c:#6f6585">${ic('bomb')}隐患卡<b>18</b></div>
      <div class="kit" style="--c:#7a9fe0">${ic('users-round')}猜猜卡（A/B）<b>6 套</b></div><div class="kit" style="--c:#f2b544">${ic('flag')}先手玩家卡<b>1</b></div><div class="kit" style="--c:#4f9e5a">${ic('heart-handshake')}信任标记<b>1</b></div>
      <div class="kit" style="--c:#e0952a">${ic('coins')}金币 / 技术 / 星星 / 奖杯代币<b>若干</b></div><div class="kit" style="--c:#ec8fb2">${ic('smile')}棋子 + 骰子<b>6+1</b></div><div class="kit" style="--c:#8a6e5a">${ic('pencil')}计分表<b>1</b></div>
    </div>
    <h2>${ic('house')}开局准备</h2>
    <div class="steps">
      <div><span><b>摆棋盘。</b>把<b>信任标记</b>放在棋盘中间信任条的「6」上。</span></div>
      <div><span><b>放牌堆。</b>困境、事件、机遇、隐患四种卡分别洗匀，面朝下放在棋盘中间对应的位置。</span></div>
      <div><span><b>选角色。</b>每人选一张角色卡（也可以背面朝上随机抽），按卡上「开局拿」拿代币，再把一个棋子放在「入职报到」格。</span></div>
      <div><span><b>拿猜猜卡。</b>每人拿一套猜猜卡（A、B 各一张）。</span></div>
      <div><span><b>定先手。</b>年纪最小的人拿「先手玩家」卡，第一个掷骰子。之后按<b>顺时针</b>（左手边）轮流。</span></div>
    </div>
    <div class="grid2">
      <div class="box tint" style="--c:#ef8a5b"><h3>${ic('timer')}标准局（约 30–40 分钟）</h3><p class="mini">有人<b>第 2 次</b>经过入职报到时，打完这一轮就结束。适合 2–4 人。</p></div>
      <div class="box tint" style="--c:#5bb5d6"><h3>${ic('zap')}快速局（约 15–20 分钟）</h3><p class="mini">有人<b>第 1 次</b>经过入职报到时，打完这一轮就结束。适合课堂、5–6 人。</p></div>
    </div></div>`));
  // 第 3 页：回合和格子
  P.push(page(`<div class="doc"><h1><span class="n">2</span>轮到你时</h1>
    <div class="steps">
      <div><span><b>掷骰子</b>，掷出几点就往前走几格（按格子上的数字从小到大走，走完 23 号回到入职报到）。</span></div>
      <div><span><b>做事。</b>停在哪一格，就做那一格上写的事。每格的做法都印在格子上。</span></div>
      <div><span><b>结束。</b>说「我好了」，轮到左手边的同学。</span></div>
    </div>
    <div class="box tint" style="--c:#f2b544"><h3>${ic('flag')}经过入职报到</h3><p class="mini">每次<b>经过或停在</b>「入职报到」，领工资 +2${ri('m')}，并在角色卡上打一个勾，记录你走了几圈。</p></div>
    <h2>${ic('layers')}9 种格子</h2>
    <table class="t"><tr><th></th><th>格子</th><th>做什么</th></tr>${tileRows()}</table>
    <h2>${ic('coins')}代币是干什么用的</h2>
    <div class="grid2">
      ${resCard('m', '领工资、做选择得到；培训要花')}${resCard('t', '学习得到；攻关项目要交 3 个')}
      ${resCard('r', '守住底线、导师、峰会得到')}${resCard('p', '在项目格交技术换来，最值钱')}
    </div>
    <p class="mini">东西不够交的时候：<b>有多少交多少</b>，不会变成负数。项目格技术不够的话，就接个外包小活 +1${ri('m')}。</p>
  </div>`));
  // 第 4 页：伦理困境
  P.push(page(`<div class="doc"><h1><span class="n">3</span>伦理困境（最重要的一格）</h1>
    <p>停在「伦理困境」格时，按下面 5 步来。这些两难都改编自工程师真实会遇到的情况，<b>没有标准答案</b>。</p>
    <div class="steps" style="--c:#e57b7b">
      <div><span><b>读卡：</b>你<b>右手边</b>的同学抽一张困境卡，把情境和 A、B 两个选项大声读给你听。</span></div>
      <div><span><b>猜一猜：</b>其他人把自己的猜猜卡 A 或 B <b>面朝下</b>放在桌上，猜你会怎么选。</span></div>
      <div><span><b>选择 + 说理由：</b>你说出选 A 还是 B，再用<b>一句话</b>说说为什么。理由比答案更重要！</span></div>
      <div><span><b>翻开：</b>大家一起翻开猜猜卡，猜对的人各 +1${ri('m')}。</span></div>
      <div><span><b>结算：</b>按你选的那一项拿或交代币，移动信任标记，最后一起读读卡底的「想一想」。用过的困境卡放在牌堆旁边。</span></div>
    </div>
    <div class="grid2">
      <div class="box tint" style="--c:#6f6585"><h3>${ic('bomb')}带 ${ri('h')} 的选项 = 捷径</h3>
        <p class="mini">选了它：按卡上写的数量抽<b>隐患卡</b>，<b>面朝下</b>放在角色卡的隐患区，<b>自己也不许偷看</b>；信任 −2。<br>
        放弃了它（选了另一项）：信任 +1。<br>两个选项都没有 ${ri('h')} 的卡（真正的两难）：信任不动。</p></div>
      <div class="box tint" style="--c:#d9625e"><h3>${ic('triangle-alert')}隐患卡什么时候翻开</h3>
        <p class="mini">① 你停在「安全审计」格：翻开<b>你自己</b>的全部隐患卡。<br>② 有人抽到事件「质量暴雷」：<b>所有人</b>翻开全部隐患卡。<br>③ 游戏结束：所有人翻开剩下的。<br>
        翻开后照卡上做（罚金币、扣星星，也可能侥幸没事），然后<b>面朝上</b>放在自己面前，不再放回。</p></div>
    </div>
    <div class="box tint" style="--c:#4f9e5a"><h3>${ic('heart-handshake')}行业信任（大家共用）</h3>
      <p class="mini">信任条从 6 开始，最高 10。<b>降到 0：信任危机</b>——所有人 −2${ri('m')}，手里还有面朝下隐患卡的人再 −2${ri('r')}，然后把标记放回 3。<br>
      <b>游戏结束时信任 ≥ 6：</b>所有人 +3${ri('m')}（口碑红利）。一个人的捷径，会让整个行业一起付出代价。</p></div>
    <div class="say">${mascot(16)}<div class="bub"><b>为什么要这样设计？</b>现实中，走捷径的后果往往不会马上出现，出不出事、出多大的事常常靠运气——所以隐患卡要面朝下、随机抽。可「这次没出事」不等于「做对了」。</div></div>
    <div class="box"><h3 style="--c:var(--pri)">${ic('layers')}卡角上的标签：三种工程思维</h3>
      <p class="mini">${Object.entries(D.LENSES).map(([k, l]) => `<b style="color:${l.color}">${k}</b>：${l.desc}`).join('<br>')}</p></div>
  </div>`));
  // 第 5 页：结束与复盘
  P.push(page(`<div class="doc"><h1><span class="n">4</span>游戏结束和算分</h1>
    <p>标准局：有人<b>第 2 次</b>经过（或停在）入职报到，继续把这一轮打完——打到先手玩家<b>右手边</b>那位为止，让每个人走的次数一样多。快速局是第 1 次。</p>
    <div class="steps">
      <div><span><b>翻开</b>所有人剩下的隐患卡，照卡上做。</span></div>
      <div><span><b>信任红利：</b>信任 ≥ 6 的话，所有人 +3${ri('m')}。</span></div>
      <div><span><b>算分：</b>用计分表，金币×1 + 技术×1 + 星星×2 + 奖杯×5。最高分是 MVP 工程师；平分时，面前隐患卡少的人赢。</span></div>
    </div>
    <h2>${ic('award')}你是哪种工程师？</h2>
    <p class="muted">数一数你面前的隐患卡（翻开过的都算）：</p>
    <div class="grid3">
      <div class="kit" style="--c:#74bf7e">${ic('shield-check')}<span><b style="margin:0;font-size:9.5pt">守护者</b><br>0 张：每次都守住了底线</span></div>
      <div class="kit" style="--c:#5bb5d6">${ic('scale')}<span><b style="margin:0;font-size:9.5pt">务实派</b><br>1–2 张：偶尔向现实妥协</span></div>
      <div class="kit" style="--c:#e57b7b">${ic('flame')}<span><b style="margin:0;font-size:9.5pt">冒险家</b><br>3 张以上：现实中可能伤到别人</span></div>
    </div>
    <h2>${ic('message-circle-question')}赛后聊一聊（5 分钟，4F 复盘）</h2>
    <div class="grid2 mini">
      <div class="box"><b>Feeling 感受</b>　哪一张困境卡让你犹豫了最久？</div><div class="box"><b>Fact 事实</b>　你选了什么？付出了什么代价？</div>
      <div class="box"><b>Finding 发现</b>　现实中，由谁、依据什么来做这样的取舍？</div><div class="box"><b>Future 未来</b>　以后真遇到类似的事，你会怎么做？</div>
    </div>
    <h2>${ic('pencil')}动手做一张自创困境卡</h2>
    <p class="mini">用空白困境卡写一个你身边的两难，比如「小组作业有人没干活，展示时要不要写上他的名字？」「发现好朋友抄作业，要不要告诉他别这样？」按「情境 — 选项 A / B — 结果」来写，两个选项都要有代价。写好后洗进困境卡堆里一起玩。</p>
    <h2>${ic('circle-help')}常见问题</h2>
    <div class="mini" style="display:flex;flex-direction:column;gap:1.4mm">
      <div><b>牌抽完了怎么办？</b>把用过的牌洗一洗重新用。隐患卡如果抽完了，就用小纸条写「隐患」代替（结束时算作罚 3 金币）。</div>
      <div><b>能偷看自己的隐患卡吗？</b>不能。就像现实里，你也不知道哪一个隐患会出事。</div>
      <div><b>机遇卡「再来一次」之后，又停在别的格子？</b>照常做那一格的事。</div>
      <div><b>2 个人怎么玩？</b>规则一样，猜一猜只有一个人猜。</div>
      <div><b>小学生觉得难？</b>可以先不用猜猜卡和信任条，结束时只比星星和奖杯。熟悉以后再加回来。</div>
    </div></div>`));
  // 第 6 页：给老师 / 组织者
  const cmp = [
    ['人数', '3–6 人，人不够可以加机器人', '2–6 人'],
    ['局长', '固定轮数（标准 6–8 轮 / 快速 5 轮）', '走 2 圈（快速局 1 圈）'],
    ['隐患', '隐患值，结算时每个 −3 分；两轮后「回响」按概率触发', '抽隐患卡面朝下，审计 / 暴雷 / 结束时翻开——用「盲抽」代替电脑掷概率'],
    ['坚守的好报', '两轮后可能有好的回响奖励', '直接多给星星，结算更简单'],
    ['猜一猜', '手机上投票，自动结算', '猜猜卡面朝下，一起翻开'],
    ['行业信任', '自动计算', '棋盘中间的信任条，手动移动标记'],
    ['计分', '自动计分 + 结算页复盘', '计分表 + 4F 复盘问题'],
    ['新增', '—', '「说一句理由」、自创困境卡 / 事件卡、「热心帮忙」互动机遇卡、困境卡 A/B 位置打乱'],
  ];
  P.push(page(`<div class="doc"><h1><span class="n">5</span>给老师和组织者</h1>
    <p>纸牌版和线上版用的是<b>同一套</b>角色、棋盘、事件卡和困境卡，只把电脑擅长、纸面麻烦的部分改得更简单，方便没接触过的同学和小朋友直接上手。</p>
    <table class="t"><tr><th style="width:18mm"></th><th>线上版</th><th>纸牌版</th></tr>${cmp.map(r => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table>
    <h2>${ic('scroll-text')}和课程要求的对应</h2>
    <table class="t"><tr><th>课程要求</th><th>纸牌版里</th></tr>
      <tr><td>角色卡 ≥ 4 张，初始资源和专属技能不同</td><td>6 张岗位角色卡，开局资源和技能各不相同</td></tr>
      <tr><td>事件卡 ≥ 12 张，改编自真实事件并注明来源</td><td>12 张行业事件卡（芯片断供、技术封锁、双碳政策、AI 算力爆发……卡底注明出处）+ 9 张机遇卡 + 18 张隐患卡</td></tr>
      <tr><td>伦理困境卡 ≥ 6 张，「情境—选项A/B—后果」结构</td><td>12 张，另有 3 张空白自创卡；每张标注工程思维类型，无标准答案</td></tr>
      <tr><td>棋盘：玩家沿产业链环节推进</td><td>24 格：芯片设计 → 晶圆制造 → 封装测试 → 终端应用</td></tr>
      <tr><td>规则通过「陌生人朗读测试」，一局 ≤ 40 分钟</td><td>本规则书 + 格子上直接印出效果；标准局约 30–40 分钟，快速局 15–20 分钟</td></tr>
    </table>
    <div class="box tint" style="--c:#ef8a5b"><h3>${ic('refresh-cw')}核心循环一句话</h3>
      <p class="mini">玩家通过<b>【掷骰走格、学习、攻关】</b>获取<b>【金币、技术、星星】</b>，用以<b>【完成项目拿奖杯】</b>，同时应对<b>【行业事件和伦理困境】</b>，最终<b>【总分最高成为 MVP 工程师】</b>——而每一次走捷径，都会让隐患和行业信任跟着你走到最后。</p></div>
    <div class="box"><h3 style="--c:var(--ink2)">${ic('book-open')}素材与来源</h3>
      <p class="mini">事件卡为基于公开报道的改编，仅用于教学。图标：Lucide（ISC）；头像：DiceBear Big Smile，作者 Ashley Seo（CC BY 4.0）；字体：站酷快乐体、Fredoka（SIL OFL）。<br>
      制作小组：${D.MEMBERS.join('、')}　·　线上版：${D.GAME_URL}</p></div>
  </div>`));
  return P.map((p, i) => i ? p.replace('</section>', `<div class="pg-foot">芯途抉择 · 纸牌版规则书　${i + 1} / 6</div></section>`) : p);
}

// ---------- 组装并打印 ----------
const kitParts = { board: [boardHalf('L'), boardHalf('R')], roles: rolePages(), cards: cardPages(), tokens: tokenPages(), pawns: [pawnPage()], score: [scorePage()] };
let n = 2; const range = k => { const a = n, b = n + kitParts[k].length - 1; n = b + 1; return a === b ? `${a}` : `${a}–${b}`; };
const pageMap = { board: range('board'), roles: range('roles') };
const cardStart = n; range('cards');
const fronts = [], backs = [];
for (let i = 0; i < kitParts.cards.length; i++) (i % 2 ? backs : fronts).push(cardStart + i);
pageMap.fronts = fronts.join('、'); pageMap.backs = backs.join('、');
pageMap.tokens = range('tokens'); pageMap.pawns = range('pawns'); pageMap.score = range('score');
pageMap.single = `1-${cardStart - 1},${fronts.join(',')},${backs[backs.length - 1] + 1}-${n - 1}`;
const kit = [kitCover(pageMap), ...Object.values(kitParts).flat()];

// 半张棋盘放在 iframe 里：直接裁切的话，被裁掉的部分会让 Chrome 把整份 PDF 缩小打印
const halfDoc = side => html('棋盘', [`<div style="position:absolute;left:${side === 'L' ? 0 : -168}mm;top:0">${boardHTML()}</div>`]).replace('<style>', '<style>html,body{width:168mm;height:252mm;overflow:hidden;margin:0}');
for (const side of ['L', 'R']) fs.writeFileSync(path.join(TMP, `board-${side}.html`), halfDoc(side));
const docs = [
  ['rules', html('芯途抉择 纸牌版 规则书', rulePages())],
  ['print-kit', html('芯途抉择 纸牌版 打印素材', kit)],
  ['board-a3', html('芯途抉择 纸牌版 棋盘 A3', [boardA3()], 'a3', 'A3 landscape')],
];
const browser = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => fs.existsSync(p));
if (!browser) throw new Error('没找到 Chrome 或 Edge');
// 用 DevTools 协议打印：命令行 --print-to-pdf 会把超出页面的内容整体缩小，这里固定 scale = 1
const PORT = 9333;
const chrome = spawn(browser, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(TMP, 'profile')}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) { await sleep(200); try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch { } }
const ws = new WebSocket(wsUrl);
await new Promise(r => ws.onopen = r);
let seq = 0; const waiting = {};
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiting[m.id]) { waiting[m.id](m); delete waiting[m.id]; } };
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; waiting[id] = m => m.error ? rej(new Error(m.error.message)) : res(m.result); ws.send(JSON.stringify({ id, method, params })); });
await cdp('Page.enable'); await cdp('Runtime.enable');
try {
  for (const [name, src] of docs) {
    const f = path.join(TMP, name + '.html');
    fs.writeFileSync(f, src);
    await cdp('Page.navigate', { url: pathToFileURL(f).href });
    for (let i = 0; i < 100; i++) {
      await sleep(150);
      const r = await cdp('Runtime.evaluate', { expression: 'document.readyState === "complete" && document.fonts.status === "loaded" && [...document.images].every(i => i.complete)', returnByValue: true });
      if (r.result.value) break;
    }
    await sleep(300);
    const { data } = await cdp('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, scale: 1, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
    fs.writeFileSync(path.join(OUT, name + '.pdf'), Buffer.from(data, 'base64'));
    console.log('已生成 docs/paper/' + name + '.pdf');
  }
} finally { ws.close(); chrome.kill(); }
console.log('素材包页码：', pageMap);
