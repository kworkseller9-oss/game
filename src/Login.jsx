import React, { useState } from 'react';
import { api, setToken } from './api.js';
import { Logo } from './ui.jsx';
import Install from './Install.jsx';

export default function Login({ onLogin }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api('/login', { method: 'POST', body: { login, password } });
      setToken(d.token);
      onLogin(d.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-hero"><Logo big /></div>
      <form className="card login-card" onSubmit={submit}>
        <h2>Вход</h2>
        <label>Логин или email</label>
        <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Введите логин или email" autoComplete="username" />
        <label>Пароль</label>
        <div className="pw">
          <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Введите пароль" autoComplete="current-password" />
          <button type="button" className="icon-btn" onClick={() => setShow(!show)}>{show ? '🙈' : '👁'}</button>
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn primary" disabled={busy || !login || !password}>{busy ? 'Входим…' : 'Войти'}</button>
        <p className="muted small">Регистрации нет. Аккаунт выдаёт администратор.</p>
        <Install />
      </form>
    </div>
  );
}
