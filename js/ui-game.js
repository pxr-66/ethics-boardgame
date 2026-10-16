// 游戏画面：手机优先的 HUD、3D 棋盘联动、卡牌弹窗、小芯提示
const Game = (() => {
  const $ = s => document.querySelector(s);
  let S = null, meId = null, send = null;
  let busy = false, seenMove = -1, prevRes = {}, modalSeq = -1, modalHidden = false, diceSeq = -1, lastTurnKey = '', lastLog = '';
  let coachOn = localStorage.getItem('ecg_coach') !== '0';
  const role = p => ROLES.find(r => r.id === p.role) || ROLES[0];
  const B = () => window.Board3D && window.Board3D.ready ? window.Board3D : null;
  const positions = () => Object.fromEntries(S.players.map(p => [p.id, p.pos]));

  // 告诉 3D 场景哪些区域被 HUD 遮住，让棋盘落在中间空出来的地方
  function syncInsets() {
    if (!B()) return;
    const top = $('#ticker').getBoundingClientRect().bottom + 8;
    const bottom = innerHeight - $('.hud-bottom').getBoundingClientRect().top + 8;
    B().setInsets({ top: Math.max(top, 70), bottom: Math.max(bottom, 120), left: 0, right: 0 });
  }
  addEventListener('resize', () => S && $('#game').classList.contains('active') && requestAnimationFrame(syncInsets));

  // 游戏中保持屏幕常亮（支持的浏览器）
  let wake = null;
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
      if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) { /* 不支持或被拒绝时忽略 */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S) keepAwake(true); });

  function tileCard(i) {
    const t = BOARD[i], tt = TILE_TYPES[t.type];
    App.modal(`<div class="card" style="--cc:${tt.color}"><div class="card-head"><span class="card-kind">${ZONES[t.zone].name} · 第 ${t.i} 格</span>
      <div class="card-ic">${I(tt.icon)}</div><h2>${t.name}</h2></div>
      <div class="card-body"><p>${rt(tt.tip)}</p><button class="btn pri" onclick="App.closeModal()">知道啦</button></div></div>`);
  }

  function enter(state, id, sender) {
    S = state; meId = id; send = sender;
    seenMove = S.moveSeq; diceSeq = S.dice ? S.dice.seq : -1; modalSeq = -1; modalHidden = false; busy = false; lastTurnKey = ''; lastLog = '';
    prevRes = {}; S.players.forEach(p => { prevRes[p.id] = { ...p.res }; });
    document.body.classList.replace('mode-menu', 'mode-game');
    keepAwake(true);
    renderAll();
    if (B()) {
      B().setMode('game'); B().setPlayers(S.players, positions()); B().showDice(true);
      B().onTileClick(tileCard);
      requestAnimationFrame(syncInsets);
    }
  }

  // 收到新状态：如果有新骰子，先播放掷骰和走棋动画，再刷新界面
  async function render(state) {
    S = state;
    if (busy) return;
    if (S.dice && S.dice.seq !== diceSeq) {
      diceSeq = S.dice.seq;
      const mv = S.lastMove, n = S.dice.n;
      busy = true;
      App.closeModal(true);
      renderTop(); renderAction(); renderSide(true);
      FX.sfx.dice();
      if (B()) {
        B().setCurrent(mv ? mv.id : null);
        await B().roll(n);
        if (mv && S.moveSeq !== seenMove) {
          seenMove = S.moveSeq;
          await new Promise(r => setTimeout(r, 250));
          await B().hop(mv.id, mv.from, mv.steps, () => FX.sfx.step());
        }
      } else await new Promise(r => setTimeout(r, 900));
      seenMove = S.moveSeq;
      busy = false;
      return render(S);
    }
    renderAll();
  }

  function renderAll() {
    renderTrust(); renderTop(); renderModal(); renderAction(); renderSide(); renderTicker(); renderCoach();
    if (B()) {
      B().setPlayers(S.players, positions());
      B().setCurrent(S.phase === 'end' ? null : Engine.cur(S).id);
      if (S.pending && S.phase !== 'roll') B().highlight(S.pending.tile); else B().highlight(-1);
    }
  }

  // 顶部：轮数 + 玩家条（当前玩家高亮，点开看详情）
  function renderTop() {
    const c = Engine.cur(S), mine = c.id === meId;
    $('#gRound').innerHTML = `第 ${S.round} 轮<small>共 ${S.rounds} 轮</small>`;
    const key = S.round + ':' + S.turn;
    if (key !== lastTurnKey) {
      lastTurnKey = key;
      if (mine && S.phase === 'roll') {
        FX.sfx.turn(); navigator.vibrate && navigator.vibrate([60, 60, 60]);
        const t = $('#myTurn'); t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
      }
    }
    $('#playersBar').innerHTML = S.players.map(p => {
      const r = role(p);
      return `<button class="pchip ${p.id === c.id ? 'cur' : ''} ${p.id === meId ? 'me' : ''} ${p.online === false ? 'off' : ''}" data-id="${p.id}" style="--pc:${r.color}">
        ${avatarHTML(p, 30, r.color)}<span class="nm">${esc(p.name)}<small>${Engine.score(p)} 分</small></span></button>`;
    }).join('');
    $('#playersBar').querySelectorAll('.pchip').forEach(b => b.onclick = () => playerCard(b.dataset.id));
    const cur = $('#playersBar .pchip.cur'); cur && cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }

  function playerCard(id) {
    const p = Engine.find(S, id); if (!p) return;
    const r = role(p);
    App.modal(`<div class="card" style="--cc:${r.color}"><div class="card-head"><span class="card-kind">${I(r.icon)}${r.name}</span>
      <div style="margin:12px auto 6px;width:max-content">${avatarHTML(p, 76, r.color)}</div><h2>${esc(p.name)}${p.id === meId ? '（我）' : ''}</h2>
      <div class="card-who">当前 <b style="font-family:var(--fn);font-size:18px;color:var(--pri-d)">${Engine.score(p)}</b> 分${p.bot ? ' · 机器人' : ''}${p.online === false ? ' · 已掉线，电脑托管中' : ''}</div></div>
      <div class="card-body pinfo">${resBar(p)}<div class="pi-skill">${I('sparkles', 'inl')}<b>${r.skill}</b>：${rt(r.desc)}</div>
      <button class="btn" onclick="App.closeModal()">关闭</button></div></div>`);
  }

  function renderAction() {
    const c = Engine.cur(S), mine = c.id === meId;
    let h = '';
    if (busy) h = `<div class="watch"><span class="spin"></span>骰子滚呀滚…</div>`;
    else if (S.phase === 'roll') h = mine ? `<button class="btn xl pri pulse" id="btnRoll">${I('dices')}掷骰子</button>`
      : `<div class="watch">${avatarHTML(c, 26, role(c).color)}等 ${esc(c.name)} 掷骰子${c.bot ? '' : '…'}</div>`;
    else if (modalHidden || !$('#modal').classList.contains('show')) h = `<button class="btn xl" id="btnShowCard">${I('layers')}看卡牌</button>`;
    $('#hudAction').innerHTML = h;
    const r = $('#btnRoll'); if (r) r.onclick = () => { r.disabled = true; navigator.vibrate && navigator.vibrate(20); send('roll'); };
    const sc = $('#btnShowCard'); if (sc) sc.onclick = () => { modalHidden = false; modalSeq = -1; renderModal(); renderAction(); };
  }

  const resBar = p => `<div class="res-bar">${['m', 't', 'r', 'p', 'h'].map(k =>
    `<div data-k="${k}" class="${k === 'h' ? 'hz' + (p.res.h ? ' has' : '') : ''}" style="--c:${RES[k].color}" title="${RES[k].name}">${I(RES[k].icon)}<b>${p.res[k]}</b></div>`).join('')}</div>`;

  function renderSide(skipFloat) {
    const me = Engine.find(S, meId);
    if (me) {
      const r = role(me);
      $('#myPanel').style.setProperty('--pc', r.color);
      $('#myPanel').innerHTML = `<div class="mp-head">${avatarHTML(me, 40, r.color)}
        <div class="nm">${esc(me.name)}<small>${I(r.icon)}${r.name}</small></div>
        <button class="skill-btn" id="btnSkill">${I('sparkles')}${r.skill}</button>
        <div class="sc"><b>${Engine.score(me)}</b>分</div></div>${resBar(me)}`;
      $('#btnSkill').onclick = () => playerCard(meId);
      $('#myPanel').style.display = '';
    } else $('#myPanel').style.display = 'none';
    if (skipFloat) return;
    // 资源变化飘字 + 音效
    for (const p of S.players) {
      const old = prevRes[p.id]; prevRes[p.id] = { ...p.res };
      if (!old) continue;
      const d = {}; let any = false;
      for (const k of ['m', 't', 'r', 'p', 'h']) if (p.res[k] !== old[k]) { d[k] = p.res[k] - old[k]; any = true; }
      if (!any) continue;
      if (p.id === meId) {
        Object.keys(d).forEach(k => $(`#myPanel [data-k="${k}"]`)?.classList.add('bump'));
        FX.floatNums($('#myPanel'), d);
        (d.p > 0 || d.r > 0) ? FX.sfx.good() : (d.h > 0 || d.m < 0) && FX.sfx.bad();
      } else FX.floatNums(document.querySelector(`.pchip[data-id="${p.id}"]`), d);
    }
    requestAnimationFrame(syncInsets);
  }

  // 行业信任：大家共享的进度条
  let lastTrust = null;
  function renderTrust() {
    const t = S.trust ?? 6, max = Engine.TRUST_MAX, el = $('#trust');
    const lv = t >= Engine.TRUST_BONUS_AT ? 'ok' : t >= 3 ? 'mid' : 'low';
    el.className = 'trust ' + lv;
    el.innerHTML = `<span class="tr-l">${I('heart-handshake')}行业信任</span>
      <span class="tr-bar">${Array.from({ length: max }, (_, i) => `<i class="${i < t ? 'on' : ''} ${i === Engine.TRUST_BONUS_AT - 1 ? 'goal' : ''}"></i>`).join('')}</span>
      <b>${t}</b>`;
    if (lastTrust !== null && t !== lastTrust) { el.classList.add(t > lastTrust ? 'up' : 'down'); navigator.vibrate && t < lastTrust && navigator.vibrate(40); }
    lastTrust = t;
  }
  function trustCard() {
    App.modal(`<div class="card" style="--cc:#e88aa8"><div class="card-head"><div class="card-ic">${I('heart-handshake')}</div><h2>行业信任</h2>
      <div class="card-who">所有玩家共享 · 现在 <b style="font-family:var(--fn);font-size:18px;color:var(--pri-d)">${S.trust}</b> / ${Engine.TRUST_MAX}</div></div>
      <div class="card-body"><div class="help-list">
        <div>${I('triangle-alert')}<span>任何人在伦理困境里选了留下${resIcon('h')}隐患的选项，信任 <b>−2</b></span></div>
        <div>${I('shield-check')}<span>明明有捷径可走却坚守底线，信任 <b>+1</b></span></div>
        <div>${I('flame')}<span>信任降到 <b>0</b>：行业信任危机，所有人 −2${resIcon('m')}，有隐患的人再 −2${resIcon('r')}</span></div>
        <div>${I('sparkles')}<span>游戏结束时信任 ≥ <b>${Engine.TRUST_BONUS_AT}</b>：所有人获得口碑红利 +3${resIcon('m')}</span></div>
      </div>
      <div class="think">${I('message-circle-question')}<span>一个人走捷径，代价却是整个行业一起承担。现实中，一起造假丑闻会让公众对整个行业失去信任。</span></div>
      <button class="btn pri" onclick="App.closeModal()">知道啦</button></div></div>`);
  }
  $('#trust').onclick = () => S && trustCard();

  // 动态：顶部只显示最新一条，点开看全部
  function renderTicker() {
    const l = S.log[S.log.length - 1]; if (!l) { $('#ticker').innerHTML = ''; return; }
    const html = `<span>${rt(l.t)}</span><span class="more">${I('chevron-right')}</span>`;
    if (l.t !== lastLog) { lastLog = l.t; const t = $('#ticker'); t.innerHTML = html; t.classList.remove('new'); void t.offsetWidth; t.classList.add('new'); }
  }
  $('#ticker').onclick = () => {
    if (!S) return;
    App.modal(`<div class="card" style="--cc:#f2b544"><div class="card-head"><div class="card-ic">${I('scroll-text')}</div><h2>对局动态</h2></div>
      <div class="card-body"><div class="log-full">${S.log.slice().reverse().map(l => `<div class="${l.c}">${rt(l.t)}</div>`).join('')}</div>
      <button class="btn" onclick="App.closeModal()">关闭</button></div></div>`);
  };
  // 卡牌弹窗：所有人都能看到当前玩家抽到的卡，只有当前玩家能操作
  function renderModal() {
    if (busy) return;
    const pd = S.pending;
    if (!pd || S.phase === 'roll' || S.phase === 'end') { if (modalSeq !== -1) { App.closeModal(true); modalSeq = -1; } modalHidden = false; return; }
    const sig = pd.seq + ':' + Object.keys(pd.votes || {}).length + (pd.votes && pd.votes[meId] || '');
    if (sig === modalSeq || modalHidden) return;
    const redraw = modalSeq !== -1 && String(modalSeq).split(':')[0] === String(pd.seq);
    modalSeq = sig;
    const c = Engine.cur(S), mine = c.id === meId, after = S.phase === 'after';
    if (pd.echo && !echoSeen[pd.seq] && !after) return echoCard(pd, c, mine);
    const tile = BOARD[pd.tile], tt = TILE_TYPES[pd.kind];
    const who = `<span class="card-who">${avatarHTML(c, 22, role(c).color)}${mine ? '你' : esc(c.name)}</span>`;
    const res = d => fmtRes(d) || '<span style="color:var(--ink2);font-size:18px">无变化</span>';
    const wait = t => `<div class="watch" style="align-self:center"><span class="spin"></span>${t}</div>`;
    const endBtn = () => mine ? `<button class="btn xl pri" id="btnEnd">${I('check')}结束回合</button>` : wait(`等 ${esc(c.name)} 结束回合`);
    const okBtn = () => mine ? `<button class="btn xl pri" data-v="ok">${I('check')}好哒</button>` : wait(`${esc(c.name)} 正在查看`);
    const opt = (v, letter, label, cost, extra = '', disabled = false, cls = '') =>
      `<button class="opt ${cls}" data-v="${v}" ${disabled || after || !mine ? 'disabled' : ''}><span class="ok">${letter}</span>
        <div class="ol">${label}</div><div class="oc">${cost}</div>${extra}</button>`;
    let kind = tt.name, icon = tt.icon, title = tile.name, body = '';

    if (pd.kind === 'dilemma') {
      const card = DILEMMAS[pd.card]; kind = '伦理困境 · 没有标准答案'; title = card.title;
      const o = k => {
        const x = card[k], qa = c.role === 'qa' && x.d.r > 0 ? '<div class="od">安全第一：额外 +1 声誉</div>' : '';
        return opt(k, k, x.label, fmtRes(x.d), (after ? `<div class="od">${x.note}</div>` : '') + qa, false, after ? (pd.pick === k ? 'picked' : 'dim') : '');
      };
      const L = LENSES[card.lens];
      const votes = pd.votes || {}, myVote = votes[meId];
      const voters = Object.entries(votes).map(([id, v]) => [Engine.find(S, id), v]).filter(([p]) => p);
      const lens = `<div class="lens" style="--lc:${L.color}"><span class="l-ic">${I(L.icon)}</span><span>工程思维透镜：<b>${card.lens}</b> · ${card.sub}<small>${L.desc}</small></span></div>`;
      const stake = `<div class="stake">${I('users-round', 'inl')}牵动谁：${card.who.split('、').map(w => `<span>${w}</span>`).join('')}</div>`;
      // 猜一猜：只给非当事人显示；结算后公布大家的猜测
      let guess = '';
      if (!mine && !after) guess = `<div class="guess"><div class="guess-h">${I('vote')}猜猜 ${esc(c.name)} 会怎么选？猜中 +1${resIcon('m')}</div>
        <div class="guess-btns">${['A', 'B'].map(k => `<button class="btn sm ${myVote === k ? 'on' : ''}" data-g="${k}">${myVote === k ? I('check') : ''}猜 ${k}</button>`).join('')}</div></div>`;
      if (after && voters.length) guess = `<div class="votes">${I('vote', 'inl')}大家的猜测：${voters.map(([p, v]) =>
        `<span class="v ${v === pd.pick ? 'hit' : ''}">${avatarHTML(p, 18)}${esc(p.name)} 猜 ${v}${v === pd.pick ? ' ✓' : ''}</span>`).join('')}</div>`;
      if (mine && !after && voters.length) guess = `<div class="votes">${I('vote', 'inl')}已有 ${voters.length} 人在猜你的选择…</div>`;
      body = `<p>${card.scene}</p>${lens}<div class="opts">${o('A')}${o('B')}</div>${stake}${guess}
        ${after && pd.trust ? `<div class="trust-chg ${pd.trust > 0 ? 'up' : 'down'}">${I('heart-handshake')}行业信任 ${pd.trust > 0 ? '+' : '−'}${Math.abs(pd.trust)}${pd.crisis ? '<b>，引发了行业信任危机！所有人受罚</b>' : pd.trust < 0 ? '，你的捷径让整个行业更难被信任' : '，你的坚守让行业更值得信赖'}</div>` : ''}
        ${after ? `<div class="think">${I('message-circle-question')}<span>想一想：${card.think}<br><button class="btn sm chat-link" id="btnTalk">${I('message-circle')}聊聊我的理由</button></span></div><div class="card-foot">${endBtn()}</div>` : (mine ? '' : wait(`等待 ${esc(c.name)} 做出选择`))}`;
    } else if (pd.kind === 'event' || pd.kind === 'chance') {
      const card = pd.kind === 'event' ? EVENTS[pd.card] : CHANCES[pd.card];
      kind = pd.kind === 'event' ? '行业事件 · 改编自真实新闻' : '机遇'; icon = card.icon; title = card.title;
      const main = card.again ? `<span style="font-size:22px">${I('dices', 'inl')}再掷一次</span>` : (pd.result && fmtRes(pd.result)) || `<span style="font-size:17px">${rt(pd.msg || '无变化')}</span>`;
      body = `<p>${rt(card.text)}</p>
        <div class="result"><div class="big">${main}</div>${pd.msg && pd.result && fmtRes(pd.result) ? `<small>${rt(pd.msg)}</small>` : ''}</div>
        ${card.src ? `<div class="card-src">${I('newspaper')}<span>${card.src}</span></div>` : ''}<div class="card-foot">${after ? endBtn() : okBtn()}</div>`;
    } else if (pd.kind === 'project') {
      body = after ? `<div class="result"><div class="big">${res(pd.result)}</div><small>${pd.result && pd.result.p ? '项目攻关成功' : '接了个外包小活'}</small></div><div class="card-foot">${endBtn()}</div>`
        : `<p>攻关这个项目需要 <b>${pd.cost}</b>${resIcon('t')}${c.role === 'process' ? '（工艺优化：少花 1 个）' : ''}，${mine ? '你' : esc(c.name)}现在有 <b>${c.res.t}</b>${resIcon('t')}。</p>
          <div class="opts">${opt('do', 'A', '攻关项目', `${fmtRes({ t: -pd.cost })}${I('chevron-right', 'inl')}${fmtRes({ p: 1, m: 2 })}`, pd.can ? '' : '<div class="od">技术不够，先去学习格攒技术吧</div>', !pd.can)}
          ${opt('odd', 'B', '接个外包小活', fmtRes({ m: 1 }))}</div>${mine ? '' : wait(`等待 ${esc(c.name)} 做出选择`)}`;
    } else if (pd.kind === 'learn') {
      const bonus = c.role === 'design' ? 1 : 0;
      body = after ? `<div class="result"><div class="big">${res(pd.result)}</div><small>学到了新知识</small></div><div class="card-foot">${endBtn()}</div>`
        : `<p>怎么学？${bonus ? '（EDA 高手：额外 +1 技术）' : ''}</p>
          <div class="opts">${opt('self', 'A', '自学', fmtRes({ t: 2 + bonus }))}
          ${opt('train', 'B', '报名培训', `${fmtRes({ m: -2 })}${I('chevron-right', 'inl')}${fmtRes({ t: 4 + bonus })}`, pd.canTrain ? '' : '<div class="od">资金不足 2</div>', !pd.canTrain)}</div>${mine ? '' : wait(`等待 ${esc(c.name)} 做出选择`)}`;
    } else {
      body = `<div class="result"><div class="big">${res(pd.result)}</div><small>${rt(pd.msg || '')}</small></div><div class="card-foot">${after ? endBtn() : okBtn()}</div>`;
    }
    App.modal(`<div class="card" style="--cc:${tt.color}"><div class="card-head"><span class="card-kind">${I(tt.icon)}${kind}</span>
      <div class="card-ic">${I(icon)}</div><h2>${title}</h2>${who}</div>
      <div class="card-body">${body}<button class="link-btn" id="btnHideCard">${I('eye')}先收起来，看看棋盘</button></div></div>`);
    if (redraw) $('#modalBox .card').style.animation = 'none'; else FX.sfx.card();
    const box = $('#modalBox');
    box.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { send('vote', b.dataset.g); });
    box.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
      if (b.disabled) return; box.querySelectorAll('[data-v]').forEach(x => x.disabled = true); send('choose', b.dataset.v);
    });
    const e = $('#btnEnd'); if (e) e.onclick = () => { e.disabled = true; send('end'); };
    const tk = $('#btnTalk'); if (tk) tk.onclick = () => Chat.toggle(true);
    $('#btnHideCard').onclick = () => { modalHidden = true; App.closeModal(true); renderAction(); };
    if (mine && !after) coachFor(pd.kind);
    else if (pd.kind === 'dilemma' && !mine && !after) coachFor('guess');
  }

  // 回响卡：过去的选择回来找你
  const echoSeen = {};
  function echoCard(pd, c, mine) {
    const e = pd.echo, card = DILEMMAS[e.card], o = card[e.pick];
    const col = !e.hit ? '#b89c84' : e.risky ? '#e57b7b' : '#74bf7e';
    App.modal(`<div class="card echo" style="--cc:${col}"><div class="card-head"><span class="card-kind">${I('refresh-cw')}选择的回响</span>
      <div class="card-ic">${I(!e.hit ? 'hourglass' : e.risky ? 'triangle-alert' : 'sparkles')}</div>
      <h2>${!e.hit ? '风平浪静' : e.risky ? '该来的还是来了' : '好人有好报'}</h2>
      <span class="card-who">${avatarHTML(c, 22, role(c).color)}${mine ? '你' : esc(c.name)}</span></div>
      <div class="card-body">
        <div class="echo-past"><small>${ECHO_AGO}，在「${card.title}」中${mine ? '你' : 'TA'}选择了</small><b><span class="ok-s">${e.pick}</span>${o.label}</b></div>
        <p>${e.text}</p>
        ${e.hit && e.result ? `<div class="result"><div class="big">${fmtRes(e.result) || '无变化'}</div></div>` : ''}
        <div class="think">${I('message-circle-question')}<span>${e.risky ? '伦理决策的后果往往不会马上出现，但迟早会出现。' : '坚守的价值常常要过一段时间才被看见。'}</span></div>
        <button class="btn xl pri" id="btnEchoOk">${I('chevron-right')}继续</button></div></div>`);
    FX.sfx[e.hit && e.risky ? 'bad' : 'good'](); if (mine) coachFor('echo');
    $('#btnEchoOk').onclick = () => { echoSeen[pd.seq] = 1; modalSeq = -1; renderModal(); renderAction(); };
  }
  const ECHO_AGO = '两轮前';

  // 新手提示：每种情况第一次出现时提示，之后不再打扰
  const COACH = {
    roll: '轮到你啦！点下面的<b>「掷骰子」</b>，棋子会自己往前走～',
    wait: '现在是别人的回合。可以<b>点点棋盘上的格子</b>，看看它们是做什么的。',
    project: '技术够的话选 <b>A 攻关</b>！项目每个值 5 分，是最主要的得分方式。',
    learn: '自学免费；培训花 2 资金但收获翻倍。技术是攻关项目的"燃料"。',
    dilemma: '没有标准答案。带<b>隐患</b>的选项短期收益高，但每个隐患结算 −3 分，还可能被查处。',
    event: '行业事件改编自真实新闻，看看对你有什么影响，然后点<b>「好哒」</b>。',
    chance: '机遇卡大多是好事，点<b>「好哒」</b>收下吧。',
    guess: '别人遇到伦理困境时，你可以<b>猜他会怎么选</b>，猜中 +1 资金。结算后打开聊天聊聊理由吧。',
    echo: '这是<b>选择的回响</b>：你两轮前做的伦理选择，现在有了后果。',
    trust: '上面这条是<b>行业信任</b>，所有人共用。有人走捷径它就会下降，点它可以看说明。',
    after: '这一步处理完了，点<b>「结束回合」</b>把机会交给下一位。',
  };
  let coachSeen = JSON.parse(localStorage.getItem('ecg_coachSeen') || '{}'), coachTimer;
  function coachFor(k) {
    if (!coachOn || coachSeen[k]) return;
    coachSeen[k] = 1; localStorage.setItem('ecg_coachSeen', JSON.stringify(coachSeen));
    $('#coachTxt').innerHTML = COACH[k] || rt(TILE_TYPES[k]?.tip || '');
    const el = $('#coach'); el.classList.add('show');
    clearTimeout(coachTimer); coachTimer = setTimeout(() => el.classList.remove('show'), 7000);
  }
  function renderCoach() {
    if (!coachOn || busy) return;
    const mine = Engine.cur(S).id === meId;
    if (S.phase === 'roll') { coachFor(mine ? 'roll' : 'wait'); if (S.round >= 2) coachFor('trust'); }
    else if (S.phase === 'after' && mine) coachFor('after');
  }
  function toggleCoach() {
    coachOn = !coachOn; localStorage.setItem('ecg_coach', coachOn ? '1' : '0');
    if (coachOn) { coachSeen = {}; localStorage.removeItem('ecg_coachSeen'); }
    App.toast(coachOn ? '新手提示已开启' : '新手提示已关闭');
    if (!coachOn) $('#coach').classList.remove('show'); else renderCoach();
  }
  function on3DReady() {
    if (!S || !$('#game').classList.contains('active')) return;
    B().setMode('game'); B().showDice(true); B().setPlayers(S.players, positions()); B().setCurrent(Engine.cur(S).id); syncInsets();
  }
  function refresh() { if (S && !busy) renderAction(); }
  function leave() { S = null; keepAwake(false); document.body.classList.replace('mode-game', 'mode-menu'); $('#coach').classList.remove('show'); if (B()) { B().clear(); B().setMode('menu'); } }
  return { enter, render, toggleCoach, refresh, leave, on3DReady, get coachOn() { return coachOn; }, tileCard };
})();
