/* ================= БОТЫ =================
   Живут на стороне хоста. Знают только то, что знает их роль:
   мафия — свою команду и найденного доном шерифа, шериф — свои проверки.
   Всё остальное берут из публичных подозрений: кто кого назвал в чате. */

let botTimers = [];

function botTimeout(fn, ms) {
  const t = setTimeout(() => {
    botTimers = botTimers.filter(x => x !== t);
    fn();
  }, ms);
  botTimers.push(t);
  return t;
}

function clearBotTimers() {
  botTimers.forEach(clearTimeout);
  botTimers = [];
}

const pickOne = a => a[Math.random() * a.length | 0];
const allBots = () => H ? H.players.filter(p => p.bot) : [];
const livingBots = () => allBots().filter(p => p.alive);
const susp = id => (H && H.suspicion[id]) || 0;

/* ---------- наполнение лобби ---------- */
function freeBotName() {
  const used = H.players.map(p => p.name.toLowerCase());
  const free = BOT_NAMES.filter(n => !used.includes(n.toLowerCase()));
  if (free.length) return pickOne(free);
  let i = 2;
  while (used.includes(('горожанин ' + i).toLowerCase())) i++;
  return 'Горожанин ' + i;
}

function addBot(silent) {
  if (!isHost || !H || H.phase !== 'lobby') return;
  if (H.players.length >= MAX_PLAYERS) { if (!silent) toast('В городе уже ' + MAX_PLAYERS + ' жителей', true); return; }
  H.players.push({
    id: 'p' + (H.seq++),
    conn: null,
    name: freeBotName(),
    color: PALETTE[H.players.length % PALETTE.length],
    alive: true,
    host: false,
    bot: true,
    role: 'civilian',
    ready: false
  });
  if (!silent) { pushAll(); beep(520, .07, 'triangle', .03); }
}

function removeBot() {
  if (!isHost || !H || H.phase !== 'lobby') return;
  const bots = allBots();
  if (!bots.length) return;
  const last = bots[bots.length - 1];
  H.players = H.players.filter(p => p !== last);
  pushAll();
  beep(300, .07, 'sine', .03);
}

function fillBots(target) {
  if (!isHost || !H || H.phase !== 'lobby') return;
  let added = 0;
  while (H.players.length < Math.min(target, MAX_PLAYERS)) { addBot(true); added++; }
  pushAll();
  if (added) { toast('В город приехало ' + added + ' новых жителей'); beep(600, .1, 'triangle', .035); }
}

function clearBots() {
  if (!isHost || !H || H.phase !== 'lobby') return;
  const n = allBots().length;
  if (!n) return;
  H.players = H.players.filter(p => !p.bot);
  pushAll();
  toast('Боты покинули город: ' + n);
}

/* ---------- готовность к раздаче ---------- */
function botsReady() {
  allBots().forEach((b, i) => {
    botTimeout(() => {
      if (H.phase !== 'reveal' || b.ready) return;
      b.ready = true;
      pushAll();
      if (H.players.every(q => q.ready)) {
        clearTimeout(H.timer);
        clearBotTimers();
        goNight();
      }
    }, 700 + i * 320 + Math.random() * 600);
  });
}

/* ---------- ночь ---------- */
function botKillTarget(b) {
  const cand = alive().filter(p => !isMafiaRole(p.role));
  if (!cand.length) return null;
  const found = H.donFound ? cand.find(p => p.id === H.donFound) : null;
  if (found && Math.random() < 0.8) return found;
  const ranked = [...cand].sort((x, y) => susp(y.id) - susp(x.id));
  if (susp(ranked[0].id) > 0 && Math.random() < 0.6) return ranked[0];
  return pickOne(cand);
}

function botsNight() {
  const round = H.round;
  livingBots().forEach((b, i) => {
    const base = 1100 + Math.random() * 3800 + i * 240;

    if (isMafiaRole(b.role)) {
      if (round > 1) {
        botTimeout(() => {
          if (H.phase !== 'night' || !b.alive || b.killDone) return;
          const t = botKillTarget(b);
          if (t) hostAction(b, { kind: 'kill', target: t.id });
        }, base);
      }
      if (b.role === 'don') {
        botTimeout(() => {
          if (H.phase !== 'night' || !b.alive || b.donCheckDone) return;
          const cand = alive().filter(p => p.id !== b.id && !isMafiaRole(p.role));
          if (cand.length && Math.random() < 0.85) {
            const ranked = [...cand].sort((x, y) => susp(y.id) - susp(x.id));
            const t = (susp(ranked[0].id) > 0 && Math.random() < 0.5) ? ranked[0] : pickOne(cand);
            hostAction(b, { kind: 'doncheck', target: t.id });
          } else {
            hostAction(b, { kind: 'donskip' });
          }
        }, base + 800 + Math.random() * 1600);
      }
    } else if (b.role === 'sheriff') {
      botTimeout(() => {
        if (H.phase !== 'night' || !b.alive || b.checkDone) return;
        const cand = alive().filter(p => p.id !== b.id);
        if (!cand.length) return;
        const ranked = [...cand].sort((x, y) => susp(y.id) - susp(x.id));
        const t = (susp(ranked[0].id) > 0 && Math.random() < 0.7) ? ranked[0] : pickOne(cand);
        hostAction(b, { kind: 'check', target: t.id });
      }, base);
    } else if (b.role === 'doctor') {
      botTimeout(() => {
        if (H.phase !== 'night' || !b.alive || b.docDone) return;
        const cand = alive().filter(p => p.id !== H.lastHeal);
        if (!cand.length) return;
        const self = cand.find(p => p.id === b.id);
        const guard = cand.find(p => p.id === H.donFound);
        let t;
        if (guard && Math.random() < 0.35) t = guard;
        else if (self && Math.random() < 0.25) t = self;
        else t = pickOne(cand);
        hostAction(b, { kind: 'heal', target: t.id });
      }, base);
    }
  });
}

/* ---------- дневная болтовня ---------- */
function phrase(kind, name) {
  const list = BOT_LINES[kind] || BOT_LINES.neutral;
  return pickOne(list).replace(/\{name\}/g, name || 'кто-то');
}

function botLine(b) {
  const others = alive().filter(p => p.id !== b.id);
  if (!others.length) return phrase('neutral');

  if (b.role === 'sheriff' && b.foundMafia) {
    const target = byId(b.foundMafia);
    if (target && target.alive && Math.random() < 0.8) return phrase('claim', target.name);
  }

  if (isMafiaRole(b.role)) {
    const cand = others.filter(p => !isMafiaRole(p.role));
    if (!cand.length) return phrase('neutral');
    const ranked = [...cand].sort((x, y) => susp(y.id) - susp(x.id));
    const target = (susp(ranked[0].id) > 0 && Math.random() < 0.6) ? ranked[0] : pickOne(cand);
    return phrase(Math.random() < 0.55 ? 'deflect' : 'accuse', target.name);
  }

  const ranked = [...others].sort((x, y) => susp(y.id) - susp(x.id));
  const r = Math.random();
  if (susp(ranked[0].id) > 0 && r < 0.62) return phrase('accuse', ranked[0].name);
  if (r < 0.78) return phrase('defend');
  if (r < 0.9) return phrase('accuse', pickOne(others).name);
  return phrase('neutral');
}

function botsDay() {
  const pool = shuffle(livingBots());
  const talkers = pool.slice(0, Math.min(5, pool.length));
  if (!talkers.length) return;
  const span = Math.max(12000, H.settings.discuss * 1000 * 0.72);
  talkers.forEach((b, i) => {
    const at = 1600 + (span / (talkers.length + 1)) * (i + 1) + Math.random() * 1400;
    botTimeout(() => {
      if (H.phase !== 'day' || !b.alive) return;
      hostChat(b, botLine(b));
    }, at);
  });
}

/* ---------- голосование ---------- */
function botVoteTarget(b) {
  const mine = isMafiaRole(b.role);
  const cand = alive().filter(p => p.id !== b.id && (!mine || !isMafiaRole(p.role)));
  if (!cand.length) return null;
  if (Math.random() < 0.1) return null;
  const ranked = [...cand].sort((x, y) => susp(y.id) - susp(x.id));
  const best = susp(ranked[0].id);
  const top = ranked.filter(p => susp(p.id) === best);
  if (best > 0 && Math.random() < 0.72) return pickOne(top);
  return pickOne(cand);
}

function botsVote() {
  const window = Math.max(2600, H.settings.vote * 1000 * 0.6);
  livingBots().forEach((b, i) => {
    botTimeout(() => {
      if (H.phase !== 'voting' || H.voteResolved || !b.alive || H.votes[b.id] != null) return;
      const t = botVoteTarget(b);
      hostVote(b, t ? t.id : 'none');
    }, 1200 + Math.random() * window + i * 200);
  });
}