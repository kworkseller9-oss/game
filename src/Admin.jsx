import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Modal, MODE } from './ui.jsx';

export default function Admin({ me }) {
  const [tab, setTab] = useState('users');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [s, u, r] = await Promise.all([api('/admin/stats'), api('/admin/users'), api('/admin/rooms')]);
      setStats(s); setUsers(u); setRooms(r);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function run(fn) {
    setError('');
    try { await fn(); await load(); } catch (e) { setError(e.message); }
  }

  const toggle = (u) => run(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { status: u.status === 'active' ? 'blocked' : 'active' } }));
  const remove = (u) => confirm(`Удалить ${u.login}?`) && run(() => api(`/admin/users/${u.id}`, { method: 'DELETE' }));
  const resetPw = (u) => {
    const pw = prompt(`Новый пароль для ${u.login} (минимум 6 символов)`);
    if (pw) run(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { password: pw } }));
  };
  const delRoom = (r) => confirm(`Закрыть комнату "${r.name}"?`) && run(() => api(`/admin/rooms/${r.id}`, { method: 'DELETE' }));

  return (
    <div>
      <div className="page-head">
        <h1>Админ панель</h1>
        {tab === 'users' && <button className="btn primary" onClick={() => setForm({ login: '', email: '', password: '' })}>+ Создать аккаунт</button>}
      </div>
      {stats && (
        <div className="stats admin-stats">
          <div className="card"><small>Пользователи</small><b>{stats.users}</b></div>
          <div className="card"><small>Активные комнаты</small><b>{stats.rooms}</b></div>
          <div className="card"><small>Сыграно игр</small><b>{stats.games}</b></div>
        </div>
      )}
      <div className="seg tabs">
        <button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Пользователи</button>
        <button className={tab === 'rooms' ? 'on' : ''} onClick={() => setTab('rooms')}>Комнаты</button>
      </div>
      {error && <div className="error">{error}</div>}

      {tab === 'users' && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Логин</th><th>Email</th><th>Роль</th><th>Статус</th><th>XP</th><th>Действия</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td><td>{u.login}</td><td>{u.email || '—'}</td>
                  <td><span className={'tag ' + u.role}>{u.role}</span></td>
                  <td className={u.status === 'active' ? 'win' : 'lose'}>{u.status === 'active' ? 'Активен' : 'Заблокирован'}</td>
                  <td>{u.xp}</td>
                  <td className="actions">
                    <button className="btn small" onClick={() => resetPw(u)}>Пароль</button>
                    {u.role !== 'admin' && <>
                      <button className="btn small" onClick={() => toggle(u)}>{u.status === 'active' ? 'Блок' : 'Разблок'}</button>
                      <button className="btn small danger" onClick={() => remove(u)}>Удалить</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rooms' && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Название</th><th>Код</th><th>Хост</th><th>Игроки</th><th>Режим</th><th>Статус</th><th /></tr></thead>
            <tbody>
              {rooms.length === 0 && <tr><td colSpan={8} className="muted center">Комнат нет</td></tr>}
              {rooms.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td><td>{r.name}</td><td>{r.code}</td><td>{r.host}</td><td>{r.players}</td>
                  <td>{MODE[r.mode]}</td><td>{r.status}{r.phase && r.status === 'playing' ? ` · ${r.phase} ${r.day}` : ''}</td>
                  <td><button className="btn small danger" onClick={() => delRoom(r)}>Закрыть</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <Modal title="Создать пользователя" onClose={() => setForm(null)}>
          <form onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/admin/users', { method: 'POST', body: form }); setForm(null); }); }}>
            <label>Логин</label>
            <input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} placeholder="Логин" />
            <label>Email (необязательно)</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
            <label>Пароль</label>
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Минимум 6 символов" />
            <button className="btn primary full" disabled={!form.login || form.password.length < 6}>Сохранить</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
