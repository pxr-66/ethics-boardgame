// 聊天：侧滑聊天面板 + 快捷短语 + 未读角标 + 新消息气泡
const Chat = (() => {
  const $ = s => document.querySelector(s);
  // 快捷短语：围绕课堂讨论，手机上不用打字
  const QUICK = ['这题好难选', '我选了 B，问心无愧', '安全第一！', '赚钱也要守底线', '换作现实你会怎么选？', '哈哈运气真好', '加油', '快点掷骰子～'];
  let lastK = 0, inited = false, unread = 0, open = false, meId = null, chatArr = [];

  function build() {
    const fab = document.createElement('button');
    fab.className = 'chat-fab'; fab.id = 'chatFab'; fab.setAttribute('aria-label', '打开聊天');
    fab.innerHTML = `${I('message-circle')}<span class="badge" id="chatBadge"></span>`;
    document.body.appendChild(fab);
    const panel = document.createElement('aside');
    panel.className = 'chat-panel panel'; panel.id = 'chatPanel'; panel.setAttribute('aria-label', '聊天');
    panel.innerHTML = `<div class="chat-h"><span>${I('messages-square')}房间聊天</span><button class="icon-btn" id="chatClose" aria-label="关闭聊天">${I('x')}</button></div>
      <div class="chat-list" id="chatList" role="log" aria-live="polite"></div>
      <div class="chat-quick" id="chatQuick">${QUICK.map(q => `<button>${q}</button>`).join('')}</div>
      <form class="chat-in" id="chatForm"><input id="chatInput" maxlength="60" placeholder="说点什么…" autocomplete="off" aria-label="聊天内容">
        <button class="btn pri" aria-label="发送">${I('send')}</button></form>`;
    document.body.appendChild(panel);
    fab.onclick = () => toggle(true);
    // 游戏中：顶部带文字的聊天按钮（在卡牌弹窗之上，随时能点）
    const top = $('#chatTop');
    top.innerHTML = `${I('message-circle')}<span>聊天</span><span class="badge" id="chatBadge2"></span>`;
    top.onclick = () => toggle(!open);
    $('#chatClose').onclick = () => toggle(false);
    $('#chatQuick').onclick = e => { const b = e.target.closest('button'); if (b) { App.sendChat(b.textContent); FX.sfx.click(); } };
    $('#chatForm').onsubmit = e => {
      e.preventDefault(); const v = $('#chatInput').value.trim(); if (!v) return;
      App.sendChat(v); $('#chatInput').value = ''; FX.sfx.click();
    };
  }

  function toggle(v) {
    open = v; document.body.classList.toggle('chat-open', v);
    if (v) { unread = 0; badge(); setTimeout(() => { const l = $('#chatList'); l.scrollTop = l.scrollHeight; if (innerWidth > 900) $('#chatInput').focus(); }, 50); }
  }
  function badge() { ['#chatBadge', '#chatBadge2'].forEach(s => { const b = $(s); if (!b) return; b.textContent = unread > 9 ? '9+' : unread || ''; b.classList.toggle('on', unread > 0); }); }

  function renderList() {
    const l = $('#chatList');
    if (!chatArr.length) { l.innerHTML = `<div class="chat-empty">${mascot(64)}<p>还没有人说话<br>点下面的快捷短语打个招呼吧</p></div>`; return; }
    l.innerHTML = chatArr.map(m => `<div class="msg ${m.id === meId ? 'me' : ''}">${avatarHTML({ avatar: m.a }, 30)}
      <div><div class="who">${esc(m.n)}</div><div class="bubble">${esc(m.t)}</div></div></div>`).join('');
    l.scrollTop = l.scrollHeight;
  }

  // 新消息：未读 +1，不在面板里时右下角弹一个气泡
  function popup(m) {
    const el = document.createElement('div'); el.className = 'chat-pop';
    el.innerHTML = `${avatarHTML({ avatar: m.a }, 26)}<span><b>${esc(m.n)}</b>${esc(m.t)}</span>`;
    el.onclick = () => toggle(true);
    $('#chatPops').prepend(el);
    setTimeout(() => el.classList.add('out'), 4200); setTimeout(() => el.remove(), 4700);
    while ($('#chatPops').children.length > 3) $('#chatPops').lastChild.remove();
  }

  function update(S, id) {
    meId = id; chatArr = S.chat || [];
    document.body.classList.add('in-room');
    const fresh = chatArr.filter(m => m.k > lastK);
    if (!inited) { inited = true; lastK = chatArr.length ? chatArr[chatArr.length - 1].k : 0; renderList(); return; }
    if (!fresh.length) return;
    lastK = fresh[fresh.length - 1].k;
    renderList();
    const others = fresh.filter(m => m.id !== meId);
    if (others.length) {
      FX.sfx.click();
      if (!open) { unread += others.length; badge(); others.forEach(popup); }
    }
  }
  function reset() { lastK = 0; inited = false; unread = 0; chatArr = []; badge(); toggle(false); document.body.classList.remove('in-room'); renderList(); }

  build();
  const pops = document.createElement('div'); pops.className = 'chat-pops'; pops.id = 'chatPops'; document.body.appendChild(pops);
  return { update, reset, toggle, get open() { return open; } };
})();
