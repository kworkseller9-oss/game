import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { q, one, ensure } from './_lib/db.js';
import * as game from './_lib/game.js';

const app = express();
app.use(express.json({ limit: '50kb' }));

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    res.status(status).json({ error: status >= 500 ? 'Ошибка сервера' : e.message, roomId: e.roomId });
  });

app.use(async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET не задан');
    await ensure();
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка настройки сервера: проверьте DATABASE_URL, JWT_SECRET и ADMIN_*' });
  }
});

async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    const u = await one('select id, login, email, role, status, xp from users where id = $1', [id]);
    if (!u || u.status !== 'active') return res.status(401).json({ error: 'Доступ закрыт' });
    req.user = u;
    next();
  } catch {
    res.status(401).json({ error: 'Требуется вход' });
  }
}
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Только для администратора' });

const int = (v) => parseInt(v, 10);
const publicUser = (u) => ({ id: u.id, login: u.login, email: u.email, role: u.role, xp: u.xp });

/* ----- Авторизация (регистрации нет, аккаунты выдаёт админ) ----- */

app.post('/api/login', wrap(async (req, res) => {
  const login = String(req.body.login || '').trim();
  const password = String(req.body.password || '');
  const u = await one('select * from users where lower(login) = lower($1) or lower(email) = lower($1)', [login]);
  if (!u || !(await bcrypt.compare(password, u.pass_hash))) return res.status(401).json({ error: 'Неверный логин или пароль' });
  if (u.status !== 'active') return res.status(403).json({ error: 'Аккаунт заблокирован' });
  const token = jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: publicUser(u) });
}));

app.get('/api/me', auth, wrap(async (req, res) => res.json({ user: publicUser(req.user) })));

/* ----- Комнаты ----- */

app.get('/api/rooms', auth, wrap(async (req, res) => res.json(await game.listRooms(req.user))));
app.post('/api/rooms', auth, wrap(async (req, res) => res.json(await game.createRoom(req.user, req.body))));
app.post('/api/rooms/join', auth, wrap(async (req, res) =>
  res.json(await game.joinRoom(req.user, { code: req.body.code, password: req.body.password }))));
app.post('/api/rooms/:id/join', auth, wrap(async (req, res) =>
  res.json(await game.joinRoom(req.user, { id: int(req.params.id), password: req.body.password }))));
app.post('/api/rooms/:id/leave', auth, wrap(async (req, res) => {
  await game.leaveRoom(req.user, int(req.params.id));
  res.json({ ok: true });
}));
app.post('/api/rooms/:id/start', auth, wrap(async (req, res) => {
  await game.startGame(req.user, int(req.params.id));
  res.json({ ok: true });
}));
app.get('/api/rooms/:id/state', auth, wrap(async (req, res) => res.json(await game.roomState(req.user, int(req.params.id)))));
app.post('/api/rooms/:id/chat', auth, wrap(async (req, res) => {
  await game.chat(req.user, int(req.params.id), req.body.text);
  res.json({ ok: true });
}));
app.post('/api/rooms/:id/act', auth, wrap(async (req, res) => {
  await game.act(req.user, int(req.params.id), req.body.targetId ? int(req.body.targetId) : null);
  res.json({ ok: true });
}));

app.get('/api/profile', auth, wrap(async (req, res) =>
  res.json({ user: publicUser(req.user), ...(await game.profile(req.user)) })));

/* ----- Админка (только role = admin) ----- */

app.get('/api/admin/stats', auth, adminOnly, wrap(async (req, res) => {
  const s = await one(`select
    (select count(*)::int from users) as users,
    (select count(*)::int from rooms where status <> 'finished') as rooms,
    (select count(*)::int from rooms where status = 'finished') as games`);
  res.json(s);
}));

app.get('/api/admin/users', auth, adminOnly, wrap(async (req, res) =>
  res.json(await q('select id, login, email, role, status, xp, created_at from users order by id'))));

app.post('/api/admin/users', auth, adminOnly, wrap(async (req, res) => {
  const login = String(req.body.login || '').trim();
  const email = String(req.body.email || '').trim() || null;
  const password = String(req.body.password || '');
  if (!/^[\p{L}\p{N}_.-]{3,24}$/u.test(login)) return res.status(400).json({ error: 'Логин: 3-24 символа, буквы/цифры/._-' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  const status = req.body.status === 'blocked' ? 'blocked' : 'active';
  const exists = await one('select 1 as x from users where lower(login) = lower($1)', [login]);
  if (exists) return res.status(409).json({ error: 'Такой логин уже есть' });
  // Роль всегда user: админ только один, задаётся через ADMIN_LOGIN в настройках Vercel
  const u = await one(
    "insert into users(login, email, pass_hash, role, status) values ($1,$2,$3,'user',$4) returning id",
    [login, email, await bcrypt.hash(password, 10), status]
  );
  res.json({ id: u.id });
}));

app.patch('/api/admin/users/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = int(req.params.id);
  const u = await one('select * from users where id = $1', [id]);
  if (!u) return res.status(404).json({ error: 'Не найден' });
  if (u.role === 'admin' && id !== req.user.id) return res.status(403).json({ error: 'Админа менять нельзя' });
  if (req.body.status && id !== req.user.id) {
    await q('update users set status = $2 where id = $1', [id, req.body.status === 'blocked' ? 'blocked' : 'active']);
  }
  if (req.body.email !== undefined) await q('update users set email = $2 where id = $1', [id, String(req.body.email).trim() || null]);
  if (req.body.password) {
    if (String(req.body.password).length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
    await q('update users set pass_hash = $2 where id = $1', [id, await bcrypt.hash(String(req.body.password), 10)]);
  }
  res.json({ ok: true });
}));

app.delete('/api/admin/users/:id', auth, adminOnly, wrap(async (req, res) => {
  const id = int(req.params.id);
  const u = await one('select role from users where id = $1', [id]);
  if (!u) return res.status(404).json({ error: 'Не найден' });
  if (u.role === 'admin') return res.status(403).json({ error: 'Админа удалить нельзя' });
  await q('delete from users where id = $1', [id]);
  res.json({ ok: true });
}));

app.get('/api/admin/rooms', auth, adminOnly, wrap(async (req, res) =>
  res.json(await q(
    `select r.id, r.code, r.name, r.mode, r.status, r.phase, r.day,
      (select count(*)::int from room_players p where p.room_id = r.id) as players,
      (select login from users where id = r.host_id) as host
     from rooms r order by r.id desc limit 100`))));

app.delete('/api/admin/rooms/:id', auth, adminOnly, wrap(async (req, res) => {
  await q('delete from rooms where id = $1', [int(req.params.id)]);
  res.json({ ok: true });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Не найдено' }));

export default app;
