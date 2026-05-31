import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE from '../config.js';

function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleLogin = async (event) => {
    event.preventDefault();
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Error al iniciar sesion');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      if (data.user.rol === 'ADMIN') navigate('/admin');
      else if (data.user.rol === 'CAJERO') navigate('/cajero');
      else if (data.user.rol === 'MESERO') navigate('/mesero');
      else if (data.user.rol === 'COCINA') navigate('/cocina');
    } catch (error) {
      console.error('Login request error:', error);
      setError('Error de conexion con el servidor.');
    }
  };

  return (
    <div
      className="flex h-screen w-full items-center justify-center bg-gray-900 bg-cover bg-center"
      style={{ backgroundImage: "url('https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=2070&auto=format&fit=crop')" }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center rounded-3xl border border-white/20 bg-white/10 p-10 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 shadow-lg transition-all duration-300 hover:rotate-0 -rotate-3">
         <svg className="h-10 w-10 text-white" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2">
  <path d="M16 36a16 16 0 0 1 32 0M12 36h40" strokeLinecap="round" strokeLinejoin="round"/>
  <circle cx="32" cy="18" r="2" fill="currentColor"/>
</svg>
        </div>

        <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-white drop-shadow-md">MGR</h1>
        <p className="mb-6 text-center text-sm text-gray-300 drop-shadow-sm">Ingresa tu PIN de seguridad para comenzar tu turno.</p>

        {error && (
          <div className="mb-4 w-full rounded-xl border border-red-500/50 bg-red-500/20 px-4 py-2 text-center text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="flex w-full flex-col gap-5">
          <div className="relative">
            <input
              type="password"
              maxLength="4"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              placeholder="PIN de acceso"
              autoFocus
              className="w-full rounded-2xl border-2 border-transparent bg-black/40 px-4 py-4 text-center text-3xl tracking-[0.5em] text-white transition-all placeholder:text-lg placeholder:tracking-normal placeholder:text-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <button
            type="submit"
            disabled={pin.length < 4}
            className="mt-2 w-full rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 py-4 text-lg font-bold text-white shadow-[0_0_20px_rgba(249,115,22,0.4)] transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none hover:from-orange-600 hover:to-amber-600"
          >
            Acceder al Sistema
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
