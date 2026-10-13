import React, { useEffect, useState } from 'react';

// Кнопка установки PWA. На Android/ПК использует системный prompt,
// на iPhone показывает подсказку (там prompt недоступен).
export default function Install({ className = '' }) {
  const [evt, setEvt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [hint, setHint] = useState(false);

  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setEvt(e); };
    const onInstalled = () => { setInstalled(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (standalone || installed) return null;
  if (!evt && !ios) return null;

  async function click() {
    if (evt) {
      evt.prompt();
      await evt.userChoice.catch(() => {});
      setEvt(null);
    } else {
      setHint(!hint);
    }
  }

  return (
    <div className={className}>
      <button className="btn small full" onClick={click}>📲 Установить приложение</button>
      {hint && <div className="muted small" style={{ marginTop: 6 }}>Нажмите «Поделиться» в Safari и выберите «На экран Домой».</div>}
    </div>
  );
}
