// 应用主控：页面切换、房间创建/加入、房主同步、机器人、结算
const App = (() => {
  const $ = s => document.querySelector(s);
  const saved = JSON.parse(localStorage.getItem('ecg_me') || 'null');
  const me = saved || { id: 'p' + Math.random().toString(36).slice(2, 10), name: '', avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)] };
  // 旧版本存的是 emoji 头像，换成新图标
  if (!AVATARS.includes(me.avatar)) me.avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let S = null, isHost = false, solo = false, code = null, botTimer = null, lastSeen = {}, pingTimer = null, beatTimer = null, endShown = false, joined = false;

  // 把 data-i="图标名" 的按钮补上图标
  function iconize(root = document) {
    root.querySelectorAll('[data-i]').forEach(el => { if (!el.querySelector(':scope > svg.ic')) el.insertAdjacentHTML('afterbegin', I(el.dataset.i)); });
  }
  function saveMe() { me.name = (me.name || '').trim().slice(0, 8); localStorage.setItem('ecg_me', JSON.stringify(me)); renderMe(); }
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    [...document.body.classList].filter(c => c.startsWith('page-')).forEach(c => document.body.classList.remove(c));
    document.body.classList.add('page-' + id);
  }
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); }
  function modal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.add('show'); }
  function closeModal(silent) { $('#modal').classList.remove('show'); if (!silent && S && $('#game').classList.contains('active')) Game.refresh(); }
  // 通用弹窗卡片
  const card = (color, icon, title, sub, body) => `<div class="card" style="--cc:${color}"><div class="card-head">
    <div class="card-ic">${I(icon)}</div><h2>${title}</h2>${sub ? `<div class="card-who">${sub}</div>` : ''}</div><div class="card-body">${body}</div></div>`;

  function renderMe() {
    $('#meChip').innerHTML = `${avatarHTML(me, 40)}<span class="nm">${me.name ? esc(me.name) : '还没有名字'}</span><small>${I('pencil')}${me.name ? '修改' : '设置'}</small>`;
  }
  $('#teamNames').innerHTML = MEMBERS.map((n, i) => `<span style="--c:${AV_COLORS[i]}">${n}</span>`).join('');

  // 编辑名字/头像
  function editMe(after) {
    modal(card('#ef8a5b', 'user-round', '设置你的名字', '联机时同学们会看到它', `<div class="name-form">
        <input id="mName" maxlength="8" placeholder="输入你的名字（最多 8 个字）" value="${esc(me.name)}" aria-label="你的名字">
        <div class="av-grid" id="mAv">${AVATARS.map(a => `<button class="${a === me.avatar ? 'on' : ''}" data-a="${a}" aria-label="头像">${avatarHTML({ avatar: a }, 40)}</button>`).join('')}</div>
        <button class="btn xl pri" id="mOk">${I('check')}确定</button></div>`));
    const inp = $('#mName'); setTimeout(() => inp.focus(), 100);
    $('#mAv').onclick = e => { const b = e.target.closest('button'); if (!b) return; $('#mAv .on')?.classList.remove('on'); b.classList.add('on'); me.avatar = b.dataset.a; FX.sfx.click(); };
    const ok = () => { if (!inp.value.trim()) return toast('名字不能为空'); me.name = inp.value; saveMe(); closeModal(); after && after(); };
    $('#mOk').onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
  }
  // 进入任何房间前：第一次玩先过教程（可跳过），至少要有名字
  function ensureReady(next) {
    if (!localStorage.getItem('ecg_tut')) {
      modal(card('#a68bd8', 'graduation-cap', '第一次玩？', '跟小芯花 2 分钟看看教程，马上就会玩',
        `${mascot(72, 'say-m')}<button class="btn xl pri" id="gTut">${I('book-open')}看新手教程（推荐）</button><button class="btn" id="gSkip">我会玩，跳过</button>`));
      $('#gTut').onclick = () => { closeModal(); Tutorial.open(() => next(), true); };
      $('#gSkip').onclick = () => { closeModal(); localStorage.setItem('ecg_tut', '1'); me.name ? next() : editMe(next); };
      return;
    }
    me.name ? next() : editMe(next);
  }

  // ---------- 房主逻辑 ----------
  function hostCommit() {
    S.ts = Date.now();
    if (!solo) { Net.publishState(S); localStorage.setItem('ecg_host_' + code, JSON.stringify(S)); }
    onState(S);
    scheduleBot();
  }
  function hostHandle(m) {
    if (!S || !m || !m.from) return;
    lastSeen[m.from] = Date.now();
    const p = Engine.find(S, m.from);
    if (m.type === 'join') {
      if (p) { if (p.online === false) { p.online = true; hostCommit(); } else Net.publishState(S); return; }
      if (S.phase !== 'lobby' || S.players.length >= 6) return;
      const av = AVATARS.includes(m.avatar) ? m.avatar : AVATARS[0];
      Engine.addPlayer(S, { id: m.from, name: String(m.name || '玩家').slice(0, 8), avatar: av });
      toast(`${String(m.name || '玩家').slice(0, 8)} 加入了房间`); FX.sfx.click();
      hostCommit();
    } else if (m.type === 'role') { Engine.pickRole(S, m.from, m.role); hostCommit(); }
    else if (m.type === 'chat') { Engine.chat(S, m.from, m.text); hostCommit(); }
    else if (m.type === 'act') { Engine.act(S, m.from, m.a, m.v); hostCommit(); }
    else if (m.type === 'leave') {
      if (S.phase === 'lobby') { Engine.removePlayer(S, m.from); hostCommit(); }
      else if (p) { p.online = false; hostCommit(); }
    } else if (m.type === 'ping' && p && p.online === false) { p.online = true; hostCommit(); }
  }
  // 机器人和掉线玩家由房主代为操作；等动画播完再行动
  // 同一步只排一次：聊天和投票不会重置计时
  let botKey = '';
  function scheduleBot() {
    const c = S && ['roll', 'resolve', 'after'].includes(S.phase) ? Engine.cur(S) : null;
    if (!c || (!c.bot && c.online !== false)) { clearTimeout(botTimer); botTimer = null; botKey = ''; return; }
    const key = [S.round, S.turn, S.phase, S.pending ? S.pending.seq : 0].join(':');
    if (key === botKey && botTimer) return;
    clearTimeout(botTimer); botKey = key;
    const dilemma = S.phase === 'resolve' && S.pending && S.pending.kind === 'dilemma';
    botTimer = setTimeout(() => {
      botTimer = null;
      const mv = Engine.botMove({ ...S, players: S.players.map(p => p.id === c.id ? { ...p, bot: true } : p) });
      if (!mv) return;
      Engine.act(S, c.id, mv[0], mv[1]); hostCommit();
    }, S.phase === 'roll' ? 1400 : dilemma ? 8000 : S.phase === 'resolve' ? 4200 : 2400);
  }
  function startPresence() {
    clearInterval(beatTimer);
    beatTimer = setInterval(() => {
      if (!S || solo) return;
      S.hb = Date.now();
      const now = Date.now(); let changed = false;
      for (const p of S.players) {
        if (p.bot || p.id === me.id) continue;
        if (!lastSeen[p.id]) lastSeen[p.id] = now;
        if (now - lastSeen[p.id] > 20000) {
          if (S.phase === 'lobby') { Engine.removePlayer(S, p.id); changed = true; toast(`${p.name} 离开了`); }
          else if (p.online !== false) { p.online = false; changed = true; }
        }
      }
      changed ? hostCommit() : Net.publishState(S);
    }, 8000);
  }

  // 本地或远程的动作入口
  function act(a, v) {
    FX.sfx.click();
    if (isHost) { Engine.act(S, me.id, a, v); hostCommit(); }
    else Net.send({ type: 'act', from: me.id, a, v });
  }
  function sendChat(text) {
    text = String(text || '').trim(); if (!text || !S) return;
    if (isHost) { Engine.chat(S, me.id, text); hostCommit(); }
    else Net.send({ type: 'chat', from: me.id, text });
  }
  function sendRole(role) {
    if (isHost) { Engine.pickRole(S, me.id, role); hostCommit(); }
    else Net.send({ type: 'role', from: me.id, role });
  }

  // ---------- 状态渲染 ----------
  function onState(s) {
    if (!s) return;
    if (s.closed) { if (!isHost) { toast('房主已解散房间'); goHome(); } return; }
    S = s;
    if (!isHost && !Engine.find(S, me.id) && S.phase !== 'lobby') { toast('你已不在这个房间'); return goHome(); }
    if (!isHost && S.phase === 'lobby' && !Engine.find(S, me.id) && joined) { toast('你被移出了房间'); return goHome(); }
    if (Engine.find(S, me.id)) joined = true;
    Chat.update(S, me.id);
    if (S.phase === 'lobby') { endShown = false; if ($('#game').classList.contains('active')) Game.leave(); show('lobby'); renderLobby(); }
    else if (S.phase === 'end') { if (!endShown) { endShown = true; Game.render(S); setTimeout(showEnd, 1200); } }
    else {
      if (!$('#game').classList.contains('active')) { show('game'); Game.enter(S, me.id, act); }
      else Game.render(S);
    }
  }

  function renderLobby() {
    document.body.classList.toggle('is-host', isHost);
    $('#roomCode').textContent = solo ? '单机' : code;
    renderQR();
    $('.lc-right').style.display = solo ? 'none' : '';
    $('#netStatus').style.display = solo ? 'none' : '';
    $('#pCount').textContent = `${S.players.length}/6`;
    $('#playerList').innerHTML = S.players.map(p => {
      const r = ROLES.find(x => x.id === p.role);
      return `<div class="pl-item">${avatarHTML(p, 40, r && r.color)}<span class="nm">${esc(p.name)}<small>${r ? `<span style="color:${r.color}">${I(r.icon)}</span>${r.name}` : '还没选角色'}</small></span>
        ${p.id === S.hostId ? '<span class="tag">房主</span>' : ''}${p.bot ? '<span class="tag bot">机器人</span>' : ''}${p.id === me.id ? '<span class="tag me">我</span>' : ''}
        ${isHost && p.id !== me.id ? `<button class="kick" data-id="${p.id}" aria-label="移出">${I('x')}</button>` : ''}</div>`;
    }).join('') + (S.players.length < 3 ? `<div class="pl-empty">还差 <b style="color:var(--pri)">${3 - S.players.length}</b> 人才能开始<br>叫同学输入房间码，或添加机器人</div>` : '');
    $('#playerList').querySelectorAll('.kick').forEach(b => b.onclick = () => { Engine.removePlayer(S, b.dataset.id); hostCommit(); });
    const mine = Engine.find(S, me.id);
    $('#roleGrid').innerHTML = ROLES.map(r => {
      const owner = S.players.find(p => p.role === r.id);
      const on = mine && mine.role === r.id, taken = owner && !on;
      return `<button class="role-card ${on ? 'on' : ''} ${taken ? 'taken' : ''}" data-r="${r.id}" style="--rc:${r.color}" ${taken ? 'disabled' : ''}>
        ${on ? `<span class="chk">${I('check')}</span>` : owner ? `<span class="who">${avatarHTML(owner, 26)}</span>` : ''}
        <span class="r-ic">${I(r.icon)}</span><div class="rn">${r.name}</div><div class="rq">“${r.quote}”</div>
        <div class="rs"><b>${r.skill}</b>：${rt(r.desc)}</div>
        <div class="rr">${['m', 't', 'r'].map(k => `<span>${resIcon(k)}${r.start[k]}</span>`).join('')}</div></button>`;
    }).join('');
    $('#roleGrid').querySelectorAll('.role-card').forEach(b => b.onclick = () => { FX.sfx.click(); sendRole(mine && mine.role === b.dataset.r ? null : b.dataset.r); });
    const short = S.players.length < 3;
    $('#btnStart').disabled = short;
    $('#btnStart').innerHTML = `${I('rocket')}${short ? `还差 ${3 - S.players.length} 人` : '开始游戏'}`;
    $('#btnAddBot').disabled = S.players.length >= 6;
    $('#segLength').querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.v === S.length); b.setAttribute('aria-checked', b.dataset.v === S.length); });
  }
  // 扫码加入：只有网页地址（http/https）才能被别的手机打开，本地文件不显示二维码
  let qrFor = '';
  function renderQR() {
    const el = $('#roomQR'), url = /^https?:/.test(location.protocol) && !solo ? location.origin + location.pathname + '?room=' + code : '';
    if (url === qrFor) return; qrFor = url;
    if (!url || typeof qrcode !== 'function') { el.innerHTML = ''; return; }
    const q = qrcode(0, 'M'); q.addData(url); q.make();
    el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }).replace('fill="black"', 'fill="#4a3426"').replace(/<path /, '<path fill="#4a3426" ');
  }
  // ---------- 结算 ----------
  function showEnd() {
    closeModal(true); Game.leave();
    show('end'); FX.sfx.win(); FX.confetti();
    const rank = S.final.map(f => ({ ...Engine.find(S, f.id), score: f.score }));
    const roleOf = p => ROLES.find(x => x.id === p.role);
    const mvp = rank[0], r = roleOf(mvp);
    const title = Engine.engineerType(mvp).k === 'guard' && mvp.choices.good >= 2 ? '德才兼备 · 守住底线的卓越工程师' : mvp.res.p >= 3 ? '项目狂人 · 产业链上的攻坚主力' : '芯途之星 · 稳扎稳打的成长型工程师';
    $('#mvpCard').innerHTML = `<div class="mvp-badge">${I('sparkles')}MVP</div>
      <div class="mvp-av"><span class="crown">${I('crown')}</span>${avatarHTML(mvp, 104, '#f2b544')}</div>
      <div class="mvp-name">${esc(mvp.name)}</div><div class="mvp-role" style="color:${r.color}">${I(r.icon)}${r.name}</div>
      <div class="mvp-score">${mvp.score}<small> 分</small></div><div class="mvp-title">${I('award')}${title}</div>`;
    $('#podium').innerHTML = rank.map((p, i) => `<div class="pd-row ${p.id === me.id ? 'me' : ''}" style="animation-delay:${.7 + i * .12}s">
      <span class="rk">${i + 1}</span>${avatarHTML(p, 38, roleOf(p).color)}
      <span class="nm">${esc(p.name)}${p.id === me.id ? '（我）' : ''}<small>${roleOf(p).name}</small></span>
      <span class="bd">${['m', 't', 'r', 'p', 'h'].filter(k => k !== 'h' || p.res.h).map(k => `<span>${resIcon(k)}${p.res[k]}${RES[k].w !== 1 ? `×${RES[k].w}` : ''}</span>`).join('')}</span>
      <span class="tt">${p.score}</span></div>`).join('');
    // 特别奖项
    const best = (f, cond = () => true) => { const c = rank.filter(cond); return c.length ? c.reduce((a, b) => f(b) > f(a) ? b : a) : null; };
    const aw = [];
    const a1 = best(p => p.res.r); a1 && aw.push(['star', '#e88aa8', '最佳声誉奖', a1, `声誉 ${a1.res.r}`]);
    const a2 = best(p => p.res.p); a2 && a2.res.p && aw.push(['trophy', '#ef8a5b', '攻坚先锋奖', a2, `完成 ${a2.res.p} 个项目`]);
    const a3 = best(p => p.choices.good, p => p.res.h === 0 && p.choices.good > 0); a3 && aw.push(['shield-check', '#74bf7e', '守住底线奖', a3, `零隐患，${a3.choices.good} 次坚守原则`]);
    const a4 = best(p => p.res.t); a4 && aw.push(['cpu', '#5bb5d6', '技术大牛奖', a4, `技术 ${a4.res.t}`]);
    const a6 = best(p => p.guess || 0, p => (p.guess || 0) > 0); a6 && aw.push(['thumbs-up', '#a68bd8', '洞察人心奖', a6, `${a6.guess} 次猜中队友的选择`]);
    const a5 = best(p => p.res.h, p => p.res.h > 0); a5 && aw.push(['bomb', '#8a7f99', '风险玩家', a5, `留下 ${a5.res.h} 个隐患，现实中可要小心`]);
    // 4F 复盘：回顾自己这局的伦理抉择
    const mine = Engine.find(S, me.id), picks = (mine && mine.picks) || [];
    renderEngineerType(mine); renderTrustEnd(); renderRoomPicks();
    $('#myPicks').innerHTML = picks.length ? `<div class="picks-h">${I('scale', 'inl')}你这局的伦理抉择</div>` + picks.map(x => {
      const c = DILEMMAS[x.card], o = c[x.pick], L = LENSES[c.lens];
      return `<div class="pick" style="--lc:${L.color}"><b>${c.title}</b><span class="tag-l">${c.lens}</span>
        <div>你选了 <em>${x.pick}：${o.label}</em>${(() => { const le = (S.lateEchoes || []).find(e => e.id === me.id && e.card === x.card); return le ? `<div class="late">${I('refresh-cw', 'inl')}后来：${le.text}</div>` : ''; })()}${o.d.h ? ` <span style="color:var(--bad)">${resIcon('h')}留下隐患</span>` : ''}</div><small>${c.think}</small></div>`;
    }).join('') : '';
    $('#awards').innerHTML = aw.map(([ic, c, t, p, d], i) => `<div class="aw" style="--c:${c};animation-delay:${1.2 + i * .1}s"><span class="a-ic">${I(ic)}</span>
      <div><b>${t}</b><div class="who">${avatarHTML(p, 20)}${esc(p.name)}</div><span class="d">${d}</span></div></div>`).join('');
  }

  // 你是哪种工程师 + 三种工程思维下的坚守情况（横向条形，每种思维一行）
  function renderEngineerType(p) {
    const el = $('#etype'); if (!p) { el.innerHTML = ''; return; }
    const t = Engine.engineerType(p), st = Engine.lensStats(p);
    el.style.setProperty('--tc', t.color);
    el.innerHTML = `<div class="et-head"><span class="et-ic">${I(t.icon)}</span><div><small>${avatarHTML(p, 18)} ${esc(p.name)}，这局的你是</small><b>${t.name}</b><p>${t.desc}</p></div></div>
      <div class="et-lens" role="table" aria-label="三种工程思维下的选择">
        <div class="et-cap">三种工程思维下，你守住底线的次数</div>
        ${Object.entries(LENSES).map(([k, l]) => { const s = st[k];
          return `<div class="et-row" role="row" style="--lc:${l.color}"><span class="et-n" role="cell">${I(l.icon)}${k}</span>
            <span class="et-bar" role="cell">${s.seen ? Array.from({ length: s.seen }, (_, i) => `<i class="${i < s.kept ? 'kept' : 'slip'}"></i>`).join('') : '<em>没遇到</em>'}</span>
            <span class="et-v" role="cell">${s.seen ? `${s.kept} / ${s.seen}` : ''}</span></div>`; }).join('')}
        <div class="et-key"><span><i class="kept"></i>坚守</span><span><i class="slip"></i>走了捷径</span></div>
      </div>`;
  }
  function renderTrustEnd() {
    const el = $('#trustEnd'), t = S.trust, ok = S.trustBonus;
    el.className = 'card-lite trust-end ' + (ok ? 'ok' : 'bad');
    el.innerHTML = `<span class="te-ic">${I(ok ? 'heart-handshake' : 'triangle-alert')}</span><div><b>行业信任最终 ${t} / ${Engine.TRUST_MAX}${S.crises ? ` · 发生了 ${S.crises} 次信任危机` : ''}</b>
      <span>${ok ? '大家一起守住了行业口碑，所有人获得 +3 资金红利。' : '信任没能保持住，错过了口碑红利。一个人的捷径，会让所有人一起付出代价。'}</span></div>`;
  }
  // 同一张困境卡，房间里的人都怎么选
  function renderRoomPicks() {
    const el = $('#roomPicks'), byCard = {};
    (S.history || []).forEach(h => { (byCard[h.card] = byCard[h.card] || { A: [], B: [] })[h.pick].push(Engine.find(S, h.id)); });
    const cards = Object.keys(byCard);
    if (!cards.length) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = `<h3>${I('users-round')}大家都是怎么选的</h3>` + cards.map(k => {
      const c = DILEMMAS[k], v = byCard[k], n = v.A.length + v.B.length;
      const side = key => `<div class="rp-side ${c[key].d.h ? 'risky' : ''}"><span class="rp-k">${key}</span><span class="rp-l">${c[key].label}${c[key].d.h ? '<small> · 有隐患</small>' : ''}</span>
        <span class="rp-who">${v[key].filter(Boolean).map(p => avatarHTML(p, 22)).join('')}</span></div>`;
      return `<div class="rp"><div class="rp-t"><b>${c.title}</b><span>${n} 人遇到</span></div>
        <div class="rp-bar" aria-hidden="true"><i style="flex:${v.A.length}"></i><i style="flex:${v.B.length}"></i></div>${side('A')}${side('B')}</div>`;
    }).join('') + `<p class="rp-tip">${I('message-circle-question', 'inl')}挑一张选法不一样的卡，请两边各说说理由吧。</p>`;
  }

  // ---------- 房间 ----------
  const genCode = () => String(1000 + Math.floor(Math.random() * 9000));
  function resetSession() {
    clearTimeout(botTimer); botTimer = null; botKey = ''; clearInterval(beatTimer); clearInterval(pingTimer);
    Net.leave();
    if ($('#game').classList.contains('active') || S) Game.leave();
    Chat.reset();
    S = null; qrFor = ''; isHost = false; solo = false; code = null; joined = false; endShown = false; lastSeen = {};
    document.body.classList.remove('is-host');
    $('#game').classList.remove('active');
  }
  function netStatus(ok) { const el = $('#netStatus'); el.className = 'net-status ' + (ok ? 'ok' : 'bad'); el.textContent = ok ? '已连接联机服务器' : '网络断开，正在重连…'; }

  async function createRoom(restore) {
    resetSession();
    isHost = true; toast('正在创建房间…');
    try {
      await Net.connect();
      if (restore) code = restore.code;
      else for (let i = 0; i < 5; i++) { code = genCode(); const old = await Net.peek(code, 1200); if (!old || Date.now() - (old.hb || old.ts) > 60000) break; }
      S = restore || Engine.newRoom(code, me);
      const mine = Engine.find(S, me.id); if (mine) { mine.name = me.name; mine.avatar = me.avatar; mine.online = true; }
      await Net.open(code, { up: hostHandle, status: netStatus });
      netStatus(true);
      localStorage.setItem('ecg_last', JSON.stringify({ code, host: true, t: Date.now() }));
      history.replaceState(null, '', location.pathname + '?room=' + code);
      startPresence(); hostCommit();
    } catch (e) { toast('连接联机服务器失败，请检查网络后重试'); goHome(); }
  }

  async function joinRoom(c) {
    c = String(c || '').trim();
    if (!/^\d{4}$/.test(c)) return toast('房间码是 4 位数字');
    resetSession(); toast('正在查找房间…');
    try {
      const st = await Net.peek(c);
      if (!st || Date.now() - (st.hb || st.ts) > 60000) { toast('没找到这个房间，检查一下房间码？'); return goHome(); }
      if (st.hostId === me.id) return createRoom(st);
      if (st.phase !== 'lobby' && !Engine.find(st, me.id)) { toast('这个房间已经开始游戏了'); return goHome(); }
      if (st.phase === 'lobby' && st.players.length >= 6 && !Engine.find(st, me.id)) { toast('房间已满（最多 6 人）'); return goHome(); }
      code = c;
      const hello = () => Net.send({ type: 'join', from: me.id, name: me.name, avatar: me.avatar });
      await Net.open(code, { state: onState, status: ok => { netStatus(ok); ok && hello(); } });
      netStatus(true);
      localStorage.setItem('ecg_last', JSON.stringify({ code, host: false, t: Date.now() }));
      history.replaceState(null, '', location.pathname + '?room=' + code);
      hello();
      pingTimer = setInterval(() => Net.send({ type: 'ping', from: me.id }), 6000);
      onState(st);
    } catch (e) { toast('连接联机服务器失败，请检查网络后重试'); goHome(); }
  }

  function startSolo() {
    resetSession(); isHost = true; solo = true; code = 'solo';
    S = Engine.newRoom(code, me); Engine.addBot(S); Engine.addBot(S); Engine.addBot(S);
    hostCommit();
  }

  function goHome() {
    if (code && !solo) {
      if (isHost) Net.clearRoom(); else Net.send({ type: 'leave', from: me.id });
      localStorage.removeItem('ecg_last'); localStorage.removeItem('ecg_host_' + code);
    }
    resetSession(); closeModal(true);
    history.replaceState(null, '', location.pathname);
    show('home'); renderContinue();
  }

  // 继续上一局（刷新页面或掉线后）
  function renderContinue() {
    $('#btnContinue')?.remove();
    const last = JSON.parse(localStorage.getItem('ecg_last') || 'null');
    if (!last || Date.now() - last.t > 3 * 3600e3) return;
    const b = document.createElement('button');
    b.className = 'btn xl'; b.id = 'btnContinue';
    b.innerHTML = `${I('play')}回到房间 ${last.code}`;
    b.onclick = () => {
      const st = last.host && JSON.parse(localStorage.getItem('ecg_host_' + last.code) || 'null');
      st ? createRoom(st) : joinRoom(last.code);
    };
    $('.home-btns').prepend(b);
  }

  // ---------- 按钮 ----------
  iconize();
  $('#btnMenu').innerHTML = I('menu');
  $('#meChip').onclick = () => editMe();
  $('#btnCreate').onclick = () => { FX.sfx.click(); ensureReady(() => createRoom()); };
  $('#btnSolo').onclick = () => { FX.sfx.click(); ensureReady(startSolo); };
  $('#btnTutorial').onclick = () => { FX.sfx.click(); Tutorial.open(() => show('home'), !me.name); };
  $('#btnJoin').onclick = () => {
    FX.sfx.click();
    ensureReady(() => {
      modal(card('#5bb5d6', 'key-round', '加入房间', '输入房主屏幕上的 4 位房间码', `<div class="name-form">
        <input id="jCode" inputmode="numeric" maxlength="4" placeholder="0000" aria-label="房间码" autocomplete="off"
          style="text-align:center;font-family:var(--fn);font-weight:700;font-size:40px;letter-spacing:16px;padding-left:32px">
        <button class="btn xl pri" id="jOk">${I('chevron-right')}加入</button>
        <button class="btn ghost" onclick="App.closeModal()">取消</button></div>`));
      const inp = $('#jCode'); setTimeout(() => inp.focus(), 100);
      inp.oninput = () => { inp.value = inp.value.replace(/\D/g, ''); };
      const ok = () => { const v = inp.value; closeModal(); joinRoom(v); };
      $('#jOk').onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
    });
  };
  const copy = t => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('已复制：' + t), () => prompt('复制下面的内容发给同学：', t));
  $('#btnCopyCode').onclick = () => copy(code);
  const inviteURL = () => location.origin + location.pathname + '?room=' + code;
  // 手机上调起系统分享（微信、QQ 等），不支持时复制链接
  $('#btnShare').onclick = async () => {
    const text = `来玩「芯途抉择」工程伦理桌游！房间码 ${code}`;
    if (navigator.share && /^https?:/.test(location.protocol)) { try { await navigator.share({ title: '芯途抉择', text, url: inviteURL() }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    copy(`${text}
${inviteURL()}`);
  };
  $('#btnAddBot').onclick = () => { Engine.addBot(S); hostCommit(); };
  $('#segLength').onclick = e => { const b = e.target.closest('button'); if (!b || !isHost) return; S.length = b.dataset.v; hostCommit(); };
  $('#btnStart').onclick = () => { if (Engine.start(S)) { FX.sfx.good(); hostCommit(); } };
  $('#btnLeave').onclick = goHome;
  $('#btnHome').onclick = goHome;
  $('#btnEndChat').onclick = () => Chat.toggle(true);
  $('#btnAgain').onclick = () => {
    S.phase = 'lobby'; S.log = []; S.pending = null; S.dice = null; S.final = null; S.decks = {}; S.lastMove = null;
    S.players.forEach(p => { p.res = { m: 0, t: 0, r: 0, p: 0, h: 0 }; p.pos = 0; p.choices = { good: 0, risky: 0 }; p.picks = []; p.guess = 0; });
    S.history = []; S.echoes = []; S.lateEchoes = []; S.trustBonus = false;
    hostCommit();
  };
  // 游戏菜单：手机上把小按钮收进一个面板
  function rulesCard() {
    modal(card('#5bb5d6', 'circle-help', '规则速查', '', `<div class="help-list">
      <div>${I('dices')}<span>轮到你时掷骰子前进，停在哪格触发哪格。</span></div>
      <div>${I('drafting-compass')}<span>项目格：花 3${resIcon('t')}攻关，得 1${resIcon('p')} 和 2${resIcon('m')}（主要得分方式）</span></div>
      <div>${I('graduation-cap')}<span>学习格攒技术；经过起点领工资 +2${resIcon('m')}</span></div>
      <div>${I('scale')}<span>伦理困境二选一，没有标准答案；带${resIcon('h')}隐患的选项要小心</span></div>
      <div>${I('search-check')}<span>安全审计会查处隐患；「质量暴雷」事件会让所有有隐患的人被罚</span></div>
      <div>${I('heart-handshake')}<span>行业信任大家共享：有人走捷径 −2，坚守 +1；到 0 全员受罚，结束时 ≥ 6 全员 +3${resIcon('m')}</span></div>
      <div>${I('refresh-cw')}<span>伦理选择两轮后可能「回响」，带来奖励或惩罚</span></div>
      <div class="formula" style="font-size:16px;display:block">总分 = ${resIcon('m')} + ${resIcon('t')} + ${resIcon('r')}<b>×2</b> + ${resIcon('p')}<b>×5</b> − ${resIcon('h')}<b>×3</b></div>
      <div>${I('crown')}<span>固定轮数后游戏结束，最高分为 MVP</span></div>
      <button class="btn pri" onclick="App.closeModal()">继续游戏</button></div>`));
  }
  function exitCard() {
    modal(card('#e57b7b', 'door-open', '确定要走吗？', isHost && !solo ? '你是房主，退出后房间会解散' : solo ? '单机对局不会保存' : '你的角色会由电脑托管，稍后可点「回到房间」回来',
      `<button class="btn xl pri" id="xOk">${I('log-out')}退出</button><button class="btn" onclick="App.closeModal()">再玩一会</button>`));
    $('#xOk').onclick = () => {
      if (!isHost && !solo) { Net.send({ type: 'leave', from: me.id }); resetSession(); closeModal(true); show('home'); renderContinue(); }
      else goHome();
    };
  }
  function menuCard() {
    modal(card('#f2b544', 'layers', '菜单', '', `<div class="menu-list">
      <button class="btn" id="mnRules">${I('circle-help')}规则速查</button>
      <button class="btn" id="mnCoach">${I('lightbulb')}小芯提示：${Game.coachOn ? '开' : '关'}</button>
      <button class="btn" id="mnSound">${I(FX.muted ? 'volume-x' : 'volume-2')}音效：${FX.muted ? '关' : '开'}</button>
      <button class="btn" id="mnExit">${I('door-open')}退出游戏</button>
      <button class="btn pri" onclick="App.closeModal()">继续游戏</button></div>`));
    $('#mnRules').onclick = rulesCard; $('#mnExit').onclick = exitCard;
    $('#mnCoach').onclick = () => { Game.toggleCoach(); menuCard(); };
    $('#mnSound').onclick = () => { FX.setMuted(!FX.muted); menuCard(); };
  }
  $('#btnMenu').onclick = () => { FX.sfx.click(); menuCard(); };
  $('#modal').onclick = e => { if (e.target.id === 'modal' && !$('#game').classList.contains('active')) closeModal(); };

  // ---------- 第二版：更新说明、纸牌版下载 ----------
  const NEWS_VER = 'v2';
  function newsCard() {
    modal(card('#ef8a5b', 'sparkles', '第二版更新啦', '2026 年 10 月 · 芯途抉择 v2', `<div class="help-list news-list">
      <div>${I('star')}<span><b>新增评分与评论</b>：主页点「评分评论」，给游戏打 1–5 星、写下感受。所有人都能看到大家的评分和每条评论，还能看到是多久前发的。</span></div>
      <div>${I('scroll-text')}<span><b>新增纸牌版</b>：没有手机也能玩！主页点「纸牌版」下载规则书和打印素材，A4 打印、剪一剪就能开局。</span></div>
      <div>${I('users')}<span><b>纸牌版专为青少年简化</b>：隐患卡面朝下盲抽、猜猜卡同时翻开、选完要说一句理由，还能自己写困境卡。</span></div>
      <div>${I('trophy')}<span>结算页新增「给游戏打分」按钮，玩完顺手留个评价。</span></div>
      <label class="news-skip"><input type="checkbox" id="nwSkip"> 这个版本不再自动弹出</label>
      <button class="btn pri" id="nwRate">${I('star')}去评分</button>
      <button class="btn" id="nwOk">知道了</button></div>`));
    const done = () => { if ($('#nwSkip').checked) localStorage.setItem('ecg_news', NEWS_VER); closeModal(); };
    $('#nwOk').onclick = done;
    $('#nwRate').onclick = () => { done(); Reviews.open(); };
  }
  // QQ、微信等 App 里的内置浏览器打不开 PDF，点下载会调起 App 自己的下载器，经常下载失败
  const inApp = /MicroMessenger|\bQQ\/|\bTIM\/|DingTalk|Weibo/i.test(navigator.userAgent);
  const appName = /MicroMessenger/i.test(navigator.userAgent) ? '微信' : /DingTalk/i.test(navigator.userAgent) ? '钉钉' : /Weibo/i.test(navigator.userAgent) ? '微博' : 'QQ';
  const openTip = `点右上角的「···」，选择「在浏览器打开」`;
  function paperCard() {
    const f = (file, icon, t, d) => inApp
      ? `<button class="btn paper-dl" data-f="${file}">${I(icon)}<span><b>${t}</b><small>${d}</small></span></button>`
      : `<a class="btn paper-dl" href="docs/paper/${file}" target="_blank" rel="noopener">${I(icon)}<span><b>${t}</b><small>${d}</small></span></a>`;
    modal(card('#74bf7e', 'scroll-text', '纸牌版', '打印出来，围坐一桌也能玩', `<div class="help-list">
      ${inApp ? `<div class="inapp-tip">${I('info')}<span>${appName}里没法直接下载 PDF。请${openTip}，再点「纸牌版」下载。</span></div>` : ''}
      <div>${I('users')}<span>2–6 人 · 10 岁以上 · 约 30 分钟。和线上版同一套角色、棋盘和卡牌，规则更简单。</span></div>
      ${f('rules.pdf', 'book-open', '规则书', 'A4 · 6 页，先读这个')}
      ${f('print-kit.pdf', 'scroll-text', '打印素材', 'A4 · 23 页：棋盘、角色卡、63 张卡牌、代币、棋子、计分表')}
      ${f('board-a3.pdf', 'flag', '整张棋盘（可选）', 'A3 · 1 页，打印店打一张就不用拼')}
      <div>${I('info')}<span>打印时选「实际大小 / 100%」，不要选「适合页面」。第 1 页有详细的打印和裁剪步骤。</span></div>
      <button class="btn" onclick="App.closeModal()">关闭</button></div>`));
    // 在 App 里点文件：不触发会失败的下载，告诉同学怎么换到浏览器，或者复制链接
    $('#modalBox').querySelectorAll('button.paper-dl').forEach(b => b.onclick = () => {
      const url = new URL('docs/paper/' + b.dataset.f, location.href).href;
      modal(card('#5bb5d6', 'link', '请在浏览器里下载', `${appName}里下载 PDF 会失败`, `<div class="help-list">
        <div>${I('pointer')}<span><b>方法一：</b>${openTip}，再点「纸牌版」下载。</span></div>
        <div>${I('copy')}<span><b>方法二：</b>复制下面的链接，粘贴到手机浏览器的地址栏里打开。</span></div>
        <div class="dl-link">${esc(url)}</div>
        <button class="btn pri" id="dlCopy">${I('copy')}复制链接</button>
        <button class="btn" id="dlBack">${I('chevron-left')}返回</button></div>`));
      $('#dlCopy').onclick = () => copy(url);
      $('#dlBack').onclick = paperCard;
    });
  }
  // 在 App 里打开时，主页顶部提示换到浏览器（下载和 3D 棋盘都更顺畅），可以关掉
  if (inApp && !sessionStorage.getItem('ecg_inapp_off')) {
    const bar = document.createElement('div');
    bar.className = 'inapp-bar';
    bar.innerHTML = `${I('info')}<span>在${appName}里打开的？${openTip}，下载和 3D 棋盘都更顺畅</span><button aria-label="关闭提示">${I('x')}</button>`;
    bar.querySelector('button').onclick = () => { bar.remove(); sessionStorage.setItem('ecg_inapp_off', '1'); };
    $('#home').prepend(bar);
  }
  $('#btnNews').onclick = () => { FX.sfx.click(); newsCard(); };
  $('#btnPaper').onclick = () => { FX.sfx.click(); paperCard(); };
  $('#btnReviews').onclick = () => { FX.sfx.click(); Reviews.open(); };
  $('#btnEndRate').onclick = () => { FX.sfx.click(); Reviews.open(); };

  // ---------- 启动 ----------
  renderMe(); renderContinue();
  const qRoom = new URLSearchParams(location.search).get('room');
  if (qRoom) ensureReady(() => {
    const last = JSON.parse(localStorage.getItem('ecg_last') || 'null');
    const st = last && last.host && last.code === qRoom && JSON.parse(localStorage.getItem('ecg_host_' + qRoom) || 'null');
    st ? createRoom(st) : joinRoom(qRoom);
  });
  // 等 3D 场景（ES 模块）加载完再去掉加载页；WebGL 不可用时也不卡住
  // 加载页消失后，一进主页就弹出更新说明（扫码进房间时不打扰）
  const hideLoader = () => {
    if ($('#loader').classList.contains('done')) return;
    $('#loader').classList.add('done');
    if (!qRoom && localStorage.getItem('ecg_news') !== NEWS_VER) setTimeout(() => { if ($('#home').classList.contains('active') && !$('#modal').classList.contains('show')) newsCard(); }, 500);
  };
  const boot = async () => {
    try { await document.fonts.load('40px "ZCOOL QingKe HuangYou"', '芯途抉择'); await Board3D.init($('#scene3d')); Game.on3DReady(); }
    catch (e) { console.warn('3D 初始化失败', e); }
    hideLoader();
  };
  if (window.Board3D) boot(); else addEventListener('board3d-ready', boot, { once: true });
  setTimeout(hideLoader, 6000);
  return { me, saveMe, show, toast, modal, closeModal, sendChat, card, get state() { return S; } };
})();
