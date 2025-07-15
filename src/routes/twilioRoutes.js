// src/routes/twilioRoutes.js
const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const aiService = require('../services/aiService'); // IMPORTADO
const db = require('../config/db'); // IMPORTADO
const router = express.Router();

// Almacenamiento temporal para el estado de la conversación por cada llamada (solo para MVP)
const callStates = {};

// Ruta a la que Twilio enviará las solicitudes cuando reciba una llamada (el webhook principal)
router.post('/voice', async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body.CallSid;
    const clientPhoneNumber = req.body.From;

    // Siempre inicializa/reinicia el estado de la llamada al inicio de /voice
    callStates[callSid] = {
        conversation: [],
        phoneNumber: clientPhoneNumber,
        lastPrompt: '',
    };
    
    twiml.say({ voice: 'alice', language: 'es-ES' }, 'Hola. Gracias por llamar a Atención al Cliente de Claro.');
    twiml.pause({ length: 1 });
    twiml.say({ voice: 'alice', language: 'es-ES' }, 'Por favor, dime tu consulta.');

    // <Gather> para capturar la entrada de voz del usuario
    twiml.gather({
        input: 'speech',
        timeout: 5,
        action: '/api/twilio/voice_input',
        speechTimeout: 'auto',
        language: 'es-CO',
    });
    res.type('text/xml');
    return res.send(twiml.toString());
});


// Ruta para manejar la entrada de voz del usuario (desde <Gather>)
router.post('/voice_input', async (req, res) => {
    const twiml = new VoiceResponse();
    const callSid = req.body.CallSid;
    const clientSays = req.body.SpeechResult;
    const clientPhoneNumber = req.body.From;

    if (!callStates[callSid]) {
        twiml.say({ voice: 'alice', language: 'es-ES' }, 'Lo siento, ha ocurrido un error en la sesión. Por favor, intente de nuevo.');
        twiml.hangup();
        res.type('text/xml');
        return res.send(twiml.toString());
    }

    if (!clientSays || clientSays.trim() === '') {
        console.log(`No se detectó voz o la transcripción está vacía para la llamada ${callSid}`);
        twiml.say({ voice: 'alice', language: 'es-ES' }, 'No pude entender lo que dijiste. Por favor, repite tu consulta.');
        twiml.gather({
            input: 'speech',
            timeout: 5,
            action: '/api/twilio/voice_input',
            speechTimeout: 'auto',
            language: 'es-CO',
        });
        res.type('text/xml');
        return res.send(twiml.toString());
    }

    console.log(`Cliente (${clientPhoneNumber}) dice: "${clientSays}"`);
    callStates[callSid].conversation.push({ from: 'user', text: clientSays });
    callStates[callSid].lastPrompt = clientSays;

    try {
        let userData = {};
        try {
            const [clientRows] = await db.execute(
                'SELECT id, nombre, numero_telefono, plan_actual, saldo_actual FROM clientes WHERE numero_telefono = ?',
                [clientPhoneNumber]
            );
            if (clientRows.length > 0) {
                userData = clientRows[0];
                // --- CORRECCIÓN: Obtener TODOS los servicios ---
                const [allServices] = await db.execute(
                    'SELECT nombre_servicio, descripcion, estado_red FROM servicios' // SIN LIMIT 1
                );
                if (allServices.length > 0) {
                    userData.servicios_disponibles = allServices.map(s =>
                        `${s.nombre_servicio}: ${s.descripcion} (Estado: ${s.estado_red})`
                    ).join('; '); // Une todos los servicios en una sola cadena
                } else {
                    userData.servicios_disponibles = 'No hay servicios adicionales registrados.';
                }
            } else {
                console.log(`Cliente con número ${clientPhoneNumber} no encontrado en la DB.`);
            }
        } catch (dbError) {
            console.error('Error al consultar la base de datos:', dbError);
        }

        const aiResponseText = await aiService.getAIResponse(callStates[callSid].lastPrompt, userData);
        console.log(`IA responde: "${aiResponseText}"`);
        callStates[callSid].conversation.push({ from: 'ai', text: aiResponseText });

        twiml.say({ voice: 'alice', language: 'es-ES' }, aiResponseText);

        if (aiResponseText.toLowerCase().includes('agente humano') || aiResponseText.toLowerCase().includes('agente de soporte')) {
            twiml.say({ voice: 'alice', language: 'es-ES' }, 'Un momento, por favor, le conecto con un agente humano.');
            twiml.hangup(); 
            delete callStates[callSid];
        } else {
            twiml.gather({
                input: 'speech',
                timeout: 5,
                action: '/api/twilio/voice_input',
                speechTimeout: 'auto',
                language: 'es-CO',
            });
        }

    } catch (error) {
        console.error('Error durante el proceso de IA en /voice_input:', error);
        twiml.say({ voice: 'alice', language: 'es-ES' }, 'Lo siento, ha ocurrido un error al procesar tu solicitud. Por favor, intenta de nuevo.');
        twiml.gather({
            input: 'speech',
            timeout: 5,
            action: '/api/twilio/voice_input',
            speechTimeout: 'auto',
            language: 'es-CO',
        });
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

// Ruta para la llamada saliente (se mantiene igual, solo actualizar ngrokUrl)
router.get('/call-me', async (req, res) => {
    const yourColombianPhoneNumber = '+573007727550'; // Tu número verificado en Twilio

    if (!yourColombianPhoneNumber.startsWith('+57') || yourColombianPhoneNumber.length < 10) {
         return res.status(400).send('Por favor, configura un número de teléfono colombiano válido con código de país (+57) en twilioRoutes.js para la prueba de llamada saliente.');
    }

    try {
        const ngrokUrl = 'https://15108a79fc2e.ngrok-free.app'; // <--- ¡IMPORTANTE: Pega aquí tu URL de ngrok ACTIVA!
        const redirectUrl = `${ngrokUrl}/api/twilio/voice`;

        const twimlForOutgoingCall = `<Response><Say language="es-ES" voice="alice">Esta es una llamada de prueba desde tu sistema de atención al cliente de Claro. Conectando con la lógica principal.</Say><Pause length="2"/><Redirect method="POST">${redirectUrl}</Redirect></Response>`;

        await client.calls.create({
            twiml: twimlForOutgoingCall,
            to: yourColombianPhoneNumber,
            from: process.env.TWILIO_PHONE_NUMBER
        });
        res.send('Llamada saliente iniciada a ' + yourColombianPhoneNumber);
    } catch (error) {
        console.error('Error al iniciar la llamada saliente:', error);
        res.status(500).send('Error al iniciar la llamada: ' + error.message);
    }
});

module.exports = router;