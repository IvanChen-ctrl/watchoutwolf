/* Wolf Math Defense: deterministic, framework-free rules engine. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WolfMathEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TOTAL_TURNS = 18;
  const PER_NIGHT = 6;
  const RING_NAMES = ['外圈木栅', '中圈石墙', '内圈铁门'];
  const MAX_WALLS = [11, 10, 9];
  const DICE_FACES = [
    { face: 1, label: '黑雾来袭', detail: '小屋失去2点生命，额外来一只狼。', kind: 'bad' },
    { face: 2, label: '虚惊一场', detail: '狼愣住了。你什么也没拿到。', kind: 'neutral' },
    { face: 3, label: '捡到木料', detail: '获得1块木材。', kind: 'minor' },
    { face: 4, label: '意外退款', detail: '获得2枚金币。', kind: 'minor' },
    { face: 5, label: '拾到手电筒', detail: '手电电量+1，可将一只狼变成吉娃娃。', kind: 'good' },
    { face: 6, label: '超级手电筒', detail: '手电电量+2，今晚的狼要改名了。', kind: 'jackpot' }
  ];

  function rollRandom(state) {
    let x = state.seed >>> 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    state.seed = x >>> 0 || 2463534242;
    return (state.seed >>> 0) / 4294967296;
  }
  function randInt(state, min, max) {
    return Math.floor(rollRandom(state) * (max - min + 1)) + min;
  }
  function shuffled(state, a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = randInt(state, 0, i);
      [b[i], b[j]] = [b[j], b[i]];
    }
    return b;
  }
  function log(state, line, type) {
    state.feed.unshift({ id: ++state.logId, line, type: type || 'info' });
    state.feed = state.feed.slice(0, 7);
  }
  function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
  function nightOf(turn) { return Math.min(3, 1 + Math.floor((turn - 1) / PER_NIGHT)); }

  function makeQuestion(state) {
    const night = nightOf(state.turn);
    const easy = state.mode === 'easy';
    const maxTemplate = easy ? 4 : (night === 1 ? 5 : night === 2 ? 7 : 9);
    const template = randInt(state, 0, maxTemplate);
    let prompt, answer, hint;
    const a = randInt(state, 2, easy ? 7 : 8 + night * 2);
    const b = randInt(state, 2, easy ? 6 : 5 + night * 2);
    const c = randInt(state, 1, 4);
    if (template === 0) {
      prompt = `外婆买了 ${a} 块木板，又买了 ${b} 块。仓库现在有几块木板？`;
      answer = a + b; hint = `${a} + ${b} = ${answer}`;
    } else if (template === 1) {
      const total = a + b + c;
      prompt = `守夜人带来 ${total} 枚金币，买钉子花了 ${b} 枚，还剩多少？`;
      answer = total - b; hint = `${total} − ${b} = ${answer}`;
    } else if (template === 2) {
      prompt = `一捆木板要 ${a} 枚金币，买 ${c + 1} 捆一共需要多少？`;
      answer = a * (c + 1); hint = `${a} × ${c + 1} = ${answer}`;
    } else if (template === 3) {
      const t = a * (c + 1);
      prompt = `${t} 块木板平均分给 ${c + 1} 道防线，每道能分到几块？`;
      answer = a; hint = `${t} ÷ ${c + 1} = ${answer}`;
    } else if (template === 4) {
      prompt = `修外墙要 ${a} 块木板，中墙要 ${b} 块，手头有 ${a + b - c} 块。还缺几块？`;
      answer = c; hint = `${a} + ${b} − ${a + b - c} = ${answer}`;
    } else if (template === 5) {
      prompt = `商店有 ${a} 组木料，每组 ${b} 块，另外赠送 ${c} 块。共有几块？`;
      answer = a * b + c; hint = `${a} × ${b} + ${c} = ${answer}`;
    } else if (template === 6) {
      const p = (a + 2) * 2;
      prompt = `两道门每道要 ${a + 2} 枚螺丝，已经准备了 ${c} 枚。还需多少枚？`;
      answer = p - c; hint = `2 × ${a + 2} − ${c} = ${answer}`;
    } else if (template === 7) {
      const full = (a + b) * 2;
      prompt = `每组木料 ${a + b} 元，买两组可减 ${c} 元。实际要付多少？`;
      answer = full - c; hint = `2 × ${a + b} − ${c} = ${answer}`;
    } else if (template === 8) {
      const unit = c + 2;
      prompt = `一共 ${a * unit} 块石头，每道防线分 ${unit} 块，能修几道？`;
      answer = a; hint = `${a * unit} ÷ ${unit} = ${answer}`;
    } else {
      const every = a + 3;
      const spent = Math.min(b, every * 2 - 1);
      prompt = `两天各存 ${every} 枚金币，买陷阱花 ${spent} 枚，剩下多少？`;
      answer = every * 2 - spent; hint = `2 × ${every} − ${spent} = ${answer}`;
    }
    const wrong = new Set();
    let tries = 0;
    while (wrong.size < 2 && tries++ < 60) {
      const d = randInt(state, 1, 5 + night * 2) * (rollRandom(state) < 0.5 ? -1 : 1);
      const candidate = answer + d;
      if (candidate >= 0 && candidate !== answer) wrong.add(candidate);
    }
    let candidate = answer + 1;
    while (wrong.size < 2) { if (!wrong.has(candidate)) wrong.add(candidate); candidate++; }
    return { prompt, answer, hint, options: shuffled(state, [answer, ...wrong]), id: state.turn };
  }

  function addWolf(state, fixedKind) {
    const night = nightOf(state.turn);
    const variant = rollRandom(state);
    const ambush = rollRandom(state);
    let ring = 1;
    if (!fixedKind) {
      if (night === 2 && ambush < (state.mode === 'nightmare' ? .36 : .23)) ring = 2;
      if (night === 3) {
        if (ambush < (state.mode === 'nightmare' ? .24 : .14)) ring = 3;
        else if (ambush < (state.mode === 'nightmare' ? .66 : .48)) ring = 2;
      }
    }
    const kind = fixedKind || (ring > 1 ? 'sneak' : night >= 3 && variant < .22 ? 'heavy' : night >= 2 && variant < .38 ? 'swift' : 'wolf');
    const angle = -Math.PI * .84 + rollRandom(state) * Math.PI * 1.65;
    const wolf = { id: ++state.nextWolfId, kind, ring, angle, attack: kind === 'heavy' ? 3 : 2, dogTurns: 0, stunned: 0 };
    state.wolves.push(wolf);
    if (ring > 1) log(state, `警报！钻地狼${wolf.id}绕过外圈，直接潜入第${ring}圈！`, 'bad');
    return wolf;
  }

  function newGame(mode, seed) {
    const chosen = mode === 'nightmare' ? 'nightmare' : 'easy';
    const state = {
      version: 1, mode: chosen, seed: (Number(seed) >>> 0) || (Date.now() >>> 0) || 2817,
      turn: 1, night: 1, phase: 'question', maxTurns: TOTAL_TURNS,
      house: chosen === 'nightmare' ? 12 : 15, maxHouse: 15, coins: 4, wood: 3, stone: 0, charges: 0,
      walls: chosen === 'nightmare' ? [6, 5, 4] : [7, 6, 5], traps: [0, 0, 0], actions: 2, maxActions: 2,
      selectedRing: 0, selectedWolf: null, streak: 0, correct: 0, wrong: 0,
      score: 0, logId: 0, nextWolfId: 0, wolves: [], feed: [], lastDice: null,
      lastResult: null, gameEndReason: ''
    };
    state.question = makeQuestion(state);
    addWolf(state, 'wolf');
    log(state, '外婆：路上还打游戏？快用数学换材料！狼只懂拆迁。', 'story');
    return state;
  }

  function failIfNeeded(state) {
    if (state.house <= 0) {
      state.house = 0;
      state.phase = 'lost';
      state.gameEndReason = '狼群提交了房屋拆除验收报告。';
      log(state, '小屋倒塌。外婆：明天开始补习基础数学。', 'bad');
      return true;
    }
    return false;
  }
  function answerQuestion(state, selected) {
    if (state.phase !== 'question') return { ok: false, message: '现在不是答题阶段。' };
    const val = Number(selected);
    const correct = val === state.question.answer;
    const hint = state.question.hint;
    if (correct) {
      state.phase = 'defend';
      state.correct++;
      state.streak++;
      const reward = 3 + nightOf(state.turn);
      state.coins += reward;
      state.wood += 1;
      state.score += 100 + Math.min(5, state.streak) * 15;
      let bonus = '';
      if (state.streak % 4 === 0) {
        state.charges = clamp(state.charges + 1, 0, 5);
        bonus = ' 连对4题，外婆奖励1格手电电量！';
      }
      state.lastResult = { kind: 'correct', title: '答对啦！', text: `${hint}。获得${reward}金币和1木材。${bonus}` };
      log(state, `答对：+${reward}金币，+1木材。${bonus}`, 'good');
    } else {
      state.phase = 'dice';
      state.wrong++;
      state.streak = 0;
      state.score = Math.max(0, state.score - 30);
      state.lastResult = { kind: 'wrong', title: '算错了，狼笑了', text: `正确答案：${state.question.answer}（${hint}）。可以跳过，也可以冒险掷命运骰。` };
      log(state, '算错了！命运骰启动：1/6灾厄，2/6机会拿到手电。', 'bad');
    }
    return { ok: true, correct, result: state.lastResult };
  }

  function rollDice(state, forcedFace) {
    if (state.phase !== 'dice') return { ok: false, message: '只能在答错题后掷骰。' };
    let face = randInt(state, 1, 6);
    if (typeof forcedFace === 'number' && forcedFace >= 1 && forcedFace <= 6) face = forcedFace;
    const info = DICE_FACES[face - 1];
    state.lastDice = face;
    state.phase = 'defend';
    if (face === 1) {
      state.house = Math.max(0, state.house - 2);
      addWolf(state);
    } else if (face === 3) state.wood++;
    else if (face === 4) state.coins += 2;
    else if (face === 5) state.charges = clamp(state.charges + 1, 0, 5);
    else if (face === 6) state.charges = clamp(state.charges + 2, 0, 5);
    state.lastResult = { kind: info.kind, title: `骰子 ${face} · ${info.label}`, text: info.detail };
    log(state, `骰子${face}：${info.label}。${info.detail}`, face === 1 ? 'bad' : face >= 5 ? 'good' : 'info');
    failIfNeeded(state);
    return { ok: true, face, info };
  }

  function skipDice(state) {
    if (state.phase !== 'dice') return { ok: false, message: '现在不能跳过骰子。' };
    state.phase = 'defend';
    state.lastResult = { kind: 'neutral', title: '见好就收', text: '没有掷骰，也没有奖励。至少小屋目前还在。' };
    log(state, '选择不掷骰子，安全进入建设阶段。', 'info');
    return { ok: true };
  }

  function takeAction(state, key, ring) {
    if (state.phase !== 'defend') return { ok: false, message: '请先完成本回合的算术题。' };
    if (state.actions <= 0) return { ok: false, message: '每回合只有2次工程行动。' };
    const r = Number.isInteger(ring) && ring >= 0 && ring <= 2 ? ring : state.selectedRing;
    if (key === 'buyWood') {
      if (state.coins < 4) return { ok: false, message: '金币不足：购买2木材需要4金币。' };
      state.coins -= 4; state.wood += 2;
      log(state, '采购木料：-4金币，+2木材。', 'info');
    } else if (key === 'buyStone') {
      if (state.coins < 5) return { ok: false, message: '金币不足：购买1石材需要5金币。' };
      state.coins -= 5; state.stone += 1;
      log(state, '采购石材：-5金币，+1石材。', 'info');
    } else if (key === 'fortify') {
      if (state.wood < 2) return { ok: false, message: '加固防线需要2木材。' };
      if (state.walls[r] >= MAX_WALLS[r]) return { ok: false, message: `${RING_NAMES[r]}已经加固到上限。` };
      state.wood -= 2;
      const gained = Math.min(4, MAX_WALLS[r] - state.walls[r]);
      state.walls[r] += gained;
      state.score += 10;
      log(state, `加固${RING_NAMES[r]}：+${gained}耐久。`, 'good');
    } else if (key === 'repair') {
      if (state.wood < 3) return { ok: false, message: '修理小屋需要3木材。' };
      if (state.house >= state.maxHouse) return { ok: false, message: '小屋目前完好。' };
      state.wood -= 3;
      const gained = Math.min(4, state.maxHouse - state.house);
      state.house += gained;
      log(state, `修理小屋：+${gained}生命。`, 'good');
    } else if (key === 'trap') {
      if (state.wood < 1 || state.stone < 1) return { ok: false, message: '布置陷阱需要1木材+1石材。' };
      if (state.traps[r] >= 2) return { ok: false, message: '这一圈最多可放2个陷阱。' };
      state.wood -= 1; state.stone -= 1; state.traps[r]++;
      log(state, `${RING_NAMES[r]}布置了陷阱。狼踩中会后退一层。`, 'good');
    } else return { ok: false, message: '未知工程行动。' };
    state.actions--;
    return { ok: true };
  }

  function flashWolf(state, wolfId) {
    if (state.phase !== 'defend') return { ok: false, message: '请先完成答题或骰子阶段。' };
    if (!state.charges) return { ok: false, message: '手电没有电量。答错题后可赌骰子，连对4题也能获得电量。' };
    const wolf = state.wolves.find(w => w.id === Number(wolfId));
    if (!wolf) return { ok: false, message: '目标已经不在附近。' };
    if (wolf.kind === 'dog') return { ok: false, message: '它已经是吉娃娃了，再照会让它自信。' };
    state.charges--;
    const from = wolf.ring;
    wolf.kind = 'dog';
    wolf.ring = Math.max(0, from - 1);
    wolf.attack = 0;
    wolf.dogTurns = 2;
    wolf.stunned = 0;
    state.selectedWolf = null;
    state.score += 70;
    const place = from === 1 ? '森林边缘' : RING_NAMES[from - 2];
    log(state, `手电光！狼${wolf.id}→吉娃娃，自动退到${place}。`, 'good');
    state.lastResult = { kind: 'jackpot', title: '嗷呜？汪！', text: `狼${wolf.id}变成吉娃娃，自动后退一整层（${place}），不再攻击。` };
    return { ok: true, wolfId: wolf.id, from, to: wolf.ring };
  }

  function endTurn(state) {
    if (state.phase !== 'defend') return { ok: false, message: '目前不能结束回合。' };
    const event = { attacked: [], retreats: [], damageHouse: 0, spawned: [], dawn: false, ended: false };
    const survivors = [];
    for (const wolf of state.wolves) {
      if (wolf.kind === 'dog') {
        wolf.dogTurns--;
        if (wolf.dogTurns <= 0) {
          log(state, `吉娃娃${wolf.id}带着尊严逃回森林。`, 'good');
          event.retreats.push(wolf.id);
        } else survivors.push(wolf);
        continue;
      }
      if (wolf.ring <= 0) {
        event.retreats.push(wolf.id);
        log(state, `狼${wolf.id}被陷阱赶进森林，灰溜溜地离开了。`, 'good');
        continue;
      }
      if (wolf.stunned > 0) { wolf.stunned--; survivors.push(wolf); continue; }
      const wallIndex = wolf.ring - 1;
      if (state.traps[wallIndex] > 0) {
        state.traps[wallIndex]--;
        wolf.ring = Math.max(0, wolf.ring - 1);
        wolf.stunned = 1;
        event.retreats.push(wolf.id);
        log(state, `狼${wolf.id}踩中陷阱，被弹回外围一层！`, 'good');
      } else if (state.walls[wallIndex] > 0) {
        const actual = Math.min(wolf.attack, state.walls[wallIndex]);
        state.walls[wallIndex] = Math.max(0, state.walls[wallIndex] - wolf.attack);
        event.attacked.push({ wolfId: wolf.id, ring: wallIndex, damage: actual });
        if (state.walls[wallIndex] === 0) {
          log(state, `第${wallIndex + 1}层防线被狼${wolf.id}拆穿！`, 'bad');
        }
      } else if (wolf.ring < 3) {
        wolf.ring++;
        log(state, `狼${wolf.id}穿过破口，进入${RING_NAMES[wolf.ring - 1]}。`, 'bad');
      } else {
        const damage = wolf.attack;
        state.house = Math.max(0, state.house - damage);
        event.damageHouse += damage;
        wolf.stunned = 1;
        log(state, `狼${wolf.id}撞击小屋！生命-${damage}。`, 'bad');
      }
      survivors.push(wolf);
    }
    state.wolves = survivors;
    if (state.wolves.some(w => w.kind !== 'dog') && rollRandom(state) < (state.mode === 'nightmare' ? .16 : .08)) {
      state.house = Math.max(0, state.house - 1);
      event.damageHouse++;
      log(state, '一只狼绕到厨房窗边捣乱。小屋生命-1。', 'bad');
    }
    if (failIfNeeded(state)) { event.ended = true; return { ok: true, event }; }

    const completedTurn = state.turn;
    if (completedTurn === TOTAL_TURNS) {
      state.phase = 'won';
      state.gameEndReason = '三夜守住！狼群改行卖儿童算术教材。';
      state.score += state.house * 35 + state.walls.reduce((a, b) => a + b, 0) * 6;
      log(state, `天亮了！通关得分 ${state.score}。`, 'good');
      event.ended = true;
      return { ok: true, event };
    }

    if (completedTurn % PER_NIGHT === 0) {
      event.dawn = true;
      state.wolves = [];
      state.wood += 2; state.stone += 1;
      state.walls = state.walls.map((hp, i) => Math.min(MAX_WALLS[i], hp + 2));
      state.house = Math.min(state.maxHouse, state.house + 2);
      log(state, '黎明换班！狼群退回树林。补给+2木材/+1石材，小屋+2生命，三圈各+2耐久。', 'good');
    } else {
      const currentNight = nightOf(completedTurn);
      const maxWolves = currentNight === 1 ? 5 : currentNight === 2 ? 7 : 8;
      let incoming = currentNight === 1 ? (rollRandom(state) < .82 ? 1 : 0) : 1;
      if (currentNight > 1 && rollRandom(state) < (currentNight === 2 ? .28 : .42)) incoming++;
      for (let n = 0; n < incoming && state.wolves.filter(w => w.kind !== 'dog').length < maxWolves; n++) {
        const w = addWolf(state);
        event.spawned.push(w.id);
      }
      if (event.spawned.length) log(state, `树林里亮起${event.spawned.length}双新眼睛。`, 'info');
    }
    state.turn++;
    state.night = nightOf(state.turn);
    if (completedTurn === 12 && state.mode === 'nightmare') {
      const boss = addWolf(state, 'heavy');
      boss.ring = 2;
      boss.attack = 4;
      log(state, '第三夜，狼王提前钻进中圈！外婆：它恐怕学过微积分。', 'bad');
    }
    state.actions = state.maxActions;
    state.phase = 'question';
    state.question = makeQuestion(state);
    state.lastDice = null;
    state.lastResult = null;
    state.selectedWolf = null;
    return { ok: true, event };
  }

  function scoreLabel(score) {
    return score >= 2500 ? '数学守夜大师' : score >= 1700 ? '金牌栅栏工程师' : score >= 900 ? '外婆的合格帮手' : '吉娃娃见习饲养员';
  }
  function getWolfName(wolf) {
    if (wolf.kind === 'dog') return '吉娃娃';
    if (wolf.kind === 'heavy') return '大块头狼';
    if (wolf.kind === 'swift') return '快脚狼';
    if (wolf.kind === 'sneak') return '钻地狼';
    return '野狼';
  }

  return {
    TOTAL_TURNS, PER_NIGHT, RING_NAMES, MAX_WALLS, DICE_FACES,
    newGame, makeQuestion, answerQuestion, rollDice, skipDice, takeAction, flashWolf, endTurn,
    scoreLabel, getWolfName, nightOf
  };
});
