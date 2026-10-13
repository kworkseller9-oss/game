import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Avatar, ROLE, MODE } from './ui.jsx';

export default function Profile() {
  const [p, setP] = useState(null);
  useEffect(() => { api('/profile').then(setP).catch(() => {}); }, []);
  if (!p) return <div className="muted">Загрузка…</div>;
  return (
    <div>
      <h1>Мой профиль</h1>
      <div className="card profile-top">
        <Avatar name={p.user.login} size={72} />
        <div className="grow">
          <h2>{p.user.login}</h2>
          <div className="stats">
            <div><small>Игры</small><b>{p.games}</b></div>
            <div><small>Победы</small><b>{p.wins}</b></div>
            <div><small>Поражения</small><b>{p.losses}</b></div>
          </div>
          <div className="level"><span>Уровень {p.level}</span><small>{p.xpInLevel} / {p.xpNeed} XP</small></div>
          <div className="bar"><i style={{ width: `${(p.xpInLevel / p.xpNeed) * 100}%` }} /></div>
        </div>
      </div>
      <h3>История игр</h3>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Режим</th><th>Роль</th><th>Результат</th><th>Дата</th></tr></thead>
          <tbody>
            {p.history.length === 0 && <tr><td colSpan={4} className="muted center">Сыгранных игр пока нет</td></tr>}
            {p.history.map((h, i) => (
              <tr key={i}>
                <td>{MODE[h.mode] || h.mode}</td>
                <td>{ROLE[h.role] || '—'}</td>
                <td className={h.result === 'win' ? 'win' : 'lose'}>{h.result === 'win' ? 'Победа' : 'Поражение'}</td>
                <td>{new Date(h.created_at).toLocaleString('ru-RU')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
