import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE from '../config.js';
import { getCategoryIcon } from '../utils/menuIcons';
import { clearStoredSession, getStoredToken, getStoredUser } from '../utils/session';

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function MeseroDashboard() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const token = getStoredToken();

  // ── DARK MODE ──────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('adminDarkMode') === 'true');
  useEffect(() => { localStorage.setItem('adminDarkMode', darkMode); }, [darkMode]);
  // ──────────────────────────────────────────────────────────────────────────

  const [view, setView] = useState('mesas');
  const [tables, setTables] = useState([]);
  const [currentTable, setCurrentTable] = useState(null);
  const [existingOrder, setExistingOrder] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null); // null | 'ok' | 'error'

  const loadTables = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/tables`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setTables(await response.json());
    }
  }, [token]);

  const loadExistingOrder = useCallback(async (tableId) => {
    const response = await fetch(`${API_BASE}/api/orders/mesa/${tableId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setExistingOrder(await response.json());
      return;
    }
    setExistingOrder(null);
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [categoriesResponse, productsResponse] = await Promise.all([
          fetch(`${API_BASE}/api/menu/categories`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE}/api/menu/products`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (!cancelled && categoriesResponse.ok) {
          const categoriesData = await categoriesResponse.json();
          setCategories(categoriesData);
          if (categoriesData.length > 0)
            setActiveCategory((current) => current ?? categoriesData[0].id);
        }
        if (!cancelled && productsResponse.ok)
          setProducts(await productsResponse.json());
      } catch (error) {
        console.error('Waiter menu effect error:', error);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/tables`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && response.ok) setTables(await response.json());
      } catch (error) {
        console.error('Waiter tables effect error:', error);
      }
    };
    run();
    const interval = window.setInterval(() => { if (view === 'mesas') run(); }, 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [token, view]);

  const handleLogout = () => { clearStoredSession(); navigate('/'); };

  const handleTableSelect = async (table) => {
    setCurrentTable(table);
    setView('pos');
    setCart([]);
    if (table.estado === 'OCUPADA' || table.estado === 'COBRANDO' || table.estado === 'POR_PAGAR') {
      await loadExistingOrder(table.id);
    } else {
      setExistingOrder(null);
    }
  };

  const addToCart = (product) => {
    const nextSeatBase = cart.filter((item) => item.id_producto === product.id).length + 1;
    const capacity = currentTable?.capacidad || 4;
    const suggestedSeat = nextSeatBase > capacity ? 99 : nextSeatBase;
    setCart((current) => [
      ...current,
      {
        uid: crypto.randomUUID(),
        id_producto: product.id,
        nombre: product.nombre,
        precio: product.precio,
        cantidad: 1,
        notas: '',
        comensal: suggestedSeat,
      },
    ]);
  };

  const updateCartItem = (uid, updater) => {
    setCart((current) =>
      current.map((item) => (item.uid === uid ? { ...item, ...updater(item) } : item))
    );
  };

  const removeCartItem = (uid) => {
    setCart((current) => current.filter((item) => item.uid !== uid));
  };

  const sendOrderToKitchen = async () => {
    if (!currentTable || cart.length === 0) return;

    setSending(true);
    setSendResult(null);

    try {
      if (currentTable.estado === 'LIBRE') {
        await fetch(`${API_BASE}/api/tables/${currentTable.id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ estado: 'OCUPADA' }),
        });
      }

      const response = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tipo_pedido: 'LOCAL',
          id_mesa: currentTable.id,
          items: cart.map((item) => ({
            id_producto: item.id_producto,
            cantidad: item.cantidad,
            notas_preparacion: `[${item.comensal === 99 ? 'Centro' : `Asiento ${item.comensal}`}] ${item.notas || ''}`.trim(),
          })),
        }),
      });

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          errorMsg = errBody?.message || errBody?.error || JSON.stringify(errBody);
        } catch (_) {}
        console.error('sendOrderToKitchen error:', errorMsg);
        setSendResult('error');
        return;
      }

      setSendResult('ok');
      setCart([]);
      await Promise.all([loadTables(), loadExistingOrder(currentTable.id)]);
      setTimeout(() => setSendResult(null), 2500);
    } catch (error) {
      console.error('Send order error:', error);
      setSendResult('error');
    } finally {
      setSending(false);
    }
  };

  const requestBill = async () => {
    if (!currentTable) return;
    try {
      const response = await fetch(`${API_BASE}/api/tables/${currentTable.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado: 'POR_PAGAR' }),
      });
      if (response.ok) {
        setView('mesas');
        setCurrentTable(null);
        setExistingOrder(null);
        setCart([]);
        await loadTables();
      }
    } catch (error) {
      console.error('Request bill error:', error);
    }
  };

  const filteredProducts = products
    .filter((p) => p.disponible !== false)
    .filter((p) => activeCategory === null || p.id_categoria === activeCategory)
    .filter((p) => !searchQuery || p.nombre.toLowerCase().includes(searchQuery.toLowerCase()));

  const existingTotal = existingOrder?.total || 0;
  const newItemsTotal = cart.reduce((total, item) => total + item.precio * item.cantidad, 0);
  const totalToCharge = existingTotal + newItemsTotal;

  // ── Design tokens (mismo sistema que CajeroDashboard) ─────────────────────
  const bg      = darkMode ? 'bg-[#0d0f18]'       : 'bg-slate-50';
  const surface = darkMode ? 'bg-[#161922]'       : 'bg-white';
  const surface2= darkMode ? 'bg-[#1e2132]'       : 'bg-slate-50';
  const border  = darkMode ? 'border-white/[.07]' : 'border-slate-200';
  const muted   = darkMode ? 'text-slate-400'     : 'text-slate-500';
  const heading = darkMode ? 'text-slate-100'     : 'text-slate-900';
  const borderB = darkMode ? 'border-white/[.06]' : 'border-slate-100';

  const card = `rounded-2xl border shadow-sm ${surface} ${border}`;

  const inputCls = [
    'w-full rounded-xl border px-4 py-2.5 text-sm font-medium outline-none',
    'transition-all duration-200',
    'focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500',
    darkMode
      ? 'border-white/[.08] bg-white/[.04] text-slate-100 placeholder-slate-500 hover:border-white/20'
      : 'border-slate-200 bg-white text-slate-800 placeholder-slate-400 hover:border-slate-300',
  ].join(' ');

  const selectCls = [
    'rounded-xl border px-3 py-2 text-sm font-medium outline-none',
    'transition-all duration-200',
    'focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500',
    darkMode
      ? 'border-white/[.08] bg-[#161922] text-slate-100 hover:border-white/20'
      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
  ].join(' ');

  const btnGhost = [
    'rounded-xl px-4 py-2.5 text-sm font-bold',
    'transition-all duration-200 active:scale-[.98]',
    darkMode
      ? 'bg-white/[.06] text-slate-300 hover:bg-white/[.10]'
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  ].join(' ');

  const sendBtnLabel = () => {
    if (sending)                return '⏳ Enviando...';
    if (sendResult === 'ok')    return '✅ ¡Enviado a cocina!';
    if (sendResult === 'error') return '❌ Sin conexión con cocina';
    return existingOrder ? 'Anexar a la orden' : 'Enviar a cocina';
  };

  const sendBtnCls = [
    'mt-4 w-full rounded-xl py-3.5 text-sm font-bold transition-all duration-200',
    'hover:-translate-y-px active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40',
    sendResult === 'ok'
      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
      : sendResult === 'error'
        ? 'bg-red-500 text-white shadow-md shadow-red-500/20'
        : 'bg-orange-500 text-white shadow-md shadow-orange-500/20 hover:bg-orange-400',
  ].join(' ');
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen transition-colors duration-300 ${bg} ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 lg:px-8">

        {/* TOPBAR */}
        <header className={`flex flex-col gap-4 rounded-2xl border p-4 lg:flex-row lg:items-center lg:justify-between ${surface} ${border}`}>
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 shadow-lg shadow-orange-500/30 text-xl">
              🍽️
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.25em] text-orange-500">Módulo Mesero</p>
              <h1 className={`text-lg font-black leading-none ${heading}`}>MGR</h1>
              <p className={`text-[11px] font-medium ${muted}`}>{user?.nombre || 'Servicio'}</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5">
            {[
              ['mesas',       '🪑', 'Mesas'],
              ['mis_ordenes', '📋', 'Mi turno'],
            ].map(([value, icon, label]) => (
              <button
                key={value}
                onClick={() => { setView(value); if (value !== 'pos') setCurrentTable(null); }}
                className={[
                  'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition-all duration-200',
                  view === value
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                    : darkMode
                      ? 'bg-white/[.05] text-slate-400 hover:bg-white/[.09] hover:text-slate-200'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700',
                ].join(' ')}
              >
                <span className="text-xs leading-none">{icon}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}

            <button
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className={[
                'rounded-xl px-3 py-2 text-sm font-bold transition-all duration-200',
                darkMode
                  ? 'bg-amber-400/[.12] text-amber-400 hover:bg-amber-400/[.22]'
                  : 'bg-slate-800/[.07] text-slate-600 hover:bg-slate-800/[.13]',
              ].join(' ')}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>

            <button
              onClick={handleLogout}
              className="rounded-xl px-3.5 py-2 text-sm font-bold bg-white/[.05] text-slate-400 transition-all duration-200 hover:bg-red-500/[.12] hover:text-red-400"
            >
              Salir
            </button>
          </nav>
        </header>

        {/* VIEW: MESAS */}
        {view === 'mesas' && (
          <section className={`${card} p-5`}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className={`text-sm font-black uppercase tracking-wider ${heading}`}>Mapa de Mesas</h2>
              <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'bg-white/[.06] text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                {tables.length} mesas
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {tables.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => handleTableSelect(table)}
                  className={[
                    'relative flex flex-col items-center justify-center overflow-hidden rounded-xl border p-8',
                    'transition-all duration-200 hover:-translate-y-0.5 active:scale-95',
                    table.estado === 'LIBRE'
                      ? darkMode
                        ? 'border-white/[.07] bg-white/[.03] hover:border-orange-500/30 hover:shadow-lg hover:shadow-orange-950/40'
                        : 'border-slate-200 bg-white hover:border-orange-300 hover:shadow-lg hover:shadow-orange-100'
                      : table.estado === 'POR_PAGAR'
                        ? 'border-transparent bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-xl shadow-violet-900/40 animate-pulse'
                        : table.estado === 'COBRANDO'
                          ? 'border-transparent bg-gradient-to-br from-sky-600 to-indigo-600 shadow-xl shadow-sky-900/40'
                          : 'border-transparent bg-gradient-to-br from-orange-500 to-amber-500 shadow-xl shadow-orange-900/30',
                  ].join(' ')}
                >
                  <p className={`text-6xl font-black tabular-nums ${table.estado === 'LIBRE' ? 'text-orange-500' : 'text-white'}`}>
                    {table.numero_mesa}
                  </p>
                  <p className={`mt-2 text-[9px] font-black uppercase tracking-widest ${table.estado === 'LIBRE' ? muted : 'text-white/70'}`}>
                    {table.estado}
                  </p>
                  <div className={`absolute right-3 top-3 rounded-md px-2 py-0.5 text-[9px] font-black ${table.estado === 'LIBRE' ? darkMode ? 'bg-white/[.08] text-slate-400' : 'bg-slate-100 text-slate-500' : 'bg-black/20 text-white/80 backdrop-blur-sm'}`}>
                    {table.capacidad} pax
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* VIEW: POS */}
        {view === 'pos' && currentTable && (
          <section className="grid gap-4 lg:grid-cols-[1fr_360px]">

            {/* Panel de productos */}
            <div className={`${card} p-5`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[.25em] text-orange-500">Mesa {currentTable.numero_mesa}</p>
                  <h2 className={`text-2xl font-black ${heading}`}>Tomar pedido</h2>
                </div>

                <div className="flex w-full flex-wrap gap-1.5 overflow-x-auto pb-1 lg:w-auto lg:pb-0 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveCategory(null)}
                    className={[
                      'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold whitespace-nowrap transition-all duration-200',
                      activeCategory === null
                        ? darkMode
                          ? 'bg-slate-100 text-slate-900 shadow-md -translate-y-px'
                          : 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 -translate-y-px'
                        : darkMode
                          ? 'bg-white/[.06] text-slate-400 hover:bg-white/[.10] hover:text-slate-200'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm',
                    ].join(' ')}
                  >
                    Todos
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setActiveCategory(category.id)}
                      className={[
                        'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold whitespace-nowrap transition-all duration-200',
                        activeCategory === category.id
                          ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25 -translate-y-px'
                          : darkMode
                            ? 'bg-white/[.06] text-slate-400 hover:bg-white/[.10] hover:text-slate-200'
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-orange-300 shadow-sm',
                      ].join(' ')}
                    >
                      <span className="text-base leading-none">{getCategoryIcon(category.nombre)}</span>
                      {category.nombre}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative mt-5 max-w-sm">
                <span className={`absolute inset-y-0 left-4 flex items-center ${muted}`}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </span>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar platillo..."
                  className={`${inputCls} pl-11`}
                />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    className={[
                      'group flex flex-col overflow-hidden rounded-xl border text-left',
                      'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
                      darkMode
                        ? 'border-white/[.07] bg-white/[.03] hover:border-orange-500/30 hover:shadow-orange-950/40'
                        : 'border-slate-100 bg-white hover:border-orange-200 hover:shadow-orange-100',
                    ].join(' ')}
                  >
                    <div className={`relative h-28 w-full shrink-0 overflow-hidden ${darkMode ? 'bg-white/[.05]' : 'bg-slate-100'}`}>
                      {product.imagen ? (
                        <img src={product.imagen} alt={product.nombre} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-3xl opacity-20">🍲</div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col justify-between p-3.5">
                      <p className={`text-sm font-black leading-snug group-hover:text-orange-500 ${heading}`}>{product.nombre}</p>
                      <p className={`mt-0.5 text-[9px] font-black uppercase tracking-widest ${muted}`}>{product.categoria?.nombre}</p>
                      <p className="mt-2 text-lg font-black text-orange-500">{formatMoney(product.precio)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Comanda sidebar */}
            <aside className={`${card} flex flex-col p-5`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-base font-black uppercase tracking-wider ${heading}`}>Comanda</h3>
                <button
                  type="button"
                  onClick={() => { setView('mesas'); setCurrentTable(null); setExistingOrder(null); setCart([]); }}
                  className={btnGhost}
                >
                  Volver
                </button>
              </div>

              {existingOrder && (
                <div className={`mt-5 rounded-xl border p-4 ${surface2} ${borderB}`}>
                  <p className={`text-[9px] font-black uppercase tracking-[.25em] ${muted}`}>Consumo actual</p>
                  <div className="mt-3 space-y-1.5">
                    {existingOrder.items.map((item) => (
                      <div key={item.id} className={`rounded-lg border px-3.5 py-2.5 ${surface} ${borderB}`}>
                        <p className={`text-sm font-bold ${heading}`}>{item.cantidad}× {item.producto?.nombre}</p>
                        {item.notas_preparacion && <p className={`text-xs ${muted}`}>{item.notas_preparacion}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 flex-1 space-y-2 overflow-y-auto">
                {cart.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <span className="text-4xl opacity-20">📝</span>
                    <p className={`mt-3 text-xs font-bold ${muted}`}>Aún no agregas productos nuevos.</p>
                  </div>
                )}
                {cart.map((item) => (
                  <div key={item.uid} className={`group relative overflow-hidden rounded-xl border p-3.5 transition-all duration-200 hover:border-orange-500/20 ${surface2} ${border}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className={`text-sm font-bold ${heading}`}>{item.nombre}</p>
                        <p className="text-xs font-bold text-orange-500">{formatMoney(item.precio)} <span className={`text-[10px] font-normal ${muted}`}>c/u</span></p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCartItem(item.uid)}
                        className="rounded-lg bg-red-500/10 p-1.5 text-red-500 opacity-0 transition-all duration-150 group-hover:opacity-100 hover:bg-red-500/20"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className={`flex items-center rounded-lg p-1 ${darkMode ? 'bg-white/[.06]' : 'bg-slate-200/50'}`}>
                        <button
                          type="button"
                          onClick={() => updateCartItem(item.uid, (c) => ({ cantidad: Math.max(1, c.cantidad - 1) }))}
                          className={`flex h-7 w-7 items-center justify-center rounded-md font-bold transition-colors ${darkMode ? 'bg-white/[.08] text-slate-300 hover:text-orange-400' : 'bg-white text-slate-600 shadow-sm hover:text-orange-500'}`}
                        >−</button>
                        <span className={`w-9 text-center text-sm font-black ${heading}`}>{item.cantidad}</span>
                        <button
                          type="button"
                          onClick={() => updateCartItem(item.uid, (c) => ({ cantidad: c.cantidad + 1 }))}
                          className={`flex h-7 w-7 items-center justify-center rounded-md font-bold transition-colors ${darkMode ? 'bg-white/[.08] text-slate-300 hover:text-orange-400' : 'bg-white text-slate-600 shadow-sm hover:text-orange-500'}`}
                        >+</button>
                      </div>

                      <select
                        value={item.comensal}
                        onChange={(e) => updateCartItem(item.uid, () => ({ comensal: Number(e.target.value) }))}
                        className={`flex-1 ${selectCls}`}
                      >
                        {Array.from({ length: (currentTable.capacidad || 4) + 1 }).map((_, i) => (
                          <option key={i + 1} value={i + 1}>Asiento {i + 1}</option>
                        ))}
                        <option value={99}>Centro</option>
                      </select>
                    </div>

                    <div className="mt-2.5">
                      <input
                        value={item.notas}
                        onChange={(e) => updateCartItem(item.uid, () => ({ notas: e.target.value }))}
                        placeholder="Nota de cocina (opcional)"
                        className={`w-full rounded-lg border px-3 py-1.5 text-xs outline-none transition-all duration-200 focus:ring-1 focus:ring-orange-500/30 focus:border-orange-500 ${darkMode ? 'border-white/[.08] bg-white/[.04] text-slate-300 placeholder-slate-600' : 'border-slate-200 bg-white text-slate-700 placeholder-slate-400'}`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Totales + acciones */}
              <div className={`mt-4 border-t pt-4 ${borderB}`}>
                {existingOrder && (
                  <div className={`flex items-center justify-between text-xs ${muted}`}>
                    <span>Consumo actual</span>
                    <span className="font-bold">{formatMoney(existingTotal)}</span>
                  </div>
                )}
                <div className={`mt-1.5 flex items-center justify-between text-xs ${muted}`}>
                  <span>Nuevos items</span>
                  <span className="font-bold">{formatMoney(newItemsTotal)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>Total mesa</span>
                  <span className="text-3xl font-black tabular-nums text-orange-500">{formatMoney(totalToCharge)}</span>
                </div>

                <button
                  type="button"
                  onClick={sendOrderToKitchen}
                  disabled={cart.length === 0 || sending}
                  className={sendBtnCls}
                >
                  {sendBtnLabel()}
                </button>

                {existingOrder && cart.length === 0 && currentTable.estado !== 'POR_PAGAR' && (
                  <button
                    type="button"
                    onClick={requestBill}
                    className={`mt-2 w-full rounded-xl py-3.5 text-sm font-bold transition-all duration-200 hover:-translate-y-px active:scale-[.98] ${darkMode ? 'bg-white/[.08] text-slate-200 hover:bg-white/[.14]' : 'bg-slate-900 text-white hover:bg-slate-700'}`}
                  >
                    Solicitar cuenta
                  </button>
                )}
              </div>
            </aside>
          </section>
        )}

        {/* VIEW: MI TURNO */}
        {view === 'mis_ordenes' && (
          <section className={`${card} p-5`}>
            <h2 className={`mb-5 text-lg font-black ${heading}`}>Estado del turno</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div className={`relative overflow-hidden rounded-xl border p-6 ${darkMode ? 'border-orange-500/20 bg-orange-500/[.06]' : 'bg-orange-50 border-orange-100'}`}>
                <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-orange-500/10 blur-2xl" />
                <p className="text-[9px] font-black uppercase tracking-[.25em] text-orange-500">Mesas activas</p>
                <p className="mt-3 text-5xl font-black tabular-nums text-orange-500">
                  {tables.filter((t) => t.estado !== 'LIBRE').length}
                </p>
              </div>
              <div className={`rounded-xl border p-6 ${surface2} ${border}`}>
                <p className={`text-[9px] font-black uppercase tracking-[.25em] ${muted}`}>Mesas libres</p>
                <p className={`mt-3 text-5xl font-black tabular-nums ${heading}`}>
                  {tables.filter((t) => t.estado === 'LIBRE').length}
                </p>
              </div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

export default MeseroDashboard;