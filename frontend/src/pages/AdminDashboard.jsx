import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE from '../config.js';
import { clearStoredSession, getStoredToken, getStoredUser } from '../utils/session';
import { getCategoryIcon } from '../utils/menuIcons';


const EMPTY_USER = { id: null, nombre: '', pin_acceso: '', rol: 'MESERO' };
const EMPTY_PRODUCT = { id: null, nombre: '', precio: '', id_categoria: '', imagen: '' };
const EMPTY_TABLE = { id: null, numero_mesa: '', capacidad: '' };

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

// ── MODAL COMPONENT ───────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children, darkMode }) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={[
          'relative w-full max-w-md rounded-2xl border shadow-2xl',
          darkMode ? 'bg-[#161922] border-white/[.09] text-slate-100' : 'bg-white border-slate-200 text-slate-900',
        ].join(' ')}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between border-b px-6 py-4 ${darkMode ? 'border-white/[.07]' : 'border-slate-100'}`}>
          <h2 className={`text-sm font-black uppercase tracking-wider ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className={[
              'flex h-8 w-8 items-center justify-center rounded-xl text-lg transition-all duration-150',
              darkMode ? 'text-slate-400 hover:bg-white/[.08] hover:text-slate-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700',
            ].join(' ')}
          >
            ×
          </button>
        </div>
        {/* Body */}
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const token = getStoredToken();

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('adminDarkMode') === 'true');
  useEffect(() => { localStorage.setItem('adminDarkMode', darkMode); }, [darkMode]);

  const [activeTab, setActiveTab] = useState('resumen');
  const [report, setReport] = useState({
    resumenDiario: { operaciones: 0, totalFacturado: 0, ticketPromedio: 0 },
    topProducts: [],
    tickets: [],
    pagos: [],
  });
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [tables, setTables] = useState([]);

  const [userForm, setUserForm] = useState(EMPTY_USER);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [tableForm, setTableForm] = useState(EMPTY_TABLE);
  const [newCategory, setNewCategory] = useState('');
  const [shifts, setShifts] = useState([]);

  // ── MODAL STATES ──────────────────────────────────────────────────────────
  const [showUserModal, setShowUserModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const openUserModal = (member = null) => {
    setUserForm(member
      ? { id: member.id, nombre: member.nombre, pin_acceso: '', rol: member.rol }
      : EMPTY_USER
    );
    setShowUserModal(true);
  };

  const openProductModal = (product = null) => {
    setProductForm(product
      ? { id: product.id, nombre: product.nombre, precio: product.precio, id_categoria: String(product.id_categoria), imagen: product.imagen || '' }
      : EMPTY_PRODUCT
    );
    setShowProductModal(true);
  };

  const openTableModal = (table = null) => {
    setTableForm(table
      ? { id: table.id, numero_mesa: table.numero_mesa, capacidad: table.capacidad }
      : EMPTY_TABLE
    );
    setShowTableModal(true);
  };
  // ──────────────────────────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) setUsers(await response.json());
  }, [token]);

  const loadMenu = useCallback(async () => {
    const [categoriesResponse, productsResponse] = await Promise.all([
      fetch(`${API_BASE}/api/menu/categories`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE}/api/menu/products`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (categoriesResponse.ok) setCategories(await categoriesResponse.json());
    if (productsResponse.ok) setProducts(await productsResponse.json());
  }, [token]);

  const loadTables = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/tables`, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) setTables(await response.json());
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        if (activeTab === 'resumen') {
          const [reportsResponse, usersResponse] = await Promise.all([
            fetch(`${API_BASE}/api/reports/sales`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${API_BASE}/api/users`, { headers: { Authorization: `Bearer ${token}` } }),
          ]);
          if (!cancelled && reportsResponse.ok) setReport(await reportsResponse.json());
          if (!cancelled && usersResponse.ok) setUsers(await usersResponse.json());
          return;
        }
        if (activeTab === 'historial') {
          const response = await fetch(`${API_BASE}/api/reports/shifts`, { headers: { Authorization: `Bearer ${token}` } });
          if (!cancelled && response.ok) setShifts(await response.json());
          return;
        }
        if (activeTab === 'personal') {
          const usersResponse = await fetch(`${API_BASE}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
          if (!cancelled && usersResponse.ok) setUsers(await usersResponse.json());
          return;
        }
        if (activeTab === 'menu') {
          const [categoriesResponse, productsResponse] = await Promise.all([
            fetch(`${API_BASE}/api/menu/categories`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${API_BASE}/api/menu/products`, { headers: { Authorization: `Bearer ${token}` } }),
          ]);
          if (!cancelled && categoriesResponse.ok) setCategories(await categoriesResponse.json());
          if (!cancelled && productsResponse.ok) setProducts(await productsResponse.json());
          return;
        }
        if (activeTab === 'mesas') {
          const tablesResponse = await fetch(`${API_BASE}/api/tables`, { headers: { Authorization: `Bearer ${token}` } });
          if (!cancelled && tablesResponse.ok) setTables(await tablesResponse.json());
        }
      } catch (error) {
        console.error('Admin initial effect error:', error);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [activeTab, token]);

  const handleLogout = () => { clearStoredSession(); navigate('/'); };

  const handleUserSubmit = async (event) => {
    event.preventDefault();
    const isEditing = userForm.id !== null;
    const payload = {
      nombre: userForm.nombre.trim(),
      rol: userForm.rol,
      ...(userForm.pin_acceso ? { pin_acceso: userForm.pin_acceso } : {}),
    };
    try {
      const response = await fetch(
        isEditing ? `${API_BASE}/api/users/${userForm.id}` : `${API_BASE}/api/users`,
        { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) }
      );
      if (!response.ok) { const data = await response.json().catch(() => ({})); alert(data.error || 'No se pudo guardar el usuario.'); return; }
      setShowUserModal(false);
      setUserForm(EMPTY_USER);
      await loadUsers();
    } catch (error) { console.error('User save error:', error); alert('Fallo de conexion'); }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('¿Eliminar este colaborador?')) return;
    try {
      const response = await fetch(`${API_BASE}/api/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) await loadUsers();
    } catch (error) { console.error('Delete user error:', error); }
  };

  const handleProductSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(
        productForm.id ? `${API_BASE}/api/menu/products/${productForm.id}` : `${API_BASE}/api/menu/products`,
        { method: productForm.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(productForm) }
      );
      if (!response.ok) { alert('No se pudo guardar el producto.'); return; }
      setShowProductModal(false);
      setProductForm(EMPTY_PRODUCT);
      await loadMenu();
    } catch (error) { console.error('Save product error:', error); alert('Fallo de conexion'); }
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm('¿Eliminar este producto?')) return;
    try {
      const response = await fetch(`${API_BASE}/api/menu/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) await loadMenu();
    } catch (error) { console.error('Delete product error:', error); }
  };

  const handleToggleProduct = async (product) => {
    try {
      const response = await fetch(`${API_BASE}/api/menu/products/${product.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ disponible: !product.disponible }),
      });
      if (response.ok) await loadMenu();
    } catch (error) { console.error('Toggle product error:', error); }
  };

  const handleCategorySubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/api/menu/categories`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre: newCategory.trim() }),
      });
      if (response.ok) { setNewCategory(''); setShowCategoryModal(false); await loadMenu(); }
    } catch (error) { console.error('Save category error:', error); }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('¿Eliminar esta categoria?')) return;
    try {
      const response = await fetch(`${API_BASE}/api/menu/categories/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) await loadMenu();
      else alert('La categoria aun tiene productos asociados.');
    } catch (error) { console.error('Delete category error:', error); }
  };

  const handleTableSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await fetch(
        tableForm.id ? `${API_BASE}/api/tables/${tableForm.id}` : `${API_BASE}/api/tables`,
        { method: tableForm.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(tableForm) }
      );
      if (!response.ok) { alert('No se pudo guardar la mesa.'); return; }
      setShowTableModal(false);
      setTableForm(EMPTY_TABLE);
      await loadTables();
    } catch (error) { console.error('Save table error:', error); }
  };

  const handleDeleteTable = async (id) => {
    if (!window.confirm('¿Eliminar esta mesa?')) return;
    try {
      const response = await fetch(`${API_BASE}/api/tables/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) await loadTables();
      else { const data = await response.json().catch(() => ({})); alert(data.error || 'No se pudo eliminar la mesa.'); }
    } catch (error) { console.error('Delete table error:', error); }
  };

  const handleToggleTable = async (table) => {
    const nuevoEstado = table.estado === 'OCUPADA' ? 'LIBRE' : 'OCUPADA';
    try {
      const response = await fetch(`${API_BASE}/api/tables/${table.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      if (response.ok) await loadTables();
    } catch (error) { console.error('Toggle table error:', error); }
  };

  const groupedUsers = {
    ADMIN: users.filter((m) => m.rol === 'ADMIN'),
    CAJERO: users.filter((m) => m.rol === 'CAJERO'),
    MESERO: users.filter((m) => m.rol === 'MESERO'),
    COCINA: users.filter((m) => m.rol === 'COCINA'),
  };

  const userFormValid =
    userForm.nombre.trim().length > 0 &&
    userForm.rol &&
    (userForm.id ? userForm.pin_acceso.length === 0 || userForm.pin_acceso.length === 4 : userForm.pin_acceso.length === 4);

  // ── Design tokens ─────────────────────────────────────────────────────────
  const bg        = darkMode ? 'bg-[#0d0f18]'      : 'bg-slate-50';
  const surface   = darkMode ? 'bg-[#161922]'      : 'bg-white';
  const surface2  = darkMode ? 'bg-[#1e2132]'      : 'bg-slate-50';
  const border    = darkMode ? 'border-white/[.07]' : 'border-slate-200';
  const muted     = darkMode ? 'text-slate-400'     : 'text-slate-500';
  const heading   = darkMode ? 'text-slate-100'     : 'text-slate-900';
  const subheading = darkMode ? 'text-slate-300'    : 'text-slate-700';
  const divider   = darkMode ? 'divide-white/[.06]' : 'divide-slate-100';
  const borderB   = darkMode ? 'border-white/[.06]' : 'border-slate-100';
  const card = `rounded-2xl border shadow-sm ${surface} ${border}`;

  const inputCls = [
    'w-full rounded-xl border px-4 py-2.5 text-sm font-medium outline-none',
    'transition-all duration-200',
    'focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500',
    darkMode
      ? 'border-white/[.08] bg-white/[.04] text-slate-100 placeholder-slate-500 hover:border-white/20'
      : 'border-slate-200 bg-white text-slate-800 placeholder-slate-400 hover:border-slate-300',
  ].join(' ');

  const selectCls = [
    'w-full rounded-xl border px-4 py-2.5 text-sm font-medium outline-none',
    'transition-all duration-200',
    'focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500',
    darkMode
      ? 'border-white/[.08] bg-[#161922] text-slate-100 hover:border-white/20'
      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300',
  ].join(' ');

  const btnPrimary = [
    'flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white',
    'bg-violet-600 shadow-md shadow-violet-600/20',
    'transition-all duration-200 hover:bg-violet-500 hover:shadow-violet-500/30 hover:-translate-y-px',
    'active:scale-[.98] active:translate-y-0',
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0',
  ].join(' ');

  const btnGhost = [
    'rounded-xl px-4 py-2.5 text-sm font-bold',
    'transition-all duration-200 active:scale-[.98]',
    darkMode
      ? 'bg-white/[.06] text-slate-300 hover:bg-white/[.10]'
      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  ].join(' ');

  const btnDanger = [
    'rounded-xl px-3 py-1.5 text-xs font-bold text-red-500',
    'bg-red-500/10 transition-all duration-200',
    'hover:bg-red-500/20 active:scale-[.98]',
  ].join(' ');

  const rowHover = darkMode ? 'hover:bg-white/[.03]' : 'hover:bg-slate-50';
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen transition-colors duration-300 ${bg} ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 lg:px-8">

        {/* ── TOPBAR ───────────────────────────────────────────── */}
        <header className={`flex flex-col gap-4 rounded-2xl border p-4 lg:flex-row lg:items-center lg:justify-between ${surface} ${border}`}>
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 shadow-lg shadow-violet-600/30 text-xl">🛠️</div>
            <div>
              <p className={`text-[9px] font-black uppercase tracking-[.25em] ${darkMode ? 'text-violet-400' : 'text-violet-600'}`}>Panel Administrador</p>
              <h1 className={`text-lg font-black leading-none ${heading}`}>MGR</h1>
              <p className={`text-[11px] font-medium ${muted}`}>{user?.nombre || 'Administrador'}</p>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-1.5">
            {[
              ['resumen',   '📊', 'Resumen'],
              ['historial', '🕐', 'Historial'],
              ['menu',      '🍽️', 'Menú'],
              ['mesas',     '🪑', 'Mesas'],
              ['personal',  '👥', 'Personal'],
            ].map(([value, icon, label]) => (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                className={[
                  'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition-all duration-200',
                  activeTab === value
                    ? 'bg-violet-600 text-white shadow-md shadow-violet-600/25'
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
              className={['rounded-xl px-3 py-2 text-sm font-bold transition-all duration-200', darkMode ? 'bg-amber-400/[.12] text-amber-400 hover:bg-amber-400/[.22]' : 'bg-slate-800/[.07] text-slate-600 hover:bg-slate-800/[.13]'].join(' ')}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button
              onClick={handleLogout}
              className={['rounded-xl px-3.5 py-2 text-sm font-bold transition-all duration-200', darkMode ? 'bg-white/[.05] text-slate-400 hover:bg-red-500/[.12] hover:text-red-400' : 'bg-slate-900 text-white hover:bg-slate-700'].join(' ')}
            >
              Salir
            </button>
          </nav>
        </header>

        {/* ── TAB: RESUMEN ─────────────────────────────────────── */}
        {activeTab === 'resumen' && (
          <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Facturado hoy',  value: formatMoney(report.resumenDiario.totalFacturado), icon: '💰', accent: true },
                  { label: 'Operaciones',     value: report.resumenDiario.operaciones,                 icon: '🔄', accent: false },
                  { label: 'Ticket promedio', value: formatMoney(report.resumenDiario.ticketPromedio), icon: '🧾', accent: false },
                ].map(({ label, value, icon, accent }) => (
                  <div key={label} className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm ${surface} ${border}`}>
                    <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl text-base ${darkMode ? 'bg-white/[.06]' : 'bg-slate-100'}`}>{icon}</div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>{label}</p>
                    <p className={`mt-1 text-3xl font-black tabular-nums ${accent ? 'text-violet-500' : heading}`}>{value}</p>
                    {accent && <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-violet-600/[.08] blur-2xl" />}
                  </div>
                ))}
              </div>

              <div className={`${card} p-5`}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className={`text-sm font-black uppercase tracking-wider ${heading}`}>Últimos pagos del día</h2>
                  <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold ${darkMode ? 'bg-white/[.06] text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{report.pagos.length} registros</span>
                </div>
                <div className="space-y-1.5">
                  {report.pagos.length === 0 && <p className={`py-6 text-center text-sm ${muted}`}>No hay pagos registrados hoy.</p>}
                  {report.pagos.slice(0, 8).map((payment) => (
                    <div key={payment.id} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors duration-150 ${darkMode ? `border-white/[.05] ${surface2} ${rowHover}` : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}>
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${darkMode ? 'bg-white/[.07]' : 'bg-white border border-slate-100 shadow-sm'}`}>
                        {payment.metodo_pago === 'EFECTIVO' ? '💵' : payment.metodo_pago === 'TARJETA' ? '💳' : '📱'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-bold ${heading}`}>{payment.metodo_pago}</p>
                        <p className={`truncate text-xs ${muted}`}>{payment.cajero?.nombre || 'Sin cajero'} · Orden #{payment.id_orden}</p>
                      </div>
                      <span className="shrink-0 text-sm font-black text-violet-500">{formatMoney(payment.monto_pagado)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${card} p-5`}>
                <h2 className={`mb-4 text-sm font-black uppercase tracking-wider ${heading}`}>Top platos</h2>
                <div className="space-y-1.5">
                  {report.topProducts.length === 0 && <p className={`py-6 text-center text-sm ${muted}`}>Sin ventas hoy.</p>}
                  {report.topProducts.map((product, idx) => (
                    <div key={product.id} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${darkMode ? `border-white/[.05] ${surface2}` : 'border-slate-100 bg-slate-50'}`}>
                      <span className={['flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black', idx === 0 ? 'bg-amber-400/20 text-amber-500' : idx === 1 ? 'bg-slate-400/15 text-slate-500' : darkMode ? 'bg-white/[.07] text-slate-400' : 'bg-slate-200 text-slate-500'].join(' ')}>{idx + 1}</span>
                      <p className={`flex-1 truncate text-sm font-bold ${heading}`}>{product.nombre}</p>
                      <span className={`shrink-0 text-xs font-bold ${muted}`}>{product.cantidad} uds.</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${card} p-5`}>
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-wider text-red-500">Registro de Anulaciones</h2>
                    <p className={`text-xs ${muted}`}>Auditoría de órdenes y platos anulados.</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{report.voidRecords?.length || 0} anulaciones
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead>
                      <tr className={`border-b text-[10px] font-black uppercase tracking-widest ${muted} ${borderB}`}>
                        <th className="pb-3 pr-5 font-black">Fecha y Hora</th>
                        <th className="pb-3 pr-5 font-black">Cajero</th>
                        <th className="pb-3 pr-5 font-black">Nivel</th>
                        <th className="pb-3 pr-5 font-black">Descripción</th>
                        <th className="pb-3 font-black">Motivo</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${divider}`}>
                      {!report.voidRecords || report.voidRecords.length === 0 ? (
                        <tr><td colSpan="5" className={`py-10 text-center text-sm ${muted}`}><span className="mb-2 block text-3xl">✅</span>Todo en orden. No hay anulaciones recientes.</td></tr>
                      ) : (
                        report.voidRecords.map((record) => (
                          <tr key={record.id} className={`transition-colors duration-100 ${rowHover}`}>
                            <td className={`py-3.5 pr-5 text-xs tabular-nums ${muted}`}>{new Date(record.fecha).toLocaleString()}</td>
                            <td className={`py-3.5 pr-5 text-sm font-bold ${heading}`}>{record.cajero?.nombre || 'Desconocido'}</td>
                            <td className="py-3.5 pr-5"><span className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${record.tipo === 'ORDEN' ? 'bg-red-500/15 text-red-500' : 'bg-orange-500/15 text-orange-500'}`}>{record.tipo}</span></td>
                            <td className={`py-3.5 pr-5 text-sm font-semibold ${heading}`}>{record.descripcion}</td>
                            <td className={`max-w-[180px] truncate py-3.5 text-xs italic ${muted}`}>"{record.motivo}"</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className={`${card} self-start p-5`}>
              <h2 className={`mb-4 text-sm font-black uppercase tracking-wider ${heading}`}>Equipo registrado</h2>
              <div className="space-y-1.5">
                {users.map((member) => (
                  <div key={member.id} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors duration-150 ${darkMode ? `border-white/[.05] ${surface2} ${rowHover}` : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}>
                    <div className={['flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-black uppercase', member.rol === 'ADMIN' ? 'bg-violet-600/20 text-violet-500' : member.rol === 'CAJERO' ? 'bg-emerald-600/20 text-emerald-500' : 'bg-blue-600/20 text-blue-500'].join(' ')}>{member.nombre.charAt(0)}</div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-bold ${heading}`}>{member.nombre}</p>
                      <p className={`text-[9px] font-black uppercase tracking-widest ${muted}`}>{member.rol}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] tabular-nums ${muted}`}>{formatDate(member.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── TAB: HISTORIAL ───────────────────────────────────── */}
        {activeTab === 'historial' && (
          <section className="animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className={`text-2xl font-black ${heading}`}>Cierres de Caja (Turnos)</h2>
                <p className={`text-sm ${muted}`}>Historial agrupado por aperturas y cierres físicos de caja.</p>
              </div>
            </div>
            {shifts.length === 0 ? (
              <div className={`${card} py-16 text-center p-5`}><span className="mb-4 block text-5xl opacity-30">📭</span><p className={`font-bold ${muted}`}>No hay turnos registrados aún.</p></div>
            ) : (
              shifts.map((shift) => {
                const totalIngresos = (shift.movimientos || []).filter(m => m.tipo === 'INGRESO').reduce((sum, m) => sum + m.monto, 0);
                const totalEgresos = (shift.movimientos || []).filter(m => m.tipo === 'EGRESO').reduce((sum, m) => sum + m.monto, 0);
                const ventasEfectivo = shift.total_efectivo || 0;
                const baseFija = shift.fondo_inicial || 0;
                return (
                  <div key={shift.id} className={`${card} flex flex-col gap-5 p-5`}>
                    <div className={`flex flex-wrap items-start justify-between gap-4 border-b pb-5 ${borderB}`}>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-lg px-3 py-1 text-xs font-black ${darkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>Turno #{shift.id}</span>
                          <span className={`text-sm font-bold ${subheading}`}>{shift.usuario?.nombre || 'Administrador'}</span>
                          {shift.fecha_cierre ? (
                            <span className={`flex items-center gap-1.5 text-xs font-bold ${muted}`}><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Cerrado</span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> En curso</span>
                          )}
                        </div>
                        <p className={`mt-1.5 text-xs tabular-nums ${muted}`}>
                          Abierto: {new Date(shift.fecha_apertura).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          {shift.fecha_cierre && ` · Cerrado: ${new Date(shift.fecha_cierre).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>Total Ventas Brutas</p>
                        <p className={`text-3xl font-black tabular-nums ${heading}`}>{formatMoney(ventasEfectivo + (shift.total_tarjeta || 0) + (shift.total_transferencia || 0))}</p>
                      </div>
                    </div>
                    <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl border md:grid-cols-4 ${darkMode ? 'border-white/[.06] bg-white/[.04]' : 'border-slate-100 bg-slate-100'}`}>
                      {[
                        { label: 'Base / Fondo',    val: formatMoney(baseFija),   color: subheading },
                        { label: 'Efectivo Teórico', val: formatMoney(baseFija + ventasEfectivo + totalIngresos - totalEgresos), color: 'text-emerald-500' },
                        { label: 'Declarado',        val: shift.fecha_cierre ? formatMoney(shift.efectivo_contado || 0) : '—', color: shift.fecha_cierre ? 'text-blue-500' : muted },
                        { label: 'Descuadre', val: shift.fecha_cierre ? `${shift.descuadre > 0 ? '+' : ''}${formatMoney(shift.descuadre || 0)}` : '—', color: !shift.fecha_cierre ? muted : shift.descuadre === 0 ? muted : shift.descuadre > 0 ? 'text-emerald-500' : 'text-red-500' },
                      ].map(({ label, val, color }) => (
                        <div key={label} className={`px-4 py-3.5 ${surface}`}>
                          <p className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>{label}</p>
                          <p className={`mt-0.5 text-xl font-black tabular-nums ${color}`}>{val}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-5 lg:grid-cols-3">
                      <div>
                        <h4 className={`mb-3 flex items-center justify-between text-xs font-black uppercase tracking-wider ${subheading}`}>Ventas por Caja<span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${darkMode ? 'bg-white/[.07] text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{shift.pagos?.length || 0}</span></h4>
                        <div className="custom-scrollbar max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                          {(!shift.pagos || shift.pagos.length === 0) && <p className={`py-4 text-center text-xs ${muted}`}>Sin ventas registradas.</p>}
                          {shift.pagos?.map(pago => (
                            <div key={pago.id} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${darkMode ? `border-white/[.05] ${surface2}` : 'border-slate-100 bg-slate-50'}`}>
                              <div><p className={`text-xs font-bold ${heading}`}>Orden #{pago.id_orden}</p><span className={`text-[9px] font-black uppercase tracking-wider ${muted}`}>{pago.metodo_pago}</span></div>
                              <p className="text-sm font-black text-blue-500">{formatMoney(pago.monto_pagado)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className={`mb-3 flex items-center justify-between text-xs font-black uppercase tracking-wider ${subheading}`}>Ingresos / Egresos<span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${darkMode ? 'bg-white/[.07] text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{shift.movimientos?.length || 0}</span></h4>
                        <div className="custom-scrollbar max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                          {(!shift.movimientos || shift.movimientos.length === 0) && <p className={`py-4 text-center text-xs ${muted}`}>Sin movimientos de caja extra.</p>}
                          {shift.movimientos?.map(m => (
                            <div key={m.id} className={['flex items-center justify-between rounded-xl border px-3 py-2.5', m.tipo === 'INGRESO' ? darkMode ? 'border-emerald-500/15 bg-emerald-500/[.06]' : 'border-emerald-100 bg-emerald-50' : darkMode ? 'border-red-500/15 bg-red-500/[.06]' : 'border-red-100 bg-red-50'].join(' ')}>
                              <div className="min-w-0 overflow-hidden"><p className={`truncate text-xs font-bold ${heading}`} title={m.motivo}>{m.motivo}</p><span className={`text-[9px] font-black uppercase tracking-wider ${m.tipo === 'INGRESO' ? 'text-emerald-500' : 'text-red-500'}`}>{m.tipo}</span></div>
                              <p className={`ml-3 shrink-0 text-sm font-black ${m.tipo === 'INGRESO' ? 'text-emerald-500' : 'text-red-500'}`}>{m.tipo === 'INGRESO' ? '+' : '-'}{formatMoney(m.monto)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="mb-3 flex items-center justify-between text-xs font-black uppercase tracking-wider text-red-500">Anulaciones<span className="rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-500">{shift.voids?.length || 0}</span></h4>
                        <div className="custom-scrollbar max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                          {(!shift.voids || shift.voids.length === 0) && <p className="py-4 text-center text-xs text-emerald-500/70 font-bold italic">Sin mermas ni anulaciones.</p>}
                          {shift.voids?.map(voidRec => (
                            <div key={voidRec.id} className={`rounded-xl border px-3 py-2.5 ${darkMode ? 'border-red-500/15 bg-red-500/[.06]' : 'border-red-100 bg-red-50'}`}>
                              <p className={`line-clamp-1 text-xs font-bold ${heading}`} title={voidRec.descripcion}>{voidRec.descripcion}</p>
                              <p className="mt-0.5 text-[10px] italic text-red-500">"{voidRec.motivo}"</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* ── TAB: MENU ────────────────────────────────────────── */}
        {activeTab === 'menu' && (
          <section className="flex flex-col gap-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={`text-2xl font-black ${heading}`}>Menú</h2>
                <p className={`text-sm ${muted}`}>Gestiona productos y categorías del restaurante.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(true)}
                  className={[btnGhost, 'flex items-center gap-2'].join(' ')}
                >
                  <span>🏷️</span>
                  <span className="hidden sm:inline">Categorías</span>
                </button>
                <button
                  type="button"
                  onClick={() => openProductModal()}
                  className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-600/20 transition-all duration-200 hover:bg-violet-500 hover:-translate-y-px active:scale-[.98]"
                >
                  <span>+</span>
                  <span>Nuevo producto</span>
                </button>
              </div>
            </div>

            {/* Catalog grid */}
            <div className={`${card} p-5`}>
              <div className="mb-5 flex items-center justify-between">
                <h2 className={`text-lg font-black ${heading}`}>Catálogo</h2>
                <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'bg-white/[.06] text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{products.length} productos</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <div key={product.id} className={`group flex flex-col overflow-hidden rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${darkMode ? 'border-white/[.07] bg-white/[.03] hover:border-violet-500/30 hover:shadow-violet-950/40' : 'border-slate-100 bg-white hover:border-violet-200 hover:shadow-violet-100'}`}>
                    <div className={`relative h-28 w-full shrink-0 overflow-hidden ${darkMode ? 'bg-white/[.05]' : 'bg-slate-100'}`}>
                      {product.imagen ? (
                        <img src={product.imagen} alt={product.nombre} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-3xl opacity-20">🍲</div>
                      )}
                      <div className="absolute right-2 top-2">
                        <span className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-widest backdrop-blur-md ${product.disponible ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}>{product.disponible ? 'Disponible' : 'Agotado'}</span>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col justify-between p-3.5">
                      <div>
                        <p className={`text-sm font-black leading-snug ${heading}`}>{product.nombre}</p>
                        <p className={`mt-0.5 text-[9px] font-black uppercase tracking-widest ${muted}`}>{product.categoria?.nombre}</p>
                        <p className="mt-2 text-xl font-black text-violet-500">{formatMoney(product.precio)}</p>
                      </div>
                      <div className={`mt-3 grid grid-cols-2 gap-1.5 border-t pt-3 ${borderB}`}>
                        <button type="button" onClick={() => openProductModal(product)} className={`rounded-lg py-2 text-xs font-bold transition-all duration-150 ${darkMode ? 'bg-white/[.06] text-slate-300 hover:bg-white/[.12]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Editar</button>
                        <button type="button" onClick={() => handleToggleProduct(product)} className={`rounded-lg py-2 text-xs font-bold transition-all duration-150 ${darkMode ? 'bg-white/[.06] text-slate-300 hover:bg-white/[.12]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{product.disponible ? 'Agotar' : 'Activar'}</button>
                        <button type="button" onClick={() => handleDeleteProduct(product.id)} className="col-span-2 rounded-lg py-2 text-xs font-bold text-red-500 transition-all duration-150 hover:bg-red-500/10">Eliminar</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── TAB: MESAS ───────────────────────────────────────── */}
        {activeTab === 'mesas' && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={`text-2xl font-black ${heading}`}>Mesas</h2>
                <p className={`text-sm ${muted}`}>Administra la distribución del salón.</p>
              </div>
              <button
                type="button"
                onClick={() => openTableModal()}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-600/20 transition-all duration-200 hover:bg-violet-500 hover:-translate-y-px active:scale-[.98]"
              >
                <span>+</span>
                <span>Nueva mesa</span>
              </button>
            </div>

            <div className={`${card} p-5`}>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className={`text-lg font-black ${heading}`}>Mapa de mesas</h2>
                <div className="flex items-center gap-2">
                  <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'bg-white/[.06] text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{tables.length} mesas</span>
                  <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>{tables.filter(t => t.estado !== 'OCUPADA').length} libres</span>
                  <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-100 text-red-600'}`}>{tables.filter(t => t.estado === 'OCUPADA').length} ocupadas</span>
                </div>
              </div>
              {/* Leyenda */}
              <div className="mb-4 flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className={`text-xs font-bold ${muted}`}>Libre</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span className={`text-xs font-bold ${muted}`}>Ocupada</span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {tables.map((table) => {
                  const ocupada = table.estado === 'OCUPADA';
                  return (
                    <div
                      key={table.id}
                      className={[
                        'group relative flex flex-col items-center justify-center overflow-hidden rounded-xl border p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
                        ocupada
                          ? darkMode ? 'border-red-500/30 bg-red-500/[.05] hover:shadow-red-950/40' : 'border-red-200 bg-red-50 hover:border-red-300 hover:shadow-red-100'
                          : darkMode ? 'border-emerald-500/20 bg-emerald-500/[.04] hover:border-emerald-500/40 hover:shadow-emerald-950/30' : 'border-emerald-200 bg-emerald-50 hover:border-emerald-300 hover:shadow-emerald-100',
                      ].join(' ')}
                    >
                      {/* Badge capacidad */}
                      <div className={`absolute right-2.5 top-2.5 rounded-md px-2 py-0.5 text-[9px] font-black ${darkMode ? 'bg-white/[.08] text-slate-400' : 'bg-white/80 border border-slate-200 text-slate-500'}`}>
                        {table.capacidad} pax
                      </div>

                   

                      {/* Número */}
                      <p className={`mt-1 text-5xl font-black tabular-nums ${ocupada ? 'text-red-500' : 'text-emerald-500'}`}>
                        {table.numero_mesa}
                      </p>

                      {/* Badge estado */}
                      <span className={['mt-2 rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-widest', ocupada ? darkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600' : darkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'].join(' ')}>
                        {ocupada ? 'Ocupada' : 'Libre'}
                      </span>


                      {/* Acciones */}
                      <div className={`mt-2 grid w-full grid-cols-2 gap-1.5 border-t pt-3 ${borderB}`}>
                        <button type="button" onClick={() => openTableModal(table)} className={`rounded-lg py-2 text-xs font-bold transition-all duration-150 ${darkMode ? 'bg-white/[.06] text-slate-300 hover:bg-white/[.12]' : 'bg-white/80 border border-slate-200 text-slate-600 hover:bg-white'}`}>Editar</button>
                        <button type="button" onClick={() => handleDeleteTable(table.id)} className="rounded-lg py-2 text-xs font-bold text-red-500 transition-all duration-150 hover:bg-red-500/10">Eliminar</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── TAB: PERSONAL ────────────────────────────────────── */}
        {activeTab === 'personal' && (
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className={`text-2xl font-black ${heading}`}>Personal</h2>
                <p className={`text-sm ${muted}`}>Gestiona el equipo de trabajo.</p>
              </div>
              <button
                type="button"
                onClick={() => openUserModal()}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-600/20 transition-all duration-200 hover:bg-violet-500 hover:-translate-y-px active:scale-[.98]"
              >
                <span>+</span>
                <span>Nuevo colaborador</span>
              </button>
            </div>

            <div className="space-y-3">
              {[
                ['ADMIN',  'Administradores', 'bg-violet-600/20 text-violet-500'],
                ['CAJERO', 'Cajeros',          'bg-emerald-600/20 text-emerald-500'],
                ['MESERO', 'Meseros',           'bg-blue-600/20 text-blue-500'],
                ['COCINA', 'Cocina',         'bg-orange-600/20 text-orange-500'],
              ].map(([role, label, avatarCls]) => (
                <div key={role} className={`${card} p-5`}>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className={`text-sm font-black uppercase tracking-wider ${heading}`}>{label}</h2>
                    <span className={`rounded-lg px-2.5 py-1 text-xs font-black ${darkMode ? 'bg-white/[.06] text-slate-400' : 'bg-slate-100 text-slate-600'}`}>{groupedUsers[role].length}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead>
                        <tr className={`border-b text-[10px] font-black uppercase tracking-widest ${muted} ${borderB}`}>
                          <th className="pb-3 pr-6 font-black">Nombre</th>
                          <th className="pb-3 pr-6 font-black">Creado</th>
                          <th className="pb-3 pr-6 font-black">Actualizado</th>
                          <th className="pb-3 text-right font-black">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${divider}`}>
                        {groupedUsers[role].length === 0 && (
                          <tr><td colSpan="4" className={`py-6 text-center text-xs ${muted}`}>Sin colaboradores en este rol.</td></tr>
                        )}
                        {groupedUsers[role].map((member) => (
                          <tr key={member.id} className={`transition-colors duration-100 ${rowHover}`}>
                            <td className="py-3.5 pr-6">
                              <div className="flex items-center gap-2.5">
                                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-black uppercase ${avatarCls}`}>{member.nombre.charAt(0)}</div>
                                <span className={`text-sm font-bold ${heading}`}>{member.nombre}</span>
                              </div>
                            </td>
                            <td className={`py-3.5 pr-6 text-xs tabular-nums ${muted}`}>{formatDate(member.createdAt)}</td>
                            <td className={`py-3.5 pr-6 text-xs tabular-nums ${muted}`}>{formatDate(member.updatedAt)}</td>
                            <td className="py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button type="button" onClick={() => openUserModal(member)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-150 ${darkMode ? 'bg-white/[.06] text-slate-300 hover:bg-white/[.12]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Editar</button>
                                <button type="button" onClick={() => handleDeleteUser(member.id)} className={btnDanger}>Eliminar</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* ── MODAL: USUARIO ───────────────────────────────────────────────────── */}
      <Modal
        open={showUserModal}
        onClose={() => { setShowUserModal(false); setUserForm(EMPTY_USER); }}
        title={userForm.id ? 'Editar colaborador' : 'Nuevo colaborador'}
        darkMode={darkMode}
      >
        <form onSubmit={handleUserSubmit} className="space-y-3">
          <input
            required
            value={userForm.nombre}
            onChange={(e) => setUserForm({ ...userForm, nombre: e.target.value })}
            placeholder="Nombre completo"
            className={inputCls}
          />
          <input
            type="password"
            maxLength="4"
            value={userForm.pin_acceso}
            onChange={(e) => setUserForm({ ...userForm, pin_acceso: e.target.value.replace(/\D/g, '') })}
            placeholder={userForm.id ? 'Nuevo PIN (opcional)' : 'PIN de 4 dígitos'}
            className={inputCls}
          />
          <select value={userForm.rol} onChange={(e) => setUserForm({ ...userForm, rol: e.target.value })} className={selectCls}>
            <option value="MESERO">Mesero</option>
            <option value="CAJERO">Cajero</option>
            <option value="ADMIN">Administrador</option>
            <option value="COCINA">Cocina</option>
          </select>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => { setShowUserModal(false); setUserForm(EMPTY_USER); }} className={btnGhost}>Cancelar</button>
            <button type="submit" disabled={!userFormValid} className={btnPrimary}>{userForm.id ? 'Actualizar' : 'Guardar colaborador'}</button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: PRODUCTO ──────────────────────────────────────────────────── */}
      <Modal
        open={showProductModal}
        onClose={() => { setShowProductModal(false); setProductForm(EMPTY_PRODUCT); }}
        title={productForm.id ? 'Editar producto' : 'Nuevo producto'}
        darkMode={darkMode}
      >
        <form onSubmit={handleProductSubmit} className="space-y-3">
          <input
            required
            value={productForm.nombre}
            onChange={(e) => setProductForm({ ...productForm, nombre: e.target.value })}
            placeholder="Nombre del producto"
            className={inputCls}
          />
          <input
            required
            type="number"
            step="0.01"
            value={productForm.precio}
            onChange={(e) => setProductForm({ ...productForm, precio: e.target.value })}
            placeholder="Precio"
            className={inputCls}
          />
          <select
            required
            value={productForm.id_categoria}
            onChange={(e) => setProductForm({ ...productForm, id_categoria: e.target.value })}
            className={selectCls}
          >
            <option value="">Selecciona categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.nombre}</option>
            ))}
          </select>
          <input
            value={productForm.imagen}
            onChange={(e) => setProductForm({ ...productForm, imagen: e.target.value })}
            placeholder="URL de imagen (opcional)"
            className={inputCls}
          />
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => { setShowProductModal(false); setProductForm(EMPTY_PRODUCT); }} className={btnGhost}>Cancelar</button>
            <button type="submit" className={btnPrimary}>{productForm.id ? 'Actualizar' : 'Guardar producto'}</button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: CATEGORÍA ─────────────────────────────────────────────────── */}
      <Modal
        open={showCategoryModal}
        onClose={() => { setShowCategoryModal(false); setNewCategory(''); }}
        title="Gestionar categorías"
        darkMode={darkMode}
      >
        <form onSubmit={handleCategorySubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              required
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Nueva categoría"
              className={inputCls}
            />
            <button
              type="submit"
              className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-200 hover:-translate-y-px active:translate-y-0 ${darkMode ? 'bg-white/[.08] text-slate-200 hover:bg-white/[.14]' : 'bg-slate-900 text-white hover:bg-slate-700'}`}
            >
              Crear
            </button>
          </div>
        </form>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {categories.map((category) => (
            <div
              key={category.id}
              className={`group flex items-center gap-1.5 rounded-lg border py-1.5 pl-3 pr-2 text-xs font-bold transition-all duration-200 hover:border-red-500/30 hover:bg-red-500/[.07] ${darkMode ? 'border-white/[.08] bg-white/[.04] text-slate-300' : 'border-slate-200 bg-white text-slate-700 shadow-sm'}`}
            >
              <span className="text-sm leading-none">{getCategoryIcon(category.nombre)}</span>
              {category.nombre}
              <button
                type="button"
                onClick={() => handleDeleteCategory(category.id)}
                className={`ml-0.5 flex h-5 w-5 items-center justify-center rounded-md transition-colors duration-150 group-hover:bg-red-500/20 group-hover:text-red-500 ${darkMode ? 'bg-white/[.06] text-slate-500' : 'bg-slate-100 text-slate-400'}`}
                title="Eliminar categoría"
              >
                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
          {categories.length === 0 && <p className={`text-xs ${muted}`}>No hay categorías creadas aún.</p>}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => setShowCategoryModal(false)} className={btnGhost}>Cerrar</button>
        </div>
      </Modal>

      {/* ── MODAL: MESA ──────────────────────────────────────────────────────── */}
      <Modal
        open={showTableModal}
        onClose={() => { setShowTableModal(false); setTableForm(EMPTY_TABLE); }}
        title={tableForm.id ? 'Editar mesa' : 'Nueva mesa'}
        darkMode={darkMode}
      >
        <form onSubmit={handleTableSubmit} className="space-y-3">
          <input
            required
            type="number"
            min="1"
            value={tableForm.numero_mesa}
            onChange={(e) => setTableForm({ ...tableForm, numero_mesa: e.target.value })}
            placeholder="Número de mesa"
            className={inputCls}
          />
          <input
            required
            type="number"
            min="1"
            value={tableForm.capacidad}
            onChange={(e) => setTableForm({ ...tableForm, capacidad: e.target.value })}
            placeholder="Capacidad (personas)"
            className={inputCls}
          />
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => { setShowTableModal(false); setTableForm(EMPTY_TABLE); }} className={btnGhost}>Cancelar</button>
            <button type="submit" className={btnPrimary}>{tableForm.id ? 'Actualizar' : 'Guardar mesa'}</button>
          </div>
        </form>
      </Modal>

    </div>
  );
}

export default AdminDashboard;