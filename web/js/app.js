/* Wolf Math Defense: responsive UI and hand-drawn 2D canvas renderer. */
(function () {
  'use strict';
  const G = window.WolfMathEngine;
  const $ = id => document.getElementById(id);
  const canvas = $('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = 1000, H = 600;
  const HOME_X = 506, HOME_Y = 334;
  const RING_RADII = [[388, 240], [286, 179], [185, 116]];
  const storageKey = 'wolf-math-defense-save-v1'; // Keep key: v1 saves migrate without data loss.
  const styleKey = 'watchoutwolf-visual-style-v12';
  let visualStyle = getSavedStyle();
  let state = G.newGame('easy');
  let stored = loadSave();
  let soundOn = true;
  let audioCtx = null;
  let toastTimer = null;
  let fx = null;
  const moveFx = new Map();
  const defenseFx = [];
  let drawing = true;
  let rolling = false;
  let lastView = '';
  let screenshotFrame = 0;

  const stars = Array.from({ length: 65 }, (_, i) => ({
    x: ((i * 378.17 + 71) % 930) + 30,
    y: ((i * 133.47 + 39) % 230) + 8,
    r: (i % 7 === 0 ? 1.8 : .65), offset: i * 3.25
  }));
  const trees = Array.from({ length: 31 }, (_, i) => ({ x: i * 37 - 29, y: 245 + (i % 4) * 16, h: 51 + (i % 7) * 17 }));

  function getSavedStyle() {
    try { return localStorage.getItem(styleKey) === 'drama' ? 'drama' : 'classic'; }
    catch (_) { return 'classic'; }
  }
  function setVisualStyle(next) {
    visualStyle = next === 'drama' ? 'drama' : 'classic';
    document.body.dataset.style = visualStyle;
    document.querySelectorAll('[data-style]').forEach(button => {
      const selected = button.dataset.style === visualStyle;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('active', selected);
    });
    try { localStorage.setItem(styleKey, visualStyle); } catch (_) {}
    render();
  }
  document.body.dataset.style = visualStyle;
  function loadSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
      return G.migrateSave(parsed);
    } catch (_) { return null; }
  }
  function persist() { try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) {} }
  function resetSave() { try { localStorage.removeItem(storageKey); } catch (_) {} }
  function escapeText(str) {
    return String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2900);
  }
  function playSound(kind) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      const now = audioCtx.currentTime;
      const notes = kind === 'correct' ? [510, 650, 810] : kind === 'wrong' ? [340, 285, 220] : kind === 'wolf' ? [160, 145] : kind === 'flash' ? [390, 790, 1030] : kind === 'tower' ? [300,460] : kind === 'alarm' ? [520,410,520] : kind === 'win' ? [392, 493, 587, 784] : [330];
      notes.forEach((note, index) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = kind === 'wolf' ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(note, now + index * .075);
        gain.gain.setValueAtTime(.0001, now + index * .075);
        gain.gain.exponentialRampToValueAtTime(kind === 'wolf' ? .045 : .075, now + index * .075 + .017);
        gain.gain.exponentialRampToValueAtTime(.0001, now + index * .075 + .16);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now + index * .075); osc.stop(now + index * .075 + .18);
      });
    } catch (_) {}
  }
  function vibrate(duration) { try { navigator.vibrate?.(duration); } catch (_) {} }
  function impact(text) {
    $('impactLayer').innerHTML = `<div class="impact-word">${escapeText(text)}</div>`;
    setTimeout(() => { $('impactLayer').innerHTML = ''; }, 1050);
  }
  function start(mode) {
    state = G.newGame(mode, (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
    stored = null;
    $('introOverlay').classList.remove('visible');
    $('endOverlay').classList.remove('visible');
    render(); persist();
    playSound('correct');
  }
  function continueGame() {
    if (!stored) return;
    state = stored;
    stored = null;
    $('introOverlay').classList.remove('visible');
    render();
    if (state.phase === 'won' || state.phase === 'lost') displayEnding();
  }
  function confirmRestart() {
    if (!window.confirm('重新开始本局游戏？当前守夜进度会清空。')) return;
    resetSave();
    stored = null;
    $('introOverlay').classList.add('visible');
    $('endOverlay').classList.remove('visible');
    $('introOverlay').setAttribute('aria-hidden', 'false');
  }
  function interact(action, param) {
    if (rolling) return;
    let result;
    if (action === 'answer') {
      result = G.answerQuestion(state, Number(param));
      if (result.ok) {
        playSound(result.correct ? 'correct' : 'wrong');
        impact(result.correct ? '答对！' : '答错！');
        if (!result.correct) vibrate([35, 45, 65]);
      }
    } else if (action === 'roll') {
      startRoulette(); return;
    } else if (action === 'skip') result = G.skipDice(state);
    else if (action === 'endturn') {
      const before = new Map(state.wolves.map(w => [w.id, { angle: w.angle, ring: w.ring }]));
      result = G.endTurn(state);
      if (result.ok) {
        for (const hit of result.event.projectiles) defenseFx.push({ kind: 'shot', ring: hit.ring, target: before.get(hit.wolfId), at: performance.now() });
        for (const id of result.event.alarms) defenseFx.push({ kind: 'alarm', target: before.get(id), at: performance.now() });
        for (const id of result.event.netted) defenseFx.push({ kind: 'net', target: before.get(id), at: performance.now() });
        for (const id of result.event.trapped) defenseFx.push({ kind: 'spring', target: before.get(id), at: performance.now() });
        if (defenseFx.length > 24) defenseFx.splice(0, defenseFx.length - 24);
        playSound(result.event.damageHouse ? 'wolf' : result.event.dawn ? 'correct' : result.event.projectiles.length ? 'tower' : result.event.alarms.length ? 'alarm' : 'tick');
        if (result.event.damageHouse) { impact(`小屋 -${result.event.damageHouse} ♥`); vibrate(90); }
        else if (result.event.dawn) impact('黎明补给 +');
      }
    } else if (action === 'flash') {
      const selected = Number(param) || state.selectedWolf; // Direct wolf-card flashlight always wins over stale selection.
      const wolf = state.wolves.find(w => w.id === selected);
      if (wolf) fx = { angle: wolf.angle, ring: wolf.ring, at: performance.now() };
      result = G.flashWolf(state, selected);
      if (result.ok) {
        moveFx.set(result.wolfId, { from: result.from, to: result.to, at: performance.now() });
        playSound('flash'); vibrate([25, 30, 25]); impact('嗷呜 → 汪！');
      } else fx = null;
    } else {
      result = G.takeAction(state, action, state.selectedRing);
      if (result.ok) playSound('tick');
    }
    if (!result?.ok) toast(result?.message || '操作暂时不可用。');
    if (result?.ok) {
      if (state.lastResult && (action === 'answer' || action === 'flash')) toast(`${state.lastResult.title} ${state.lastResult.text}`);
      persist(); render();
      if (state.phase === 'won' || state.phase === 'lost') setTimeout(displayEnding, 700);
    }
  }
  function startRoulette() {
    if (rolling || state.phase !== 'dice') return;
    rolling = true;
    const overlay = document.createElement('div');
    overlay.className = 'roulette-backdrop';
    overlay.innerHTML = `<div class="roulette-dialog"><div class="roulette-title">🎲 命运六面骰</div><div style="position:relative;width:210px;margin:auto"><div class="roulette-pointer">▼</div><div class="roulette-wheel" id="rollingWheel">${Array.from({ length: 6 }, (_, i) => {
      const a = (i + .5) * Math.PI / 3; // The label aligns with its matching conic-gradient sector.
      const x = 104 + 71 * Math.sin(a), y = 105 - 71 * Math.cos(a);
      return `<span class="roulette-num" style="left:${x}px;top:${y}px">${i + 1}</span>`;
    }).join('')}</div></div><div class="roulette-status">狼盯着骰子，外婆盯着你……</div><div class="roulette-result" id="rouletteResult"></div></div>`;
    document.body.appendChild(overlay);
    const result = G.rollDice(state);
    const face = result.face;
    persist(); // Save the committed result immediately, even if Android is paused mid-animation.
    // Every sector is 60 degrees; face 1 begins at 0-60 degrees.
    const stop = (360 - ((face - 1) * 60 + 30)) % 360;
    setTimeout(() => { const wheel = $('rollingWheel'); if (wheel) wheel.style.transform = `rotate(${2160 + stop}deg)`; playSound('tick'); }, 50);
    setTimeout(() => {
      const ele = $('rouletteResult');
      if (ele) ele.textContent = `${face} · ${result.info.label}`;
      playSound(face === 1 ? 'wrong' : face >= 5 ? 'flash' : 'tick');
      if (face === 1) vibrate([120, 70, 140]);
    }, 1940);
    setTimeout(() => {
      overlay.remove(); rolling = false;
      persist(); render();
      toast(result.info.detail);
      if (face >= 5) impact('手电电量 +' + (face === 6 ? 2 : 1));
      if (state.phase === 'lost') displayEnding();
    }, 2550);
  }
  function render() {
    const night = G.nightOf(state.turn);
    $('nightLabel').textContent = `第 ${night} 夜`;
    $('turnLabel').textContent = `回合 ${state.turn} / ${G.TOTAL_TURNS}`;
    const phaseText = { question: '答题中', dice: '命运骰', defend: '修筑防线', won: '胜利！', lost: '失守！' };
    $('phaseLabel').textContent = phaseText[state.phase] || state.phase;
    $('phaseDot').style.background = state.phase === 'dice' ? '#ffba67' : state.phase === 'lost' ? '#f47c80' : '#9be4af';
    $('scoreLabel').textContent = state.score;
    $('healthText').textContent = `${state.house} / ${state.maxHouse}`;
    $('healthFill').style.width = `${100 * state.house / state.maxHouse}%`;
    $('flashBadge').innerHTML = `🔦 <span>${state.charges} 格电量</span>`;
    $('wolfCount').textContent = `🐺 ${state.wolves.filter(w => w.kind !== 'dog').length} 狼 · 🐕 ${state.wolves.filter(w => w.kind === 'dog').length} 狗`;
    $('coinsNum').textContent = state.coins;
    $('woodNum').textContent = state.wood;
    $('stoneNum').textContent = state.stone;
    $('batteryNum').textContent = state.charges;
    $('missionText').textContent = state.phase === 'question' ? '答题兑换建材；买陷阱、黏网、哨塔与警报铃。' : state.phase === 'dice' ? '算错可掷命运骰：好运拿到手电，狼变吉娃娃并退回外圈。' : state.phase === 'defend' ? '选中防线部署武器，永久哨塔每轮自动发射；手电可临时救急。' : '这一夜的结果已经揭晓。';
    const line = state.phase === 'dice' ? '外婆：数学没算对？现在还要拿运气补考。'
      : state.phase === 'defend' ? '女儿：冰淇淋是我送的。丑娘：那我还得报恩。'
      : state.phase === 'won' ? '导演：狼没受伤，自尊心有待修复。'
      : state.phase === 'lost' ? '外婆：墙没了，床下那位先出来帮忙。'
      : G.nightOf(state.turn) === 1 ? '外婆：孙子还在玩唯一那台掌机。床底下有声音……'
      : G.nightOf(state.turn) === 2 ? '孙子：我们有防御塔。丑娘（床下）：别朝屋里开。'
      : '女儿：第三夜要到了。外婆：我先检查一下床底。';
    $('sceneCaption').textContent = line;
    renderRings(); renderPhase(); renderWolves(); renderFeed();
    if (!drawing) draw(performance.now());
    lastView = state.phase;
  }
  function renderRings() {
    $('defenseRings').innerHTML = G.RING_NAMES.map((label, i) => {
      const health = state.walls[i], max = G.MAX_WALLS[i];
      return `<button type="button" class="ring-button ${state.selectedRing === i ? 'selected' : ''}" data-ring="${i}" aria-pressed="${state.selectedRing === i}"><div class="ring-header"><span class="ring-name"><span class="ring-symbol">${['Ⅰ', 'Ⅱ', 'Ⅲ'][i]}</span>${label}</span></div><div class="ring-meter"><div class="${health / max < .35 ? 'critical' : ''}" style="width:${100 * health / max}%"></div></div><div class="ring-footer"><span>${health === 0 ? '已被突破' : '耐久'}</span><span class="ring-health">${health}/${max}</span></div><div class="ring-arsenal">⚙ ${state.traps[i]}　🕸 ${state.nets[i]}<span>🎯 ${state.towers[i]}级　🔔 ${state.alarms[i] ? (state.alarmCooldowns[i] ? '冷却' : '待命') : '—'}</span></div></button>`;
    }).join('');
  }
  function renderResult() {
    if (!state.lastResult) return '';
    const r = state.lastResult;
    const cls = ['wrong', 'bad'].includes(r.kind) ? 'bad' : r.kind === 'neutral' ? 'neutral' : '';
    return `<div class="result-strip ${cls}"><span class="result-emoji">${cls === 'bad' ? '⚠' : '✦'}</span><div><strong>${escapeText(r.title)}</strong>${escapeText(r.text)}</div></div>`;
  }
  function renderPhase() {
    const panel = $('phasePanel');
    if (state.phase === 'question') {
      panel.innerHTML = `<div class="action-card"><div class="action-card-header"><span class="micro-tag">🧮 数学采购挑战</span><span class="chapter-tag">第 ${state.turn} 题 / 18</span></div><div class="question-inner"><div class="question-title">${escapeText(state.question.prompt)}</div><p class="answer-label">选出正确答案以获得建材</p><div class="answer-choices">${state.question.options.map((v, i) => `<button class="answer-option" type="button" data-answer="${v}" aria-label="选项${i + 1}，${v}">${v}</button>`).join('')}</div><p class="action-hint">✓ 答对：金币 +${3 + G.nightOf(state.turn)}、木材 +1；连续4题答对还能获得手电电量。</p></div></div>`;
    } else if (state.phase === 'dice') {
      panel.innerHTML = `${renderResult()}<div class="action-card"><div class="dice-layout"><span class="micro-tag">🎲 算错了的补救机会</span><h3 style="margin-top:12px">敢不敢掷命运骰？</h3><p class="dice-description">六个面，等概率。坏运气会让狼群袭来；好手气拿到手电筒，照狼一眼，狼就成吉娃娃。</p><div class="dice-outcomes">${G.DICE_FACES.map(f => `<span class="dice-face ${f.kind}"><span>${f.face}</span> ${f.label}</span>`).join('')}</div><div class="dice-actions"><button type="button" class="primary-button" data-action="roll">🎲 掷命运骰</button><button type="button" class="secondary-button" data-action="skip">安全跳过</button></div><p class="action-hint">概率公开：灾厄 1/6，拿手电 2/6，其余 3/6。没有真金钱赌博。</p></div></div>`;
    } else if (state.phase === 'defend') {
      const can = condition => state.actions > 0 && condition;
      const r = state.selectedRing;
      const actionButton = (key, emoji, title, desc, cost, eligible) =>
        `<button class="build-button" type="button" data-action="${key}" ${can(eligible) ? '' : 'disabled'}><b><span class="build-symbol">${emoji}</span>${title}</b><small>${desc}</small><span class="cost">${cost}</span></button>`;
      const selectedWolf = state.wolves.find(w => w.id === state.selectedWolf && w.kind !== 'dog');
      panel.innerHTML = `${renderResult()}<div class="action-card"><div class="defend-header"><div class="defend-title">🛠 陷阱 · 武器 · 施工</div><span class="remaining-actions">剩余 ${state.actions} / 2 次</span></div><div class="defend-body"><p class="action-hint">部署位置：<b class="selected-defense-name">${G.RING_NAMES[r]}</b>。点击战场或防线卡片切换。</p>
        <div class="build-choice"><div class="build-group-label">一次性陷阱 <small>每圈最多各 2 个</small></div>
          ${actionButton('trap', '⚙️', '弹簧绊狼夹', '触发后弹退一圈，狼暂停行动', '木材 1 · 石材 1', state.wood >= 1 && state.stone >= 1 && state.traps[r] < 2)}
          ${actionButton('net', '🕸️', '冰淇淋黏网', '困住狼两次攻击；女儿的冰淇淋', '木材 1 · 金币 3', state.wood >= 1 && state.coins >= 3 && state.nets[r] < 2)}
          <div class="build-group-label">可升级自动防御 <small>每回合自动触发</small></div>
          ${actionButton('tower', '🎯', `弹弓哨塔 Lv.${state.towers[r]}/2`, '发射石子降低狼的胆量；归零逃跑', '木材 2 · 石材 1 · 金币 2', state.wood >= 2 && state.stone >= 1 && state.coins >= 2 && state.towers[r] < 2)}
          ${actionButton('alarm', '🔔', state.alarms[r] ? '警报铃已安装' : '月光警报铃', '每 3 回合吓住一只狼两轮', '木材 1 · 石材 2 · 金币 3', state.wood >= 1 && state.stone >= 2 && state.coins >= 3 && !state.alarms[r])}
          <div class="build-group-label">修筑与材料 <small>小屋的日常工程</small></div>
          ${actionButton('buyWood', '🪵', '采购 2 块木材', '用于修墙、制作各类陷阱', '金币 4 → 木材 +2', state.coins >= 4)}
          ${actionButton('buyStone', '⬡', '采购 1 块石材', '用于哨塔、夹子和警报铃', '金币 5 → 石材 +1', state.coins >= 5)}
          ${actionButton('fortify', '🏗️', '加固选中防线', '耐久最多 +4', '木材 2', state.wood >= 2 && state.walls[r] < G.MAX_WALLS[r])}
          ${actionButton('repair', '♥', '修理外婆小屋', '生命最多 +4', '木材 3', state.wood >= 3 && state.house < state.maxHouse)}
          <div class="build-group-label">特殊道具 <small>不占工程行动</small></div>
          <button class="build-button torch-action" type="button" data-action="flash" ${state.charges > 0 && selectedWolf ? '' : 'disabled'}><b><span class="build-symbol">🔦</span>手电变吉娃娃</b><small>${selectedWolf ? `目标：狼 #${selectedWolf.id}` : '先选中一只狼'}</small><span class="cost">电量 1 · 不占建造次数</span></button>
        </div><button type="button" class="endturn-button" data-action="endturn">🌙 结束回合 · 自动防御开火 →</button><p class="attack-warning">⚠ 结束回合：先触发哨塔和警报铃，接着结算陷阱，最后才是狼的攻击。</p></div></div>`;
    } else {
      panel.innerHTML = `<div class="action-card"><div class="dice-layout"><h3>${state.phase === 'won' ? '守夜成功！' : '防线失守！'}</h3><p class="dice-description">${escapeText(state.gameEndReason)}</p><button class="primary-button" type="button" data-restart="yes">重新开始</button></div></div>`;
    }
  }
  function renderWolves() {
    const list = $('wolfList');
    if (!state.wolves.length) {
      list.innerHTML = '<div class="empty-wolves">树林里暂时没有狼。最好趁这个机会修补外墙。</div>';
      return;
    }
    list.innerHTML = state.wolves.map(w => {
      const dog = w.kind === 'dog';
      const label = G.getWolfName(w);
      const position = w.ring === 0 ? '森林边缘' : G.RING_NAMES[w.ring - 1];
      const ready = state.phase === 'defend' && state.charges > 0 && !dog;
      return `<div class="wolf-card ${state.selectedWolf === w.id ? 'selected' : ''}"><div class="wolf-avatar ${dog ? 'dog' : ''}">${dog ? '🐕' : w.kind === 'heavy' ? '🐺' : '🐺'}</div><div class="wolf-details"><strong>#${w.id} ${label}</strong><small>${position} ${dog ? '· 正在逃跑' : `· 攻击 ${w.attack} · 胆量 ${w.courage}/${w.maxCourage}`}</small></div>${dog ? '<span style="color:#a7e8bc;font-size:11px">无害 ✓</span>' : `<button class="target-choose ${ready ? 'torch-target' : ''}" type="button" data-wolf="${w.id}" aria-label="选中第${w.id}只狼">${state.selectedWolf === w.id ? '已选中' : '选中'}</button>`}${ready ? `<button class="target-choose torch-target" type="button" data-directflash="${w.id}" aria-label="用手电照射第${w.id}只狼">🔦 照射</button>` : ''}</div>`;
    }).join('');
  }
  function renderFeed() {
    $('battleFeed').innerHTML = state.feed.map(item => `<li><span class="feed-dot ${item.type}"></span><span>${escapeText(item.line)}</span></li>`).join('');
  }
  function displayEnding() {
    if (state.phase !== 'won' && state.phase !== 'lost') return;
    const won = state.phase === 'won';
    $('endIcon').textContent = won ? '☀️' : '🏚️';
    $('endEyebrow').textContent = won ? 'MISSION COMPLETED' : 'MISSION FAILED';
    $('endTitle').textContent = won ? '三夜守住了！' : '小屋失守了……';
    $('endReason').textContent = won ? `${state.gameEndReason} 荣誉称号：${G.scoreLabel(state.score)}` : `${state.gameEndReason} 狼拿走了答案本，外婆拿走了游戏机。`;
    $('endStats').innerHTML = `<div><strong>${state.score}</strong><small>守夜得分</small></div><div><strong>${state.turn} / 18</strong><small>坚持回合</small></div><div><strong>${state.correct}</strong><small>答对题数</small></div><div><strong>${state.house} ♥</strong><small>小屋生命</small></div>`;
    $('endOverlay').classList.add('visible');
    $('endOverlay').setAttribute('aria-hidden', 'false');
    playSound(won ? 'win' : 'wrong');
  }
  function closeHelp() { $('helpOverlay').classList.remove('visible'); $('helpOverlay').setAttribute('aria-hidden', 'true'); }
  document.addEventListener('click', event => {
    const target = event.target;
    if (target.closest('button[data-style]')) { setVisualStyle(target.closest('button[data-style]').dataset.style); playSound('tick'); return; }
    if (target.closest('[data-mode]')) { start(target.closest('[data-mode]').dataset.mode); return; }
    if (target.closest('[data-restart]')) { $('endOverlay').classList.remove('visible'); start('easy'); return; }
    if (target.closest('[data-answer]')) { interact('answer', target.closest('[data-answer]').dataset.answer); return; }
    if (target.closest('[data-directflash]')) { interact('flash', target.closest('[data-directflash]').dataset.directflash); return; }
    if (target.closest('[data-wolf]')) {
      state.selectedWolf = Number(target.closest('[data-wolf]').dataset.wolf);
      playSound('tick'); persist(); render(); return;
    }
    if (target.closest('[data-ring]')) {
      state.selectedRing = Number(target.closest('[data-ring]').dataset.ring);
      playSound('tick'); persist(); render(); return;
    }
    if (target.closest('[data-action]')) { interact(target.closest('[data-action]').dataset.action); return; }
  });
  $('continueButton').addEventListener('click', continueGame);
  $('restartBtn').addEventListener('click', confirmRestart);
  $('helpBtn').addEventListener('click', () => { $('helpOverlay').classList.add('visible'); $('helpOverlay').setAttribute('aria-hidden', 'false'); });
  $('closeHelp').addEventListener('click', closeHelp);
  $('okHelp').addEventListener('click', closeHelp);
  $('soundBtn').addEventListener('click', () => { soundOn = !soundOn; $('soundBtn').textContent = soundOn ? '♫' : '×'; $('soundBtn').classList.toggle('off', !soundOn); toast(soundOn ? '音效已开启' : '音效已关闭'); });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeHelp();
    if (/^[1-3]$/.test(event.key) && state.phase === 'question' && !$('introOverlay').classList.contains('visible') && !$('helpOverlay').classList.contains('visible')) {
      interact('answer', state.question.options[Number(event.key) - 1]);
    }
  });
  canvas.addEventListener('pointerdown', event => {
    if ($('introOverlay').classList.contains('visible') || $('helpOverlay').classList.contains('visible') || rolling) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * W / rect.width;
    const y = (event.clientY - rect.top) * H / rect.height;
    let nearest = null, nearestDist = Infinity;
    for (const wolf of state.wolves) {
      const p = wolfPosition(wolf, performance.now());
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < 49 && dist < nearestDist) { nearest = wolf; nearestDist = dist; }
    }
    if (nearest) {
      if (nearest.kind === 'dog') { toast('这只吉娃娃已经投降，正在撤退。'); return; }
      state.selectedWolf = nearest.id;
      playSound('tick'); render(); persist();
      if (state.phase === 'defend' && state.charges > 0) toast(`已锁定狼 #${nearest.id}，点下方「🔦 照射」或狼群雷达里的按钮。`);
      else toast(`已选中狼 #${nearest.id}。手电筒充好电就可以照射。`);
      return;
    }
    const dx = x - HOME_X, dy = y - HOME_Y;
    const distances = RING_RADII.map(([rx, ry]) => Math.abs(Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)) - 1));
    const min = Math.min(...distances);
    if (min < .22) {
      state.selectedRing = distances.indexOf(min);
      playSound('tick'); render(); persist();
      toast(`当前加固目标：${G.RING_NAMES[state.selectedRing]}`);
    }
  });

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2.25, window.devicePixelRatio || 1);
    const desiredW = Math.round(rect.width * dpr), desiredH = Math.round(rect.height * dpr);
    if (canvas.width !== desiredW || canvas.height !== desiredH) { canvas.width = desiredW; canvas.height = desiredH; }
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }
  function rounded(x, y, w, h, r, fill, stroke, line) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = line || 1; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function ellipse(x, y, rx, ry, fill, stroke, line) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line || 1; ctx.stroke(); }
  }
  function polygon(pts, fill, stroke, line) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line || 1; ctx.stroke(); }
  }
  function label(text, x, y, color, align, size) {
    ctx.font = `800 ${size || 12}px system-ui, sans-serif`;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function backgroundDrama(t) {
    // Short-drama mode: cinematic twilight, stage depth, warm practical lighting and mist.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#110f1c'); sky.addColorStop(.4, '#27303b'); sky.addColorStop(.72, '#393638'); sky.addColorStop(1, '#161c26');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // Moonlit clouds have a deliberately slow drift; no hard cuts.
    for (let i=0; i<7; i++) {
      const x = (i*178 + Math.sin(t/9600+i)*25) % 1100 - 50;
      ctx.globalAlpha = .06 + .014*Math.sin(t/3000+i);
      ellipse(x, 82 + i*31, 175+i*12, 25, '#d9cad2');
    }
    ctx.globalAlpha = 1;
    ctx.save();ctx.shadowColor='#d4c6bd';ctx.shadowBlur=24;
    ellipse(818,85,41,41,'#d8c6b8');ctx.restore();
    ellipse(831,75,7,7,'#aea4a3');ellipse(805,99,6,5,'#aca09e');
    polygon([[0,284],[122,221],[205,267],[356,210],[501,256],[650,193],[810,270],[918,205],[1000,252],[1000,600],[0,600]],'#17252d');
    polygon([[0,335],[90,275],[198,308],[317,250],[481,320],[630,268],[790,307],[1000,256],[1000,600],[0,600]],'#1b272c');
    trees.forEach((tree,i)=>{
      ctx.globalAlpha=.6+.14*(i%3);
      polygon([[tree.x-21,tree.y+30],[tree.x,tree.y-tree.h*1.15],[tree.x+18,tree.y+30]],i%4===0?'#15202a':'#141f27');
      polygon([[tree.x-27,tree.y+42],[tree.x,tree.y-tree.h*.86],[tree.x+27,tree.y+42]],'#1d292a');
      rounded(tree.x-3,tree.y+18,6,31,2,'#283033');
    });ctx.globalAlpha=1;
    const ground=ctx.createRadialGradient(505,365,15,505,375,590);
    ground.addColorStop(0,'#4f4c42');ground.addColorStop(.62,'#282f30');ground.addColorStop(1,'#171f29');
    ellipse(505,395,525,264,ground);
    for(let i=0;i<27;i++){
      let px=26+(i*71.71)%950, py=383+(i*43.1)%212;
      ctx.globalAlpha=.12;ellipse(px,py,12+(i%4)*8,2,'#b1a69c');
    }ctx.globalAlpha=1;
    // Stage fog drifts rather than teleporting across frames.
    for(let i=0;i<4;i++) {
      let x=140+i*210+Math.sin(t/2700+i)*31;
      ctx.globalAlpha=.055; ellipse(x,420+i*12,184,31,'#e4c9b9');
    }ctx.globalAlpha=1;
  }
  function background(t) {
    if (visualStyle === 'drama') { backgroundDrama(t); return; }
    const sky = ctx.createLinearGradient(0, 0, 0, 600);
    sky.addColorStop(0, '#0a142b'); sky.addColorStop(.45, '#172c42'); sky.addColorStop(1, '#29413c');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      const alpha = .28 + .35 * Math.sin(t / 1600 + s.offset) ** 2;
      ctx.fillStyle = `rgba(224,233,249,${alpha})`; ellipse(s.x, s.y, s.r, s.r, ctx.fillStyle);
    }
    ctx.save();
    ctx.shadowColor = '#f7dba0'; ctx.shadowBlur = 39;
    ellipse(811, 84, 36, 36, '#f5daa3');
    ctx.shadowBlur = 0;
    ellipse(801, 77, 8, 7, '#e5c58f'); ellipse(827, 92, 5, 4, '#e6c795');
    ctx.restore();
    ctx.globalAlpha = .13;
    ellipse(680 + Math.sin(t / 8000) * 19, 133, 175, 30, '#d2d9dc');
    ellipse(264 + Math.sin(t / 6500) * 21, 174, 155, 25, '#b0cbd7');
    ctx.globalAlpha = 1;
    polygon([[0,265],[75,203],[147,243],[225,178],[311,254],[420,198],[500,255],[587,189],[695,259],[763,201],[846,258],[935,199],[1000,252],[1000,600],[0,600]], '#172e3b');
    polygon([[0,302],[73,251],[126,283],[228,233],[318,281],[430,246],[521,285],[618,237],[721,287],[818,248],[919,289],[1000,250],[1000,600],[0,600]], '#1b343e');
    trees.forEach((tree, i) => {
      const dx = tree.x, cy = tree.y;
      polygon([[dx-16,cy],[dx,cy-tree.h],[dx+16,cy]], i % 5 === 0 ? '#102333' : '#142936');
      polygon([[dx-18,cy+15],[dx,cy-tree.h*.72],[dx+18,cy+15]], i % 3 === 0 ? '#10252f' : '#152d35');
      rounded(dx-3,cy+3,6,19,1,'#192634');
    });
    ellipse(506, 384, 500, 250, '#223e3f');
    ellipse(506, 396, 455, 221, '#263e39');
    for (let i = 0; i < 20; i++) {
      const px = 55 + (i * 61.37) % 900, py = 360 + (i * 53.2) % 200;
      ellipse(px, py, i % 3 === 0 ? 8 : 4, i % 3 === 0 ? 3 : 2, '#405947');
    }
    ctx.save();
    ctx.globalAlpha = .065 + .02 * Math.sin(t / 1800);
    ellipse(505, 377, 413, 213, '#f3e7c4');
    ctx.restore();
  }
  function drawRing(i, t) {
    const [rx, ry] = RING_RADII[i];
    const hp = state.walls[i], max = G.MAX_WALLS[i];
    const selected = state.selectedRing === i;
    const ringColor = visualStyle === 'drama' ? (hp === 0 ? '#9b4e52' : hp/max < .33 ? '#c16d60' : ['#8b684c','#77878c','#a38a63'][i]) : (hp === 0 ? '#a25a60' : hp / max < .33 ? '#d68a6f' : i === 0 ? '#b28c65' : i === 1 ? '#94aeb9' : '#c0a36c');
    ctx.save();
    ctx.globalAlpha = selected ? .3 : .12;
    ctx.lineWidth = selected ? 29 : 19;
    ctx.strokeStyle = selected ? (visualStyle === 'drama' ? '#ec9c5d' : '#f7ca70') : ringColor;
    ctx.beginPath(); ctx.ellipse(HOME_X, HOME_Y, rx, ry, 0, 0, 2 * Math.PI); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash(hp === 0 ? [3, 22] : i === 0 ? [11, 5] : i === 1 ? [19, 8] : [29, 7]);
    ctx.lineWidth = i === 2 ? 13 : 11;
    ctx.lineCap = i === 0 ? 'round' : 'butt';
    ctx.strokeStyle = '#142731';
    ctx.beginPath(); ctx.ellipse(HOME_X, HOME_Y + 4, rx, ry, 0, 0, 2 * Math.PI); ctx.stroke();
    ctx.strokeStyle = ringColor;
    ctx.beginPath(); ctx.ellipse(HOME_X, HOME_Y, rx, ry, 0, 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);
    const count = [39, 32, 26][i];
    for (let j = 0; j < count; j++) {
      const angle = j * 2 * Math.PI / count;
      const x = HOME_X + rx * Math.cos(angle), y = HOME_Y + ry * Math.sin(angle);
      if (hp === 0 && j % 2) continue;
      ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
      rounded(-5,-12,i === 2 ? 11 : 9, 24, 2, hp === 0 ? '#765650' : i === 1 ? '#667f8d' : i === 2 ? '#857c65' : '#765e48', '#1e3038',1);
      if(i === 0) polygon([[-5,-12],[0,-20],[4,-12]], '#9b7858');
      ctx.restore();
    }
    if (selected) {
      const x = HOME_X + rx * Math.cos(-Math.PI * .58), y = HOME_Y + ry * Math.sin(-Math.PI * .58);
      ctx.save(); ctx.shadowColor = '#ffd78d'; ctx.shadowBlur = 15;
      ellipse(x,y,11,11,'#f5cc7c'); ctx.restore();
    }
    ctx.restore();
  }
  function drawCabinDrama(t) {
    const x=HOME_X,y=HOME_Y;
    // Hand-lit, pseudo-3D village cottage rather than flat emoji illustration.
    const warmth=ctx.createRadialGradient(x,y,0,x,y,200);
    warmth.addColorStop(0,'#c4844473');warmth.addColorStop(1,'#c4844400');
    ellipse(x,y+43,220,155,warmth); ellipse(x+4,y+78,146,27,'#111b22bb');
    polygon([[x-104,y-48],[x-119,y-30],[x-116,y+86],[x-101,y+92]],'#4e433e');
    rounded(x-103,y-44,216,132,3,'#675a4d','#342e33',5);
    polygon([[x+113,y-44],[x+140,y-57],[x+138,y+61],[x+113,y+88]],'#433c3d','#25272d',4);
    for(let i=0;i<9;i++) {
      ctx.strokeStyle='#3b3537';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x-102,y-31+i*14);ctx.lineTo(x+111,y-31+i*14);ctx.stroke();
      for(let j=0;j<4;j++){ ctx.globalAlpha=.25;ellipse(x-83+j*60+(i%2)*16,y-27+i*14,11,1,'#c9ab86');ctx.globalAlpha=1;}
    }
    rounded(x+65,y-154,31,79,1,'#5e514d','#29282e',4);
    for(let i=0;i<6;i++)rounded(x+65,y-149+i*12,31,2,0,'#ac8d76');
    polygon([[x-134,y-39],[x-2,y-167],[x+136,y-57],[x+155,y-44],[x+8,y-127],[x-124,y-29]],'#34353e','#1d252d',5);
    for(let i=0;i<8;i++) {
      const px=x-119+i*33;
      ctx.strokeStyle=i%2?'#61554e':'#524d4d';ctx.lineWidth=5;
      ctx.beginPath();ctx.moveTo(px,y-49-i*6);ctx.lineTo(px+39,y-24-i*5);ctx.stroke();
    }
    ctx.strokeStyle='#ba9670';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-133,y-38);ctx.lineTo(x-2,y-166);ctx.lineTo(x+138,y-55);ctx.stroke();
    for(const sx of [x-63,x+65]) {
      ctx.save();ctx.shadowColor='#f4b16c';ctx.shadowBlur=25;
      rounded(sx-25,y-8,52,51,2,'#e7a668','#332d32',5);ctx.restore();
      ctx.strokeStyle='#604b42';ctx.lineWidth=4;
      ctx.beginPath();ctx.moveTo(sx,y-8);ctx.lineTo(sx,y+43);ctx.moveTo(sx-24,y+17);ctx.lineTo(sx+27,y+17);ctx.stroke();
    }
    // The glasses and the one handheld console establish character continuity.
    ellipse(x-63,y+8,10,12,'#e8b08c');
    ellipse(x-70,y+8,5,5,null,'#463b3e',2);ellipse(x-57,y+8,5,5,null,'#463b3e',2);
    ellipse(x+65,y+6,10,10,'#a97c65');
    rounded(x+52,y+20,27,13,3,'#242c3e','#a69c8e',1);
    ellipse(x+59,y+26,2,2,'#8cd9da');
    // Bed-bottom cameo: only visible in short-drama style, no sudden character teleport.
    rounded(x-88,y+27,49,8,2,'#6c4538');
    ellipse(x-60,y+40,2,2,'#e1ac7d');ellipse(x-53,y+40,2,2,'#e1ac7d');
    rounded(x-23,y+25,45,62,2,'#332f38','#ad7650',4);
    ellipse(x+12,y+58,3,3,'#f9d9aa');
    rounded(x-64,y+81,130,9,1,'#423b38');
    rounded(x-68,y+95,136,29,7,'#1a222be9','#bb8b64',2);
    label('外婆家 · 午夜',x,y+109,'#f8d3a7','center',14);
    // Wet highlights and a hanging amber lantern keep the cabin in the world.
    ctx.strokeStyle='#755b4c';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+119,y-45);ctx.lineTo(x+120,y+4);ctx.stroke();
    ctx.save();ctx.shadowBlur=20;ctx.shadowColor='#ffb05e';ellipse(x+120,y+13,8,11,'#daa36c');ctx.restore();
    if(state.house<state.maxHouse/2){ctx.strokeStyle='#372e30';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(x+94,y+1);ctx.lineTo(x+80,y+22);ctx.lineTo(x+104,y+42);ctx.stroke();}
  }
  function drawCabin(t) {
    if (visualStyle === 'drama') { drawCabinDrama(t); return; }
    // Warm firelight and ground shadow.
    ctx.save();
    ctx.globalAlpha = .24 + Math.sin(t / 150) * .018;
    const pool = ctx.createRadialGradient(HOME_X, HOME_Y + 31, 5, HOME_X, HOME_Y + 31, 165);
    pool.addColorStop(0,'#ffce6d');pool.addColorStop(1,'#ffce6d00');
    ellipse(HOME_X, HOME_Y + 30, 160, 115, pool);
    ctx.restore();
    ellipse(HOME_X + 4, HOME_Y + 69, 129, 35, '#101e2b9e');
    // Chimney smoke.
    for (let i = 0; i < 4; i++) {
      const x = HOME_X + 77 + Math.sin(t / 1050 + i * 1.6) * 14;
      const y = HOME_Y - 139 - i * 19 - ((t / 75) % 21);
      ctx.globalAlpha = .11 - i * .02;
      ellipse(x, y, 18 + i * 8, 11 + i * 5, '#d3dae1');
    }
    ctx.globalAlpha = 1;
    // Wood body.
    rounded(HOME_X-103, HOME_Y-37, 206, 124, 3, '#835f49', '#442f39',6);
    for (let j=0;j<7;j++) {
      rounded(HOME_X-101, HOME_Y-34 + j*17.4, 201, 2, 1, '#604735');
    }
    // Chimney and roof.
    rounded(HOME_X+66,HOME_Y-143,30,66,3,'#61525b','#30354d',3);
    for(let j=0;j<4;j++) rounded(HOME_X+69,HOME_Y-137+j*13,24,2,1,'#9e8276');
    polygon([[HOME_X-131,HOME_Y-39],[HOME_X,HOME_Y-155],[HOME_X+137,HOME_Y-36],[HOME_X+119,HOME_Y-35],[HOME_X,HOME_Y-128],[HOME_X-113,HOME_Y-34]],'#3f4553','#293248',6);
    for (let i = 0; i < 6; i++) {
      const x = HOME_X - 103 + i * 36;
      const y = HOME_Y - 41 - (x - (HOME_X - 103)) * .8;
      ctx.strokeStyle = '#68707a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x,y+1);ctx.lineTo(x+44,y+39);ctx.stroke();
    }
    polygon([[HOME_X-129,HOME_Y-35],[HOME_X,HOME_Y-154],[HOME_X+135,HOME_Y-35]],null,'#a99578',4);
    // Yellow windows.
    ctx.save(); ctx.shadowBlur=18;ctx.shadowColor='#ffe8a2';
    rounded(HOME_X-82,HOME_Y-10,54,49,5,'#fbd188','#4c3c3d',5);
    rounded(HOME_X+31,HOME_Y-10,54,49,5,'#efbd74','#4c3c3d',5);
    ctx.restore();
    ctx.strokeStyle='#6b4c42';ctx.lineWidth=5;
    for(let px of [HOME_X-55,HOME_X+58]){ctx.beginPath();ctx.moveTo(px,HOME_Y-10);ctx.lineTo(px,HOME_Y+40);ctx.stroke();}
    // Grandma's glasses in window.
    ellipse(HOME_X-61,HOME_Y+10,11,12,'#ecb98a');
    ellipse(HOME_X-67,HOME_Y+11,5,5,null,'#564a55',2);
    ellipse(HOME_X-55,HOME_Y+11,5,5,null,'#564a55',2);
    polygon([[HOME_X-75,HOME_Y+3],[HOME_X-72,HOME_Y-3],[HOME_X-67,HOME_Y+2]],'#d3d7d4');
    polygon([[HOME_X-54,HOME_Y+2],[HOME_X-48,HOME_Y-4],[HOME_X-46,HOME_Y+3]],'#d3d7d4');
    // Child using the little game console in opposite window.
    ellipse(HOME_X+59,HOME_Y+10,10,11,'#d5a279');
    rounded(HOME_X+46,HOME_Y+20,25,12,2,'#3f4c63','#29374d',1);
    ellipse(HOME_X+52,HOME_Y+26,2,2,'#e3d3b3');
    // Door and porch.
    rounded(HOME_X-21,HOME_Y+20,42,67,3,'#4e3540','#2e2738',4);
    ellipse(HOME_X+11, HOME_Y+57, 3,3,'#edd8a5');
    rounded(HOME_X-52,HOME_Y+82,104,9,3,'#66564a');
    // House health signage.
    rounded(HOME_X-59,HOME_Y+92,118,28,9,'#101f2ce9','#a88962',2);
    label('外 婆 的 小 屋',HOME_X,HOME_Y+106,'#ffe6aa','center',13);
    if (state.house < state.maxHouse/2) {
      ctx.strokeStyle='#382a32';ctx.lineWidth=4;
      ctx.beginPath();ctx.moveTo(HOME_X+96,HOME_Y+3);ctx.lineTo(HOME_X+84,HOME_Y+18);ctx.lineTo(HOME_X+94,HOME_Y+32);ctx.stroke();
    }
  }
  function wolfPosition(wolf, t) {
    const ringSize = ring => ring === 0 ? [456, 259] : RING_RADII[ring - 1];
    let [rx, ry] = ringSize(wolf.ring);
    const travel = moveFx.get(wolf.id);
    if (travel) {
      const dt = Math.max(0, t - travel.at);
      if (dt > 850) moveFx.delete(wolf.id);
      else {
        const a = ringSize(travel.from), b = ringSize(travel.to);
        const progress = dt / 850;
        const eased = 1 - (1 - progress) ** 3;
        rx = a[0] + (b[0] - a[0]) * eased;
        ry = a[1] + (b[1] - a[1]) * eased;
      }
    }
    const wobble = Math.sin(t / 520 + wolf.id * 2.43) * (wolf.kind === 'dog' ? 4 : 2.1);
    return { x: HOME_X + Math.cos(wolf.angle) * rx, y: HOME_Y + Math.sin(wolf.angle) * ry + wobble };
  }
  function drawWolfDrama(wolf,t) {
    const pos=wolfPosition(wolf,t),dog=wolf.kind==='dog',heavy=wolf.kind==='heavy';
    const size=dog?.73:heavy?1.2:1;
    ctx.save();ctx.translate(pos.x,pos.y);ctx.scale(size,size);
    if(state.selectedWolf===wolf.id&&!dog){ctx.shadowColor='#f8b67c';ctx.shadowBlur=15;ellipse(0,-4,39,49,'#ad66472b','#e9bc80',3);ctx.shadowBlur=0;}
    ellipse(2,30,39,11,'#10141a98');
    // Asymmetrical ears, layered fur, uneven grin: the comic's deliberately ugly wolf.
    polygon([[-27,2],[-47,-11],[-45,-25],[-25,-8]],dog?'#bb8b62':'#39363f','#242631',2);
    rounded(-28,6,56,29,10,dog?'#bb8a62':heavy?'#66515b':'#55545d','#252630',3);
    for(let i=0;i<5;i++) polygon([[-29+i*13,8],[-20+i*13,31],[-32+i*13,18]],dog?'#d4a174':'#6b6669');
    rounded(-27,24,14,16,3,dog?'#986747':'#43424b');rounded(12,24,14,16,3,dog?'#986747':'#43424b');
    polygon([[-31,-10],[-22,-63],[-1,-28]],dog?'#cb9464':'#4d4d56','#222733',3);
    polygon([[7,-27],[30,-53],[31,-5]],dog?'#bb865d':'#65616b','#222733',3);
    polygon([[-23,-20],[-21,-48],[-9,-26]],'#a46772');
    polygon([[18,-26],[27,-42],[25,-13]],'#a56b74');
    ellipse(0,-8,33,34,dog?'#d8a875':heavy?'#756168':'#756d70','#37343c',3);
    for(let i=0;i<6;i++){
      const bx=-20+i*8,by=-32+(i%3)*2;
      ctx.strokeStyle=dog?'#b77a51':'#938388';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx-2,by-8);ctx.stroke();
    }
    ellipse(-13,-15,9,12,'#ebdbc9');ellipse(12,-10,7,11,'#ead8c5');
    ellipse(-11,-14,3,5,dog?'#302a2a':'#c64f46');ellipse(12,-10,3,5,dog?'#302a2a':'#c64f46');
    ctx.strokeStyle='#302b32';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-26,-24);ctx.lineTo(-6,-21);ctx.moveTo(6,-19);ctx.lineTo(20,-27);ctx.stroke();
    polygon([[-17,2],[0,15],[17,5],[0,24]],dog?'#f6d7b3':'#9c8b8a');
    ellipse(1,7,9,7,'#34313a');
    if(dog){ctx.strokeStyle='#8c5044';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,14,9,0,Math.PI);ctx.stroke();}
    else {polygon([[-15,15],[-8,24],[-4,16],[2,26],[8,15]],'#e3d4c9','#3f3038',1);}
    rounded(-23,-76,46,21,6,dog?'#57634b':'#4e3741',dog?'#a3c18e':'#b68a79',1);
    label(dog?'汪':String(wolf.id),0,-65,'#ffe2b4','center',15);
    if(dog)label('退！',0,52,'#d4e9bb','center',14);
    ctx.restore();
  }
  function drawWolf(wolf, t) {
    if (visualStyle === 'drama') { drawWolfDrama(wolf,t); return; }
    const p = wolfPosition(wolf,t), dog = wolf.kind === 'dog', heavy = wolf.kind === 'heavy';
    const size = dog ? .69 : heavy ? 1.20 : wolf.kind === 'swift' ? .9 : 1;
    ctx.save(); ctx.translate(p.x,p.y);ctx.scale(size,size);
    if (state.selectedWolf === wolf.id && !dog) {
      ctx.save(); ctx.shadowColor='#ffe096';ctx.shadowBlur=19;
      ellipse(0,0,42,37,'#f5d27b33','#ffe2a3',3);
      ctx.restore();
    }
    ellipse(1,29,34,9,'#0e1a2688');
    // Cartoon tail, paws, head and oversized pointed ears.
    polygon(dog ? [[-24,8],[-44,-4],[-35,-13],[-20,-5]] : [[-28,10],[-49,-8],[-42,-18],[-24,-5]],dog?'#c58c55':'#465263','#252d3b',2);
    rounded(-28,7,56,26,11,dog?'#c99b68':heavy?'#6a5361':'#556374','#293747',2);
    rounded(-25,22,13,14,4,dog?'#bd855b':'#405467');rounded(12,22,13,14,4,dog?'#bd855b':'#405467');
    polygon(dog ? [[-28,-5],[-30,-49],[-4,-22]] : [[-28,-12],[-23,-55],[-2,-27]],dog?'#c89057':'#677b88','#283846',2);
    polygon(dog ? [[13,-21],[33,-48],[31,-2]] : [[10,-27],[26,-58],[31,-11]],dog?'#c89057':'#677b88','#283846',2);
    polygon([[-24,-16],[-24,-40],[-8,-24]],dog?'#dc8d8a':'#ae8a8d');
    polygon([[18,-22],[27,-43],[25,-13]],dog?'#dc8d8a':'#ae8a8d');
    ellipse(0,-6,34,31,dog?'#d9a36b':heavy?'#746571':'#6a7b8a','#354350',2);
    polygon([[-13,2],[0,8],[14,2],[0,20]],dog?'#f6dec1':'#c0c9c5');
    ellipse(-11,-12,dog?5:6,dog?7:9,'#fff0d3');ellipse(12,-12,dog?5:6,dog?7:9,'#fff0d3');
    ellipse(-9,-11,2.5,4,'#243541');ellipse(10,-11,2.5,4,'#243541');
    if (!dog) {
      ctx.strokeStyle = '#2a3540'; ctx.lineWidth=4; ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(-20,-25);ctx.lineTo(-7,-21);ctx.moveTo(6,-22);ctx.lineTo(19,-27);ctx.stroke();
    }
    ellipse(0,4,dog?5:8,dog?4:6,'#282f3a');
    if (dog) {
      ctx.strokeStyle='#6b4744';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,10,8,0,Math.PI);ctx.stroke();
    } else {
      polygon([[-10,12],[-4,22],[0,16],[4,22],[9,11]],'#e6e3d7','#35414d',1);
    }
    // Character badge, kept readable in reduced mobile canvas.
    rounded(-18,-77,36,21,7,dog?'#2b715b':'#26354b',dog?'#87cba2':'#7d8fa8',1);
    label(dog?'汪':String(wolf.id),0,-66,dog?'#e9ffe6':'#ffe7ad','center',14);
    if (dog) {
      label('← 退回外圈',0,48,'#c6ffbd','center',11);
    }
    ctx.restore();
  }
  function drawDefenses(t) {
    // Each ring has four equipment slots. Installed equipment is shown, not merely counted.
    const angles = [-2.05, .38, -1.0, 2.55];
    for (let ring=0;ring<3;ring++) {
      const [rx,ry]=RING_RADII[ring];
      for(let kind=0;kind<4;kind++) {
        const count=[state.traps[ring],state.nets[ring],state.towers[ring],state.alarms[ring]][kind];
        if(!count)continue;
        const a=angles[kind]+ring*.17;
        const x=HOME_X+Math.cos(a)*rx,y=HOME_Y+Math.sin(a)*ry;
        ctx.save();ctx.translate(x,y);
        ellipse(0,12,20,6,'#121b23a1');
        if(kind===0){
          rounded(-16,-7,32,11,3,'#92755f','#282d32',2);
          for(let j=0;j<count;j++){
            const dx=j*10-5;
            ctx.strokeStyle='#efc07e';ctx.lineWidth=3;
            ctx.beginPath();ctx.moveTo(dx-6,-6);ctx.lineTo(dx,-16);ctx.lineTo(dx+6,-6);ctx.stroke();
          }
        }else if(kind===1){
          ctx.strokeStyle='#c9bfa8';ctx.lineWidth=2.2;
          for(let j=-2;j<=2;j++){
            ctx.beginPath();ctx.moveTo(-17,j*5);ctx.lineTo(17,j*5);ctx.stroke();
            ctx.beginPath();ctx.moveTo(j*8,-13);ctx.lineTo(j*8,12);ctx.stroke();
          }
          ellipse(0,0,6,6,'#e5b488');
        }else if(kind===2){
          rounded(-10,-9,22,27,3,'#695a4d','#262a30',2);
          polygon([[-21,-14],[-4,-27],[18,-14]],'#a88d65','#403a39',2);
          ctx.strokeStyle='#ead49e';ctx.lineWidth=3;
          ctx.beginPath();ctx.moveTo(-2,-14);ctx.lineTo(0,-29);ctx.lineTo(13,-34);ctx.stroke();
          ellipse(15,-35,4,4,'#c0aca1');
          if(count>1)label('Ⅱ',0,13,'#ffe4ab','center',12);
        }else{
          ctx.strokeStyle='#b6a286';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,14);ctx.lineTo(0,-22);ctx.stroke();
          ctx.save();ctx.shadowColor='#f6bd67';ctx.shadowBlur=8+5*Math.sin(t/400)**2;
          polygon([[-12,-21],[0,-34],[12,-21]],'#b69a74');ellipse(0,-21,10,8,'#d5ad64');ctx.restore();
          if(!state.alarmCooldowns[ring]){
            ctx.strokeStyle='rgba(255,223,170,.4)';ctx.lineWidth=2;
            ctx.beginPath();ctx.arc(0,-20,14+3*Math.sin(t/750)**2,Math.PI*1.5,Math.PI*.5);ctx.stroke();
          }
        }
        ctx.restore();
      }
    }
  }
  function drawDefenseEffects(t) {
    for (let k=defenseFx.length-1;k>=0;k--) {
      const fx=defenseFx[k],dt=t-fx.at;
      if(dt>930||!fx.target){defenseFx.splice(k,1);continue;}
      const r=fx.target.ring<=0 ? [456,259] : RING_RADII[fx.target.ring-1];
      const target={x:HOME_X+Math.cos(fx.target.angle)*r[0],y:HOME_Y+Math.sin(fx.target.angle)*r[1]};
      const alpha=Math.max(0,1-dt/930),progress=Math.min(1,dt/760);
      ctx.save();ctx.globalAlpha=alpha;
      if(fx.kind==='shot') {
        const [rx,ry]=RING_RADII[fx.ring],a=-1.0+fx.ring*.17;
        const src={x:HOME_X+Math.cos(a)*rx,y:HOME_Y+Math.sin(a)*ry};
        ctx.strokeStyle='#ffe09b';ctx.lineWidth=2.7;ctx.setLineDash([3,8]);
        ctx.beginPath();ctx.moveTo(src.x,src.y-20);ctx.quadraticCurveTo((src.x+target.x)/2,(src.y+target.y)/2-45,target.x,target.y);ctx.stroke();ctx.setLineDash([]);
        const eased=progress*progress*(3-2*progress);
        const px=src.x+(target.x-src.x)*eased,py=src.y+(target.y-src.y)*eased-38*4*eased*(1-eased);
        ctx.shadowColor='#fff1c5';ctx.shadowBlur=17;ellipse(px,py,5.5,5.5,'#ffe0a6');
        if(progress>.7)label('−1 胆量',target.x,target.y-45-dt*.02,'#ffebbc','center',14);
      }else if(fx.kind==='alarm') {
        for(let i=0;i<3;i++){
          ctx.strokeStyle='#e6cb91';ctx.lineWidth=2;
          ctx.beginPath();ctx.ellipse(target.x,target.y,16+progress*52+i*9,10+progress*32+i*4,0,0,Math.PI*2);ctx.stroke();
        }
        label('警铃！',target.x,target.y-47,'#ffdfb4','center',17);
      }else if(fx.kind==='net'){
        ctx.strokeStyle='#f5caa5';ctx.lineWidth=2;
        for(let d=-2;d<=2;d++){
          ctx.beginPath();ctx.moveTo(target.x-22,target.y+d*8);ctx.lineTo(target.x+22,target.y+d*8);ctx.stroke();
          ctx.beginPath();ctx.moveTo(target.x+d*9,target.y-21);ctx.lineTo(target.x+d*9,target.y+21);ctx.stroke();
        }
        label('黏住！',target.x,target.y-50,'#fff1ca','center',16);
      }else if(fx.kind==='spring'){
        ctx.strokeStyle='#ffe0a5';ctx.lineWidth=3;
        for(let i=0;i<8;i++){
          const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(target.x+20*Math.cos(a),target.y+18*Math.sin(a));ctx.lineTo(target.x+(34+progress*25)*Math.cos(a),target.y+(29+progress*20)*Math.sin(a));ctx.stroke();
        }
        label('弹退！',target.x,target.y-50,'#f8debd','center',16);
      }
      ctx.restore();
    }
  }
  function drawTorch(t) {
    if (!fx) return;
    const dt = t - fx.at;
    if (dt > 1120) { fx = null; return; }
    const [rx,ry] = RING_RADII[Math.max(0,fx.ring-1)];
    const target = { x: HOME_X + rx*Math.cos(fx.angle), y: HOME_Y + ry*Math.sin(fx.angle) };
    const len = Math.hypot(target.x - HOME_X,target.y - HOME_Y), angle = Math.atan2(target.y-HOME_Y,target.x-HOME_X);
    const intensity = Math.max(0,1-dt/1100);
    ctx.save();ctx.globalAlpha = intensity*.75;
    ctx.translate(HOME_X, HOME_Y);
    ctx.rotate(angle);
    const grad=ctx.createLinearGradient(0,0,len,0);
    grad.addColorStop(0,'#fff6b5cc');grad.addColorStop(1,'#fffad844');
    polygon([[0,-5],[len,-43],[len,43],[0,5]],grad);
    ctx.restore();
    ctx.save(); ctx.shadowColor='#fff5ae'; ctx.shadowBlur=36*intensity;
    ellipse(target.x,target.y,24+dt*.04,24+dt*.04,`rgba(255,241,169,${intensity*.68})`);
    ctx.restore();
    for (let i=0;i<12;i++) {
      const a=i*2.399,rad=dt*.075;
      ellipse(target.x+Math.cos(a)*rad,target.y+Math.sin(a)*rad*.6,3.5*intensity,3.5*intensity,`rgba(255,243,187,${intensity})`);
    }
  }
  function draw(t) {
    if (!canvas.isConnected) return;
    resizeCanvas();
    ctx.setTransform(canvas.width / W,0,0,canvas.height / H,0,0);
    ctx.clearRect(0,0,W,H);
    background(t);
    for(let i=0;i<3;i++) drawRing(i,t);
    drawDefenses(t);
    drawCabin(t);
    state.wolves.slice().sort((a,b)=>wolfPosition(a,t).y-wolfPosition(b,t).y).forEach(w=>drawWolf(w,t));
    drawTorch(t);
    drawDefenseEffects(t);
    // Dark corners guide attention into the playable space.
    const vignette=ctx.createRadialGradient(500,305,180,500,310,650);
    vignette.addColorStop(0,'#04091400');vignette.addColorStop(1,'#020812ae');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
    if(visualStyle==='drama') {
      ctx.fillStyle='#080a14d9';ctx.fillRect(0,0,W,15);ctx.fillRect(0,H-16,W,16);
      label('丑狼喜剧  ·  第四幕 / THE NIGHT WATCH',500,8,'#dab38b','center',10);
      ctx.save();ctx.globalAlpha=.055;
      for(let i=0;i<37;i++) {
        const bx=(i*157)%W,by=(i*73)%H;
        ellipse(bx,by,1.2,1.2,'#fbf0db');
      }
      ctx.restore();
    }
    screenshotFrame++;
    if (drawing) requestAnimationFrame(draw);
  }

  if (stored && stored.phase !== 'won' && stored.phase !== 'lost') $('continueButton').classList.remove('hidden');
  document.querySelectorAll('[data-style]').forEach(button => {
    const selected=button.dataset.style===visualStyle;
    button.setAttribute('aria-pressed',String(selected));
    button.classList.toggle('active',selected);
  });
  render();
  requestAnimationFrame(draw);
  window.WolfMathDebug = {
    getState: () => JSON.parse(JSON.stringify(state)),
    getVisualStyle: () => visualStyle, setVisualStyle,
    start, interact, render, endTurn: () => interact('endturn'),
    screenshot: () => canvas.toDataURL('image/png'),
    setState(next) { state = next; render(); persist(); }
  };
  if ('serviceWorker' in navigator && location.hostname !== 'appassets.androidplatform.net' && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
