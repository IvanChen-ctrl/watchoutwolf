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
  const storageKey = 'wolf-math-defense-save-v1';
  let state = G.newGame('easy');
  let stored = loadSave();
  let soundOn = true;
  let audioCtx = null;
  let toastTimer = null;
  let fx = null;
  const moveFx = new Map();
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

  function loadSave() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.walls) || !Array.isArray(parsed.wolves) || !parsed.question) return null;
      return parsed;
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
      const notes = kind === 'correct' ? [510, 650, 810] : kind === 'wrong' ? [340, 285, 220] : kind === 'wolf' ? [160, 145] : kind === 'flash' ? [390, 790, 1030] : kind === 'win' ? [392, 493, 587, 784] : [330];
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
      result = G.endTurn(state);
      if (result.ok) {
        playSound(result.event.damageHouse ? 'wolf' : result.event.dawn ? 'correct' : 'tick');
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
    $('missionText').textContent = state.phase === 'question' ? '算对数学题领物资；狼群正在等待你交卷。' : state.phase === 'dice' ? '数学挑战失败：掷骰赌一个手电筒，还是不冒险？' : state.phase === 'defend' ? '加固选中的防线，或者用手电筒把狼变成吉娃娃。' : '这一夜的结果已经揭晓。';
    renderRings(); renderPhase(); renderWolves(); renderFeed();
    if (!drawing) draw(performance.now());
    lastView = state.phase;
  }
  function renderRings() {
    $('defenseRings').innerHTML = G.RING_NAMES.map((label, i) => {
      const health = state.walls[i], max = G.MAX_WALLS[i];
      return `<button type="button" class="ring-button ${state.selectedRing === i ? 'selected' : ''}" data-ring="${i}" aria-pressed="${state.selectedRing === i}"><div class="ring-header"><span class="ring-name"><span class="ring-symbol">${['Ⅰ', 'Ⅱ', 'Ⅲ'][i]}</span>${label}</span></div><div class="ring-meter"><div class="${health / max < .35 ? 'critical' : ''}" style="width:${100 * health / max}%"></div></div><div class="ring-footer"><span>${health === 0 ? '已被突破' : '耐久'}</span><span class="ring-health">${health}/${max}</span></div><div class="ring-footer"><span>陷阱</span><span>${state.traps[i]} / 2</span></div></button>`;
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
      const can = (test) => state.actions > 0 && test;
      panel.innerHTML = `${renderResult()}<div class="action-card"><div class="defend-header"><div class="defend-title">🛠 修筑与采购</div><span class="remaining-actions">剩余行动 ${state.actions} / 2</span></div><div class="defend-body"><p class="action-hint">当前目标：<b style="color:#ffe0a3">${G.RING_NAMES[state.selectedRing]}</b>。点击地图或下方防线可切换。</p><div class="build-choice"><button class="build-button" type="button" data-action="buyWood" ${can(state.coins >= 4) ? '' : 'disabled'}><b><span class="build-symbol">🪵</span>买两块木材</b><small>补充建材库存</small><span class="cost">−4 金币 → +2 木材</span></button><button class="build-button" type="button" data-action="buyStone" ${can(state.coins >= 5) ? '' : 'disabled'}><b><span class="build-symbol">⬡</span>买一块石材</b><small>用于布置绊狼陷阱</small><span class="cost">−5 金币 → +1 石材</span></button><button class="build-button" type="button" data-action="fortify" ${can(state.wood >= 2 && state.walls[state.selectedRing] < G.MAX_WALLS[state.selectedRing]) ? '' : 'disabled'}><b><span class="build-symbol">🏗</span>加固选中防线</b><small>防线耐久最多 +4</small><span class="cost">−2 木材</span></button><button class="build-button" type="button" data-action="repair" ${can(state.wood >= 3 && state.house < state.maxHouse) ? '' : 'disabled'}><b><span class="build-symbol">♥</span>修理外婆小屋</b><small>小屋生命最多 +4</small><span class="cost">−3 木材</span></button><button class="build-button" type="button" data-action="trap" ${can(state.wood >= 1 && state.stone >= 1 && state.traps[state.selectedRing] < 2) ? '' : 'disabled'}><b><span class="build-symbol">⚙</span>绊狼陷阱</b><small>踩中退后一圈</small><span class="cost">−1 木材 · −1 石材</span></button><button class="build-button" type="button" data-action="flash" ${state.charges && state.selectedWolf && state.wolves.some(w => w.id === state.selectedWolf && w.kind !== 'dog') ? '' : 'disabled'}><b><span class="build-symbol">🔦</span>照射选中的狼</b><small>${state.selectedWolf ? `当前选中 #${state.selectedWolf}` : '先点地图里的狼'}</small><span class="cost">−1 手电电量 · 免费行动</span></button></div><button type="button" class="endturn-button" data-action="endturn">🌙 结束回合 · 狼群开始行动 →</button><p class="attack-warning">⚠ 结束回合后，狼会攻击脚下那层防线。耐久耗尽后将继续向小屋前进。</p></div></div>`;
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
      return `<div class="wolf-card ${state.selectedWolf === w.id ? 'selected' : ''}"><div class="wolf-avatar ${dog ? 'dog' : ''}">${dog ? '🐕' : w.kind === 'heavy' ? '🐺' : '🐺'}</div><div class="wolf-details"><strong>#${w.id} ${label}</strong><small>${position} ${dog ? '· 正在逃跑' : `· 攻击 ${w.attack}`}</small></div>${dog ? '<span style="color:#a7e8bc;font-size:11px">无害 ✓</span>' : `<button class="target-choose ${ready ? 'torch-target' : ''}" type="button" data-wolf="${w.id}" aria-label="选中第${w.id}只狼">${state.selectedWolf === w.id ? '已选中' : '选中'}</button>`}${ready ? `<button class="target-choose torch-target" type="button" data-directflash="${w.id}" aria-label="用手电照射第${w.id}只狼">🔦 照射</button>` : ''}</div>`;
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
  function background(t) {
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
    const ringColor = hp === 0 ? '#a25a60' : hp / max < .33 ? '#d68a6f' : i === 0 ? '#b28c65' : i === 1 ? '#94aeb9' : '#c0a36c';
    ctx.save();
    ctx.globalAlpha = selected ? .3 : .12;
    ctx.lineWidth = selected ? 29 : 19;
    ctx.strokeStyle = selected ? '#f7ca70' : ringColor;
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
  function drawCabin(t) {
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
  function drawWolf(wolf, t) {
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
    drawCabin(t);
    state.wolves.slice().sort((a,b)=>wolfPosition(a,t).y-wolfPosition(b,t).y).forEach(w=>drawWolf(w,t));
    drawTorch(t);
    // Dark corners guide attention into the playable space.
    const vignette=ctx.createRadialGradient(500,305,180,500,310,650);
    vignette.addColorStop(0,'#04091400');vignette.addColorStop(1,'#020812ae');
    ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
    screenshotFrame++;
    if (drawing) requestAnimationFrame(draw);
  }

  if (stored && stored.phase !== 'won' && stored.phase !== 'lost') $('continueButton').classList.remove('hidden');
  render();
  requestAnimationFrame(draw);
  window.WolfMathDebug = {
    getState: () => JSON.parse(JSON.stringify(state)),
    start, interact, render, endTurn: () => interact('endturn'),
    screenshot: () => canvas.toDataURL('image/png'),
    setState(next) { state = next; render(); persist(); }
  };
  if ('serviceWorker' in navigator && location.hostname !== 'appassets.androidplatform.net' && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
