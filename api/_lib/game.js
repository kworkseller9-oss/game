import { q, one } from './db.js';

const TIMERS = { classic: { night: 45, day: 120 }, blitz: { night: 20, day: 45 } };
const NIGHT_ROLES = ['mafia', 'doctor', 'sheriff'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const err = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const say = (roomId, text, channel = 'system') =>
  q('insert into messages(room_id, channel, text) values ($1, $2, $3)', [roomId, channel, text]);
const timers = (room) => TIMERS[room.mode] || TIMERS.classic;

/* ---------- Лобби ---------- */

export async function listRooms(user) {
  const rooms = await q(
    `select r.id, r.code, r.name, r.max_players, r.mode, r.status, (r.password is not null) as locked,
      (select count(*)::int from room_players p where p.room_id = r.id) as players,
      (select login from users where id = r.host_id) as host
     from rooms r where r.status <> 'finished' order by r.id desc limit 50`
  );
  const cur = await one(
    `select p.room_id from room_players p join rooms r on r.id = p.room_id
     where p.user_id = $1 and r.status <> 'finished' limit 1`,
    [user.id]
  );
  return { rooms, current: cur ? cur.room_id : null };
}

async function activeRoomOf(userId) {
  return one(
    `select p.room_id from room_players p join rooms r on r.id = p.room_id
     where p.user_id = $1 and r.status <> 'finished' limit 1`,
    [userId]
  );
}

export async function createRoom(user, body) {
  const cur = await activeRoomOf(user.id);
  if (cur) throw err(409, 'Вы уже находитесь в комнате', { roomId: cur.room_id });
  const name = String(body.name || '').trim().slice(0, 30) || `Комната ${user.login}`;
  const maxPlayers = Math.min(12, Math.max(4, parseInt(body.maxPlayers, 10) || 10));
  const mode = body.mode === 'blitz' ? 'blitz' : 'classic';
  const password = body.password ? String(body.password).slice(0, 30) : null;
  let room;
  for (let i = 0; i < 8 && !room; i++) {
    const code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    try {
      room = await one(
        'insert into rooms(code, name, host_id, max_players, mode, password) values ($1,$2,$3,$4,$5,$6) returning id',
        [code, name, user.id, maxPlayers, mode, password]
      );
    } catch (e) {
      if (!String(e.message).includes('unique')) throw e;
    }
  }
  if (!room) throw err(500, 'Не удалось создать комнату');
  await q('insert into room_players(room_id, user_id) values ($1, $2)', [room.id, user.id]);
  return { id: room.id };
}

export async function joinRoom(user, { id, code, password }) {
  const room = id
    ? await one('select * from rooms where id = $1', [id])
    : await one('select * from rooms where code = $1', [String(code || '').toUpperCase().trim()]);
  if (!room || room.status === 'finished') throw err(404, 'Комната не найдена');
  const member = await one('select 1 as x from room_players where room_id = $1 and user_id = $2', [room.id, user.id]);
  if (member) return { id: room.id };
  const cur = await activeRoomOf(user.id);
  if (cur) throw err(409, 'Вы уже находитесь в другой комнате', { roomId: cur.room_id });
  if (room.status !== 'waiting') throw err(400, 'Игра уже идёт');
  if (room.password && room.password !== String(password || '')) throw err(403, 'Неверный пароль комнаты');
  const cnt = await one('select count(*)::int as c from room_players where room_id = $1', [room.id]);
  if (cnt.c >= room.max_players) throw err(400, 'Комната заполнена');
  await q('insert into room_players(room_id, user_id) values ($1, $2)', [room.id, user.id]);
  await say(room.id, `${user.login} вошёл в комнату`);
  return { id: room.id };
}

export async function leaveRoom(user, roomId) {
  const room = await one('select * from rooms where id = $1', [roomId]);
  if (!room) return;
  if (room.status === 'waiting') {
    await q('delete from room_players where room_id = $1 and user_id = $2', [roomId, user.id]);
    const left = await q('select user_id from room_players where room_id = $1 order by joined_at', [roomId]);
    if (!left.length) {
      await q('delete from rooms where id = $1', [roomId]);
    } else {
      if (room.host_id === user.id) await q('update rooms set host_id = $2 where id = $1', [roomId, left[0].user_id]);
      await say(roomId, `${user.login} вышел из комнаты`);
    }
  } else if (room.status === 'playing') {
    await q('update room_players set alive = false where room_id = $1 and user_id = $2', [roomId, user.id]);
    await say(roomId, `${user.login} покинул игру`);
  }
}

/* ---------- Старт ---------- */

function assignRoles(n) {
  const mafia = Math.max(1, Math.floor(n / 3));
  const roles = Array(mafia).fill('mafia');
  if (n >= 5) roles.push('doctor');
  if (n >= 6) roles.push('sheriff');
  while (roles.length < n) roles.push('civilian');
  return shuffle(roles);
}

export async function startGame(user, roomId) {
  const room = await one('select * from rooms where id = $1', [roomId]);
  if (!room) throw err(404, 'Комната не найдена');
  if (room.host_id !== user.id) throw err(403, 'Начать игру может только хост');
  if (room.status !== 'waiting') throw err(400, 'Игра уже началась');
  const players = await q('select user_id from room_players where room_id = $1 order by joined_at', [roomId]);
  const min = parseInt(process.env.MIN_PLAYERS, 10) || 4;
  if (players.length < min) throw err(400, `Нужно минимум ${min} игроков`);
  const roles = assignRoles(players.length);
  for (let i = 0; i < players.length; i++) {
    await q('update room_players set role = $3, alive = true where room_id = $1 and user_id = $2', [
      roomId,
      players[i].user_id,
      roles[i],
    ]);
  }
  await q(
    `update rooms set status = 'playing', phase = 'night', day = 1, step = step + 1,
       phase_ends_at = now() + make_interval(secs => $2), updated_at = now() where id = $1`,
    [roomId, timers(room).night]
  );
  await say(roomId, 'Игра началась. Наступила ночь 1. Город засыпает…');
}

/* ---------- Игровой цикл ---------- */

function winnerOf(players) {
  const alive = players.filter((p) => p.alive);
  const mafia = alive.filter((p) => p.role === 'mafia').length;
  const rest = alive.length - mafia;
  if (mafia === 0) return 'civilians';
  if (mafia >= rest) return 'mafia';
  return null;
}

function pickTop(votes) {
  const count = new Map();
  for (const v of votes) if (v != null) count.set(v, (count.get(v) || 0) + 1);
  if (!count.size) return { id: null, tie: false };
  const max = Math.max(...count.values());
  const top = [...count.entries()].filter(([, c]) => c === max).map(([id]) => id);
  return { id: top.length === 1 ? top[0] : null, tie: top.length > 1, random: top[Math.floor(Math.random() * top.length)] };
}

async function finish(room, players, winner) {
  const claimed = await one(
    `update rooms set status = 'finished', phase = 'over', winner = $3, step = step + 1, updated_at = now()
     where id = $1 and step = $2 and status = 'playing' returning id`,
    [room.id, room.step, winner]
  );
  if (!claimed) return;
  await say(room.id, winner === 'mafia' ? 'Игра окончена. Победила мафия.' : 'Игра окончена. Победили мирные жители.');
  for (const p of players) {
    const win = (winner === 'mafia') === (p.role === 'mafia');
    await q('insert into history(user_id, room_id, mode, role, result) values ($1,$2,$3,$4,$5)', [
      p.user_id,
      room.id,
      room.mode,
      p.role,
      win ? 'win' : 'lose',
    ]);
    await q('update users set xp = xp + $2 where id = $1', [p.user_id, win ? 30 : 10]);
  }
}

export async function tick(roomId) {
  const room = await one('select * from rooms where id = $1', [roomId]);
  if (!room || room.status !== 'playing') return room;
  const players = await q(
    'select rp.user_id, rp.role, rp.alive, u.login from room_players rp join users u on u.id = rp.user_id where rp.room_id = $1',
    [roomId]
  );
  const early = winnerOf(players);
  if (early) {
    await finish(room, players, early);
    return one('select * from rooms where id = $1', [roomId]);
  }
  const alive = players.filter((p) => p.alive);
  const acts = await q('select * from actions where room_id = $1 and day = $2 and phase = $3', [
    roomId,
    room.day,
    room.phase,
  ]);
  let due = Date.now() >= new Date(room.phase_ends_at).getTime();
  if (!due) {
    const needed = room.phase === 'night' ? alive.filter((p) => NIGHT_ROLES.includes(p.role)) : alive;
    due = needed.length > 0 && needed.every((p) => acts.some((a) => a.actor_id === p.user_id));
  }
  if (!due) return room;

  const name = (id) => players.find((p) => p.user_id === id)?.login || '?';
  const msgs = [];
  const privates = [];
  let dead = [];

  if (room.phase === 'night') {
    const mafiaIds = alive.filter((p) => p.role === 'mafia').map((p) => p.user_id);
    const mafiaVotes = acts.filter((a) => mafiaIds.includes(a.actor_id)).map((a) => a.target_id);
    const kill = pickTop(mafiaVotes);
    const target = kill.id ?? kill.random ?? null;
    const doc = acts.find((a) => alive.find((p) => p.user_id === a.actor_id && p.role === 'doctor'));
    const saved = doc?.target_id ?? null;
    const sher = acts.find((a) => alive.find((p) => p.user_id === a.actor_id && p.role === 'sheriff'));
    if (sher?.target_id) {
      const t = players.find((p) => p.user_id === sher.target_id);
      privates.push([sher.actor_id, `Проверка шерифа: ${t.login} — ${t.role === 'mafia' ? 'МАФИЯ' : 'не мафия'}`]);
    }
    if (target && target !== saved) {
      dead = [target];
      msgs.push(`Наступило утро. Этой ночью был убит ${name(target)}.`);
    } else {
      msgs.push('Наступило утро. Этой ночью никто не погиб.');
    }
  } else {
    const t = pickTop(acts.map((a) => a.target_id));
    if (t.id) {
      dead = [t.id];
      msgs.push(`Город проголосовал. ${name(t.id)} изгнан из города. Его роль: ${roleName(players.find((p) => p.user_id === t.id).role)}.`);
    } else {
      msgs.push(t.tie ? 'Голоса разделились. Никто не изгнан.' : 'Никто не изгнан.');
    }
  }

  const after = players.map((p) => ({ ...p, alive: p.alive && !dead.includes(p.user_id) }));
  const winner = winnerOf(after);

  const nextPhase = room.phase === 'night' ? 'day' : 'night';
  const nextDay = room.phase === 'day' ? room.day + 1 : room.day;
  const secs = timers(room)[nextPhase];

  const claimed = await one(
    `update rooms set phase = $3, day = $4, step = step + 1, phase_ends_at = now() + make_interval(secs => $5), updated_at = now()
     where id = $1 and step = $2 and status = 'playing' returning id`,
    [roomId, room.step, nextPhase, nextDay, secs]
  );
  if (!claimed) return one('select * from rooms where id = $1', [roomId]);

  if (dead.length) await q('update room_players set alive = false where room_id = $1 and user_id = any($2::int[])', [roomId, dead]);
  for (const m of msgs) await say(roomId, m);
  for (const [uid, text] of privates) await say(roomId, text, `u:${uid}`);

  if (winner) {
    await finish({ ...room, step: room.step + 1 }, after, winner);
  } else {
    await say(roomId, nextPhase === 'night' ? `Ночь ${nextDay}. Город засыпает…` : `День ${nextDay}. Обсуждайте и голосуйте.`);
  }
  return one('select * from rooms where id = $1', [roomId]);
}

const roleName = (r) => ({ mafia: 'Мафия', doctor: 'Доктор', sheriff: 'Шериф', civilian: 'Мирный житель' }[r] || r);

/* ---------- Состояние для клиента ---------- */

export async function roomState(user, roomId) {
  const member = await one('select * from room_players where room_id = $1 and user_id = $2', [roomId, user.id]);
  if (!member) throw err(403, 'Вы не в этой комнате');
  await tick(roomId);
  const room = await one('select * from rooms where id = $1', [roomId]);
  if (!room) throw err(404, 'Комната не найдена');
  const rows = await q(
    `select rp.user_id as id, rp.role, rp.alive, u.login from room_players rp
     join users u on u.id = rp.user_id where rp.room_id = $1 order by rp.joined_at`,
    [roomId]
  );
  const me = rows.find((p) => p.id === user.id);
  const over = room.status === 'finished';
  const players = rows.map((p) => ({
    id: p.id,
    login: p.login,
    alive: p.alive,
    isHost: p.id === room.host_id,
    role: p.id === user.id || over || (me?.role === 'mafia' && p.role === 'mafia') ? p.role : null,
  }));

  const channels = ['all', 'system', `u:${user.id}`];
  if (me?.role === 'mafia') channels.push('mafia');
  const messages = await q(
    `select m.id, m.channel, m.text, m.user_id, u.login from messages m left join users u on u.id = m.user_id
     where m.room_id = $1 and m.channel = any($2::text[]) order by m.id desc limit 100`,
    [roomId, channels]
  );
  messages.reverse();

  let myTarget = null;
  const votes = {};
  if (room.status === 'playing') {
    const acts = await q('select actor_id, target_id from actions where room_id = $1 and day = $2 and phase = $3', [
      roomId,
      room.day,
      room.phase,
    ]);
    const mine = acts.find((a) => a.actor_id === user.id);
    myTarget = mine ? mine.target_id ?? 0 : null;
    if (room.phase === 'day') for (const a of acts) if (a.target_id) votes[a.target_id] = (votes[a.target_id] || 0) + 1;
  }

  return {
    room: {
      id: room.id,
      code: room.code,
      name: room.name,
      mode: room.mode,
      status: room.status,
      phase: room.phase,
      day: room.day,
      winner: room.winner,
      maxPlayers: room.max_players,
      isHost: room.host_id === user.id,
    },
    endsIn: room.phase_ends_at && room.status === 'playing' ? Math.max(0, Math.ceil((new Date(room.phase_ends_at).getTime() - Date.now()) / 1000)) : 0,
    me: { id: user.id, role: me?.role || null, alive: me?.alive ?? false },
    players,
    messages,
    myTarget,
    votes,
  };
}

/* ---------- Чат и действия ---------- */

export async function chat(user, roomId, text) {
  text = String(text || '').trim().slice(0, 300);
  if (!text) throw err(400, 'Пустое сообщение');
  const room = await one('select * from rooms where id = $1', [roomId]);
  const me = await one('select * from room_players where room_id = $1 and user_id = $2', [roomId, user.id]);
  if (!room || !me) throw err(403, 'Вы не в этой комнате');
  let channel;
  if (room.status === 'waiting' || room.status === 'finished') channel = 'all';
  else if (!me.alive) throw err(403, 'Выбывшие игроки не могут писать');
  else if (room.phase === 'day') channel = 'all';
  else if (me.role === 'mafia') channel = 'mafia';
  else throw err(403, 'Ночью город молчит');
  await q('insert into messages(room_id, user_id, channel, text) values ($1,$2,$3,$4)', [roomId, user.id, channel, text]);
}

export async function act(user, roomId, targetId) {
  const room = await one('select * from rooms where id = $1', [roomId]);
  const me = await one('select * from room_players where room_id = $1 and user_id = $2', [roomId, user.id]);
  if (!room || !me) throw err(403, 'Вы не в этой комнате');
  if (room.status !== 'playing') throw err(400, 'Игра не идёт');
  if (!me.alive) throw err(403, 'Вы выбыли из игры');
  let target = null;
  if (targetId) {
    target = await one('select * from room_players where room_id = $1 and user_id = $2 and alive = true', [roomId, targetId]);
    if (!target) throw err(400, 'Неверная цель');
  }
  if (room.phase === 'night') {
    if (!NIGHT_ROLES.includes(me.role)) throw err(403, 'Ночью вы спите');
    if (!target) throw err(400, 'Выберите игрока');
    if (me.role === 'mafia' && target.role === 'mafia') throw err(400, 'Нельзя выбрать своего');
    if (me.role === 'sheriff' && target.user_id === user.id) throw err(400, 'Нельзя проверять себя');
  } else if (target && target.user_id === user.id) {
    throw err(400, 'Нельзя голосовать за себя');
  }
  await q(
    `insert into actions(room_id, day, phase, actor_id, target_id) values ($1,$2,$3,$4,$5)
     on conflict (room_id, day, phase, actor_id) do update set target_id = excluded.target_id`,
    [roomId, room.day, room.phase, user.id, target ? target.user_id : null]
  );
}

/* ---------- Профиль ---------- */

export async function profile(user) {
  const stats = await one(
    `select count(*)::int as games, count(*) filter (where result = 'win')::int as wins,
       count(*) filter (where result = 'lose')::int as losses from history where user_id = $1`,
    [user.id]
  );
  const history = await q(
    'select mode, role, result, created_at from history where user_id = $1 order by id desc limit 20',
    [user.id]
  );
  const level = Math.floor(user.xp / 300) + 1;
  return { ...stats, xp: user.xp, level, xpInLevel: user.xp % 300, xpNeed: 300, history };
}
