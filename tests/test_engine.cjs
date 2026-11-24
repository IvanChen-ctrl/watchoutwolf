const assert = require('node:assert/strict');
const E = require('../web/js/engine.js');

let tests = 0;
const test = (name, callback) => { callback(); tests++; console.log('PASS', name); };

test('three rings, full house, question with 3 unique options', () => {
  const s = E.newGame('easy', 123);
  assert.equal(s.phase, 'question');
  assert.equal(s.walls.length, 3);
  assert.equal(s.house, 15);
  assert.equal(new Set(s.question.options).size, 3);
  assert.ok(s.question.options.includes(s.question.answer));
});

test('correct answer generates materials and repair phase', () => {
  const s = E.newGame('easy', 125);
  const out = E.answerQuestion(s, s.question.answer);
  assert.equal(out.correct, true);
  assert.equal(s.phase, 'defend');
  assert.equal(s.coins, 8);
  assert.equal(s.wood, 4);
  assert.equal(s.actions, 2);
  assert.equal(E.answerQuestion(s, 100000).ok, false);
});

test('math failure unlocks optional six-face die; skip is safe', () => {
  const s = E.newGame('easy', 126);
  E.answerQuestion(s, -9999);
  assert.equal(s.phase, 'dice');
  assert.equal(s.coins, 4);
  assert.equal(E.takeAction(s, 'fortify').ok, false);
  assert.equal(E.skipDice(s).ok, true);
  assert.equal(s.house, 15);
  assert.equal(s.phase, 'defend');
});

test('dice exactly matches all six advertised outcomes', () => {
  for (let face = 1; face <= 6; face++) {
    const s = E.newGame('nightmare', 2200 + face);
    E.answerQuestion(s, -9999);
    assert.equal(E.rollDice(s, face).face, face);
    assert.equal(s.phase, face === 1 && s.house <= 0 ? 'lost' : 'defend');
    assert.equal(s.house, face === 1 ? 10 : 12);
    assert.equal(s.charges, face === 5 ? 1 : face === 6 ? 2 : 0);
    assert.equal(s.wood, face === 3 ? 4 : 3);
    assert.equal(s.coins, face === 4 ? 6 : 4);
    assert.equal(s.wolves.length, face === 1 ? 2 : 1);
  }
});

test('flash wolf from inner ring -> dog in middle ring', () => {
  const s = E.newGame('easy', 127);
  E.answerQuestion(s, s.question.answer);
  s.wolves[0].ring = 3; s.charges = 1;
  const res = E.flashWolf(s, s.wolves[0].id);
  assert.equal(res.ok, true);
  assert.equal(s.wolves[0].kind, 'dog');
  assert.equal(s.wolves[0].ring, 2);
  assert.equal(s.wolves[0].attack, 0);
  assert.equal(s.charges, 0);
  assert.equal(E.flashWolf(s, s.wolves[0].id).ok, false);
  E.endTurn(s);
  assert.equal(s.wolves[0].kind, 'dog');
  E.answerQuestion(s, s.question.answer); E.endTurn(s);
  assert.equal(s.wolves.some(w => w.id === res.wolfId), false);
});

test('flash wolf in outer ring -> dog at forest edge', () => {
  const s = E.newGame('easy', 128);
  E.answerQuestion(s, s.question.answer);
  s.charges = 1;
  E.flashWolf(s, s.wolves[0].id);
  assert.equal(s.wolves[0].ring, 0);
});

test('buy and build consume exactly two engineering actions', () => {
  const s = E.newGame('easy', 130);
  E.answerQuestion(s, s.question.answer);
  assert.equal(E.takeAction(s, 'buyWood', 0).ok, true);
  const start = s.walls[0];
  assert.equal(E.takeAction(s, 'fortify', 0).ok, true);
  assert.equal(s.walls[0], Math.min(E.MAX_WALLS[0], start + 4));
  assert.equal(s.actions, 0);
  assert.equal(E.takeAction(s, 'fortify', 1).ok, false);
});

test('trap pushes attacker one ring out, then stun expires', () => {
  const s = E.newGame('easy', 142);
  E.answerQuestion(s, s.question.answer);
  s.wolves[0].ring = 3;
  s.stone = 1;
  E.takeAction(s, 'trap', 2);
  assert.equal(s.traps[2], 1);
  E.endTurn(s);
  assert.equal(s.traps[2], 0);
  assert.equal(s.wolves[0].ring, 2);
  assert.equal(s.wolves[0].stunned, 1);
});

test('outer-ring trap pushes a wolf into forest and it leaves safely', () => {
  const s = E.newGame('easy', 512);
  E.answerQuestion(s, s.question.answer);
  s.stone = 1;
  assert.equal(E.takeAction(s, 'trap', 0).ok, true);
  const wolfId = s.wolves[0].id;
  const first = E.endTurn(s);
  assert.equal(first.ok, true);
  const wolf = s.wolves.find(w => w.id === wolfId);
  assert.ok(wolf);
  assert.equal(wolf.ring, 0);
  assert.equal(wolf.stunned, 1);
  E.answerQuestion(s, s.question.answer);
  const second = E.endTurn(s);
  assert.equal(second.ok, true);
  assert.equal(s.wolves.some(w => w.id === wolfId), false);
});

test('flashlight is free action and target can never be flashed twice', () => {
  const s = E.newGame('easy', 991);
  E.answerQuestion(s, s.question.answer);
  const actions = s.actions;
  s.charges = 2;
  assert.equal(E.flashWolf(s, s.wolves[0].id).ok, true);
  assert.equal(s.actions, actions);
  assert.equal(s.charges, 1);
  assert.equal(E.flashWolf(s, s.wolves[0].id).ok, false);
  assert.equal(s.charges, 1);
});

test('distinct deterministic seeds create reproducible game and dice outcomes', () => {
  const a=E.newGame('nightmare', 7891), b=E.newGame('nightmare', 7891);
  assert.deepEqual(a,b);
  for(const s of [a,b]) { E.answerQuestion(s, -999); E.rollDice(s); }
  assert.deepEqual(a,b);
});

test('browser integrity: direct flashlight overrides earlier selection, dice sectors align', () => {
  const fs = require('node:fs');
  const app = fs.readFileSync(require('node:path').join(__dirname, '../web/js/app.js'), 'utf8');
  assert.match(app, /Number\(param\) \|\| state\.selectedWolf/);
  assert.match(app, /\(i \+ \.5\) \* Math\.PI \/ 3/);
  assert.match(app, /const face = result\.face;\s*persist\(\)/);
});

test('math question generation in both modes never has negative options', () => {
  for(const mode of ['easy', 'nightmare']) {
    for(let seed=1;seed<=100;seed++) {
      const s=E.newGame(mode,seed);
      for(let i=0;i<18;i++) {
        s.turn=i+1;
        s.question=E.makeQuestion(s);
        assert.equal(new Set(s.question.options).size,3);
        assert.ok(s.question.options.includes(s.question.answer));
        assert.ok(s.question.options.every(n => Number.isInteger(n) && n >= 0));
      }
    }
  }
});

test('math puzzles are mathematically correct across 18 rounds and difficulty tiers', () => {
  const solveHint = hint => {
    const expression = hint.split(' = ')[0].replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-');
    assert.match(expression, /^[0-9+*/() .-]+$/);
    return Function('return (' + expression + ')')();
  };
  for(const mode of ['easy','nightmare']) {
    const topics = new Set();
    for(let seed = 1; seed <= 400; seed++) {
      const s = E.newGame(mode, seed);
      for(let turn = 1; turn <= 18; turn++) {
        s.turn = turn;
        const q = E.makeQuestion(s);
        topics.add(q.theme);
        assert.equal(q.id, turn);
        assert.equal(q.chapter, E.nightOf(turn));
        assert.ok(Number.isSafeInteger(q.answer) && q.answer >= 0, `${mode} ${turn} ${q.prompt}`);
        assert.equal(q.answer, solveHint(q.hint), `${mode} ${turn}: ${q.prompt} ${q.hint}`);
        assert.equal(q.options.filter(n => n === q.answer).length, 1);
        if(q.theme === '狼群波次') assert.doesNotMatch(q.prompt, /少 -[0-9]/);
        if(q.theme === '复杂补差') assert.ok(q.answer >= 0);
      }
    }
    assert.ok(topics.size >= 12, `insufficient diverse topics: ${topics.size}`);
  }
});

test('save migration preserves RNG and original question and makes dogs harmless', () => {
  for(const version of [1,2,3,4,5]) {
    const original = E.newGame('nightmare', 4975);
    const wolf = original.wolves[0];
    wolf.kind='dog'; wolf.attack=7; wolf.weapon='攻城槌'; wolf.weaponIcon='🪵';
    wolf.courage=0; wolf.dogTurns=2;
    original.seed=0x12345678;
    original.version=version;
    original.question={prompt:'旧问题仍可回答', answer:8, options:[8,7,9],hint:'3 + 5 = 8', id:original.turn};
    const saved=JSON.parse(JSON.stringify(original));
    const loaded=E.migrateSave(saved);
    assert.equal(loaded.version,5);
    assert.equal(loaded.seed,original.seed,'save migration must not draw random values');
    assert.equal(loaded.question.prompt,'旧问题仍可回答');
    assert.equal(loaded.question.theme,'旧版守夜算术');
    assert.equal(loaded.wolves[0].attack,0,'no rescued dog should attack');
    assert.equal(loaded.wolves[0].weapon,'夹尾巴');
    assert.equal(loaded.wolves[0].dogTurns,2);
  }
});

test('wolf weapon strength increases only at later nights', () => {
  const s=E.newGame('easy',100);
  const first=s.wolves[0];
  assert.equal(first.weapon,'利爪');
  assert.equal(first.attack,2);
  s.turn=13; s.wolves=[];
  // Spawn from a fixed dice fallback by entering the second night.
  E.answerQuestion(s,0); // wrong answers open the die without mutating a valid old target.
  assert.equal(E.getWolfWeapon({kind:'heavy'},13,'easy'),'攻城槌');
  assert.equal(E.getWolfWeapon({kind:'sneak'},13,'easy'),'火油瓶');
  assert.equal(E.getWolfWeapon({kind:'dog',weapon:'夹尾巴'},13,'easy'),'夹尾巴');
});

test('full game ends in victory or legitimate loss, never frozen phase', () => {
  for(let seed=1;seed<=100;seed++) {
    const s=E.newGame(seed%2?'easy':'nightmare',seed);
    let iterations=0;
    while(!['won','lost'].includes(s.phase) && iterations++<40) {
      if(s.phase === 'question') E.answerQuestion(s,s.question.answer);
      if(s.phase === 'interlude') E.continueStory(s);
      if(s.phase === 'defend') E.endTurn(s);
    }
    assert.ok(['won','lost'].includes(s.phase), `seed ${seed} did not end`);
    assert.ok(iterations<=21);
  }
});

function agentRun(seed,mode,accuracy) {
  const s=E.newGame(mode,seed);
  let rng = (seed ^ 0x9e3779b9) >>> 0;
  const draw = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
  while(!['won','lost'].includes(s.phase)) {
    if(s.phase === 'question') {
      if(accuracy===1 || draw() < accuracy) E.answerQuestion(s,s.question.answer);
      else E.answerQuestion(s,-99);
    }
    if(s.phase === 'dice') E.rollDice(s);
    if(s.phase === 'interlude') { E.continueStory(s); continue; }
    if(s.phase !== 'defend') continue;
    // Use flashlight against the greatest immediate risk.
    while (s.charges > 0) {
      const target=s.wolves.filter(w=>w.kind!=='dog').sort((a,b)=>b.ring-a.ring)[0];
      if(!target) break;
      E.flashWolf(s,target.id);
    }
    while(s.actions>0) {
      if(s.house<11 && s.wood>=3) { E.takeAction(s,'repair'); continue; }
      let dangerRing=[...s.wolves].filter(w=>w.kind!=='dog').sort((a,b)=>b.ring-a.ring)[0];
      let ring=dangerRing?dangerRing.ring-1:0;
      if(s.wood>=2 && s.walls[ring]<=E.MAX_WALLS[ring]-3) {
        E.takeAction(s,'fortify',ring);continue;
      }
      if(s.wood>=2 && s.walls[0]<=7){E.takeAction(s,'fortify',0);continue;}
      if(s.coins>=4 && s.wood<7) { E.takeAction(s,'buyWood');continue; }
      if(s.wood>=2 && s.walls[ring]<E.MAX_WALLS[ring]) { E.takeAction(s,'fortify',ring);continue; }
      break;
    }
    E.endTurn(s);
  }
  return s;
}
for (const mode of ['easy','nightmare']) {
  for (const accuracy of [1,.70]) {
    let victories=0, avgHouse=0;
    for(let i=1;i<=200;i++) {
      const s=agentRun(i * 2183,mode,accuracy);
      if(s.phase==='won'){victories++;avgHouse+=s.house;}
    }
    console.log('BALANCE',mode,'accuracy=',accuracy,'wins=',victories,'/200','avgWinnerHouse=',victories?(avgHouse/victories).toFixed(1):'-');
  }
}
// v1.4 arsenal, progression and backward-compatible saves.
test('version 1 saves upgrade without resetting seed, progress or wolves', () => {
  const old=E.newGame('easy',1234);
  E.answerQuestion(old,old.question.answer); old.turn=5;old.seed=987654;
  delete old.nets;delete old.towers;delete old.alarms;delete old.alarmCooldowns;delete old.defenseStats;
  for(const w of old.wolves){delete w.courage;delete w.maxCourage;}
  old.version=1;
  const loaded=E.migrateSave(JSON.parse(JSON.stringify(old)));
  assert.equal(loaded.version,5); assert.equal(loaded.turn,5);assert.equal(loaded.seed,987654);
  assert.deepEqual(loaded.nets,[0,0,0]);assert.deepEqual(loaded.towers,[0,0,0]);
  assert.equal(loaded.wolves[0].courage,3);assert.equal(loaded.wolves[0].id,old.wolves[0].id);
  assert.equal(E.migrateSave(null),null);
});

test('defense catalogue has four distinct non-lethal equipment types',()=>{
  assert.deepEqual(Object.keys(E.DEFENSE_ITEMS).sort(),['alarm','net','tower','trap']);
  assert.equal(E.DEFENSE_ITEMS.tower.limit,2);
  assert.equal(E.MAX_DEFENSE.alarms,1);
});

test('ice cream net consumes wood and coins, blocks two attack turns',()=>{
  const s=E.newGame('easy',360);
  E.answerQuestion(s,s.question.answer);
  const initial=[s.wood,s.coins,s.actions,s.walls[0]];
  assert.equal(E.takeAction(s,'net',0).ok,true);
  assert.deepEqual([s.wood,s.coins,s.actions,s.nets[0]],[initial[0]-1,initial[1]-3,initial[2]-1,1]);
  s.wolves=[s.wolves[0]];
  E.endTurn(s);
  assert.equal(s.walls[0],initial[3]);assert.equal(s.nets[0],0);assert.equal(s.wolves[0].stunned,1);
  s.wolves=[s.wolves[0]];
  E.answerQuestion(s,s.question.answer);
  E.endTurn(s);
  assert.equal(s.walls[0],initial[3]);assert.equal(s.wolves[0].stunned,0);
  s.wolves=[s.wolves[0]];
  E.answerQuestion(s,s.question.answer);
  E.endTurn(s);
  assert.equal(s.walls[0],initial[3]-2);
  assert.equal(s.defenseStats.nets,1);
});

test('sling towers have two levels and repel by courage before the attack',()=>{
  const s=E.newGame('easy',361);
  E.answerQuestion(s,s.question.answer);
  s.coins=30;s.wood=30;s.stone=30;
  assert.equal(E.takeAction(s,'tower',0).ok,true);
  assert.equal(E.takeAction(s,'tower',0).ok,true);
  assert.deepEqual(s.towers,[2,0,0]);
  assert.equal(s.actions,0);
  assert.equal(E.takeAction(s,'tower',0).ok,false);
  const id=s.wolves[0].id;
  let event=E.endTurn(s).event;
  assert.equal(event.projectiles.length,2);
  assert.equal(s.wolves.find(w=>w.id===id).courage,1);
  assert.equal(s.walls[0],5); // tower lowers morale; an unrepelled wolf still attacks
  s.wolves=s.wolves.filter(w=>w.id===id);
  E.answerQuestion(s,s.question.answer);
  event=E.endTurn(s).event;
  assert.equal(event.repelled.includes(id),true);
  assert.equal(s.wolves.some(w=>w.id===id),false);
  assert.equal(s.defenseStats.scared,1);
});

test('alarm stuns for two turns and enters a three-turn cooldown',()=>{
  const s=E.newGame('easy',362);
  E.answerQuestion(s,s.question.answer);
  s.coins=10;s.wood=10;s.stone=10;
  assert.equal(E.takeAction(s,'alarm',0).ok,true);
  const id=s.wolves[0].id,initialWall=s.walls[0];
  let event=E.endTurn(s).event;
  assert.deepEqual(event.alarms,[id]);assert.equal(s.alarmCooldowns[0],3);
  assert.equal(s.walls[0],initialWall);assert.equal(s.wolves.find(w=>w.id===id).stunned,1);
  s.wolves=s.wolves.filter(w=>w.id===id);
  E.answerQuestion(s,s.question.answer);E.endTurn(s);
  assert.equal(s.alarmCooldowns[0],2);assert.equal(s.walls[0],initialWall);
  s.wolves=s.wolves.filter(w=>w.id===id);
  E.answerQuestion(s,s.question.answer);E.endTurn(s);
  assert.equal(s.alarmCooldowns[0],1);assert.equal(s.walls[0],initialWall-2);
  s.wolves=s.wolves.filter(w=>w.id===id);
  E.answerQuestion(s,s.question.answer);event=E.endTurn(s).event;
  assert.deepEqual(event.alarms,[id]);assert.equal(s.defenseStats.alarms,2);
});

test('equipment costs and capacity limits enforce no partial transaction',()=>{
  const s=E.newGame('easy',363);
  E.answerQuestion(s,s.question.answer);
  const before=JSON.stringify({wood:s.wood,stone:s.stone,coins:s.coins,actions:s.actions});
  for(const key of ['trap','tower','alarm'])assert.equal(E.takeAction(s,key,2).ok,false);
  assert.equal(JSON.stringify({wood:s.wood,stone:s.stone,coins:s.coins,actions:s.actions}),before);
  s.coins=99;s.stone=99;s.wood=99;
  assert.equal(E.takeAction(s,'net',2).ok,true);
  assert.equal(E.takeAction(s,'net',2).ok,true);
  s.actions=1;
  const resources=JSON.stringify([s.wood,s.stone,s.coins,s.actions]);
  assert.equal(E.takeAction(s,'net',2).ok,false);
  assert.equal(JSON.stringify([s.wood,s.stone,s.coins,s.actions]),resources);
});

test('per-ring structures do not automatically work on the neighboring ring',()=>{
  const s=E.newGame('easy',364);
  E.answerQuestion(s,s.question.answer);
  s.stone=10;s.wood=10;s.coins=10;
  E.takeAction(s,'tower',1);
  s.wolves[0].ring=1;
  const event=E.endTurn(s).event;
  assert.equal(event.projectiles.length,0);
  assert.equal(s.towers[0],0); assert.equal(s.towers[1],1);
});

test('non-lethal tower never damages or shoots a transformed Chihuahua',()=>{
  const s=E.newGame('easy',365);
  E.answerQuestion(s,s.question.answer);
  s.stone=5;s.wood=10;s.coins=10;
  E.takeAction(s,'tower',0);
  s.charges=1;
  E.flashWolf(s,s.wolves[0].id);
  s.wolves[0].ring=1; // ensure that the dog remains inside the attack range
  const event=E.endTurn(s).event;
  assert.equal(event.projectiles.length,0);
  assert.equal(s.wolves[0].kind,'dog');
});

console.log(`Passed ${tests} engine test suites.`);
