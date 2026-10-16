// 新手教程：分步讲解 + 动手试一试 + 小测验
const Tutorial = (() => {
  let idx = 0, onDone = null, steps = [], canNext = true, hasName = false;
  const $ = s => document.querySelector(s);
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const dice = n => `<div class="mini-dice ${n === 1 || n === 4 ? 'red' : ''}" id="tDice">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`;
  // 小芯说话：吉祥物 + 气泡
  const say = html => `<div class="say">${mascot(64)}<div class="bub">${html}</div></div>`;

  function build(needName) {
    const S = [];
    if (needName) S.push({
      lock: true,
      html: () => `<h2>欢迎来到 <em>芯途抉择</em></h2>
        ${say('你好呀，我是<b>小芯</b>，一颗会说话的芯片～接下来由我带你熟悉游戏。先给自己起个名字、挑个头像吧！')}
        <div class="name-form">
          <input id="tName" maxlength="8" placeholder="输入你的名字（最多 8 个字）" value="${esc(App.me.name)}" aria-label="你的名字">
          <div class="av-grid" id="tAv">${AVATARS.map(a => `<button class="${a === App.me.avatar ? 'on' : ''}" data-a="${a}" aria-label="头像">${avatarHTML({ avatar: a }, 44)}</button>`).join('')}</div>
        </div>`,
      mount: ok => {
        const inp = $('#tName');
        const check = () => { App.me.name = inp.value.trim(); ok(!!App.me.name); };
        inp.addEventListener('input', check); check(); setTimeout(() => inp.focus(), 200);
        $('#tAv').addEventListener('click', e => {
          const b = e.target.closest('button'); if (!b) return;
          $('#tAv .on')?.classList.remove('on'); b.classList.add('on'); App.me.avatar = b.dataset.a; FX.sfx.click();
        });
      },
    });
    S.push({
      html: () => `<h2>你是一名 <em>刚入职的工程师</em></h2>
        ${say('每位玩家都是半导体行业的新人。大家从同一个起点出发，沿着芯片产业链一圈圈地走：')}
        <div class="chain">${ZONES.map(z => `<b style="--c:${z.color}">${z.name}</b>`).join(I('chevron-right'))}</div>
        <p>一路上你会<em>攻关项目</em>、<em>学习成长</em>、遭遇<em>真实的行业大事件</em>，还会碰上<b style="color:var(--bad)">没有标准答案的伦理困境</b>。</p>
        <div class="demo"><p>${I('target', 'inl')} <b>目标很简单：</b>游戏固定轮数，结束时<em>总分最高</em>的人成为 MVP。</p></div>`,
    });
    S.push({
      html: () => `<h2>你有 <em>4 种资源</em>，外加 1 个"坑"</h2>
        <div class="res-row">
          ${[['m', '领工资、接活赚来，培训要花钱', '×1'], ['t', '学习获得，攻关项目要消耗它', '×1'], ['r', '做正确的事、帮助他人获得', '×2'], ['p', '完成的项目，最值钱', '×5'], ['h', '走捷径留下的雷，可能被查处', '−3']]
            .map(([k, d, w]) => `<div class="res-card" style="--c:${RES[k].color}"><span class="pts">${w}</span><span class="rc-ic">${I(RES[k].icon)}</span><b>${RES[k].name}</b><div>${d}</div></div>`).join('')}
        </div>
        <p>${I('lightbulb', 'inl')} 小窍门：用 <b>技术</b> 换 <b>项目</b> 是最主要的得分方式。右上角数字是每个资源值几分。</p>`,
    });
    S.push({
      html: () => `<h2>棋盘上的 <em>格子</em></h2>
        <p>停在哪个格子，就触发它的效果。不用死记，游戏里点击任意格子都能查看说明。</p>
        <div class="legend">${Object.values(TILE_TYPES).map(t =>
          `<div><span class="lg-ic" style="--c:${t.color}">${I(t.icon)}</span><span><b>${t.name}</b>${rt(t.tip)}</span></div>`).join('')}</div>`,
    });
    S.push({
      lock: true,
      html: () => `<h2>动手试试：<em>掷骰子</em></h2>
        ${say('轮到你时，点屏幕下方的橙色大按钮，骰子会在棋盘上滚动，棋子自己往前走 1–6 格。')}
        <div class="demo" style="display:flex;flex-direction:column;align-items:center;gap:18px;padding:24px">
          ${dice(1)}
          <button class="btn xl pri pulse" id="tRoll">${I('dices')}掷骰子</button>
          <div class="try-tip" id="tRollMsg">${I('pointer', 'inl')} 点一下试试</div>
        </div>`,
      mount: ok => {
        $('#tRoll').onclick = () => {
          const n = 1 + Math.floor(Math.random() * 6);
          FX.sfx.dice();
          $('#tDice').outerHTML = dice(n); $('#tDice').classList.add('rolling');
          const t = BOARD[n], tt = TILE_TYPES[t.type];
          setTimeout(() => {
            $('#tRollMsg').innerHTML = `掷出 <b style="font-family:var(--fn);font-size:22px">${n}</b> 点，走到了「<span style="color:${tt.color}">${I(tt.icon, 'inl')}${t.name}</span>」<br><span style="color:var(--ink2);font-weight:400">${rt(tt.tip)}</span>`;
            $('#tRoll').classList.remove('pulse'); $('#tRoll').innerHTML = `${I('refresh-cw')}再掷一次`;
            ok(true);
          }, 750);
        };
      },
    });
    S.push({
      html: () => `<h2>得分核心：<em>攻关项目</em></h2>
        ${say('停在<b>项目格</b>时，如果你有 3 个技术，就可以攻关拿项目啦：')}
        <div class="formula">${fmtRes({ t: -3 })} ${I('chevron-right')} ${fmtRes({ p: 1, m: 2 })}<br><small style="font-size:13px;color:var(--ink2)">技术不够也没关系，可以接个外包小活 ${fmtRes({ m: 1 })}</small></div>
        <div class="steps">
          <div><span class="no">1</span><span>停在 ${I('graduation-cap', 'inl')}<b>学习格</b> 攒技术</span></div>
          <div><span class="no">2</span><span>停在 ${I('drafting-compass', 'inl')}<b>项目格</b> 攻关拿项目</span></div>
          <div><span class="no">3</span><span>重复，项目越多分越高</span></div>
        </div>`,
    });
    S.push({
      lock: true,
      html: () => {
        const c = DILEMMAS[0];
        return `<h2>重头戏：<em>伦理困境</em></h2>
        ${say('停在<b>伦理困境格</b>会抽一张两难卡。<b>没有标准答案</b>，两个选项都有代价。来试一张吧：')}
        <div class="demo">
          <p><b style="font-family:var(--fz);font-size:20px;font-weight:400;color:var(--pri-d)">「${c.title}」</b><br>${c.scene}</p>
          <div class="opts" id="tOpts" style="margin-top:12px">
            ${['A', 'B'].map(k => `<button class="opt" data-k="${k}"><span class="ok">${k}</span><div class="ol">${c[k].label}</div><div class="oc">${fmtRes(c[k].d)}</div></button>`).join('')}
          </div>
          <div id="tDil"></div>
        </div>`;
      },
      mount: ok => {
        const c = DILEMMAS[0];
        $('#tOpts').onclick = e => {
          const b = e.target.closest('.opt'); if (!b || b.disabled) return;
          const k = b.dataset.k; FX.sfx.card();
          $('#tOpts').querySelectorAll('.opt').forEach(o => { o.disabled = true; o.classList.add(o === b ? 'picked' : 'dim'); });
          $('#tDil').innerHTML = `<div class="result" style="margin-top:12px"><small style="margin:0;color:var(--ink);font-size:15px">${c[k].note}</small></div>
            <div class="think" style="margin-top:10px">${I('message-circle-question')}<span>${c.think}</span></div>
            <p style="margin-top:10px">注意选项 A 带来了 ${resIcon('h')}<b style="color:var(--bad)">隐患</b>：短期赚得多，但每个隐患结算时 −3 分，还可能在<b>安全审计</b>或<b>质量暴雷</b>事件中被查处罚款。</p>
            <div class="tut-trust"><div class="trust ok" style="position:static;transform:none;box-shadow:none"><span class="tr-l">${I('heart-handshake')}行业信任</span><span class="tr-bar">${Array.from({ length: 10 }, (_, i) => `<i class="${i < (k === 'A' ? 4 : 7) ? 'on' : ''} ${i === 5 ? 'goal' : ''}"></i>`).join('')}</span><b>${k === 'A' ? 4 : 7}</b></div>
              <p>${k === 'A' ? '你走了捷径，<b>所有人共享的行业信任 −2</b>。信任降到 0 会引发危机，所有人一起受罚。' : '你守住了底线，<b>所有人共享的行业信任 +1</b>。结束时信任 ≥ 6，所有人都有口碑红利。'}</p></div>
            <p>${I('refresh-cw', 'inl')} 另外，这个选择<b>两轮后可能会「回响」</b>，回来找你：${c[k].echo.e}</p>`;
          ok(true);
        };
      },
    });
    S.push({
      html: () => `<h2>用 <em>工程思维</em> 看困境</h2>
        ${say('每张困境卡都标了一枚「工程思维透镜」，来自本课阅读材料《工程思维的特点》。做选择前，先用它问问自己：')}
        <div class="legend">${Object.entries(LENSES).map(([k, l]) => `<div><span class="lg-ic" style="--c:${l.color}">${I(l.icon)}</span><span><b style="color:${l.color}">${k}</b>${l.desc}</span></div>`).join('')}</div>
        <div class="demo"><p>${I('lightbulb', 'inl')} 卡牌下方还会列出这个抉择<b>牵动了谁</b>（利益相关方）。工程伦理，正是工程思维走到价值与边界处必然遭遇的判断问题。</p></div>`,
    });
    S.push({
      html: () => `<h2>别人选的时候，<em>你也有事做</em></h2>
        <div class="steps">
          <div><span class="no">1</span><span>${I('vote', 'inl')}<b>猜一猜</b>：队友遇到困境卡时，猜他会选 A 还是 B，猜中 +1${resIcon('m')}</span></div>
          <div><span class="no">2</span><span>${I('message-circle', 'inl')}<b>聊一聊</b>：右下角的聊天按钮，可以打字，也可以点快捷短语</span></div>
          <div><span class="no">3</span><span>${I('message-circle-question', 'inl')}<b>想一想</b>：每张卡结算后都有一个思考题，适合拿来讨论</span></div>
        </div>
        <p>结算时取舍理由比答案本身更重要：说说你为什么这么选。</p>`,
    });
    S.push({
      html: () => `<h2>角色各有 <em>专属技能</em></h2>
        ${say('开局前在房间里选角色（不选就随机），每个角色起始资源和技能都不一样：')}
        <div class="legend">${ROLES.map(r => `<div><span class="lg-ic" style="--c:${r.color}">${I(r.icon)}</span><span><b style="color:${r.color}">${r.name}</b>${r.skill}：${rt(r.desc)}</span></div>`).join('')}</div>`,
    });
    S.push({
      lock: true,
      html: () => `<h2>最后一步：<em>小测验</em></h2>
        <div class="formula">总分 = ${resIcon('m')} + ${resIcon('t')} + ${resIcon('r')}<b>×2</b> + ${resIcon('p')}<b>×5</b> − ${resIcon('h')}<b>×3</b></div>
        <p><b>问：</b>小明有 4${resIcon('m')}、5${resIcon('t')}、2${resIcon('r')}、1${resIcon('p')}、1${resIcon('h')}，他的总分是多少？</p>
        <div class="quiz" id="tQuiz">
          <button class="btn" data-v="0">17 分</button>
          <button class="btn" data-v="1">15 分</button>
          <button class="btn" data-v="0">18 分</button>
        </div><div id="tQuizMsg"></div>`,
      mount: ok => {
        $('#tQuiz').onclick = e => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.dataset.v === '1') {
            b.classList.add('right'); b.innerHTML = `${I('circle-check')}15 分`; FX.sfx.good();
            $('#tQuizMsg').innerHTML = `<p class="try-tip" style="margin-top:8px">答对了！4 + 5 + 2×2 + 1×5 − 1×3 = 15</p>`; ok(true);
          } else { b.classList.add('wrong'); FX.sfx.bad(); $('#tQuizMsg').innerHTML = `<p style="margin-top:8px;color:var(--bad)">再算算：别忘了声誉 ×2、项目 ×5、隐患 ×(−3)</p>`; }
        };
      },
    });
    S.push({
      html: () => `<h2>准备好啦！<em>怎么和同学联机？</em></h2>
        <div class="steps">
          <div><span class="no">1</span><span>一个人点<b>「创建房间」</b>，会得到一个 <em>4 位房间码</em>和二维码</span></div>
          <div><span class="no">2</span><span>其他人点<b>「加入房间」</b>输入房间码，或者<b>用手机扫二维码</b>直接进来</span></div>
          <div><span class="no">3</span><span>凑够 <b>3–6 人</b>（不够可加机器人），房主点<b>「开始游戏」</b></span></div>
        </div>
        ${say('第一次遇到每种情况时，我都会跳出来告诉你怎么做。右上角的菜单里可以随时看规则～')}`,
    });
    return S;
  }

  function render() {
    const st = steps[idx];
    const stage = $('#tutStage');
    stage.innerHTML = st.html();
    stage.style.animation = 'none'; void stage.offsetWidth; stage.style.animation = '';
    $('#tutStep').textContent = `${String(idx + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}`;
    $('#tutBar').style.width = ((idx + 1) / steps.length * 100) + '%';
    $('#tutPrev').style.visibility = idx ? 'visible' : 'hidden';
    $('#tutNext').innerHTML = idx === steps.length - 1 ? `${I('rocket')}开始游戏` : `下一步${I('chevron-right')}`;
    setNext(!st.lock);
    if (st.mount) st.mount(setNext);
  }
  function setNext(v) { canNext = v; $('#tutNext').disabled = !v; $('#tutNext').classList.toggle('pulse', v && !!steps[idx].lock); }

  function finish() { localStorage.setItem('ecg_tut', '1'); App.saveMe(); const f = onDone; onDone = null; f && f(); }

  $('#tutNext').onclick = () => {
    if (!canNext) return; FX.sfx.click();
    if (idx === 0 && hasName) App.saveMe();
    if (idx < steps.length - 1) { idx++; render(); } else finish();
  };
  $('#tutPrev').onclick = () => { if (idx > 0) { FX.sfx.click(); idx--; render(); } };
  $('#tutSkip').onclick = () => {
    // 跳过时仍要保证有名字
    if (!App.me.name) { if (!hasName) { hasName = true; steps = build(true); } idx = 0; render(); App.toast('先填个名字再跳过哦'); return; }
    finish();
  };

  function open(done, needName) {
    onDone = done; hasName = !!needName; steps = build(needName); idx = 0;
    App.show('tutorial'); render();
  }
  return { open };
})();
