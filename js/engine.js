// 游戏引擎：只在房主端运行，所有状态以房主为准
const Engine = (() => {
  const rnd = n => Math.floor(Math.random() * n);
  // 行业信任：所有人共享，从 6 开始。走捷径 −2，在有捷径可走时坚守 +1；降到 0 触发信任危机，结算时 ≥6 全员获得口碑红利
  const TRUST_MAX = 10, TRUST_START = 6, TRUST_BONUS_AT = 6;
  // 回响：两轮后回来；走捷径有一半概率被发现，坚守有六成概率被看见
  const ECHO_DELAY = 2, ECHO_RISKY = .5, ECHO_GOOD = .6;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const deck = arr => shuffle(arr.map((_, i) => i));

  function newRoom(code, host) {
    return {
      v: 1, code, hostId: host.id, phase: 'lobby', rounds: 0, length: 'std',
      players: [mkPlayer(host, false)], turn: 0, round: 1, seq: 0,
      dice: null, pending: null, log: [], chat: [], decks: {}, moveSeq: 0, ts: Date.now(),
      trust: TRUST_START, crises: 0, echoes: [], history: [],
    };
  }
  function mkPlayer(p, bot) {
    return { id: p.id, name: p.name, avatar: p.avatar, bot: !!bot, role: null, pos: 0,
      res: { m: 0, t: 0, r: 0, p: 0, h: 0 }, choices: { good: 0, risky: 0 }, online: true };
  }
  function log(s, text, cls) { s.log.push({ t: text, c: cls || '' }); if (s.log.length > 40) s.log.shift(); }
  const cur = s => s.players[s.turn];
  const find = (s, id) => s.players.find(p => p.id === id);
  function draw(s, name, src) {
    if (!s.decks[name] || !s.decks[name].length) s.decks[name] = deck(src);
    return s.decks[name].pop();
  }

  // 资源结算，返回实际变化（不会扣成负数）
  function apply(s, p, d, opt = {}) {
    const real = {};
    for (const k of ['m', 't', 'r', 'p', 'h']) {
      if (!d[k]) continue;
      let v = d[k];
      if (opt.event && v < 0 && p.role === 'pack' && k !== 'h') v = Math.min(0, v + 1);
      const before = p.res[k];
      p.res[k] = Math.max(0, before + v);
      if (p.res[k] !== before) real[k] = p.res[k] - before;
    }
    return real;
  }
  function score(p) { const r = p.res; return r.m + r.t + r.r * 2 + r.p * 5 - r.h * 3; }

  function addPlayer(s, p, bot) {
    if (s.phase !== 'lobby' || s.players.length >= 6) return false;
    if (find(s, p.id)) return true;
    s.players.push(mkPlayer(p, bot)); return true;
  }
  function addBot(s) {
    const used = s.players.map(p => p.name);
    const name = BOT_NAMES.find(n => !used.includes(n)) || '机器人';
    const free = AVATARS.filter(a => !s.players.some(p => p.avatar === a));
    const avatar = (free.length ? free : AVATARS)[rnd((free.length ? free : AVATARS).length)];
    // 机器人用 bot 字段区分，名字不带标记
    return addPlayer(s, { id: 'bot' + Date.now() + rnd(999), name, avatar }, true);
  }
  function removePlayer(s, id) {
    if (s.phase !== 'lobby' || id === s.hostId) return;
    s.players = s.players.filter(p => p.id !== id);
  }
  function pickRole(s, id, role) {
    const p = find(s, id);
    if (!p || s.phase !== 'lobby') return;
    if (role && s.players.some(q => q.role === role && q.id !== id)) return;
    p.role = role;
  }

  function start(s) {
    if (s.phase !== 'lobby' || s.players.length < 3) return false;
    const free = shuffle(ROLES.map(r => r.id).filter(r => !s.players.some(p => p.role === r)));
    for (const p of s.players) {
      if (!p.role) p.role = free.pop();
      const role = ROLES.find(r => r.id === p.role);
      p.res = { m: role.start.m, t: role.start.t, r: role.start.r, p: 0, h: 0 };
      p.pos = 0;
    }
    s.players = shuffle(s.players);
    s.rounds = s.length === 'short' ? 5 : (s.players.length <= 4 ? 8 : 6);
    s.phase = 'roll'; s.turn = 0; s.round = 1;
    s.trust = TRUST_START; s.crises = 0; s.echoes = []; s.history = [];
    log(s, `{party-popper} 游戏开始！共 ${s.rounds} 轮，${cur(s).name} 先手`, 'sys');
    return true;
  }

  // 掷骰并移动
  function roll(s, id) {
    if (s.phase !== 'roll' || cur(s).id !== id) return;
    const p = cur(s);
    const n = 1 + rnd(6);
    s.dice = { n, seq: ++s.seq, who: p.id };
    const from = p.pos;
    p.pos = (p.pos + n) % BOARD.length;
    s.moveSeq++;
    s.lastMove = { id: p.id, from, steps: n };
    log(s, `{dices} ${p.name} 掷出 ${n} 点，来到「${BOARD[p.pos].name}」`);
    if (p.pos < from || n >= BOARD.length) {
      const pay = 2 + (p.role === 'equip' ? 1 : 0);
      if (p.pos !== 0) { apply(s, p, { m: pay }); log(s, `{flag} ${p.name} 经过入职报到，领工资 +${pay}[m]`, 'good'); }
    }
    const echo = takeEcho(s, p);
    land(s, p);
    if (echo) s.pending.echo = echo;
  }

  function land(s, p) {
    const t = BOARD[p.pos];
    const pend = { kind: t.type, who: p.id, tile: p.pos, seq: ++s.seq };
    if (t.type === 'start') {
      const pay = 2 + (p.role === 'equip' ? 1 : 0);
      pend.result = apply(s, p, { m: pay }); pend.msg = `停在入职报到，领工资 +${pay}[m]`;
    } else if (t.type === 'project') {
      pend.cost = p.role === 'process' ? 2 : 3;
      pend.can = p.res.t >= pend.cost;
    } else if (t.type === 'event') {
      const i = draw(s, 'event', EVENTS); const c = EVENTS[i]; pend.card = i;
      if (c.all) { s.players.forEach(q => apply(s, q, c.all, { event: true })); pend.result = { ...c.all }; pend.msg = '所有人都获得了'; }
      else if (c.hzBoom) {
        const hit = s.players.filter(q => q.res.h > 0);
        hit.forEach(q => { apply(s, q, { m: -3, h: -q.res.h }); });
        pend.msg = hit.length ? `被查处：${hit.map(q => q.name).join('、')}` : '所有人都很干净，无人受罚';
      } else if (c.cond) {
        if (p.res.t >= c.cond.t) { pend.result = apply(s, p, c.cond.d, { event: true }); }
        else pend.msg = '技术不足 5，这次没赶上';
      } else pend.result = apply(s, p, c.d, { event: true });
    } else if (t.type === 'chance') {
      const i = draw(s, 'chance', CHANCES); const c = CHANCES[i]; pend.card = i;
      if (c.again) pend.again = true;
      else if (c.fixHz) pend.result = p.res.h > 0 ? apply(s, p, { h: -1 }) : apply(s, p, { r: 1 });
      else pend.result = apply(s, p, c.d);
    } else if (t.type === 'dilemma') {
      pend.card = draw(s, 'dilemma', DILEMMAS);
      // 其他玩家可以猜当事人会怎么选；机器人随机猜
      pend.votes = {};
      s.players.forEach(q => { if (q.bot && q.id !== p.id) pend.votes[q.id] = Math.random() < .6 ? 'B' : 'A'; });
    } else if (t.type === 'learn') {
      pend.canTrain = p.res.m >= 2;
    } else if (t.type === 'audit') {
      if (p.res.h > 0) { pend.result = apply(s, p, { m: -2, r: -1, h: -1 }); pend.msg = '审计查出隐患！整改罚款，隐患 −1'; }
      else if (p.res.r >= 5) { pend.result = apply(s, p, { m: 2, r: 1 }); pend.msg = '零隐患 + 高声誉，获得表彰！'; }
      else { pend.result = apply(s, p, { r: 1 }); pend.msg = '审计通过，没有隐患'; }
    } else if (t.type === 'mentor') {
      pend.result = apply(s, p, { t: 1, r: 1 }); pend.msg = '老师傅倾囊相授';
    } else if (t.type === 'summit') {
      pend.result = apply(s, p, { m: 1, r: 1, t: p.role === 'ai' ? 1 : 0 }); pend.msg = '你在峰会上做了精彩分享';
    }
    if (t.type === 'chance' && p.role === 'ai' && !pend.again) { const x = apply(s, p, { t: 1 }); pend.result = merge(pend.result, x); }
    s.pending = pend; s.phase = 'resolve';
  }
  const merge = (a, b) => { const o = { ...(a || {}) }; for (const k in b) o[k] = (o[k] || 0) + b[k]; return o; };
  const fmt = d => Object.entries(d || {}).filter(([, v]) => v).map(([k, v]) => `${v > 0 ? '+' : ''}${v}[${k}]`).join(' ');

  // 玩家对当前卡片做出选择
  function choose(s, id, v) {
    if (s.phase !== 'resolve' || cur(s).id !== id || s.pending.done) return;
    const p = cur(s), pd = s.pending;
    if (pd.kind === 'project') {
      if (v === 'do' && pd.can) { pd.result = apply(s, p, { t: -pd.cost, p: 1, m: 2 }); log(s, `{drafting-compass} ${p.name} 攻关「${BOARD[pd.tile].name}」成功！${fmt(pd.result)}`, 'good'); }
      else { pd.result = apply(s, p, { m: 1 }); log(s, `{drafting-compass} ${p.name} 接了个外包小活 +1[m]`); }
    } else if (pd.kind === 'learn') {
      const bonus = p.role === 'design' ? 1 : 0;
      if (v === 'train' && pd.canTrain) pd.result = apply(s, p, { m: -2, t: 4 + bonus });
      else pd.result = apply(s, p, { t: 2 + bonus });
      log(s, `{graduation-cap} ${p.name} ${v === 'train' ? '参加培训' : '自学'}，${fmt(pd.result)}`);
    } else if (pd.kind === 'dilemma') {
      const c = DILEMMAS[pd.card]; const opt = v === 'B' ? c.B : c.A;
      const d = { ...opt.d };
      if (p.role === 'qa' && d.r > 0) d.r += 1;
      pd.result = apply(s, p, d); pd.pick = v === 'B' ? 'B' : 'A';
      if (d.h) p.choices.risky++; else p.choices.good++;
      p.picks = p.picks || []; p.picks.push({ card: pd.card, pick: pd.pick });
      s.history.push({ id: p.id, card: pd.card, pick: pd.pick });
      // 行业信任
      const other = v === 'B' ? c.A : c.B, before = s.trust;
      if (d.h) s.trust = Math.max(0, s.trust - 2);
      else if (other.d.h) s.trust = Math.min(TRUST_MAX, s.trust + 1);
      pd.trust = s.trust - before;
      // 回响：两轮后到来（概率性）
      s.echoes.push({ id: p.id, card: pd.card, pick: pd.pick, risky: !!d.h, due: s.round + ECHO_DELAY });
      log(s, `{scale} ${p.name} 面对「${c.title}」选择了：${opt.label}　${fmt(pd.result)}`, d.h ? 'bad' : 'good');
      // 猜中的人 +1 资金
      const right = Object.entries(pd.votes || {}).filter(([, x]) => x === pd.pick).map(([qid]) => find(s, qid)).filter(Boolean);
      right.forEach(q => { apply(s, q, { m: 1 }); q.guess = (q.guess || 0) + 1; });
      pd.right = right.map(q => q.id);
      if (right.length) log(s, `{users-round} 猜中 ${p.name} 选择的人：${right.map(q => q.name).join('、')}，各 +1[m]`, 'good');
      if (s.trust === 0) crisis(s);
      if (p.bot) say(s, p, BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)].replace('X', pd.pick));
    } else if (pd.kind === 'event') {
      log(s, `{newspaper} ${EVENTS[pd.card].title}：${p.name} ${fmt(pd.result) || pd.msg || ''}`);
    } else if (pd.kind === 'chance') {
      log(s, `{clover} ${p.name} 抽到「${CHANCES[pd.card].title}」${fmt(pd.result)}`, 'good');
      if (pd.again) { s.phase = 'roll'; s.pending = null; s.extra = true; return; }
    } else if (pd.msg) log(s, `{${TILE_TYPES[pd.kind].icon}} ${p.name}：${pd.msg} ${fmt(pd.result)}`);
    pd.done = true; pd.seq = ++s.seq;
    s.phase = 'after';
  }

  // 结束回合
  function endTurn(s, id) {
    if (s.phase !== 'after' || cur(s).id !== id) return;
    s.pending = null; s.extra = false;
    s.turn++;
    if (s.turn >= s.players.length) {
      s.turn = 0; s.round++;
      if (s.round > s.rounds) return finish(s);
      log(s, `—— 第 ${s.round} 轮开始 ——`, 'sys');
    }
    s.phase = 'roll';
  }

  // 到期的回响：每次只来一条
  function takeEcho(s, p) {
    const i = s.echoes.findIndex(e => e.id === p.id && e.due <= s.round);
    if (i < 0) return null;
    return resolveEcho(s, p, s.echoes.splice(i, 1)[0]);
  }
  function resolveEcho(s, p, e) {
    const c = DILEMMAS[e.card], o = c[e.pick];
    const hit = Math.random() < (e.risky ? ECHO_RISKY : ECHO_GOOD);
    const out = { card: e.card, pick: e.pick, risky: e.risky, hit };
    if (hit) { out.result = apply(s, p, o.echo.d); out.text = o.echo.e; }
    else out.text = e.risky ? '这次侥幸没出事……但隐患还在。' : '没人注意到，但你问心无愧。';
    log(s, `{refresh-cw} ${p.name} 当初在「${c.title}」的选择有了回响：${out.text}${hit ? ' ' + fmt(out.result) : ''}`, hit ? (e.risky ? 'bad' : 'good') : '');
    return out;
  }
  // 信任危机：所有人受罚，留下隐患的人罚得更重；信任恢复到一半
  function crisis(s) {
    s.crises++;
    const hit = [];
    s.players.forEach(q => { const r = apply(s, q, { m: -2, r: q.res.h > 0 ? -2 : 0 }); if (Object.keys(r).length) hit.push(q.name); });
    s.trust = 3;
    s.pending && (s.pending.crisis = true);
    log(s, `{triangle-alert} 行业信任危机！公众不再相信芯片行业，所有人 −2[m]，有隐患的人再 −2[r]`, 'bad');
  }

  function finish(s) {
    // 没来得及到来的回响，在结算前一次性揭晓
    s.lateEchoes = [];
    for (const e of s.echoes) { const p = find(s, e.id); if (p) s.lateEchoes.push({ id: p.id, ...resolveEcho(s, p, e) }); }
    s.echoes = [];
    // 行业口碑红利：信任保持得好，所有人一起受益
    s.trustBonus = s.trust >= TRUST_BONUS_AT;
    if (s.trustBonus) { s.players.forEach(q => apply(s, q, { m: 3 })); log(s, `{heart-handshake} 行业信任保持在 ${s.trust}，所有人获得口碑红利 +3[m]`, 'good'); }
    s.phase = 'end'; s.round = s.rounds;
    s.final = s.players.map(p => ({ id: p.id, score: score(p) })).sort((a, b) => b.score - a.score);
    log(s, `{crown} 游戏结束！MVP：${find(s, s.final[0].id).name}`, 'sys');
  }

  // 猜一猜：非当事人在困境卡结算前投票
  function vote(s, id, v) {
    const pd = s.pending;
    if (s.phase !== 'resolve' || !pd || pd.kind !== 'dilemma' || pd.done || cur(s).id === id || !find(s, id)) return;
    if (v !== 'A' && v !== 'B') return;
    pd.votes[id] = v;
  }
  // 聊天：只保留最近 40 条，长度限制 60 字
  const BOT_LINES = ['这题好难…我选了 X', '选 X 吧，问心无愧', '纠结了半天，最后选 X', '如果是真的工作，我也会选 X', '大家觉得 X 对吗？'];
  function say(s, p, text) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!text) return;
    s.chat = s.chat || [];
    s.chat.push({ id: p.id, n: p.name, a: p.avatar, t: text, k: ++s.seq });
    if (s.chat.length > 40) s.chat.shift();
  }
  function chat(s, id, text) { const p = find(s, id); if (p) say(s, p, text); }

  function act(s, id, a, v) {
    if (a === 'roll') roll(s, id);
    else if (a === 'vote') vote(s, id, v);
    else if (a === 'choose') choose(s, id, v);
    else if (a === 'end') endTurn(s, id);
    s.ts = Date.now();
  }

  // 机器人：简单策略，偶尔"冒险"
  function botMove(s) {
    const p = cur(s);
    if (!p || !p.bot) return null;
    if (s.phase === 'roll') return ['roll'];
    if (s.phase === 'resolve') {
      const pd = s.pending;
      if (pd.kind === 'project') return ['choose', pd.can ? 'do' : 'odd'];
      if (pd.kind === 'learn') return ['choose', pd.canTrain && p.res.m > 4 ? 'train' : 'self'];
      if (pd.kind === 'dilemma') return ['choose', Math.random() < 0.7 ? 'B' : 'A'];
      return ['choose', 'ok'];
    }
    if (s.phase === 'after') return ['end'];
    return null;
  }

  // 工程师类型：根据这局的伦理选择
  function engineerType(p) {
    const n = (p.picks || []).length, risky = p.choices.risky, good = p.choices.good;
    if (!n) return { k: 'new', name: '旁观者', icon: 'eye', color: '#b89c84', desc: '这局没遇到伦理困境。下次多去困境格看看吧' };
    if (risky === 0) return { k: 'guard', name: '守护者', icon: 'shield-check', color: '#74bf7e', desc: '每一次都守住了底线，哪怕要付出代价' };
    if (risky >= good) return { k: 'risk', name: '冒险家', icon: 'flame', color: '#e57b7b', desc: '敢走捷径，也要为隐患买单。现实中这可能伤害到别人' };
    return { k: 'prag', name: '务实派', icon: 'scale', color: '#5bb5d6', desc: '大多数时候坚持原则，偶尔向现实妥协' };
  }
  // 三种工程思维下的选择：遇到几次、坚守几次
  function lensStats(p) {
    const o = {}; Object.keys(LENSES).forEach(k => { o[k] = { seen: 0, kept: 0 }; });
    (p.picks || []).forEach(x => { const c = DILEMMAS[x.card], l = o[c.lens]; l.seen++; if (!c[x.pick].d.h) l.kept++; });
    return o;
  }

  return { newRoom, addPlayer, addBot, removePlayer, pickRole, start, act, chat, botMove, score, fmt, cur, find, engineerType, lensStats, TRUST_MAX, TRUST_BONUS_AT };
})();
