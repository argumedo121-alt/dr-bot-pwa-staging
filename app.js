/**
 * Dr. Bot PWA — Application Logic
 * 
 * Handles: Token auth (localStorage), audio recording (MediaRecorder API),
 * server communication, skin switching, and error notifications.
 * 
 * Audio format: webm (native browser codec, verified compatible with Gemini API).
 */

// ═══════════════════════════════════════════════════
// DOM Elements
// ═══════════════════════════════════════════════════
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const setupScreen   = $('#setup-screen');
const recorderScreen = $('#recorder-screen');
const tokenInput    = $('#token-input');
const saveTokenBtn  = $('#save-token-btn');
const setupError    = $('#setup-error');
const recordBtn     = $('#record-btn');
const statusIcon    = $('#status-icon');
const statusText    = $('#status-text');
const timerEl       = $('#timer');
const notification  = $('#notification');
const notifIcon     = $('#notification-icon');
const notifText     = $('#notification-text');
const settingsBtn   = $('#settings-btn');

// ═══════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════
let mediaRecorder = null;
let audioChunks   = [];
let isRecording   = false;
let timerInterval = null;
let recordStart   = 0;

// ═══════════════════════════════════════════════════
// Configuración de Servidor
// ═══════════════════════════════════════════════════
// Ngrok Tunnel (HTTPS seguro)
const API_SERVER = 'https://garrett-apotropaic-trophically.ngrok-free.dev';

// ═══════════════════════════════════════════════════
// Storage Helpers
// ═══════════════════════════════════════════════════
const STORAGE_KEYS = {
    TOKEN:  'drbot_pwa_token',
    SKIN:   'drbot_pwa_skin',
};

function getToken()  { return localStorage.getItem(STORAGE_KEYS.TOKEN);  }
function getSkin()   { return localStorage.getItem(STORAGE_KEYS.SKIN) || 'normal'; }

function saveConfig(token) {
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
}

// ═══════════════════════════════════════════════════
// Screen Navigation
// ═══════════════════════════════════════════════════
function showSetup() {
    setupScreen.classList.remove('hidden');
    recorderScreen.classList.add('hidden');
}

function showRecorder() {
    setupScreen.classList.add('hidden');
    recorderScreen.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════
function init() {
    const token  = getToken();

    if (token) {
        showRecorder();
    } else {
        showSetup();
    }

    // Apply saved skin
    applySkin(getSkin());
}

// ═══════════════════════════════════════════════════
// Token Setup
// ═══════════════════════════════════════════════════
saveTokenBtn.addEventListener('click', () => {
    const token  = tokenInput.value.trim();

    setupError.textContent = '';

    if (!token) {
        setupError.textContent = '❌ Ingresa tu token de acceso';
        return;
    }

    saveConfig(token);
    showRecorder();
    showNotification('success', '✅', 'Configuración guardada');
});

// Settings button → go back to setup
settingsBtn.addEventListener('click', () => {
    if (isRecording) return; // Don't allow during recording
    showSetup();
});

// ═══════════════════════════════════════════════════
// Skin Switching
// ═══════════════════════════════════════════════════
function applySkin(skin) {
    document.body.classList.remove('skin-dim', 'skin-zen', 'skin-neon');
    if (skin === 'dim')  document.body.classList.add('skin-dim');
    if (skin === 'zen')  document.body.classList.add('skin-zen');
    if (skin === 'neon') document.body.classList.add('skin-neon');

    $$('.skin-btn').forEach(btn => btn.classList.remove('active'));
    $(`#skin-${skin}`)?.classList.add('active');

    localStorage.setItem(STORAGE_KEYS.SKIN, skin);
}

$('#skin-normal').addEventListener('click', () => applySkin('normal'));
$('#skin-dim').addEventListener('click',    () => applySkin('dim'));
$('#skin-zen').addEventListener('click',    () => applySkin('zen'));
$('#skin-neon').addEventListener('click',   () => applySkin('neon'));

// ═══════════════════════════════════════════════════
// Timer
// ═══════════════════════════════════════════════════
function startTimer() {
    recordStart = Date.now();
    timerEl.textContent = '00:00';
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordStart) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

// ═══════════════════════════════════════════════════
// Notifications
// ═══════════════════════════════════════════════════
let notifTimeout = null;

function showNotification(type, icon, text, duration = 4000) {
    if (notifTimeout) clearTimeout(notifTimeout);

    notification.className = `notification ${type}`;
    notifIcon.textContent = icon;
    notifText.textContent = text;

    // Force reflow for animation
    void notification.offsetWidth;
    notification.classList.add('visible');

    if (duration > 0) {
        notifTimeout = setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => notification.classList.add('hidden'), 400);
        }, duration);
    }
}

// ═══════════════════════════════════════════════════
// Audio Recording
// ═══════════════════════════════════════════════════
recordBtn.addEventListener('click', async () => {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
});

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100,
            } 
        });

        // Determine best supported MIME type
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : MediaRecorder.isTypeSupported('audio/mp4')
                    ? 'audio/mp4'
                    : ''; // Browser default

        const options = mimeType ? { mimeType } : {};
        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            // Stop all tracks to release mic
            stream.getTracks().forEach(t => t.stop());
            
            const ext = mediaRecorder.mimeType.includes('mp4') ? '.mp4' : '.webm';
            const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
            sendAudio(blob, ext);
        };

        mediaRecorder.onerror = (e) => {
            showNotification('error', '❌', `Error de grabación: ${e.error?.message || 'desconocido'}`);
            resetUI();
        };

        mediaRecorder.start(1000); // Collect data every 1s
        isRecording = true;
        startTimer();

        // Update UI
        recordBtn.classList.add('recording');
        statusIcon.textContent = '🔴';
        statusText.textContent = 'Grabando... toca para detener';

    } catch (err) {
        if (err.name === 'NotAllowedError') {
            showNotification('error', '🎤', 'Permiso de micrófono denegado. Habilítalo en Configuración.');
        } else if (err.name === 'NotFoundError') {
            showNotification('error', '🎤', 'No se encontró ningún micrófono.');
        } else {
            showNotification('error', '❌', `Error al iniciar grabación: ${err.message}`);
        }
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    isRecording = false;
    stopTimer();

    // Update UI to sending state
    recordBtn.classList.remove('recording');
    recordBtn.classList.add('sending');
    statusIcon.textContent = '📤';
    statusText.textContent = 'Enviando y procesando...';
}

function resetUI() {
    isRecording = false;
    stopTimer();
    recordBtn.classList.remove('recording', 'sending');
    statusIcon.textContent = '🎙️';
    statusText.textContent = 'Toca para grabar';
    timerEl.textContent = '00:00';
}

// ═══════════════════════════════════════════════════
// Send Audio to Server
// ═══════════════════════════════════════════════════
async function sendAudio(blob, ext) {
    const token  = getToken();

    if (!token) {
        showNotification('error', '⚙️', 'Token no configurado');
        resetUI();
        showSetup();
        return;
    }

    // Validate non-empty audio
    if (blob.size < 100) {
        showNotification('warning', '⚠️', 'Audio demasiado corto, intenta de nuevo');
        resetUI();
        return;
    }

    const formData = new FormData();
    formData.append('audio', blob, `recording${ext}`);

    try {
        const response = await fetch(`${API_SERVER}/api/audio`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        if (response.ok) {
            const data = await response.json();
            showNotification('success', '✅', data.message || 'Procesado y disponible en tu Google Doc');
        } else {
            // Parse error for specific debugging
            let errorDetail = '';
            try {
                const errData = await response.json();
                errorDetail = errData.detail || '';
            } catch {
                errorDetail = response.statusText;
            }

            switch (response.status) {
                case 401:
                    showNotification('error', '🔑', `Token inválido (401): ${errorDetail}`, 6000);
                    break;
                case 400:
                    showNotification('error', '⚠️', `Solicitud inválida (400): ${errorDetail}`, 6000);
                    break;
                case 500:
                    showNotification('error', '🔥', `Error en el servidor (500): ${errorDetail}`, 6000);
                    break;
                default:
                    showNotification('error', '❌', `Error ${response.status}: ${errorDetail}`, 6000);
            }
        }
    } catch (err) {
        // Network errors (offline, DNS, CORS, timeout)
        if (!navigator.onLine) {
            showNotification('error', '📡', 'Sin conexión a internet', 6000);
        } else if (err.name === 'TypeError' && err.message.includes('fetch')) {
            showNotification('error', '🌐', `Error de red: no se pudo conectar al servidor. Verifica la URL.`, 8000);
        } else {
            showNotification('error', '❌', `Error de conexión: ${err.message}`, 6000);
        }
    } finally {
        resetUI();
    }
}

// ═══════════════════════════════════════════════════
// Boot
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', init);
