// server.js
require('dotenv').config();
const express = require('express');
const db = require('./src/config/db');
const twilioRoutes = require('./src/routes/twilioRoutes'); // <-- ¡IMPORTA LAS RUTAS DE TWILIO!
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
// ¡IMPORTANTE para Twilio! Twilio envía datos en formato URL-encoded
app.use(express.urlencoded({ extended: true })); // <-- ¡Asegúrate de que esta línea esté presente!

//Base de datos
// Ruta de prueba para verificar conexión a la DB
app.get('/api/clientes', async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM clientes');
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener clientes:', error);
        res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
});

app.get('/', (req, res) => {
    res.send('Backend de Atención al Cliente con IA funcionando!');
});

// ¡USA LAS RUTAS DE TWILIO! Todas las rutas en twilioRoutes.js estarán bajo /api/twilio
app.use('/api/twilio', twilioRoutes); // <-- ¡Asegúrate de que esta línea esté presente!

app.listen(PORT, () => {
    console.log(`Servidor Node.js escuchando en el puerto ${PORT}`);
    console.log(`Accede a http://localhost:${PORT}`);
    console.log(`Prueba la API de clientes en http://localhost:${PORT}/api/clientes`);
    console.log(`Webhook de Twilio esperado en http://localhost:${PORT}/api/twilio/voice`);
});
