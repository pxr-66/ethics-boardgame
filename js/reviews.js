// 评分与评论（第二版新增）
// 网站是纯静态的，没有自己的服务器：每条评论作为「保留消息」同时存到三个公共 MQTT 服务器上，
// 打开页面时从所有服务器读回来合并。每个看过评论的浏览器还会在本地缓存一份，
// 发现某个服务器上少了哪条就补发回去——所以单个服务器被清空，评论也能自己恢复。
const Reviews = (() => {
  const $ = s => document.querySelector(s);
  // 网址带 ?rvtest 时用单独的测试主题，调试不会弄脏正式评论
  const TOPIC = 'ethics-chip-game/reviews/v1' + (/[?&]rvtest/.test(location.search) ? '-test' : '');
  const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
  const CACHE = 'ecg_reviews:' + TOPIC, MAX_LEN = 200, PAGE = 30;
  // 课堂使用，简单过滤几个常见脏话
  const BAD = /傻[逼比b]|煞笔|sb|操你|草泥马|妈的|他妈|去死|滚蛋|废物|垃圾人|fuck|shit|bitch/gi;
  let items = {}, conns = [], started = false, back = 'home', picked = 0, shown = PAGE, lastPost = 0, tick = null;

  const load = () => { try { items = JSON.parse(localStorage.getItem(CACHE) || '{}') || {}; } catch { items = {}; } };
  const save = () => { try { localStorage.setItem(CACHE, JSON.stringify(items)); } catch { } };

  // 只接受格式正确的评论，防止别人往主题里塞乱七八糟的东西
  function valid(r, id) {
    if (!r || typeof r !== 'object' || r.id !== id || !/^[a-z0-9-]{6,40}$/.test(id)) return false;
    if (typeof r.ts !== 'number' || r.ts < Date.UTC(2026, 0, 1) || r.ts > Date.now() + 864e5) return false;
    if (r.del) return true;
    return Number.isInteger(r.s) && r.s >= 1 && r.s <= 5 && typeof r.t === 'string' && r.t.length <= MAX_LEN
      && typeof r.n === 'string' && r.n.length <= 8 && typeof r.d === 'string';
  }
  // 合并：删除标记优先，其次取较新的
  function merge(r) {
    const old = items[r.id];
    if (old && (old.del || (!r.del && old.ts >= r.ts))) return false;
    items[r.id] = r; return true;
  }

  function connect(url) {
    const c = MqttLite.connect(url), conn = { c, has: new Set(), healed: false, ok: false };
    c.on('connect', () => {
      conn.ok = true; renderNet();
      c.subscribe(TOPIC + '/#');
      // 等保留消息都到齐，再把本地有、这个服务器没有的评论补上去
      setTimeout(() => heal(conn), 4000);
    });
    c.on('offline', () => { conn.ok = false; renderNet(); });
    c.on('message', (topic, text) => {
      if (!topic.startsWith(TOPIC + '/') || !text) return;
      const id = topic.slice(TOPIC.length + 1);
      let r; try { r = JSON.parse(text); } catch { return; }
      if (!valid(r, id)) return;
      conn.has.add(id);
      if (merge(r)) { save(); render(); }
    });
    conns.push(conn);
  }
  function heal(conn) {
    if (!conn.ok) return;
    let n = 0;
    for (const r of Object.values(items)) {
      if (conn.has.has(r.id) || n >= 60) continue;
      conn.c.publish(`${TOPIC}/${r.id}`, JSON.stringify(r), true); conn.has.add(r.id); n++;
    }
  }
  function publish(r) {
    merge(r); save();
    let sent = 0;
    conns.forEach(k => { if (k.c.publish(`${TOPIC}/${r.id}`, JSON.stringify(r), true)) { k.has.add(r.id); sent++; } });
    return sent;
  }

  function start() {
    if (started) return; started = true;
    load(); render();
    BROKERS.forEach(connect);
  }

  // ---------- 统计 ----------
  const live = () => Object.values(items).filter(r => !r.del).sort((a, b) => b.ts - a.ts);
  function stats() {
    // 每台设备只算最新的那次评分，避免同一个人刷分
    const byDev = {};
    live().forEach(r => { if (!byDev[r.d]) byDev[r.d] = r; });
    const rates = Object.values(byDev).map(r => r.s);
    const dist = [1, 2, 3, 4, 5].map(k => rates.filter(s => s === k).length);
    const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    return { n: rates.length, comments: live().filter(r => r.t).length, avg, dist };
  }

  // ---------- 显示 ----------
  function ago(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return '刚刚';
    if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
    if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
    if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
    const d = new Date(ts); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  const fullTime = ts => { const d = new Date(ts), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const stars = (v, cls = '') => `<span class="stars ${cls}" aria-label="${v.toFixed ? v.toFixed(1) : v} 星">${[1, 2, 3, 4, 5].map(k =>
    `<i class="${v >= k - .25 ? 'on' : v >= k - .75 ? 'half' : ''}">${I('star')}</i>`).join('')}</span>`;

  function renderHome() {
    const b = $('#btnReviews'); if (!b) return;
    const st = stats();
    b.innerHTML = `${I('star')}<span>评分评论</span><small>${st.n ? `${st.avg.toFixed(1)} 分 · ${st.n} 人` : '来打第一个分'}</small>`;
  }
  function renderNet() {
    const el = $('#rvNet'); if (!el) return;
    const n = conns.filter(k => k.ok).length;
    el.className = 'net-status ' + (n ? 'ok' : 'bad');
    el.textContent = n ? `已连接 ${n} 个评论服务器` : '正在连接评论服务器…';
  }
  function render() {
    renderHome();
    if (!$('#reviews').classList.contains('active')) return;
    const st = stats(), list = live();
    $('#rvSum').innerHTML = `<div class="rv-avg"><b>${st.n ? st.avg.toFixed(1) : '–'}</b>${stars(st.avg, 'lg')}<span>${st.n} 人评分 · ${st.comments} 条评论</span></div>
      <div class="rv-dist">${[5, 4, 3, 2, 1].map(k => `<div><span>${k} 星</span><i><em style="width:${st.n ? st.dist[k - 1] / st.n * 100 : 0}%"></em></i><small>${st.dist[k - 1]}</small></div>`).join('')}</div>`;
    const me = App.me;
    $('#rvList').innerHTML = list.length ? list.slice(0, shown).map(r => `<div class="rv-item card-lite">
        ${avatarHTML({ avatar: r.a }, 40)}<div class="rv-body">
        <div class="rv-h"><b>${esc(r.n || '匿名玩家')}</b>${r.d === me.id ? '<span class="tag me">我</span>' : ''}${stars(r.s)}
          <time datetime="${new Date(r.ts).toISOString()}" title="${fullTime(r.ts)}" data-ts="${r.ts}">${ago(r.ts)}</time></div>
        ${r.t ? `<p>${esc(r.t)}</p>` : '<p class="muted">只打了分，没有写评论</p>'}
        ${r.d === me.id ? `<button class="rv-del" data-id="${r.id}">${I('x')}删除</button>` : ''}</div></div>`).join('')
      + (list.length > shown ? `<button class="btn" id="rvMore">${I('chevron-right')}再看 ${Math.min(PAGE, list.length - shown)} 条</button>` : '')
      : `<div class="rv-empty card-lite">${mascot(64)}<p>还没有人评论<br>来做第一个吧！</p></div>`;
    $('#rvList').querySelectorAll('.rv-del').forEach(b => b.onclick = () => {
      if (!confirm('确定删除这条评论吗？')) return;
      const r = items[b.dataset.id];
      publish({ id: r.id, d: r.d, del: 1, ts: Date.now() }); render(); App.toast('已删除');
    });
    const more = $('#rvMore'); if (more) more.onclick = () => { shown += PAGE; render(); };
  }

  function renderForm() {
    const me = App.me;
    $('#rvForm').innerHTML = `<h3>${I('pencil')}写评价</h3>
      <div class="rv-pick" id="rvPick" role="radiogroup" aria-label="评分">${[1, 2, 3, 4, 5].map(k => `<button data-v="${k}" role="radio" aria-label="${k} 星">${I('star')}</button>`).join('')}<span id="rvPickTxt">点星星打分</span></div>
      <div class="rv-who">${avatarHTML(me, 34)}<input id="rvName" maxlength="8" placeholder="你的名字（可不填）" value="${esc(me.name)}" aria-label="名字"></div>
      <textarea id="rvText" maxlength="${MAX_LEN}" rows="3" placeholder="说说你玩下来的感受：哪张困境卡最难选？哪里好玩、哪里可以改进？（可不填）" aria-label="评论内容"></textarea>
      <div class="rv-send"><small id="rvCount">0 / ${MAX_LEN}</small><button class="btn pri" id="rvSend">${I('send')}发布</button></div>
      <p class="hint">评论所有人都能看到，请文明发言，不要写手机号等个人信息。</p>`;
    const words = ['', '不太好玩', '一般般', '还不错', '挺好玩', '超好玩！'];
    const paint = v => { $('#rvPick').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v <= v)); $('#rvPickTxt').textContent = v ? `${v} 星 · ${words[v]}` : '点星星打分'; };
    $('#rvPick').onclick = e => { const b = e.target.closest('button'); if (!b) return; picked = +b.dataset.v; paint(picked); FX.sfx.click(); };
    $('#rvText').oninput = () => { $('#rvCount').textContent = `${$('#rvText').value.length} / ${MAX_LEN}`; };
    paint(picked);
    $('#rvSend').onclick = submit;
  }
  function submit() {
    if (!picked) return App.toast('先点星星打个分吧');
    if (Date.now() - lastPost < 20000) return App.toast('发得太快啦，过一会儿再发');
    const me = App.me;
    const name = $('#rvName').value.trim().slice(0, 8);
    if (name && name !== me.name) { me.name = name; App.saveMe(); }
    const text = $('#rvText').value.replace(/\s+/g, ' ').trim().slice(0, MAX_LEN).replace(BAD, m => '*'.repeat(m.length));
    const ts = Date.now();
    const r = { id: `${me.id}-${ts.toString(36)}`.toLowerCase().replace(/[^a-z0-9-]/g, ''), d: me.id, n: name, a: me.avatar, s: picked, t: text, ts };
    const sent = publish(r);
    lastPost = ts; picked = 0; shown = PAGE;
    renderForm(); render(); FX.sfx.good();
    App.toast(sent ? '发布成功，谢谢你的评价！' : '网络没连上，评价先存在本机，联网后会自动发出');
  }

  // 从哪个页面进来，「返回」就回到哪里（结算页进来不会离开房间）
  function open() {
    const cur = document.querySelector('.screen.active');
    back = cur && cur.id !== 'reviews' ? cur.id : 'home';
    start();
    App.closeModal(true);
    App.show('reviews');
    renderForm(); renderNet(); render();
    $('#reviews').scrollTop = 0;
    clearInterval(tick);
    // 「几分钟前」每分钟刷新一次
    tick = setInterval(() => {
      if (!$('#reviews').classList.contains('active')) return clearInterval(tick);
      document.querySelectorAll('#rvList time').forEach(t => { t.textContent = ago(+t.dataset.ts); });
    }, 30000);
  }

  // 没连上时发的评论：下次连上服务器，heal() 会把本地缓存里的补发出去
  $('#rvBack').onclick = () => { FX.sfx.click(); App.show(back); };
  start();
  return { open, stats };
})();
