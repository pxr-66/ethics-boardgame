// 图标工具：I() 生成 SVG；rt() 把文本里的 [m] 资源标记和 {icon} 标记渲染成图标
function I(name, cls = '', style = '') {
  const body = ICONS[name] || ICONS['circle-help'];
  return `<svg class="ic ${cls}" ${style ? `style="${style}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function resIcon(k) { const r = RES[k]; return `<span class="ri" style="color:${r.color}" title="${r.name}">${I(r.icon)}</span>`; }
// 富文本：先转义，再替换标记（模板里的 HTML 由调用方自己拼接，不经过这里）
function rt(s) {
  return esc(s).replace(/\[(m|t|r|p|h)\]/g, (_, k) => resIcon(k))
    .replace(/\{([a-z0-9-]+)\}/g, (m, n) => ICONS[n] ? I(n, 'inl') : m);
}
// 资源变化，例如 +2[m] −1[t]
function fmtRes(d) {
  return Object.entries(d || {}).filter(([, v]) => v).map(([k, v]) =>
    `<span class="dv ${(k === 'h' ? v < 0 : v > 0) ? 'up' : 'down'}">${v > 0 ? '+' : '−'}${Math.abs(v)}${resIcon(k)}</span>`).join('');
}
function avColor(av) { const i = AVATARS.indexOf(av); return AV_COLORS[(i < 0 ? 0 : i) % AV_COLORS.length]; }
const avSrc = av => `img/avatars/${AVATARS.includes(av) ? av : AVATARS[0]}.svg`;
// 头像：插画 + 外圈（可传角色色）
function avatarHTML(p, size = 40, ring) {
  const c = ring || avColor(p.avatar);
  return `<span class="avatar" style="--ac:${c};width:${size}px;height:${size}px"><img src="${avSrc(p.avatar)}" alt="" draggable="false"></span>`;
}
// 吉祥物「小芯」
function mascot(size = 56, cls = '') { return `<img class="mascot ${cls}" src="img/mascot.svg" width="${size}" height="${size}" alt="小芯">`; }
