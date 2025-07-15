// src/routes/twilioRoutes.js
const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
// Asegúrate de que TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN estén en tu .env
const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const router = express.Router();

// Ruta a la que Twilio enviará las solicitudes cuando reciba una llamada
// Esta es la URL que configuraste en el webhook de Twilio: /api/twilio/voice
router.post('/voice', (req, res) => {
    const twiml = new VoiceResponse();

    // Para el MVP inicial, simplemente haremos que Twilio responda con un saludo.
    // Después, aquí integraremos la lógica de la IA.
    twiml.say({ voice: 'alice', language: 'es-ES' }, 'Hola. Gracias por llamar a Atención al Cliente de Claro. Un momento por favor.');
    twiml.pause({ length: 1 }); // Pausa de 1 segundo

    // Por ahora, solo saluda y cuelga. Aquí es donde se conectará la IA después.
    twiml.hangup();

    res.type('text/xml'); // Twilio espera una respuesta XML
    res.send(twiml.toString());
});

// NUEVA RUTA: Para iniciar una llamada saliente a tu número en Colombia (para pruebas)
// Puedes acceder a esta ruta desde tu navegador (ej. http://localhost:3001/api/twilio/call-me)
router.get('/call-me', async (req, res) => {
    // ¡REEMPLAZA CON TU NÚMERO DE MÓVIL COLOMBIANO! Formato: +573XXXXXXXXX
    const yourColombianPhoneNumber = '+57XXXXXXXXXX'; // <-- ¡IMPORTANTE: Cámbialo por tu número real!

    if (!yourColombianPhoneNumber.startsWith('+57') || yourColombianPhoneNumber.length < 10) {
         return res.status(400).send('Por favor, configura un número de teléfono colombiano válido con código de país (+57) en twilioRoutes.js para la prueba de llamada saliente.');
    }

    try {
        // La URL de redirección DEBE ser tu URL de ngrok actual + /api/twilio/voice
        const ngrokUrl = 'https://39db6ae08b6b.ngrok-free.app'; // <-- ¡IMPORTANTE: Pega aquí tu URL de ngrok ACTIVA!
        const redirectUrl = `${ngrokUrl}/api/twilio/voice`;

        // Genera el TwiML directamente para la llamada saliente.
        // Esta llamada te reproducirá un mensaje y luego redirigirá a tu webhook /api/twilio/voice
        const twimlForOutgoingCall = `<Response><Say language="es-ES" voice="alice">Esta es una llamada de prueba desde tu sistema de atención al cliente de Claro. Conectando con la lógica principal.</Say><Pause length="2"/><Redirect method="POST">${redirectUrl}</Redirect></Response>`;

        await client.calls.create({
            twiml: twimlForOutgoingCall,
            to: yourColombianPhoneNumber,
            from: process.env.TWILIO_PHONE_NUMBER // Tu número de Twilio de EE. UU. (del .env)
        });
        res.send('Llamada saliente iniciada a ' + yourColombianPhoneNumber);
    } catch (error) {
        console.error('Error al iniciar la llamada saliente:', error);
        res.status(500).send('Error al iniciar la llamada: ' + error.message);
    }
});

module.exports = router;