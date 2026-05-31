import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE from '../config.js';
import { clearStoredSession, getStoredToken, getStoredUser } from '../utils/session';

const POLL_INTERVAL = 3000;

function elapsed(createdAt) {
  const diff = Math.floor((Date.now() - new Date(createdAt)) / 1000);
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function playNewOrderSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18, 0.36].forEach((t) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime + t);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + t + 0.12);
      gain.gain.setValueAtTime(0.35, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.14);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.15);
    });
  } catch (_) {}
}

function CocinaDashboard() {
  const navigate = useNavigate();
  const user  = getStoredUser();
  const token = getStoredToken();

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('adminDarkMode') === 'true'
  );
  useEffect(() => { localStorage.setItem('adminDarkMode', darkMode); }, [darkMode]);

  const [orders, setOrders]                 = useState([]);
  const [loading, setLoading]               = useState(true);
  const [completedCount, setCompletedCount] = useState(0);
  const [connected, setConnected]           = useState(true);
  const [lastUpdated, setLastUpdated]       = useState(null);
  const [newOrderIds, setNewOrderIds]       = useState(new Set());

  const knownIdsRef   = useRef(new Set());
  const completingRef = useRef(new Set());

  // ── localStorage helpers ──────────────────────────────────────────────────
  const DONE_KEY     = 'cocina_done_items';
  const getDoneItems = () => JSON.parse(localStorage.getItem(DONE_KEY) || '{}');
  const saveDoneItem = (itemId, done) => {
    const current = getDoneItems();
    if (done) current[itemId] = true;
    else delete current[itemId];
    localStorage.setItem(DONE_KEY, JSON.stringify(current));
  };
  // ─────────────────────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${API_BASE}/api/orders?estado=ABIERTO`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        if (res.status === 401) {
          clearStoredSession();
          navigate('/');
          return;
        }
        setConnected(false);
        return;
      }

      setConnected(true);
      setLastUpdated(new Date());

      const data = await res.json();

      const normalized = data
        .map((o) => ({ ...o, createdAt: o.fecha_creacion }))
        .filter((o) => !completingRef.current.has(o.id))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

      // Detectar órdenes nuevas
      const incomingIds = new Set(normalized.map((o) => o.id));
      const freshIds = [...incomingIds].filter(
        (id) => !knownIdsRef.current.has(id) && !completingRef.current.has(id)
      );

      if (freshIds.length > 0 && knownIdsRef.current.size > 0) {
        playNewOrderSound();
        setNewOrderIds((prev) => new Set([...prev, ...freshIds]));
        setTimeout(() => {
          setNewOrderIds((prev) => {
            const next = new Set(prev);
            freshIds.forEach((id) => next.delete(id));
            return next;
          });
        }, 3000);
      }

      // Solo registrar IDs que no estamos completando
      knownIdsRef.current = new Set(
        [...incomingIds].filter((id) => !completingRef.current.has(id))
      );

      setOrders((prev) => {
        const prevMap   = Object.fromEntries(prev.map((o) => [o.id, o]));
        const doneItems = getDoneItems();
        return normalized.map((order) => ({
          ...order,
          items: order.items.map((item) => {
            const oldItem = prevMap[order.id]?.items.find((i) => i.id === item.id);
            const done    = oldItem?._done ?? doneItems[item.id] ?? false;
            return { ...item, _done: done };
          }),
        }));
      });

    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn('Fetch timeout — sin respuesta del servidor');
      } else {
        console.error('fetchOrders error:', err);
      }
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Ticker para cronómetro
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const handleItemDone = (orderId, itemId) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          items: o.items.map((i) => {
            if (i.id !== itemId) return i;
            const newDone = !i._done;
            saveDoneItem(itemId, newDone);
            return { ...i, _done: newDone };
          }),
        };
      })
    );
  };

  const handleOrderComplete = async (id) => {
    const order = orders.find((o) => o.id === id);

    // Quitar de UI inmediatamente
    completingRef.current.add(id);
    setOrders((prev) => prev.filter((o) => o.id !== id));
    setCompletedCount((c) => c + 1);

    try {
      const res = await fetch(`${API_BASE}/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado: 'LISTO' }),
      });

      if (!res.ok) {
        // Revertir si falla
        completingRef.current.delete(id);
        setCompletedCount((c) => c - 1);
        await fetchOrders();
        return;
      }
    } catch (err) {
      console.error('handleOrderComplete error:', err);
      completingRef.current.delete(id);
      setCompletedCount((c) => c - 1);
      await fetchOrders();
      return;
    }

    // Limpiar localStorage de esta orden
    if (order) {
      const current = getDoneItems();
      order.items.forEach((i) => delete current[i.id]);
      localStorage.setItem(DONE_KEY, JSON.stringify(current));
    }

    // Desbloquear inmediatamente — el backend ya la tiene como LISTO
    // y el poll filtra ?estado=ABIERTO, así que no vuelve a aparecer
    completingRef.current.delete(id);
  };

  const handleLogout = () => {
    clearStoredSession();
    navigate('/');
  };

  // ── Design tokens ─────────────────────────────────────────────────────────
  const bg      = darkMode ? 'bg-[#0d0f18]'       : 'bg-slate-50';
  const surface  = darkMode ? 'bg-[#161922]'       : 'bg-white';
  const surface2 = darkMode ? 'bg-[#1e2132]'       : 'bg-slate-50';
  const border   = darkMode ? 'border-white/[.07]' : 'border-slate-200';
  const muted    = darkMode ? 'text-slate-400'     : 'text-slate-500';
  const heading  = darkMode ? 'text-slate-100'     : 'text-slate-900';
  const borderB  = darkMode ? 'border-white/[.06]' : 'border-slate-100';
  const card     = `rounded-2xl border shadow-sm ${surface} ${border}`;
  // ─────────────────────────────────────────────────────────────────────────

  const urgencyClass = (createdAt) => {
    const mins = (Date.now() - new Date(createdAt)) / 60000;
    if (mins >= 15) return {
      ring:  'border-red-500/60 shadow-red-950/30',
      badge: 'bg-red-500/10 text-red-400',
      dot:   'bg-red-500',
    };
    if (mins >= 8) return {
      ring:  'border-amber-500/60 shadow-amber-950/30',
      badge: 'bg-amber-500/10 text-amber-400',
      dot:   'bg-amber-500',
    };
    return {
      ring:  'border-emerald-500/40 shadow-emerald-950/20',
      badge: 'bg-emerald-500/10 text-emerald-400',
      dot:   'bg-emerald-500',
    };
  };

  const kpis = [
    { label: 'En cola',     val: orders.length,                                              color: 'text-orange-500',  bgColor: darkMode ? 'bg-orange-500/[.06] border-orange-500/20'   : 'bg-orange-50 border-orange-100'   },
    { label: 'En proceso',  val: orders.filter((o) => o.items.some((i) => i._done)).length,  color: 'text-amber-500',   bgColor: darkMode ? 'bg-amber-500/[.06] border-amber-500/20'    : 'bg-amber-50 border-amber-100'    },
    { label: 'Listos',      val: orders.filter((o) => o.items.every((i) => i._done)).length, color: 'text-emerald-500', bgColor: darkMode ? 'bg-emerald-500/[.06] border-emerald-500/20' : 'bg-emerald-50 border-emerald-100' },
    { label: 'Despachados', val: completedCount,                                              color: heading,            bgColor: `${surface2} ${border}` },
  ];

  return (
    <div className={`min-h-screen transition-colors duration-300 ${bg} ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 lg:px-8">

        {/* TOPBAR */}
        <header className={`flex flex-col gap-4 rounded-2xl border p-4 lg:flex-row lg:items-center lg:justify-between ${surface} ${border}`}>
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 shadow-lg shadow-orange-500/30 text-xl">
              👨‍🍳
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.25em] text-orange-500">Módulo Cocina</p>
              <h1 className={`text-lg font-black leading-none ${heading}`}>MGR</h1>
              <p className={`text-[11px] font-medium ${muted}`}>{user?.nombre || 'Cocina'}</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5">
            <div className={[
              'flex items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-bold',
              connected
                ? darkMode ? 'bg-emerald-500/[.10] text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                : darkMode ? 'bg-red-500/[.10] text-red-400'         : 'bg-red-50 text-red-500',
            ].join(' ')}>
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {connected
                ? lastUpdated
                  ? lastUpdated.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : 'En línea'
                : 'Sin conexión'}
            </div>

            <button
              onClick={fetchOrders}
              title="Actualizar"
              className={[
                'rounded-xl px-3.5 py-2 text-sm font-bold transition-all duration-200 active:scale-95',
                darkMode
                  ? 'bg-white/[.05] text-slate-400 hover:bg-white/[.09] hover:text-slate-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700',
              ].join(' ')}
            >🔄</button>

            <button
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? 'Modo claro' : 'Modo oscuro'}
              className={[
                'rounded-xl px-3 py-2 text-sm font-bold transition-all duration-200',
                darkMode
                  ? 'bg-amber-400/[.12] text-amber-400 hover:bg-amber-400/[.22]'
                  : 'bg-slate-800/[.07] text-slate-600 hover:bg-slate-800/[.13]',
              ].join(' ')}
            >{darkMode ? '☀️' : '🌙'}</button>

            <button
              onClick={handleLogout}
              className={[
                'rounded-xl px-3.5 py-2 text-sm font-bold transition-all duration-200',
                darkMode
                  ? 'bg-white/[.05] text-slate-400 hover:bg-red-500/[.12] hover:text-red-400'
                  : 'bg-slate-900 text-white hover:bg-slate-700',
              ].join(' ')}
            >Salir</button>
          </nav>
        </header>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className={`relative overflow-hidden rounded-2xl border p-5 ${k.bgColor}`}>
              <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-current opacity-5 blur-2xl" />
              <p className="text-[9px] font-black uppercase tracking-[.25em] text-orange-500">{k.label}</p>
              <p className={`mt-2 text-5xl font-black tabular-nums ${k.color}`}>{k.val}</p>
            </div>
          ))}
        </div>

        {/* CONTENIDO */}
        {loading ? (
          <div className={`${card} flex items-center justify-center py-24`}>
            <p className={`text-sm font-bold ${muted}`}>Cargando órdenes...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className={`${card} flex flex-col items-center justify-center py-24`}>
            <span className="text-5xl">✅</span>
            <p className={`mt-4 text-sm font-bold ${muted}`}>Cocina al día — sin órdenes pendientes</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {orders.map((order) => {
              const allDone   = order.items.every((i) => i._done);
              const doneCount = order.items.filter((i) => i._done).length;
              const progress  = Math.round((doneCount / order.items.length) * 100);
              const urgency   = urgencyClass(order.createdAt);
              const isNew     = newOrderIds.has(order.id);

              return (
                <div
                  key={order.id}
                  className={[
                    'flex flex-col rounded-2xl border transition-all duration-300',
                    surface,
                    allDone ? urgency.ring + ' shadow-lg' : urgency.ring + ' shadow-sm',
                    isNew ? 'ring-2 ring-orange-500 ring-offset-2 scale-[1.02] shadow-xl shadow-orange-500/25' : '',
                  ].join(' ')}
                >
                  {isNew && (
                    <div className="flex items-center justify-center gap-2 rounded-t-2xl bg-orange-500 py-1.5 text-[10px] font-black uppercase tracking-[.2em] text-white animate-pulse">
                      🔔 Nueva orden
                    </div>
                  )}

                  {/* Cabecera */}
                  <div className={`flex items-center justify-between border-b px-5 py-4 ${borderB}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 shadow-md shadow-orange-500/25">
                        <span className="text-sm font-black text-white">{order.id_mesa ?? '—'}</span>
                      </div>
                      <div>
                        <p className={`text-sm font-black ${heading}`}>Mesa {order.id_mesa}</p>
                        <p className={`text-[10px] font-medium ${muted}`}>Orden #{order.id}</p>
                      </div>
                    </div>
                    <div className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-black tabular-nums ${urgency.badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${urgency.dot}`} />
                      {elapsed(order.createdAt)}
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className={`h-1 w-full ${darkMode ? 'bg-white/[.05]' : 'bg-slate-100'}`}>
                    <div
                      className="h-full bg-orange-500 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {/* Items */}
                  <div className="flex-1 space-y-2 p-4">
                    {order.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleItemDone(order.id, item.id)}
                        className={[
                          'group w-full rounded-xl border px-4 py-3 text-left',
                          'transition-all duration-200 hover:-translate-y-px active:scale-[.98]',
                          item._done
                            ? darkMode
                              ? 'border-emerald-500/30 bg-emerald-500/[.08]'
                              : 'border-emerald-200 bg-emerald-50'
                            : darkMode
                              ? `border-white/[.07] bg-white/[.03] hover:border-orange-500/20 ${surface2}`
                              : 'border-slate-100 bg-slate-50 hover:border-orange-200 hover:bg-orange-50/40',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={[
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-black',
                              item._done
                                ? 'bg-emerald-500 text-white'
                                : darkMode ? 'bg-white/[.10] text-slate-400' : 'bg-slate-200 text-slate-500',
                            ].join(' ')}>
                              {item._done ? '✓' : item.cantidad}
                            </span>
                            <span className={[
                              'truncate text-sm font-bold',
                              item._done
                                ? darkMode ? 'text-emerald-400 line-through' : 'text-emerald-600 line-through'
                                : heading,
                            ].join(' ')}>
                              {item.cantidad > 1 && !item._done ? `${item.cantidad}× ` : ''}{item.producto?.nombre}
                            </span>
                          </div>
                          {item._done && (
                            <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest ${darkMode ? 'text-emerald-500' : 'text-emerald-600'}`}>
                              Listo
                            </span>
                          )}
                        </div>
                        {item.notas_preparacion && (
                          <p className={`mt-1.5 pl-9 text-[11px] ${item._done ? (darkMode ? 'text-emerald-500/60' : 'text-emerald-500/70') : muted}`}>
                            {item.notas_preparacion}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className={`border-t px-4 pb-4 pt-3 ${borderB}`}>
                    <div className={`mb-3 flex items-center justify-between text-[10px] font-bold ${muted}`}>
                      <span>{doneCount}/{order.items.length} platos listos</span>
                      <span>{progress}%</span>
                    </div>
                    <button
                      type="button"
                      disabled={!allDone}
                      onClick={() => handleOrderComplete(order.id)}
                      className={[
                        'w-full rounded-xl py-3 text-sm font-bold transition-all duration-200',
                        allDone
                          ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20 hover:bg-orange-400 hover:-translate-y-px active:scale-[.98]'
                          : 'cursor-not-allowed opacity-40 ' + (darkMode ? 'bg-white/[.06] text-slate-400' : 'bg-slate-100 text-slate-400'),
                      ].join(' ')}
                    >
                      {allDone ? '🚀 Confirmar orden lista' : 'Completa todos los platos'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

export default CocinaDashboard;