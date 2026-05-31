import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE from '../config.js';
import { getCategoryIcon } from '../utils/menuIcons';
import { clearStoredSession, getStoredToken, getStoredUser } from '../utils/session';

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function parseCustomer(rawCustomer) {
  try {
    return JSON.parse(rawCustomer || '{}');
  } catch {
    return {};
  }
}

function groupOrderItemsBySeat(order) {
  if (!order) return [];

  const groups = order.items.reduce((acc, item) => {
    const note = item.notas_preparacion || '';
    const match = note.match(/^\[(.*?)\]/);
    const seat = match ? match[1] : 'Cuenta general';
    const cleanNote = match ? note.replace(match[0], '').trim() : note.trim();

    if (!acc[seat]) {
      acc[seat] = { seat, subtotal: 0, items: [] };
    }

    acc[seat].subtotal += item.precio_unitario * item.cantidad;
    acc[seat].items.push({ ...item, cleanNote });
    return acc;
  }, {});

  return Object.values(groups);
}

function CajeroDashboard() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const token = getStoredToken();

  // ── DARK MODE ──────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('adminDarkMode') === 'true');

  useEffect(() => {
    localStorage.setItem('adminDarkMode', darkMode);
  }, [darkMode]);
  // ──────────────────────────────────────────────────────────────────────────

  const [view, setView] = useState('mesas');
  const [tables, setTables] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [report, setReport] = useState({ resumenDiario: { totalFacturado: 0 } });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [previousTableState, setPreviousTableState] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  const [referencia, setReferencia] = useState('');

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [deliveryNombre, setDeliveryNombre] = useState('');
  const [deliveryTelefono, setDeliveryTelefono] = useState('');
  const [deliveryDireccion, setDeliveryDireccion] = useState('');

  // Shift Management State
  const [isShiftOpen, setIsShiftOpen] = useState(true);
  const [fondoInput, setFondoInput] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [countedCashInput, setCountedCashInput] = useState('');
  
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movementForm, setMovementForm] = useState({ tipo: 'EGRESO', monto: '', motivo: '' });

  const checkActiveShift = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/reports/check-open-shift`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setIsShiftOpen(data.hasOpenShift);
      }
    } catch(e) {
      console.error('Error checking shift:', e);
    }
  }, [token]);

  const handleOpenShift = async (e) => {
    e.preventDefault();
    if (!fondoInput || isNaN(fondoInput)) return alert('Ingrese un monto válido');
    
    try {
      const resp = await fetch(`${API_BASE}/api/reports/open-shift`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fondo_inicial: parseFloat(fondoInput) })
      });
      if (resp.ok) {
        setIsShiftOpen(true);
        loadReport();
      } else {
        const data = await resp.json();
        alert(data.error);
      }
    } catch(e) {
      alert('Error de conexión.');
    }
  };

  const handleCashMovement = async (e) => {
    e.preventDefault();
    if (!movementForm.monto || !movementForm.motivo) return alert('Completa todos los campos');
    
    try {
      const resp = await fetch(`${API_BASE}/api/reports/cash-movement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(movementForm)
      });
      if (resp.ok) {
        setShowMovementModal(false);
        setMovementForm({ tipo: 'EGRESO', monto: '', motivo: '' });
        loadReport(); // Refresh data
      } else {
        alert('No se pudo registrar.');
      }
    } catch(e) {
      alert('Error de red');
    }
  };

  const loadTables = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/tables`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setTables(await response.json());
    }
  }, [token]);

  const loadDeliveries = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/orders/delivery`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setDeliveries(await response.json());
    }
  }, [token]);

  const loadReport = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/reports/current-shift`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      setReport(await response.json());
    }
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
          if (categoriesData.length > 0) {
            setActiveCategory((current) => current ?? categoriesData[0].id);
          }
        }

        if (!cancelled && productsResponse.ok) {
          setProducts(await productsResponse.json());
        }
      } catch (error) {
        console.error('Cashier menu effect error:', error);
      }
    };

    checkActiveShift();
    run();

    return () => {
      cancelled = true;
    };
  }, [token, checkActiveShift]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        if (view === 'mesas') {
          const response = await fetch(`${API_BASE}/api/tables`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!cancelled && response.ok) {
            setTables(await response.json());
          }
          return;
        }

        if (view === 'delivery') {
          const response = await fetch(`${API_BASE}/api/orders/delivery`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!cancelled && response.ok) {
            setDeliveries(await response.json());
          }
          return;
        }

        if (view === 'cierre') {
          const response = await fetch(`${API_BASE}/api/reports/current-shift`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!cancelled && response.ok) {
            setReport(await response.json());
          }
        }
      } catch (error) {
        console.error('Cashier refresh effect error:', error);
      }
    };

    run();
    const interval = window.setInterval(run, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token, view]);

  const handleLogout = () => {
    clearStoredSession();
    navigate('/');
  };

  const addToCart = (product) => {
    setCart((current) => [
      ...current,
      {
        uid: crypto.randomUUID(),
        id_producto: product.id,
        nombre: product.nombre,
        precio: product.precio,
        cantidad: 1,
        notas: '',
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

  const sendDeliveryOrder = async () => {
    if (!deliveryNombre.trim() || !deliveryTelefono.trim() || cart.length === 0) {
      alert('Completa los datos obligatorios del domicilio.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tipo_pedido: 'DOMICILIO',
          datos_cliente: {
            nombre: deliveryNombre.trim(),
            telefono: deliveryTelefono.trim(),
            direccion: deliveryDireccion.trim(),
          },
          items: cart.map((item) => ({
            id_producto: item.id_producto,
            cantidad: item.cantidad,
            notas_preparacion: item.notas,
          })),
        }),
      });

      if (!response.ok) {
        alert('No se pudo registrar el domicilio.');
        return;
      }

      setCart([]);
      setDeliveryNombre('');
      setDeliveryTelefono('');
      setDeliveryDireccion('');
      setView('delivery');
      await loadDeliveries();
    } catch (error) {
      console.error('Create delivery order error:', error);
      alert('Fallo de conexion');
    }
  };

  const openTableAccount = async (table) => {
    if (table.estado === 'LIBRE') return;

    try {
      setPreviousTableState(table.estado);

      await fetch(`${API_BASE}/api/tables/${table.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ estado: 'COBRANDO' }),
      });

      const response = await fetch(`${API_BASE}/api/orders/mesa/${table.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        alert('No se encontro una orden abierta para esa mesa.');
        await loadTables();
        return;
      }

      setSelectedOrder(await response.json());
      setPaymentMethod('EFECTIVO');
      setReferencia('');
      await loadTables();
    } catch (error) {
      console.error('Open table account error:', error);
    }
  };

  const closePaymentModal = async () => {
    if (selectedOrder?.id_mesa && selectedOrder.tipo_pedido === 'LOCAL' && previousTableState) {
      await fetch(`${API_BASE}/api/tables/${selectedOrder.id_mesa}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ estado: previousTableState }),
      }).catch((error) => console.error('Restore table state error:', error));

      await loadTables();
    }

    setSelectedOrder(null);
    setReferencia('');
    setPreviousTableState(null);
  };

  const processPayment = async () => {
    if (!selectedOrder) return;

    try {
      const response = await fetch(`${API_BASE}/api/orders/${selectedOrder.id}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          metodo_pago: paymentMethod,
          monto_pagado: selectedOrder.total,
          referencia: paymentMethod === 'TRANSFERENCIA' ? referencia.trim() : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'No se pudo registrar el pago.');
        return;
      }

      setSelectedOrder(null);
      setReferencia('');
      await Promise.all([loadTables(), loadDeliveries(), loadReport()]);
    } catch (error) {
      console.error('Process payment error:', error);
    }
  };

  const voidItem = async (itemId) => {
    const motivo = window.prompt('¿Cuál es el motivo para anular este plato? (Ej. Error de cocina, Cliente arrepentido, etc.)');
    if (!motivo || motivo.trim() === '') return;

    try {
      const response = await fetch(`${API_BASE}/api/orders/${selectedOrder.id}/void-item/${itemId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || 'No se pudo anular el plato.');
        return;
      }
      
      const orderResp = await fetch(`${API_BASE}/api/orders/mesa/${selectedOrder.id_mesa}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (orderResp.ok) {
        setSelectedOrder(await orderResp.json());
      } else {
        closePaymentModal();
      }
    } catch (error) {
      console.error('Void item error:', error);
      alert('Error de conexión.');
    }
  };

  const voidOrder = async () => {
    const motivo = window.prompt('¿Cuál es el motivo para anular TODA la cuenta? (Ej. Cliente se fue sin pagar, Error de sistema)');
    if (!motivo || motivo.trim() === '') return;

    if (!window.confirm('¿Estás seguro de que deseas anular y cerrar esta orden por completo?')) return;

    try {
      const response = await fetch(`${API_BASE}/api/orders/${selectedOrder.id}/void`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ motivo: motivo.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error || 'No se pudo anular la orden.');
        return;
      }

      setSelectedOrder(null);
      setReferencia('');
      setPreviousTableState(null);
      await loadTables();
    } catch (error) {
      console.error('Void order error:', error);
      alert('Error de conexión.');
    }
  };

  const executeClose = () => {
    setShowCloseModal(true);
  };

  const confirmCloseShift = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/api/reports/cierre`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ efectivo_contado: countedCashInput || null })
      });

      if (response.ok) {
        handleLogout();
      } else {
        const err = await response.json();
        alert(err.error || 'Error al cerrar caja');
      }
    } catch (error) {
      console.error('Close register error:', error);
      alert('Error de conexión');
    }
  };

  const filteredProducts = products
    .filter((product) => product.disponible !== false)
    .filter((product) => activeCategory === null || product.id_categoria === activeCategory)
    .filter((product) => !searchQuery || product.nombre.toLowerCase().includes(searchQuery.toLowerCase()));

  const cartTotal = cart.reduce((total, item) => total + item.precio * item.cantidad, 0);
  const groupedItems = groupOrderItemsBySeat(selectedOrder);
  const selectedOrderCustomer = parseCustomer(selectedOrder?.datos_cliente);

  const pagos = report.pagos || [];
  const voids = report.voidRecords || [];
  const totalEfectivo = pagos.filter(p => p.metodo_pago === 'EFECTIVO').reduce((acc, p) => acc + p.monto_pagado, 0);
  const totalTarjeta = pagos.filter(p => p.metodo_pago === 'TARJETA').reduce((acc, p) => acc + p.monto_pagado, 0);
  const totalTransferencia = pagos.filter(p => p.metodo_pago === 'TRANSFERENCIA').reduce((acc, p) => acc + p.monto_pagado, 0);

  // ── Design tokens (mismo sistema que AdminDashboard) ──────────────────────
  const bg       = darkMode ? 'bg-[#0d0f18]'       : 'bg-slate-50';
  const surface  = darkMode ? 'bg-[#161922]'       : 'bg-white';
  const surface2 = darkMode ? 'bg-[#1e2132]'       : 'bg-slate-50';
  const border   = darkMode ? 'border-white/[.07]' : 'border-slate-200';
  const muted    = darkMode ? 'text-slate-400'     : 'text-slate-500';
  const heading  = darkMode ? 'text-slate-100'     : 'text-slate-900';
  const subh     = darkMode ? 'text-slate-300'     : 'text-slate-700';
  const divider  = darkMode ? 'divide-white/[.06]' : 'divide-slate-100';
  const borderB  = darkMode ? 'border-white/[.06]' : 'border-slate-100';
  const rowHover = darkMode ? 'hover:bg-white/[.03]' : 'hover:bg-slate-50';

  const card = `rounded-2xl border shadow-sm ${surface} ${border}`;

  const inputCls = [
    'w-full rounded-xl border px-4 py-2.5 text-sm font-medium outline-none',
    'transition-all duration-200',
    'focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500',
    darkMode
      ? 'border-white/[.08] bg-white/[.04] text-slate-100 placeholder-slate-500 hover:border-white/20'
      : 'border-slate-200 bg-white text-slate-800 placeholder-slate-400 hover:border-slate-300',
  ].join(' ');

  const inputLgCls = [
    'w-full rounded-xl border-2 px-5 py-4 text-2xl font-black outline-none',
    'transition-all duration-200',
    darkMode
      ? 'border-white/[.08] bg-white/[.04] text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:bg-white/[.07]'
      : 'border-slate-200 bg-white text-slate-800 placeholder-slate-300 focus:border-sky-500',
  ].join(' ');

  const selectCls = [
    'w-full rounded-xl border px-4 py-2.5 text-sm font-medium outline-none',
    'transition-all duration-200',
    'focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500',
    darkMode
      ? 'border-white/[.08] bg-[#161922] text-slate-100 hover:border-white/20'
      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300',
  ].join(' ');

  const btnPrimary = [
    'rounded-xl px-4 py-2.5 text-sm font-bold text-white',
    'bg-sky-600 shadow-md shadow-sky-600/20',
    'transition-all duration-200 hover:bg-sky-500 hover:-translate-y-px',
    'active:scale-[.98] active:translate-y-0',
  ].join(' ');

  const btnDark = [
    'rounded-xl px-4 py-2.5 text-sm font-bold',
    'transition-all duration-200 hover:-translate-y-px active:scale-[.98]',
    darkMode
      ? 'bg-[#0d0f18] border border-white/[.10] text-white hover:bg-white/[.06]'
      : 'bg-slate-900 text-white hover:bg-slate-700',
  ].join(' ');

  const btnGhost = [
    'rounded-xl px-4 py-2.5 text-sm font-bold',
    'transition-all duration-200 active:scale-[.98]',
    darkMode
      ? 'bg-white/[.06] text-slate-300 hover:bg-white/[.10]'
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  ].join(' ');
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen transition-colors duration-300 ${bg} ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 lg:px-8">

        {/* ── TOPBAR ── */}
        <header className={`flex flex-col gap-4 rounded-2xl border p-4 lg:flex-row lg:items-center lg:justify-between ${surface} ${border}`}>
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 shadow-lg shadow-sky-600/30 text-xl">
              📠
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.25em] text-sky-400">Módulo Caja</p>
              <h1 className={`text-lg font-black leading-none ${heading}`}>MGR</h1>
              <p className={`text-[11px] font-medium ${muted}`}>{user?.nombre || 'Caja'}</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1.5">
            {[
              ['mesas',           '🪑', 'Mesas'],
              ['delivery',        '🛵', 'Delivery'],
              ['nuevo_domicilio', '➕', 'Nuevo domicilio'],
              ['cierre',          '📊', 'Cierre'],
            ].map(([value, icon, label]) => (
              <button
                key={value}
                onClick={() => setView(value)}
                className={[
                  'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold',
                  'transition-all duration-200',
                  view === value
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-600/25'
                    : 'bg-white/[.05] text-slate-400 hover:bg-white/[.09] hover:text-slate-200',
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
                'rounded-xl px-3 py-2 text-sm font-bold',
                'transition-all duration-200',
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

        {/* ── VIEW: MESAS ── */}
        {view === 'mesas' && (
          <section className={`${card} p-5`}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className={`text-sm font-black uppercase tracking-wider ${heading}`}>Mapa de Mesas</h2>
              <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest bg-white/[.06] ${muted}`}>
                {tables.length} mesas
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {tables.map((table) => (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => openTableAccount(table)}
                  className={[
                    'relative flex flex-col items-center justify-center overflow-hidden rounded-xl border p-8',
                    'transition-all duration-200 hover:-translate-y-0.5 active:scale-95',
                    table.estado === 'LIBRE'
                      ? `border-white/[.07] bg-white/[.03] hover:border-sky-500/30 hover:shadow-lg hover:shadow-sky-950/40`
                      : table.estado === 'POR_PAGAR'
                        ? 'border-transparent bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-xl shadow-violet-900/40 animate-pulse'
                        : table.estado === 'COBRANDO'
                          ? 'border-transparent bg-gradient-to-br from-sky-600 to-indigo-600 shadow-xl shadow-sky-900/40'
                          : 'border-transparent bg-gradient-to-br from-orange-500 to-amber-500 shadow-xl shadow-orange-900/30',
                  ].join(' ')}
                >
                  <p className={`text-6xl font-black tabular-nums ${table.estado === 'LIBRE' ? 'text-sky-400' : 'text-white'}`}>
                    {table.numero_mesa}
                  </p>
                  <p className={`mt-2 text-[9px] font-black uppercase tracking-widest ${table.estado === 'LIBRE' ? muted : 'text-white/70'}`}>
                    {table.estado}
                  </p>
                  <div className={`absolute right-3 top-3 rounded-md px-2 py-0.5 text-[9px] font-black ${table.estado === 'LIBRE' ? 'bg-white/[.08] text-slate-400' : 'bg-black/20 text-white/80 backdrop-blur-sm'}`}>
                    {table.capacidad} pax
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── VIEW: DELIVERY ── */}
        {view === 'delivery' && (
          <section className={`${card} p-5`}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className={`text-lg font-black ${heading}`}>Pedidos a domicilio</h2>
              <span className={`rounded-lg px-2.5 py-1 text-xs font-bold bg-white/[.06] ${muted}`}>
                {deliveries.length} activos
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {deliveries.length === 0 && (
                <p className={`col-span-full py-10 text-center text-sm ${muted}`}>No hay domicilios pendientes.</p>
              )}
              {deliveries.map((order) => {
                const customer = parseCustomer(order.datos_cliente);
                return (
                  <div key={order.id} className={`flex flex-col rounded-xl border p-4 transition-all duration-200 hover:border-sky-500/30 ${surface2} ${border}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className={`font-black ${heading}`}>{customer.nombre || 'Sin nombre'}</p>
                        <p className={`text-xs ${muted}`}>{customer.telefono || 'Sin teléfono'}</p>
                        <p className={`text-xs ${muted}`}>{customer.direccion || 'Sin dirección'}</p>
                      </div>
                      <span className="rounded-lg bg-sky-500/15 px-3 py-1 text-xs font-black text-sky-400">
                        #{order.id}
                      </span>
                    </div>
                    <div className={`mt-4 space-y-1.5 border-t pt-4 ${borderB}`}>
                      {order.items.map((item) => (
                        <div key={item.id} className={`flex justify-between text-xs font-medium ${subh}`}>
                          <span>{item.cantidad}× {item.producto?.nombre}</span>
                          <span className="font-bold text-sky-400">{formatMoney(item.precio_unitario * item.cantidad)}</span>
                        </div>
                      ))}
                    </div>
                    <div className={`mt-4 flex items-center justify-between border-t pt-4 ${borderB}`}>
                      <span className={`text-xl font-black ${heading}`}>{formatMoney(order.total)}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        className={`${btnPrimary} px-5`}
                      >
                        Cobrar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── VIEW: NUEVO DOMICILIO ── */}
        {view === 'nuevo_domicilio' && (
          <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className={`${card} p-5`}>
              {/* Category tabs */}
              <div className="flex w-full flex-wrap gap-2 overflow-x-auto pb-2">
                <button
                  type="button"
                  onClick={() => setActiveCategory(null)}
                  className={[
                    'flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold whitespace-nowrap',
                    'transition-all duration-200',
                    activeCategory === null
                      ? 'bg-slate-100 text-slate-900 shadow-md shadow-white/10 -translate-y-px'
                      : `bg-white/[.06] ${muted} hover:bg-white/[.10] hover:text-slate-200`,
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
                      'flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold whitespace-nowrap',
                      'transition-all duration-200',
                      activeCategory === category.id
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-600/25 -translate-y-px'
                        : `bg-white/[.06] ${muted} hover:bg-white/[.10] hover:text-slate-200`,
                    ].join(' ')}
                  >
                    <span className="text-base leading-none">{getCategoryIcon(category.nombre)}</span>
                    {category.nombre}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative mt-5 max-w-sm">
                <span className={`absolute inset-y-0 left-4 flex items-center ${muted}`}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </span>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar producto..."
                  className={`${inputCls} pl-11`}
                />
              </div>

              {/* Product grid */}
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    className={[
                      'group flex flex-col overflow-hidden rounded-xl border text-left',
                      'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
                      `border-white/[.07] bg-white/[.03] hover:border-sky-500/30 hover:shadow-sky-950/40`,
                    ].join(' ')}
                  >
                    <div className="relative h-28 w-full shrink-0 overflow-hidden bg-white/[.05]">
                      {product.imagen ? (
                        <img src={product.imagen} alt={product.nombre} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-3xl opacity-20">🍲</div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col justify-between p-3.5">
                      <p className={`text-sm font-black leading-snug ${heading}`}>{product.nombre}</p>
                      <p className={`mt-0.5 text-[9px] font-black uppercase tracking-widest ${muted}`}>{product.categoria?.nombre}</p>
                      <p className="mt-2 text-lg font-black text-sky-400">{formatMoney(product.precio)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Cart sidebar */}
            <aside className={`${card} flex flex-col p-5`}>
              <h2 className={`text-base font-black uppercase tracking-wider ${heading}`}>Nuevo domicilio</h2>
              <div className="mt-4 space-y-2.5">
                <input
                  value={deliveryNombre}
                  onChange={(event) => setDeliveryNombre(event.target.value)}
                  placeholder="Nombre del cliente"
                  className={inputCls}
                />
                <input
                  value={deliveryTelefono}
                  onChange={(event) => setDeliveryTelefono(event.target.value)}
                  placeholder="Teléfono"
                  className={inputCls}
                />
                <input
                  value={deliveryDireccion}
                  onChange={(event) => setDeliveryDireccion(event.target.value)}
                  placeholder="Dirección"
                  className={inputCls}
                />
              </div>

              <div className={`mt-5 flex-1 space-y-2 overflow-y-auto border-t pt-4 ${borderB}`}>
                {cart.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <span className="text-4xl opacity-20">🛒</span>
                    <p className={`mt-3 text-xs font-bold ${muted}`}>Agrega productos al carrito.</p>
                  </div>
                )}
                {cart.map((item) => (
                  <div key={item.uid} className={`group relative overflow-hidden rounded-xl border p-3.5 transition-all duration-200 hover:border-sky-500/20 ${surface2} ${border}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className={`text-sm font-bold ${heading}`}>{item.nombre}</p>
                        <p className="text-xs font-bold text-sky-400">{formatMoney(item.precio)} <span className={`text-[10px] font-normal ${muted}`}>c/u</span></p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCartItem(item.uid)}
                        className="rounded-lg bg-red-500/10 p-1.5 text-red-500 opacity-0 transition-all duration-150 group-hover:opacity-100 hover:bg-red-500/20"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                    
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center rounded-lg bg-white/[.06] p-1">
                        <button
                          type="button"
                          onClick={() => updateCartItem(item.uid, (current) => ({ cantidad: Math.max(1, current.cantidad - 1) }))}
                          className={`flex h-7 w-7 items-center justify-center rounded-md bg-white/[.08] font-bold ${muted} transition-colors hover:text-sky-400`}
                        >
                          −
                        </button>
                        <span className={`w-9 text-center text-sm font-black ${heading}`}>{item.cantidad}</span>
                        <button
                          type="button"
                          onClick={() => updateCartItem(item.uid, (current) => ({ cantidad: current.cantidad + 1 }))}
                          className={`flex h-7 w-7 items-center justify-center rounded-md bg-white/[.08] font-bold ${muted} transition-colors hover:text-sky-400`}
                        >
                          +
                        </button>
                      </div>
                      
                      <input
                        value={item.notas}
                        onChange={(event) => updateCartItem(item.uid, () => ({ notas: event.target.value }))}
                        placeholder="Nota (opcional)"
                        className={`flex-1 rounded-lg border px-3 py-1.5 text-xs outline-none transition-all duration-200 focus:ring-1 focus:ring-sky-500/30 focus:border-sky-500 border-white/[.08] bg-white/[.04] text-slate-300 placeholder-slate-600`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className={`mt-4 border-t pt-4 ${borderB}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold uppercase tracking-widest ${muted}`}>Total</span>
                  <span className={`text-2xl font-black ${heading}`}>{formatMoney(cartTotal)}</span>
                </div>
                <button
                  type="button"
                  onClick={sendDeliveryOrder}
                  className="mt-4 w-full rounded-xl bg-sky-600 py-3 text-sm font-bold text-white shadow-md shadow-sky-600/20 transition-all duration-200 hover:bg-sky-500 hover:-translate-y-px active:scale-[.98]"
                >
                  Registrar domicilio
                </button>
              </div>
            </aside>
          </section>
        )}

        {/* ── VIEW: CIERRE ── */}
        {view === 'cierre' && (
          <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr] animate-in fade-in slide-in-from-bottom-4">
            <div className="flex flex-col gap-4">

              {/* Arqueo header */}
              <div className={`${card} p-6 relative overflow-hidden`}>
                <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-sky-600/[.07] blur-3xl" />
                <p className="text-[9px] font-black uppercase tracking-[.25em] text-sky-400">Arqueo del Turno</p>
                <h2 className={`mt-1.5 text-5xl font-black tabular-nums ${heading}`}>{formatMoney(report.resumenDiario.totalFacturado)}</h2>
                <p className={`mt-1.5 text-sm font-medium ${muted}`}>{pagos.length} operaciones registradas</p>
                
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Efectivo',       value: totalEfectivo,      icon: '💵', color: 'emerald' },
                    { label: 'Tarjeta',        value: totalTarjeta,       icon: '💳', color: 'sky'     },
                    { label: 'Transferencia',  value: totalTransferencia, icon: '📲', color: 'violet'  },
                  ].map(({ label, value, icon, color }) => (
                    <div key={label} className={`rounded-xl border p-4 ${surface2} border-white/[.06]`}>
                      <div className="flex items-center gap-2">
                        <span className="text-base leading-none">{icon}</span>
                        <p className={`text-[10px] font-black uppercase tracking-widest text-${color}-400`}>{label}</p>
                      </div>
                      <p className={`mt-2 text-xl font-black tabular-nums text-${color}-400`}>{formatMoney(value)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Últimos pagos */}
              <div className={`${card} flex max-h-72 flex-col overflow-hidden p-5`}>
                <h3 className={`mb-4 flex items-center justify-between text-sm font-black uppercase tracking-wider ${heading}`}>
                  Últimos pagos
                  <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold bg-white/[.06] ${muted}`}>{pagos.length}</span>
                </h3>
                <div className={`flex-1 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar`}>
                  {pagos.length === 0 && <p className={`py-4 text-center text-sm ${muted}`}>No hay cobros registrados.</p>}
                  {pagos.slice(0, 15).map((pago) => (
                    <div key={pago.id} className={`flex items-center justify-between rounded-xl border px-3.5 py-3 ${surface2} border-white/[.05]`}>
                      <div>
                        <p className={`text-sm font-bold ${heading}`}>Orden #{pago.id_orden}</p>
                        <p className={`text-xs tabular-nums ${muted}`}>{new Date(pago.fecha_pago).toLocaleTimeString()} · {pago.metodo_pago}</p>
                      </div>
                      <span className="text-sm font-black text-sky-400">{formatMoney(pago.monto_pagado)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Movimientos */}
              <div className={`${card} flex max-h-64 flex-col overflow-hidden p-5`}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className={`text-sm font-black uppercase tracking-wider ${heading}`}>Movimientos de Caja</h3>
                  <button
                    onClick={() => setShowMovementModal(true)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-150 bg-white/[.06] ${muted} hover:bg-white/[.12] hover:text-slate-200`}
                  >
                    + Registrar
                  </button>
                </div>
                <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                  {(!report.cashMovements || report.cashMovements.length === 0) && (
                    <p className={`py-4 text-center text-sm italic ${muted}`}>No hay ingresos ni egresos adicionales.</p>
                  )}
                  {report.cashMovements?.map(m => (
                    <div key={m.id} className={[
                      'flex items-center justify-between rounded-xl border px-3.5 py-3',
                      m.tipo === 'INGRESO' ? 'bg-emerald-500/[.06] border-emerald-500/15' : 'bg-red-500/[.06] border-red-500/15',
                    ].join(' ')}>
                      <div>
                        <p className={`text-sm font-bold ${heading}`}>{m.motivo}</p>
                        <span className={`text-[9px] font-black uppercase tracking-wider ${m.tipo === 'INGRESO' ? 'text-emerald-400' : 'text-red-400'}`}>{m.tipo}</span>
                      </div>
                      <span className={`font-black text-sm ${m.tipo === 'INGRESO' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {m.tipo === 'INGRESO' ? '+' : '-'}{formatMoney(m.monto)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">

              {/* Anulaciones */}
              <div className={`${card} flex max-h-96 flex-col overflow-hidden p-5`}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-wider text-red-500">Registro de Anulaciones</h3>
                  <span className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[10px] font-black text-red-500">
                    {voids.length} hoy
                  </span>
                </div>
                <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                  {voids.length === 0 && (
                    <div className={`flex flex-col items-center py-10 text-center`}>
                      <span className="mb-2 block text-3xl opacity-40">✅</span>
                      <p className={`text-sm font-bold ${muted}`}>Sin anulaciones en tu turno.</p>
                    </div>
                  )}
                  {voids.map((record) => (
                    <div key={record.id} className="rounded-xl border border-red-500/15 bg-red-500/[.06] p-3.5">
                      <div className="flex items-start justify-between">
                        <p className={`text-sm font-bold ${heading}`}>{record.descripcion}</p>
                        <span className={`ml-3 shrink-0 text-[9px] font-black uppercase tracking-widest tabular-nums ${muted}`}>
                          {new Date(record.fecha).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs italic text-red-400">"{record.motivo}"</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cierre Z */}
              <div className={`${card} p-5 border-t-2 border-t-red-500/50`}>
                <h3 className={`text-base font-black ${heading}`}>Término de Turno</h3>
                <p className={`mt-1.5 text-xs leading-relaxed ${muted}`}>
                  Inicia el Arqueo Ciego. Tendrás que declarar cuánto efectivo exacto cuentas en gaveta para validar el cuadre.
                </p>
                <button
                  type="button"
                  onClick={executeClose}
                  className="mt-5 w-full rounded-xl bg-red-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-red-900/30 transition-all duration-200 hover:bg-red-500 hover:-translate-y-px active:scale-[.98]"
                >
                  Emitir Cierre Z y Salir
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ── MODAL: PAYMENT ── */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className={`grid max-h-[90vh] w-full max-w-5xl gap-0 overflow-hidden rounded-2xl shadow-2xl lg:grid-cols-[1.4fr_400px] ${surface} border ${border}`}>
            {/* Order items */}
            <div className="overflow-y-auto p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className={`text-2xl font-black ${heading}`}>
                    {selectedOrder.tipo_pedido === 'DOMICILIO'
                      ? selectedOrderCustomer.nombre || `Domicilio #${selectedOrder.id}`
                      : `Mesa ${selectedOrder.id_mesa}`}
                  </h2>
                  {selectedOrder.tipo_pedido === 'DOMICILIO' && (
                    <p className={`mt-0.5 text-sm ${muted}`}>
                      {selectedOrderCustomer.telefono || '—'} · {selectedOrderCustomer.direccion || 'Sin dirección'}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closePaymentModal}
                  className={`rounded-xl px-4 py-2 text-sm font-bold transition-all duration-150 ${btnGhost}`}
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {groupedItems.map((group) => (
                  <div key={group.seat} className={`rounded-xl border p-4 ${surface2} ${border}`}>
                    <div className={`mb-3 flex items-center justify-between border-b pb-3 ${borderB}`}>
                      <p className={`text-sm font-black ${heading}`}>{group.seat}</p>
                      <p className={`text-sm font-bold text-sky-400`}>{formatMoney(group.subtotal)}</p>
                    </div>
                    <div className="space-y-1.5">
                      {group.items.map((item) => (
                        <div key={item.id} className={`group relative flex items-start justify-between gap-3 rounded-lg px-3.5 py-2.5 transition-colors duration-150 ${rowHover}`}>
                          <div className="flex-1">
                            <p className={`text-sm font-bold ${heading}`}>{item.cantidad}× {item.producto?.nombre}</p>
                            {item.cleanNote && <p className={`text-xs ${muted}`}>{item.cleanNote}</p>}
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className={`text-sm font-black ${heading}`}>{formatMoney(item.precio_unitario * item.cantidad)}</span>
                            <button
                              type="button"
                              onClick={() => voidItem(item.id)}
                              className="rounded-lg bg-red-500/10 p-1.5 text-red-500 opacity-0 transition-all duration-150 group-hover:opacity-100 hover:bg-red-500/20"
                              title="Anular plato"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment panel */}
            <aside className={`flex flex-col border-l p-6 ${borderB}`}>
              <h3 className={`text-base font-black uppercase tracking-wider ${heading}`}>Cobro</h3>
              <p className={`mt-4 text-[10px] font-bold uppercase tracking-widest ${muted}`}>Total a pagar</p>
              <p className="text-5xl font-black tabular-nums text-sky-400">{formatMoney(selectedOrder.total)}</p>

              <div className="mt-6 grid gap-2">
                {[
                  { method: 'EFECTIVO',      icon: '💵' },
                  { method: 'TARJETA',       icon: '💳' },
                  { method: 'TRANSFERENCIA', icon: '📲' },
                ].map(({ method, icon }) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={[
                      'flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-bold',
                      'transition-all duration-200',
                      paymentMethod === method
                        ? 'bg-sky-600 text-white shadow-lg shadow-sky-900/40 scale-[1.01]'
                        : `${surface2} ${border} border text-slate-300 hover:border-sky-500/30`,
                    ].join(' ')}
                  >
                    <span className="text-base leading-none">{icon}</span>
                    {method}
                  </button>
                ))}
              </div>

              {paymentMethod === 'TRANSFERENCIA' && (
                <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                  <input
                    value={referencia}
                    onChange={(event) => setReferencia(event.target.value)}
                    placeholder="Referencia de pago"
                    className={inputCls}
                  />
                </div>
              )}

              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={processPayment}
                  className="w-full rounded-xl bg-sky-600 py-3.5 text-sm font-bold text-white shadow-md shadow-sky-900/30 transition-all duration-200 hover:bg-sky-500 hover:-translate-y-px active:scale-[.98]"
                >
                  Confirmar pago
                </button>
                <button
                  type="button"
                  onClick={closePaymentModal}
                  className={`w-full rounded-xl py-3.5 text-sm font-bold transition-all duration-200 ${btnGhost}`}
                >
                  Cancelar y cerrar
                </button>
                <button
                  type="button"
                  onClick={voidOrder}
                  className="mt-1 w-full py-1 text-center text-xs font-bold text-red-500 transition-colors hover:text-red-400"
                >
                  Anular toda la orden
                </button>
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* ── MODAL: APERTURA DE TURNO ── */}
      {!isShiftOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <form
            onSubmit={handleOpenShift}
            className={`w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 ${surface} ${border}`}
          >
            <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl text-5xl ${surface2}`}>💶</div>
            <h2 className={`text-2xl font-black ${heading}`}>Apertura de Turno</h2>
            <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
              Para empezar a cobrar, declara el fondo inicial o base de tu caja. Escribe 0 si no tienes base.
            </p>
            <div className="mt-8 text-left">
              <label className={`mb-2 block text-[10px] font-black uppercase tracking-widest ${muted}`}>
                Total en caja física ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                max="100000"
                value={fondoInput}
                onChange={e => setFondoInput(e.target.value)}
                autoFocus
                className={inputLgCls}
                placeholder="0.00"
              />
            </div>
            <button
              type="submit"
              className="mt-6 w-full rounded-xl bg-sky-600 py-4 text-base font-bold text-white shadow-xl shadow-sky-900/30 transition-all duration-200 hover:bg-sky-500 hover:-translate-y-px active:scale-[.98]"
            >
              Abrir Toma de Pedidos
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className={`mt-3 w-full py-2 text-center text-sm font-bold transition-colors ${muted} hover:text-slate-300`}
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      )}

      {/* ── MODAL: CIERRE Z ── */}
      {showCloseModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
          <form
            onSubmit={confirmCloseShift}
            className={`w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 border-t-2 border-t-red-500 ${surface} ${border}`}
          >
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/15 text-5xl">🏧</div>
            <h2 className={`text-2xl font-black ${heading}`}>Cierre Z: Arqueo Ciego</h2>
            <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
              Antes de finalizar tu turno, ingresa exactamente el saldo de dinero físico/digital que tienes en tu caja.
            </p>
            <div className="mt-8 text-left">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-red-500">
                Dinero Contado ($)
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={countedCashInput}
                onChange={e => setCountedCashInput(e.target.value)}
                autoFocus
                className={inputLgCls}
                placeholder="Total contado"
              />
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className={`flex-1 rounded-xl py-3.5 text-sm font-bold ${btnGhost}`}
              >
                Atrás
              </button>
              <button
                type="submit"
                className="flex-[2] rounded-xl bg-red-600 py-3.5 text-sm font-bold text-white shadow-xl shadow-red-900/30 transition-all duration-200 hover:bg-red-500 active:scale-[.98]"
              >
                Confirmar y Salir
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL: MOVIMIENTO DE CAJA ── */}
      {showMovementModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCashMovement}
            className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl animate-in fade-in zoom-in-95 ${surface} ${border}`}
          >
            <h3 className={`mb-5 text-base font-black uppercase tracking-wider ${heading}`}>
              Registrar Movimiento de Caja
            </h3>
            <div className="space-y-4">
              <div>
                <label className={`mb-2 block text-[10px] font-black uppercase tracking-widest ${muted}`}>Tipo</label>
                <select
                  value={movementForm.tipo}
                  onChange={e => setMovementForm({...movementForm, tipo: e.target.value})}
                  className={selectCls}
                >
                  <option value="EGRESO">Salida / Gasto (Egreso)</option>
                  <option value="INGRESO">Entrada / Base extra (Ingreso)</option>
                </select>
              </div>
              <div>
                <label className={`mb-2 block text-[10px] font-black uppercase tracking-widest ${muted}`}>Monto ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={movementForm.monto}
                  onChange={e => setMovementForm({...movementForm, monto: e.target.value})}
                  className={inputCls}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className={`mb-2 block text-[10px] font-black uppercase tracking-widest ${muted}`}>Motivo</label>
                <input
                  type="text"
                  required
                  value={movementForm.motivo}
                  onChange={e => setMovementForm({...movementForm, motivo: e.target.value})}
                  className={inputCls}
                  placeholder="Ej. Pago a proveedor de hielo"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setShowMovementModal(false)}
                className={`flex-1 rounded-xl py-3 text-sm font-bold ${btnGhost}`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-[2] rounded-xl bg-sky-600 py-3 text-sm font-bold text-white shadow-md shadow-sky-900/30 transition-all duration-200 hover:bg-sky-500 active:scale-[.98]"
              >
                Guardar Movimiento
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default CajeroDashboard;