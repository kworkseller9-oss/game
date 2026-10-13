import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { Avatar, ROLE, MODE } from './ui.jsx';

const TASKS = {
  mafia: ['Убить всех мирных жителей', 'Не раскрыть свою роль', 'Общаться с другими мафиями ночью'],
  civilian: ['Вычислить мафию днём', 'Голосовать осознанно', 'Дожить до победы города'],
  doctor: ['Каждую ночь спасать одного игрока', 'Можно спасти себя', 'Помочь городу найти мафию'],
  sheriff: ['Каждую ночь проверять одного игрока', 'Узнавать, мафия ли он', 'Осторожно делиться знанием'],
};

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Room({ id, me, onExit }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [left, setLeft] = useState(0);
  const [seen, setSeen] = useState(() => sessionStorage.getItem('seen' + id) === '1');
  const logRef = useRef();

  async function load() {
    try {
      const d = await api(`/rooms/${id}/state`);
      setS(d);
      setLeft(d.endsIn);
    } catch (e) {
      if (e.status === 403 || e.status === 404) onExit();
      else setError(e.message);
    }
  }
  useEffect(() => { load(); const t = setInterval(load, 1500); return () => clearInterval(t); }, [id]);
  useEffect(() => { const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [s?.messages?.length]);

  if (!s) return <div className="center-screen">Загрузка комнаты…</div>;
  const { room, players, messages, me: my } = s;

  const call = async (path, body) => {
    setError('');
    try { await api(`/rooms/${id}${path}`, { method: 'POST', body }); await load(); } catch (e) { setError(e.message); }
  };
  const leave = async () => { await call('/leave'); onExit(); };
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const t = text; setText('');
    await call('/chat', { text: t });
  };

  const renderChat = ({ canWrite, placeholder }) => (
    <div className="chat">
      <div className="chat-log" ref={logRef}>
        {messages.map((m) => (
          <div key={m.id} className={'msg ' + (m.channel === 'system' || m.channel.startsWith('u:') ? 'sys' : m.channel === 'mafia' ? 'maf' : '')}>
            {m.login && <b>{m.login}{m.channel === 'mafia' ? ' (мафия)' : ''}: </b>}{m.text}
          </div>
        ))}
      </div>
      {canWrite && (
        <form className="chat-input" onSubmit={send}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={300} />
          <button className="btn primary small">➤</button>
        </form>
      )}
    </div>
  );

  /* ---------- Ожидание ---------- */
  if (room.status === 'waiting') {
    return (
      <div className="room">
        <div className="room-top">
          <button className="icon-btn" onClick={leave}>←</button>
          <div className="grow">
            <b>Комната: {room.name}</b>
            <div className="muted small">Игроки: {players.length}/{room.maxPlayers} · Режим: {MODE[room.mode]}</div>
          </div>
          <div className="code-box">Код: <b>{room.code}</b>
            <button className="btn small" onClick={() => navigator.clipboard?.writeText(room.code)}>Скопировать</button>
          </div>
        </div>
        <div className="room-grid">
          <div>
            <div className="players-grid">
              {players.map((p) => (
                <div key={p.id} className="pl">
                  <Avatar name={p.login} size={64} ring={p.isHost ? '#e0a526' : undefined} />
                  <div>{p.login}</div>
                  {p.isHost && <small className="muted">Хост</small>}
                </div>
              ))}
            </div>
            {error && <div className="error">{error}</div>}
            {room.isHost
              ? <button className="btn primary full" onClick={() => call('/start')}>Начать игру</button>
              : <div className="muted center">Ждём, пока хост начнёт игру…</div>}
          </div>
          {renderChat({ canWrite: true, placeholder: 'Написать сообщение…' })}
        </div>
      </div>
    );
  }

  /* ---------- Игра ---------- */
  const over = room.status === 'finished';
  const night = room.phase === 'night';
  const myRole = my.role;
  const canNight = night && my.alive && ['mafia', 'doctor', 'sheriff'].includes(myRole);
  const alive = players.filter((p) => p.alive);
  const choices = alive.filter((p) => {
    if (myRole === 'mafia') return p.role !== 'mafia';
    if (myRole === 'sheriff') return p.id !== my.id;
    return true;
  });
  const act = (targetId) => call('/act', { targetId });
  const titleOf = { mafia: 'Выберите жертву', doctor: 'Кого спасти?', sheriff: 'Кого проверить?' };

  return (
    <div className={'room game ' + (night ? 'night' : 'day')}>
      <div className="room-top">
        <button className="icon-btn" onClick={leave}>←</button>
        <div className="grow center">
          <b>{over ? 'Игра окончена' : `${night ? 'Ночь' : 'День'} ${room.day}`}</b>
          {!over && <div className="timer">⏱ {fmt(left)}</div>}
        </div>
        <span className="role-chip">{ROLE[myRole]}</span>
      </div>

      {!seen && !over && (
        <div className="overlay">
          <div className="modal role-card">
            <div className={'role-art ' + myRole}>{{ mafia: '🕴', doctor: '⚕', sheriff: '★', civilian: '☺' }[myRole]}</div>
            <h2>Вы — <span className={myRole === 'mafia' ? 'red' : ''}>{ROLE[myRole]}</span></h2>
            <p className="muted">Ваша задача:</p>
            <ul>{TASKS[myRole].map((t) => <li key={t}>{t}</li>)}</ul>
            <button className="btn primary full" onClick={() => { sessionStorage.setItem('seen' + id, '1'); setSeen(true); }}>Понятно</button>
          </div>
        </div>
      )}

      {over && (
        <div className="card result">
          <h2>{room.winner === 'mafia' ? 'Победила мафия' : 'Победили мирные жители'}</h2>
          <div className="reveal">
            {players.map((p) => <span key={p.id} className={'tag ' + (p.role === 'mafia' ? 'admin' : '')}>{p.login} — {ROLE[p.role]}</span>)}
          </div>
          <button className="btn primary" onClick={leave}>В лобби</button>
        </div>
      )}

      {!my.alive && !over && <div className="card banner">Вы выбыли из игры. Можно наблюдать.</div>}
      {error && <div className="error">{error}</div>}

      <div className="room-grid">
        <div>
          {night && !over && (
            <div className="card">
              {canNight ? (
                <>
                  <h3 className="center">{titleOf[myRole]}</h3>
                  <div className="players-grid">
                    {choices.map((p) => (
                      <button key={p.id} className={'pl pick' + (s.myTarget === p.id ? ' sel' : '')} onClick={() => act(p.id)}>
                        <Avatar name={p.login} size={56} />
                        <div>{p.login}</div>
                      </button>
                    ))}
                  </div>
                  {s.myTarget ? <div className="muted center small">Выбор принят. Можно изменить до конца ночи.</div> : null}
                </>
              ) : (
                <div className="center muted sleep">🌙 Город спит… Дождитесь утра.</div>
              )}
            </div>
          )}

          {!night && !over && (
            <div className="card">
              <h3>Голосование</h3>
              <div className="vote-list">
                {alive.map((p) => (
                  <div key={p.id} className={'vote-row' + (s.myTarget === p.id ? ' sel' : '')}>
                    <Avatar name={p.login} size={30} />
                    <span className="grow">{p.login}{p.id === my.id ? ' (вы)' : ''}</span>
                    <span className="count">{s.votes[p.id] || 0}</span>
                    <button className="btn small" disabled={!my.alive || p.id === my.id} onClick={() => act(p.id)}>Голос</button>
                  </div>
                ))}
              </div>
              <button className={'btn full' + (s.myTarget === 0 ? ' primary' : '')} disabled={!my.alive} onClick={() => act(null)}>Пропустить голосование</button>
            </div>
          )}

          <div className="card">
            <small className="muted">Игроки</small>
            <div className="chips">
              {players.map((p) => (
                <span key={p.id} className={'chip' + (p.alive ? '' : ' dead')}>
                  {p.login}{p.role && !over ? ` · ${ROLE[p.role]}` : ''}
                </span>
              ))}
            </div>
          </div>
        </div>

        {renderChat({
          canWrite: my.alive && !over && (!night || myRole === 'mafia'),
          placeholder: night ? 'Чат мафии…' : 'Написать сообщение…',
        })}
      </div>
    </div>
  );
}
