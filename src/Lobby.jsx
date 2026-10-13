import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Modal, MODE } from './ui.jsx';

export default function Lobby({ onOpen }) {
  const [data, setData] = useState({ rooms: [], current: null });
  const [error, setError] = useState('');
  const [create, setCreate] = useState(false);
  const [code, setCode] = useState('');
  const [pwAsk, setPwAsk] = useState(null);

  async function load() {
    try { setData(await api('/rooms')); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  async function join(room, password) {
    setError('');
    try {
      const d = await api(`/rooms/${room.id}/join`, { method: 'POST', body: { password } });
      onOpen(d.id);
    } catch (e) {
      if (e.status === 403 && room.locked && !password) setPwAsk(room);
      else if (e.data?.roomId) onOpen(e.data.roomId);
      else setError(e.message);
    }
  }

  async function joinByCode(e) {
    e.preventDefault();
    try {
      const d = await api('/rooms/join', { method: 'POST', body: { code } });
      onOpen(d.id);
    } catch (e2) {
      if (e2.data?.roomId) onOpen(e2.data.roomId); else setError(e2.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h1>Доступные комнаты</h1>
        <button className="btn primary" onClick={() => setCreate(true)}>Создать комнату</button>
      </div>

      {data.current && (
        <div className="card banner">
          Вы уже в комнате.
          <button className="btn primary small" onClick={() => onOpen(data.current)}>Вернуться</button>
        </div>
      )}

      <form className="inline-form" onSubmit={joinByCode}>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Код комнаты" maxLength={4} />
        <button className="btn" disabled={code.length < 4}>Войти по коду</button>
      </form>
      {error && <div className="error">{error}</div>}

      <div className="card table-wrap">
        <table>
          <thead><tr><th>Название</th><th>Игроки</th><th>Режим</th><th>Статус</th><th /></tr></thead>
          <tbody>
            {data.rooms.length === 0 && <tr><td colSpan={5} className="muted center">Комнат пока нет. Создайте первую.</td></tr>}
            {data.rooms.map((r) => (
              <tr key={r.id}>
                <td>{r.locked && '🔒 '}{r.name}<div className="muted small">хост: {r.host}</div></td>
                <td>{r.players}/{r.max_players}</td>
                <td>{MODE[r.mode]}</td>
                <td>
                  {r.status === 'playing' ? <span className="dot green">Идёт игра</span>
                    : r.players >= r.max_players ? <span className="dot red">Полная</span>
                    : <span className="dot yellow">Ждёт</span>}
                </td>
                <td><button className="btn small" disabled={r.status !== 'waiting' || r.players >= r.max_players} onClick={() => join(r)}>Войти</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {create && <CreateRoom onClose={() => setCreate(false)} onCreated={onOpen} />}
      {pwAsk && (
        <Modal title={`Пароль: ${pwAsk.name}`} onClose={() => setPwAsk(null)}>
          <PasswordAsk onSubmit={(pw) => { const r = pwAsk; setPwAsk(null); join(r, pw); }} />
        </Modal>
      )}
    </div>
  );
}

function PasswordAsk({ onSubmit }) {
  const [pw, setPw] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(pw); }}>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Пароль комнаты" autoFocus />
      <button className="btn primary full">Войти</button>
    </form>
  );
}

function CreateRoom({ onClose, onCreated }) {
  const [f, setF] = useState({ name: '', maxPlayers: 8, mode: 'classic', password: '' });
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      const d = await api('/rooms', { method: 'POST', body: f });
      onCreated(d.id);
    } catch (e2) {
      if (e2.data?.roomId) onCreated(e2.data.roomId); else setError(e2.message);
    }
  }
  return (
    <Modal title="Создать комнату" onClose={onClose}>
      <form onSubmit={submit}>
        <label>Название комнаты</label>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Например: Моя компания" maxLength={30} />
        <label>Количество игроков</label>
        <select value={f.maxPlayers} onChange={(e) => setF({ ...f, maxPlayers: +e.target.value })}>
          {[4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label>Режим игры</label>
        <div className="seg">
          {Object.entries(MODE).map(([k, v]) => (
            <button type="button" key={k} className={f.mode === k ? 'on' : ''} onClick={() => setF({ ...f, mode: k })}>{v}</button>
          ))}
        </div>
        <label>Пароль (необязательно)</label>
        <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="Введите пароль" />
        {error && <div className="error">{error}</div>}
        <button className="btn primary full">Создать</button>
      </form>
    </Modal>
  );
}
