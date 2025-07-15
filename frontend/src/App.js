import React, { useState, useEffect } from 'react';
import './App.css';

// Circuit Breaker Configuration
const CIRCUIT_BREAKER_THRESHOLD = 3; // Number of consecutive failures before opening the circuit
const CIRCUIT_BREAKER_TIMEOUT = 5000; // Time in ms to stay open before half-opening

let circuitState = 'CLOSED';
let failureCount = 0;
let lastFailureTime = 0;

// Helper function for retries with Circuit Breaker
async function retryFetch(url, options, maxRetries = 3, delay = 1000) {
  if (circuitState === 'OPEN') {
    if (Date.now() - lastFailureTime > CIRCUIT_BREAKER_TIMEOUT) {
      circuitState = 'HALF-OPEN';
      console.warn("Circuit Breaker: Half-opening circuit for", url);
    } else {
      console.warn("Circuit Breaker: Circuit is OPEN. Request rejected for", url);
      throw new Error("Circuit Breaker: Service unavailable.");
    }
  }

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && response.status >= 500) { // Retry on server errors
        throw new Error(`Server error: ${response.status}`);
      }

      // If successful, reset circuit breaker
      if (circuitState !== 'CLOSED') {
        console.info("Circuit Breaker: Request successful. Closing circuit.");
        circuitState = 'CLOSED';
        failureCount = 0;
      }
      return response;
    } catch (error) {
      if (circuitState === 'HALF-OPEN') {
        console.warn("Circuit Breaker: Test request failed. Re-opening circuit for", url);
        circuitState = 'OPEN';
        lastFailureTime = Date.now();
        throw new Error("Circuit Breaker: Service unavailable after test.");
      }

      failureCount++;
      if (failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
        circuitState = 'OPEN';
        lastFailureTime = Date.now();
        console.error("Circuit Breaker: Threshold reached. Opening circuit for", url);
        throw new Error("Circuit Breaker: Service unavailable.");
      }

      if (i < maxRetries - 1) {
        console.warn(`Attempt ${i + 1} failed for ${url}. Retrying in ${delay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        throw error; // Last attempt, re-throw the error
      }
    }
  }
}

function App() {
  const [accounts, setAccounts] = useState([]);
  const [name, setName] = useState('');
  const [initialBalance, setInitialBalance] = useState('');
  const [message, setMessage] = useState('');
  const [appId, setAppId] = useState(null);

  const API_URL = process.env.REACT_APP_API_URL || '/api'; // Usar proxy en desarrollo, o ruta directa en producción

  const fetchAppId = async () => {
    try {
      const response = await retryFetch(`${API_URL}/app-id`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAppId(data.appId);
      console.log("Connected to backend instance:", data.appId);
    } catch (error) {
      console.error("Error fetching app ID:", error);
      // Optionally set a message for the user or a default app ID
    }
  };

  const fetchAccounts = async () => {
    try {
      const response = await retryFetch(`${API_URL}/accounts`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAccounts(data);
    } catch (error) {
      console.error("Error fetching accounts:", error);
      setMessage(`Error al cargar cuentas: ${error.message}`);
    }
  };

  const createAccount = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const response = await retryFetch(`${API_URL}/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, initialBalance: parseFloat(initialBalance) }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }
      const newAccount = await response.json();
      setMessage(`Cuenta '${newAccount.name}' creada con éxito! ID: ${newAccount.id}`);
      setName('');
      setInitialBalance('');
      fetchAccounts(); // Refresh the list
    } catch (error) {
      console.error("Error creating account:", error);
      setMessage(`Error al crear cuenta: ${error.message}`);
    }
  };

  useEffect(() => {
    fetchAppId();
    fetchAccounts();
  }, []);

  return (
    <div className="App">
      <nav className="navbar">
        <h1>JFBS - Joseph Fabian Banking System</h1>
        {appId && <h1 className="app-id-display">AppID: {appId}</h1>}
        <ul>
          <li><a href="#create">Crear Cuenta</a></li>
          <li><a href="#list">Listar Cuentas</a></li>
        </ul>
      </nav>

      <div className="container">
        <section id="create">
          <h2>Crear Nueva Cuenta</h2>
          <form onSubmit={createAccount}>
            <div>
              <label>Nombre:</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label>Monto Inicial:</label>
              <input
                type="number"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                min="0"
                step="0.01"
                required
              />
            </div>
            <button type="submit">Crear Cuenta</button>
          </form>
          {message && <p className="message">{message}</p>}
        </section>

        <section id="list">
          <h2>Cuentas Disponibles</h2>
          {accounts.length === 0 ? (
            <p>No hay cuentas disponibles.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.id}</td>
                    <td>{account.name}</td>
                    <td>${parseFloat(account.balance || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

export default App;
