const express = require('express');
const { Pool } = require('pg');
const cors = require('cors'); // Para permitir solicitudes desde el frontend

const app = express();
const port = process.env.PORT || 3000;

// Configuración de la base de datos
const pool = new Pool({
  user: process.env.DB_USER || 'user',
  host: process.env.DB_HOST || 'db_primary', // Nombre del servicio Docker para la DB primaria
  database: process.env.DB_NAME || 'jbs_db',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
  // Opcional: Configuración de reintentos y timeouts para la conexión a la DB
  connectionTimeoutMillis: 5000, // 5 segundos para establecer la conexión
  idleTimeoutMillis: 30000, // 30 segundos para cerrar conexiones inactivas
  max: 20 // Máximo de conexiones en el pool
});

// Helper function for retries
async function retryOperation(operation, maxRetries = 5, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i < maxRetries - 1) {
        console.warn(`Attempt ${i + 1} failed. Retrying in ${delay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; 
      } else {
        throw error; 
      }
    }
  }
}

// Middleware
app.use(cors()); // Habilitar CORS para el frontend
app.use(express.json()); // Para parsear JSON en el cuerpo de las solicitudes

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/api/app-id', (req, res) => {
  res.json({ appId: process.env.APP_ID });
});


app.post('/api/accounts', async (req, res) => {
  const { name, initialBalance } = req.body;

  if (!name || typeof initialBalance !== 'number' || initialBalance < 0) {
    return res.status(400).json({ message: 'Nombre y monto inicial válido son requeridos.' });
  }

  try {
    const newAccount = await retryOperation(async () => {
      const client = await pool.connect();
      try {
        const result = await client.query(
          'INSERT INTO accounts (name, balance) VALUES ($1, $2) RETURNING id, name, balance',
          [name, initialBalance]
        );
        return result.rows[0];
      } finally {
        client.release(); // Liberar el cliente de la conexión
      }
    });
    res.status(201).json(newAccount);
  } catch (err) {
    console.error('Error al crear cuenta:', err);
    res.status(500).json({ message: 'Error interno del servidor al crear cuenta.', error: err.message });
  }
});

app.get('/api/accounts', async (req, res) => {
  try {
    const accounts = await retryOperation(async () => {
      const client = await pool.connect();
      try {
        const result = await client.query('SELECT id, name, balance FROM accounts ORDER BY id ASC');
        return result.rows.map(account => ({
          ...account,
          balance: parseFloat(account.balance) // Convert balance to float
        }));
      } finally {
        client.release();
      }
    });
    res.json(accounts);
  } catch (err) {
    console.error('Error al listar cuentas:', err);
    res.status(500).json({ message: 'Error interno del servidor al listar cuentas.', error: err.message });
  }
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor de la API JFBS escuchando en el puerto ${port}`);
});

// Manejo de errores de conexión a la DB
pool.on('error', (err, client) => {
  console.error('Error inesperado en el pool de la DB:', err);
});

// Crear tabla si no existe (solo para desarrollo/primera ejecución)
async function createTable() {
  try {
    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        balance NUMERIC(15, 2) NOT NULL DEFAULT 0.00
      );
    `);
    client.release();
    console.log('Tabla "accounts" verificada/creada.');
  } catch (err) {
    console.error('Error al crear la tabla de cuentas:', err);
  }
}

createTable();
