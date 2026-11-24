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
  const MAX_DEFENSE = Object.freeze({ traps: 2, nets: 2, towers: 2, alarms: 1 });
  const DEFENSE_ITEMS = Object.freeze({
    trap: { label: '弹簧绊狼夹', cost: { wood: 1, stone: 1 }, limit: 2, description: '一次性：把狼弹退一圈，并眩晕一回合' },
    net: { label: '冰淇淋黏网', cost: { wood: 1, coins: 3 }, limit: 2, description: '一次性：被黏住的狼本回合及下一回合停止攻击' },
    tower: { label: '弹弓哨塔', cost: { wood: 2, stone: 1, coins: 2 }, limit: 2, description: '永久：每级每回合减少一只狼1点胆量，归零劝退' },
    alarm: { label: '月光警报铃', cost: { wood: 1, stone: 2, coins: 3 }, limit: 1, description: '永久：每隔三回合让本圈一只狼停止两轮攻击' }
  });
  const DICE_FACES = [
    { face: 1, label: '黑雾来袭', detail: '小屋失去2点生命，额外来一只狼。', kind: 'bad' },
    { face: 2, label: '虚惊一场', detail: '狼愣住了。你什么也没拿到。', kind: 'neutral' },
    { face: 3, label: '捡到木料', detail: '获得1块木材。', kind: 'minor' },
    { face: 4, label: '意外退款', detail: '获得2枚金币。', kind: 'minor' },
    { face: 5, label: '拾到手电筒', detail: '手电电量+1，可将一只狼变成吉娃娃。', kind: 'good' },
    { face: 6, label: '超级手电筒', detail: '手电电量+2，今晚的狼要改名了。', kind: 'jackpot' }
  ];

  const TERRAIN_DEFS = Object.freeze([
    { key: 'briar', label: '荆棘坡地', costs: [{ wood: 1, coins: 2 }, { wood: 2, stone: 1, coins: 2 }], description: '外圈地形：狼在外圈先被扎得心虚；2级再额外绊住一轮。' },
    { key: 'mud', label: '泥泞壕沟', costs: [{ wood: 1, stone: 1, coins: 1 }, { wood: 2, stone: 2, coins: 1 }], description: '中圈地形：泥地吸收冲击，狼在中圈造成的伤害降低。' },
    { key: 'highground', label: '高地月台', costs: [{ wood: 1, stone: 2, coins: 2 }, { wood: 2, stone: 2, coins: 3 }], description: '内圈地形：提升内圈自动防御，哨塔补射、警铃更快冷却。' }
  ]);
  const INTERLUDE_STORIES = Object.freeze({
    2: {
      title: '第二关 · 院子与厨房',
      kicker: '第一夜守住了，狼却开始试探侧门。',
      lines: [
        '天亮后，女儿把剩下的冰淇淋和麻绳留下，说它们至少能做成黏网。',
        '丑娘终于从床底探出头：外面的狼太吵，她决定拿出一点冷幽默式报恩。',
        '第二夜开始，狼会更会绕路。把中圈守好，别让厨房先沦陷。'
      ]
    },
    3: {
      title: '第三关 · PS1 惊悚夜',
      kicker: '最后一夜像旧主机里的粗糙噩梦。',
      lines: [
        '夜色突然像老电视机一样起了颗粒，整个院子仿佛掉进一张低多边形贴图。',
        '孙子终于把掌机放下：这回不是开玩笑，连狼王都快从像素缝里钻出来了。',
        '第三夜会更猛烈。利用高地月台、哨塔和警铃，把结局撑到黎明。'
      ]
    }
  });

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

  function weaponProfile(kind, night, mode) {
    const hard = mode === 'nightmare';
    if (kind === 'dog') return { name: '夹尾巴', attackBonus: 0, icon: '🐕' };
    if (night <= 1) {
      if (kind === 'heavy') return { name: '木桩肩撞', attackBonus: 0, icon: '🪵' };
      if (kind === 'swift') return { name: '扑咬短爪', attackBonus: 0, icon: '🗡️' };
      if (kind === 'sneak') return { name: '地洞铁铲', attackBonus: 0, icon: '⛏️' };
      return { name: '利爪', attackBonus: 0, icon: '🦴' };
    }
    if (night === 2) {
      if (kind === 'heavy') return { name: '包铁木槌', attackBonus: 1, icon: '🔨' };
      if (kind === 'swift') return { name: '钩镰短刃', attackBonus: hard ? 1 : 0, icon: '🗡️' };
      if (kind === 'sneak') return { name: '撬棍', attackBonus: 1, icon: '🪛' };
      return { name: '骨棒', attackBonus: hard ? 1 : 0, icon: '🦴' };
    }
    if (kind === 'heavy') return { name: '攻城槌', attackBonus: 1, icon: '🪵' };
    if (kind === 'swift') return { name: '连弩', attackBonus: 1, icon: '🏹' };
    if (kind === 'sneak') return { name: '火油瓶', attackBonus: 1, icon: '🔥' };
    return { name: '铁爪套', attackBonus: 1, icon: '⚔️' };
  }

  function upgradeWolfLoadout(state, wolf) {
    const profile = weaponProfile(wolf.kind, nightOf(state.turn), state.mode);
    const baseAttack = wolf.kind === 'heavy' ? 3 : 2;
    wolf.weapon = profile.name;
    wolf.weaponIcon = profile.icon;
    wolf.attack = wolf.kind === 'dog' ? 0 : baseAttack + profile.attackBonus;
    return wolf;
  }

  function makeOptions(state, answer, spread) {
    const wrong = new Set();
    let tries = 0;
    while (wrong.size < 2 && tries++ < 80) {
      const d = randInt(state, 1, spread) * (rollRandom(state) < 0.5 ? -1 : 1);
      const candidate = answer + d;
      if (candidate >= 0 && candidate !== answer) wrong.add(candidate);
    }
    let candidate = Math.max(0, answer + 1);
    while (wrong.size < 2) { if (!wrong.has(candidate) && candidate !== answer) wrong.add(candidate); candidate++; }
    return shuffled(state, [answer, ...wrong]);
  }

  function questionPack(state, tier) {
    const a = randInt(state, 2 + tier, 7 + tier * 3);
    const b = randInt(state, 2, 5 + tier * 3);
    const c = randInt(state, 1, 4 + tier);
    const d = randInt(state, 2, 6 + tier * 2);
    const secondWaveLess = Math.min(c, a - 1); // A wave never contains negative wolves.
    const bank = [
      () => ({
        theme: '木板补给', difficulty: tier,
        prompt: `外圈要补 ${a} 块木板，中圈要补 ${b} 块木板，仓库里另有备用 ${c} 块。一共要准备多少块木板？`,
        answer: a + b + c, hint: `${a} + ${b} + ${c}`
      }),
      () => ({
        theme: '陷阱采购', difficulty: tier,
        prompt: `一个弹簧夹要 ${a} 枚金币，冰淇淋黏网要 ${b} 枚金币。各买 1 个，再多买 ${c} 枚钉子，共要多少金币？`,
        answer: a + b + c, hint: `${a} + ${b} + ${c}`
      }),
      () => ({
        theme: '石墙修筑', difficulty: tier,
        prompt: `修一段石墙要 ${a} 块石头，共修 ${c + 1} 段，还额外用掉 ${b} 块石头堵缝。一共用了多少块石头？`,
        answer: a * (c + 1) + b, hint: `${a} × ${c + 1} + ${b}`
      }),
      () => ({
        theme: '哨塔分配', difficulty: tier,
        prompt: `仓库有 ${a * (c + 1)} 颗石子，平均分给 ${c + 1} 座弹弓哨塔，每座可分到多少颗？`,
        answer: a, hint: `${a * (c + 1)} ÷ ${c + 1}`
      }),
      () => ({
        theme: '警铃电池', difficulty: tier,
        prompt: `警报铃原有 ${a + b} 格电量，今夜用掉 ${b} 格，又临时充入 ${c} 格，现在还有多少格？`,
        answer: a + c, hint: `${a + b} − ${b} + ${c}`
      }),
      () => ({
        theme: '狼群波次', difficulty: tier,
        prompt: `第一波来了 ${a} 只狼，第二波比第一波少 ${secondWaveLess} 只，第三波又来了 ${b} 只。一共来了多少只狼？`,
        answer: a + (a - secondWaveLess) + b, hint: `${a} + (${a} − ${secondWaveLess}) + ${b}`
      }),
      () => ({
        theme: '围栏周长', difficulty: tier,
        prompt: `一个长方形训练围栏长 ${a + 2} 米、宽 ${c + 2} 米。围一圈需要多少米围栏？`,
        answer: 2 * ((a + 2) + (c + 2)), hint: `2 × (${a + 2} + ${c + 2})`
      }),
      () => ({
        theme: '折扣采购', difficulty: tier,
        prompt: `木料每组 ${a + b} 元，买 2 组可减 ${c} 元，再加运费 ${d} 元，最后付多少？`,
        answer: 2 * (a + b) - c + d, hint: `2 × (${a + b}) − ${c} + ${d}`
      }),
      () => ({
        theme: '壕沟分层', difficulty: tier,
        prompt: `泥泞壕沟要挖 ${a} 层，每层放 ${b} 块石板，再额外铺 ${c} 块防滑板，一共需要多少块材料？`,
        answer: a * b + c, hint: `${a} × ${b} + ${c}`
      }),
      () => ({
        theme: '堡垒台阶', difficulty: tier,
        prompt: `堡垒有 3 层台阶，每层各放 ${a} 个沙袋，另外门口再放 ${b + c} 个。总共放了多少个沙袋？`,
        answer: 3 * a + (b + c), hint: `3 × ${a} + (${b} + ${c})`
      }),
      () => ({
        theme: '攻城反推', difficulty: tier,
        prompt: `狼带来一些包铁木槌，如果每队分 ${c + 2} 把，一共分给 ${a} 队，正好分完。总共有多少把？`,
        answer: a * (c + 2), hint: `${a} × ${c + 2}`
      })
    ];
    if (tier >= 2) {
      bank.push(
        () => ({
          theme: '两步预算', difficulty: tier,
          prompt: `修一段外墙要 ${a} 块木板，修一段中墙要 ${b} 块石板。若外墙修 2 段、中墙修 1 段，再额外备用 ${c} 块材料，一共需要多少块？`,
          answer: 2 * a + b + c, hint: `2 × ${a} + ${b} + ${c}`
        }),
        () => ({
          theme: '分批补给', difficulty: tier,
          prompt: `第一车送来 ${a} 箱木料，每箱 ${c + 1} 块；第二车直接送来 ${b} 块。两车一共送来多少块木料？`,
          answer: a * (c + 1) + b, hint: `${a} × ${c + 1} + ${b}`
        })
      );
    }
    if (tier >= 3) {
      bank.push(
        () => ({
          theme: '堡垒总工程', difficulty: tier,
          prompt: `修堡垒前墙要 ${a} 组砖，每组 ${b} 块；侧墙又要 ${c} 组，每组 ${d} 块。若门楼额外再用 ${a} 块砖，一共需要多少块砖？`,
          answer: a * b + c * d + a, hint: `${a} × ${b} + ${c} × ${d} + ${a}`
        }),
        () => ({
          theme: '复杂补差', difficulty: tier,
          prompt: `仓库目标是准备 ${3 * a + 2 * b + c} 块木板。现在已有 ${b + c} 块，又新买了 ${d} 块。还差多少块？`,
          answer: 3 * a + b - d, hint: `${3 * a + 2 * b + c} − (${b} + ${c}) − ${d}`
        }),
        () => ({
          theme: '多层哨塔', difficulty: tier,
          prompt: `每座高地哨塔有 ${a} 层，每层放 ${c} 个石袋；这样的哨塔建了 ${b} 座。总共用了多少个石袋？`,
          answer: a * c * b, hint: `${a} × ${c} × ${b}`
        })
      );
    }
    return bank;
  }

  function makeQuestion(state) {
    const night = nightOf(state.turn);
    const tier = state.mode === 'nightmare' ? Math.min(3, night + (night > 1 ? 1 : 0)) : night;
    const bank = questionPack(state, tier);
    const chosen = bank[randInt(state, 0, bank.length - 1)]();
    const answer = Math.trunc(chosen.answer);
    if (answer < 0 || !Number.isSafeInteger(answer)) throw new Error('Invalid math question: ' + chosen.theme);
    const hint = `${chosen.hint} = ${answer}`;
    return {
      prompt: chosen.prompt,
      answer,
      hint,
      options: makeOptions(state, answer, 5 + night * 3 + tier),
      id: state.turn,
      theme: chosen.theme,
      difficulty: tier,
      chapter: night
    };
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
    const courage = kind === 'heavy' ? 5 : kind === 'swift' ? 2 : kind === 'sneak' ? 3 : 3;
    const wolf = { id: ++state.nextWolfId, kind, ring, angle, attack: kind === 'heavy' ? 3 : 2, dogTurns: 0, stunned: 0, courage, maxCourage: courage, weapon: '', weaponIcon: '' };
    upgradeWolfLoadout(state, wolf);
    state.wolves.push(wolf);
    if (ring > 1) log(state, `警报！钻地狼${wolf.id}绕过外圈，直接潜入第${ring}圈！`, 'bad');
    return wolf;
  }

  function newGame(mode, seed) {
    const chosen = mode === 'nightmare' ? 'nightmare' : 'easy';
    const state = {
      version: 5, mode: chosen, seed: (Number(seed) >>> 0) || (Date.now() >>> 0) || 2817,
      turn: 1, night: 1, phase: 'question', maxTurns: TOTAL_TURNS,
      house: chosen === 'nightmare' ? 12 : 15, maxHouse: 15, coins: 4, wood: 3, stone: 0, charges: 0,
      walls: chosen === 'nightmare' ? [6, 5, 4] : [7, 6, 5],
      traps: [0, 0, 0], nets: [0, 0, 0], towers: [0, 0, 0], alarms: [0, 0, 0], alarmCooldowns: [0, 0, 0],
      terrainLevels: [0, 0, 0],
      defenseStats: { springs: 0, nets: 0, shots: 0, scared: 0, alarms: 0, terrain: 0 },
      actions: 2, maxActions: 2,
      selectedRing: 0, selectedWolf: null, streak: 0, correct: 0, wrong: 0,
      score: 0, logId: 0, nextWolfId: 0, wolves: [], feed: [], lastDice: null,
      storyCard: null, chapter: 1,
      timer: { phase: 'question', secondsLeft: 35 },
      lastResult: null, gameEndReason: ''
    };
    state.question = makeQuestion(state);
    addWolf(state, 'wolf');
    log(state, '外婆：路上还打游戏？快用数学换材料！狼只懂拆迁。', 'story');
    return state;
  }

  // Previous builds stored version 1. Upgrade in place without resetting progress or the RNG seed.
  function migrateSave(state) {
    if (!state || ![1, 2, 3, 4, 5].includes(state.version) || !Array.isArray(state.walls) ||
        state.walls.length !== 3 || !Array.isArray(state.wolves) || !state.question) return null;
    for (const [key, maximum] of Object.entries(MAX_DEFENSE)) {
      if (!Array.isArray(state[key]) || state[key].length !== 3) state[key] = [0, 0, 0];
      state[key] = state[key].map(v => clamp(Number.isFinite(v) ? Math.trunc(v) : 0, 0, maximum));
    }
    if (!Array.isArray(state.alarmCooldowns) || state.alarmCooldowns.length !== 3) state.alarmCooldowns = [0, 0, 0];
    if (!Array.isArray(state.terrainLevels) || state.terrainLevels.length !== 3) state.terrainLevels = [0, 0, 0];
    state.terrainLevels = state.terrainLevels.map(v => clamp(Number.isFinite(v) ? Math.trunc(v) : 0, 0, 2));
    if (!state.defenseStats || typeof state.defenseStats !== 'object') state.defenseStats = {};
    for (const key of ['springs','nets','shots','scared','alarms','terrain']) {
      if (!Number.isFinite(state.defenseStats[key])) state.defenseStats[key] = 0;
    }
    if (!state.timer || typeof state.timer !== 'object') state.timer = { phase: state.phase || 'question', secondsLeft: 35 };
    if (!Number.isFinite(state.timer.secondsLeft)) state.timer.secondsLeft = 35;
    if (!Number.isFinite(state.chapter)) state.chapter = nightOf(state.turn || 1);
    if (!('storyCard' in state)) state.storyCard = null;
    for (const wolf of state.wolves) {
      const base = wolf.kind === 'heavy' ? 5 : wolf.kind === 'swift' ? 2 : 3;
      if (!Number.isFinite(wolf.maxCourage)) wolf.maxCourage = base;
      if (!Number.isFinite(wolf.courage)) wolf.courage = wolf.kind === 'dog' ? 0 : base;
      if (!Number.isFinite(wolf.stunned)) wolf.stunned = 0;
      upgradeWolfLoadout(state, wolf);
    }
    // Old saves must keep their RNG seed and existing question intact.
    if (!state.question.theme) state.question.theme = '旧版守夜算术';
    if (!state.question.chapter) state.question.chapter = nightOf(state.turn);
    if (!state.question.difficulty) state.question.difficulty = state.mode === 'nightmare'
      ? Math.min(3, state.question.chapter + (state.question.chapter > 1 ? 1 : 0)) : state.question.chapter;
    state.version = 5;
    return state;
  }


  function setStoryPhase(state, chapter) {
    const story = INTERLUDE_STORIES[chapter];
    if (!story) return false;
    state.chapter = chapter;
    state.storyCard = JSON.parse(JSON.stringify(story));
    state.phase = 'interlude';
    state.timer = { phase: 'interlude', secondsLeft: 0 };
    return true;
  }

  function continueStory(state) {
    if (state.phase !== 'interlude') return { ok: false, message: '当前没有过场剧情。' };
    state.phase = 'question';
    state.storyCard = null;
    state.timer = { phase: 'question', secondsLeft: 35 };
    log(state, `进入${['第一关','第二关','第三关'][nightOf(state.turn) - 1] || '下一关'}。`, 'story');
    return { ok: true };
  }

  function canAfford(state, cost) {
    return (!cost.wood || state.wood >= cost.wood) && (!cost.stone || state.stone >= cost.stone) && (!cost.coins || state.coins >= cost.coins);
  }

  function spendCost(state, cost) {
    state.wood -= cost.wood || 0;
    state.stone -= cost.stone || 0;
    state.coins -= cost.coins || 0;
  }

  function terrainLabel(index, level) {
    return `${TERRAIN_DEFS[index].label} Lv.${level}`;
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
      log(state, `${RING_NAMES[r]}放置弹簧绊狼夹，触发后向外弹退一层。`, 'good');
    } else if (key === 'net') {
      if (state.wood < 1 || state.coins < 3) return { ok: false, message: '冰淇淋黏网需要1木材和3金币。' };
      if (state.nets[r] >= 2) return { ok: false, message: '这一圈最多可放2张黏网。' };
      state.wood--; state.coins -= 3; state.nets[r]++;
      log(state, `女儿留下的冰淇淋成了黏网：${RING_NAMES[r]}放置1张。`, 'good');
    } else if (key === 'tower') {
      if (state.wood < 2 || state.stone < 1 || state.coins < 2) return { ok: false, message: '弹弓哨塔需要2木材、1石材和2金币。' };
      if (state.towers[r] >= 2) return { ok: false, message: '哨塔已达到2级。' };
      state.wood -= 2; state.stone--; state.coins -= 2; state.towers[r]++;
      log(state, `${RING_NAMES[r]}弹弓哨塔升至${state.towers[r]}级，每级每回合发射1次。`, 'good');
    } else if (key === 'alarm') {
      if (state.wood < 1 || state.stone < 2 || state.coins < 3) return { ok: false, message: '月光警报铃需要1木材、2石材和3金币。' };
      if (state.alarms[r] >= 1) return { ok: false, message: '该防线已经有警报铃。' };
      state.wood--; state.stone -= 2; state.coins -= 3; state.alarms[r] = 1;
      state.alarmCooldowns[r] = 0;
      log(state, `${RING_NAMES[r]}装上月光警报铃，每隔3回合吓住一只狼。`, 'good');
    } else if (key === 'terrain') {
      const nextLevel = state.terrainLevels[r] + 1;
      if (nextLevel > 2) return { ok: false, message: `${TERRAIN_DEFS[r].label}已经升满2级。` };
      const cost = TERRAIN_DEFS[r].costs[nextLevel - 1];
      if (!canAfford(state, cost)) {
        return { ok: false, message: `${terrainLabel(r, nextLevel)} 需要${cost.wood || 0}木材/${cost.stone || 0}石材/${cost.coins || 0}金币。` };
      }
      spendCost(state, cost);
      state.terrainLevels[r] = nextLevel;
      state.score += 15 * nextLevel;
      log(state, `${RING_NAMES[r]}完成地形改造：${terrainLabel(r, nextLevel)}。`, 'good');
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
    wolf.weapon = '夹尾巴';
    wolf.weaponIcon = '🐕';
    wolf.ring = Math.max(0, from - 1);
    wolf.attack = 0;
    wolf.courage = 0;
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
    const event = { attacked: [], retreats: [], damageHouse: 0, spawned: [], dawn: false, ended: false,
      projectiles: [], netted: [], trapped: [], alarms: [], repelled: [], terrain: [] };
    // Permanent, non-lethal defenses act before wolf attacks. Targeting is deterministic.
    const repelled = new Set();
    for (let i = 0; i < 3; i++) {
      const bonusShots = i === 2 ? state.terrainLevels[2] : 0;
      for (let shot = 0; shot < state.towers[i] + bonusShots; shot++) {
        const candidates = state.wolves.filter(w => w.kind !== 'dog' && w.ring === i + 1 && !repelled.has(w.id))
          .sort((a,b) => b.attack - a.attack || a.courage - b.courage || a.id - b.id);
        if (!candidates.length) break;
        const victim = candidates[0];
        victim.courage = Math.max(0, victim.courage - 1);
        state.defenseStats.shots++;
        event.projectiles.push({ wolfId: victim.id, ring: i, courage: victim.courage });
        if (victim.courage === 0) {
          repelled.add(victim.id);
          event.repelled.push(victim.id);
          state.defenseStats.scared++;
          state.score += 25;
          log(state, `狼${victim.id}被弹弓哨塔吓破胆，掉头跑进森林。`, 'good');
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      state.alarmCooldowns[i] = Math.max(0, state.alarmCooldowns[i] - 1);
      if (!state.alarms[i] || state.alarmCooldowns[i] !== 0) continue;
      const victim = state.wolves.filter(w => w.kind !== 'dog' && w.ring === i + 1 &&
        !repelled.has(w.id) && w.stunned <= 0).sort((a,b) => b.attack - a.attack || a.id - b.id)[0];
      if (!victim) continue;
      victim.stunned = 2;
      state.alarmCooldowns[i] = i === 2 && state.terrainLevels[2] > 0 ? Math.max(1, 3 - state.terrainLevels[2]) : 3;
      state.defenseStats.alarms++;
      event.alarms.push(victim.id);
      log(state, `月光警报铃轰然响起！狼${victim.id}愣在原地，漏掉两次攻击。`, 'good');
    }
    const survivors = [];
    for (const wolf of state.wolves) {
      if (wolf.kind !== 'dog' && wolf.ring === 1 && state.terrainLevels[0] > 0) {
        const beforeCourage = wolf.courage;
        wolf.courage = Math.max(0, wolf.courage - 1);
        if (wolf.courage !== beforeCourage) {
          state.defenseStats.terrain++;
          event.terrain.push({ type: 'briar', wolfId: wolf.id, ring: 0, level: state.terrainLevels[0] });
        }
        if (state.terrainLevels[0] > 1 && wolf.stunned <= 0) wolf.stunned = 1;
      }
      if (repelled.has(wolf.id)) continue;
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
        event.trapped.push(wolf.id);
        state.defenseStats.springs++;
        log(state, `狼${wolf.id}踩中弹簧夹，被弹回外围一层！`, 'good');
      } else if (state.nets[wallIndex] > 0) {
        state.nets[wallIndex]--;
        wolf.stunned = 1; // This attack turn is skipped; next turn is skipped by the stunned guard.
        state.defenseStats.nets++;
        event.netted.push(wolf.id);
        log(state, `狼${wolf.id}被冰淇淋黏网黏住：今天不拆家，明天也休息。`, 'good');
      } else if (state.walls[wallIndex] > 0) {
        const attackPower = wallIndex === 1 && state.terrainLevels[1] > 0 ? Math.max(1, wolf.attack - state.terrainLevels[1]) : wolf.attack;
        if (wallIndex === 1 && attackPower !== wolf.attack) event.terrain.push({ type: 'mud', wolfId: wolf.id, ring: 1, level: state.terrainLevels[1] });
        const actual = Math.min(attackPower, state.walls[wallIndex]);
        state.walls[wallIndex] = Math.max(0, state.walls[wallIndex] - attackPower);
        event.attacked.push({ wolfId: wolf.id, ring: wallIndex, damage: actual });
        if (state.walls[wallIndex] === 0) {
          log(state, `第${wallIndex + 1}层防线被狼${wolf.id}拆穿！`, 'bad');
        }
      } else if (wolf.ring < 3) {
        wolf.ring++;
        log(state, `狼${wolf.id}穿过破口，进入${RING_NAMES[wolf.ring - 1]}。`, 'bad');
      } else {
        const damage = wallIndex === 2 && state.terrainLevels[2] > 0 ? Math.max(1, wolf.attack - 1) : wolf.attack;
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
      boss.attack = Math.max(4, boss.attack);
      log(state, '第三夜，狼王提前钻进中圈！外婆：它恐怕学过微积分。', 'bad');
    }
    state.actions = state.maxActions;
    state.phase = 'question';
    state.question = makeQuestion(state);
    state.timer = { phase: 'question', secondsLeft: 35 };
    if (event.dawn && completedTurn < TOTAL_TURNS) setStoryPhase(state, state.night);
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
  function getWolfWeapon(wolf, turn, mode) {
    if (wolf && wolf.weapon) return wolf.weapon;
    return weaponProfile(wolf?.kind || 'wolf', nightOf(turn || 1), mode || 'easy').name;
  }

  return {
    TOTAL_TURNS, PER_NIGHT, RING_NAMES, MAX_WALLS, MAX_DEFENSE, DEFENSE_ITEMS, DICE_FACES, TERRAIN_DEFS, INTERLUDE_STORIES,
    newGame, migrateSave, makeQuestion, answerQuestion, rollDice, skipDice, takeAction, flashWolf, endTurn, continueStory,
    scoreLabel, getWolfName, getWolfWeapon, nightOf
  };
});
