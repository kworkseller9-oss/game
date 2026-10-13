import React from 'react';

const COLORS = ['#b3262d', '#2f6fb3', '#2c8a5b', '#a8742a', '#7a45b0', '#2a8f9a', '#b04578', '#5a6475'];

export function Avatar({ name = '?', size = 40, ring }) {
  const c = COLORS[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % COLORS.length];
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, background: c, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function Logo({ big }) {
  return (
    <div className={'logo' + (big ? ' big' : '')}>
      <span>MAFIA</span>
      {big && <small>Онлайн игра с друзьями</small>}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const ROLE = { mafia: 'Мафия', civilian: 'Мирный житель', doctor: 'Доктор', sheriff: 'Шериф' };
export const MODE = { classic: 'Классика', blitz: 'Блиц' };
