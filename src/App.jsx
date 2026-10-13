import React, { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { Avatar, Logo } from './ui.jsx';
import Login from './Login.jsx';
import Lobby from './Lobby.jsx';
import Room from './Room.jsx';
import Profile from './Profile.jsx';
import Admin from './Admin.jsx';
import Install from './Install.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  const [view, setView] = useState('lobby');
  const [roomId, setRoomId] = useState(null);

  useEffect(() => {
    if (getToken()) {
      api('/me').then((d) => setUser(d.user)).catch(() => {}).finally(() => setReady(true));
    }
    const off = () => { setUser(null); setRoomId(null); setView('lobby'); };
    window.addEventListener('logout', off);
    return () => window.removeEventListener('logout', off);
  }, []);

  if (!ready) return <div className="center-screen">Загрузка…</div>;
  if (!user) return <Login onLogin={(u) => setUser(u)} />;

  const openRoom = (id) => { setRoomId(id); setView('room'); };
  const exitRoom = () => { setRoomId(null); setView('lobby'); };
  const logout = () => { setToken(null); setUser(null); };

  if (view === 'room' && roomId) {
    return <Room id={roomId} me={user} onExit={exitRoom} />;
  }

  const nav = [
    ['lobby', '🏠', 'Главная'],
    ['profile', '👤', 'Профиль'],
    ...(user.role === 'admin' ? [['admin', '⚙️', 'Админ']] : []),
  ];

  return (
    <div className="shell">
      <aside className="side">
        <Logo />
        <nav>
          {nav.map(([k, ico, label]) => (
            <button key={k} className={'nav-item' + (view === k ? ' active' : '')} onClick={() => setView(k)}>
              <span>{ico}</span><b>{label}</b>
            </button>
          ))}
          <button className="nav-item" onClick={logout}><span>🚪</span><b>Выход</b></button>
        </nav>
        <Install className="side-install" />
        <div className="side-user">
          <Avatar name={user.login} size={34} />
          <div><div>{user.login}</div><small className="online">Онлайн</small></div>
        </div>
      </aside>
      <main className="main">
        <Install className="mobile-install" />
        {view === 'lobby' && <Lobby onOpen={openRoom} />}
        {view === 'profile' && <Profile />}
        {view === 'admin' && user.role === 'admin' && <Admin me={user} />}
      </main>
    </div>
  );
}
