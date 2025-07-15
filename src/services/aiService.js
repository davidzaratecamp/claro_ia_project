const speech = require('@google-cloud/speech').v1p1beta1;
const textToSpeech = require('@google-cloud/text-to-speech').v1beta1;
const { GoogleGenerativeAI } = require('@google/generative-ai');

const speechClient = new speech.SpeechClient();
const ttsClient = new textToSpeech.TextToSpeechClient();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

/**
 * Envía una consulta a la IA (Gemini) y obtiene una respuesta.
 * Esta función es la que procesa el texto del usuario y los datos de la DB.
 * @param {string} prompt El texto de la consulta del usuario.
 * @param {object} userData Datos relevantes del cliente de MySQL.
 * @returns {string} La respuesta generada por la IA.
 */
async function getAIResponse(prompt, userData = {}) {
    // Detectar si el cliente está saludando
    const saludoCliente = /hola|buenos días|buenas tardes|buenas noches|qué tal|como estás|como esta/i.test(prompt);

    // Saludo personalizado si aplica
    const saludoInicial = saludoCliente && userData.nombre
        ? `Hola ${userData.nombre}, `
        : '';

    // Construcción del prompt completo
    let fullPrompt = `Eres un asistente de atención al cliente de Claro Colombia. Tu objetivo es resolver las dudas del cliente o, si no puedes, indicar que escalarás la llamada a un agente humano. No inventes información. Si te preguntan por un tema que no es Claro, informa que solo puedes ayudar con servicios de Claro. Mantén las respuestas concisas y directas. **Evita saludos redundantes o repetitivos en cada turno. Solo saluda si el cliente lo hace primero.**

Consulta del cliente: "${prompt}"\n`;

    if (userData && Object.keys(userData).length > 0) {
        fullPrompt += `\nInformación relevante del cliente (de la base de datos):
- Nombre: ${userData.nombre || 'No disponible'}
- Número de Teléfono: ${userData.numero_telefono || 'No disponible'}
- Plan Actual: ${userData.plan_actual || 'No disponible'}
- Saldo Actual: ${userData.saldo_actual !== undefined ? `₡${parseFloat(userData.saldo_actual).toFixed(2)}` : 'No disponible'}
- Estado de Servicios/Red: ${userData.estado_red || 'No disponible'}
- Descripción de Servicio: ${userData.descripcion_servicio || 'No disponible'}
- Servicios Adicionales Disponibles para Contratar (si no están ya en el plan del cliente): ${userData.servicios_disponibles || 'No disponible'}\n`;
    }

    fullPrompt += `\nBasado en la consulta del cliente y la información proporcionada, tu respuesta:\n${saludoInicial}`;

    console.log("--- PROMPT ENVIADO A GEMINI ---");
    console.log(fullPrompt);
    console.log("------------------------------");

    try {
        const result = await geminiModel.generateContent(fullPrompt);
        const response = await result.response;
        const text = response.text();
        return text;
    } catch (error) {
        console.error('Error al obtener respuesta de Gemini:', error);
        if (error.response && error.response.promptFeedback && error.response.promptFeedback.blockReason) {
            console.error('Gemini bloqueó la respuesta:', error.response.promptFeedback.blockReason);
            return "Lo siento, no puedo procesar esa solicitud por razones de seguridad. ¿Podrías reformular tu pregunta?";
        }
        return "Lo siento, tengo dificultades para procesar tu solicitud en este momento. Por favor, intenta de nuevo o espera por un agente humano.";
    }
}

/**
 * Convierte texto a audio.
 * @param {string} text El texto a sintetizar.
 * @returns {Buffer} El buffer de audio (en formato LINEAR16, listo para Twilio).
 */
async function synthesizeSpeech(text) {
    const request = {
        input: { text: text },
        voice: { languageCode: 'es-US', ssmlGender: 'FEMALE' },
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 8000 },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    return response.audioContent;
}

module.exports = {
    getAIResponse,
    synthesizeSpeech
};
