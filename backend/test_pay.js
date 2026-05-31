const baseUrl = 'http://localhost:5000/api';
(async () => {
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '5678' })
  });
  const data = await loginRes.json();
  const token = data.token;
  
  const payRes = await fetch(`${baseUrl}/orders/8/pay`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ metodo_pago: 'EFECTIVO', monto_pagado: 38.99, referencia: null })
  });
  console.log("PAY STATUS:", payRes.status);
  const payData = await payRes.json();
  console.log("PAY RESPONSE:", payData);
})();
