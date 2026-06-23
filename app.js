/**
 * Dr. Bot PWA — Application Logic
 */

// DOM Elements
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const setupScreen   = $('#setup-screen');
const recorderScreen = $('#recorder-screen');
const tokenInput    = $('#token-input');
const saveTokenBtn  = $('#save-token-btn');
const cancelSetupBtn = $('#cancel-setup-btn');
const setupError    = $('#setup-error');
const recordBtn     = $('#record-btn');
const discardBtn    = $('#discard-btn');
const statusIcon    = $('#status-icon');
const statusText    = $('#status-text');
const timerEl       = $('#timer');
const notification  = $('#notification');
const notifIcon     = $('#notification-icon');
const notifText     = $('#notification-text');
const settingsBtn   = $('#settings-btn');

// Log Elements
const logPanel = $('#log-panel');
const logEntries = $('#log-entries');
const logToggleBtn = $('#log-toggle-btn');
let logCount = 0;

// Account Elements
const accountBtn = $('#account-btn');
const accountModal = $('#account-modal');
const accountCloseBtn = $('#account-close-btn');
const accountContent = $('#account-content');

// State
let mediaRecorder = null;
let audioChunks   = [];
let isRecording   = false;
let discardNext   = false;
let timerInterval = null;
let recordStart   = 0;

// API SERVER - Will be injected
const API_SERVER = 'https://garrett-apotropaic-trophically.ngrok-free.dev';

// Web Audio API State
let audioCtx      = null;
let analyser      = null;
let dataArray     = null;
let drawVisual    = null;
const canvas      = $('#audio-visualizer');
const canvasCtx   = canvas ? canvas.getContext('2d') : null;

function resizeCanvas() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const STORAGE_KEYS = {
    TOKEN:  'drbot_pwa_token',
    SKIN:   'drbot_pwa_skin',
};

function getToken()  { return localStorage.getItem(STORAGE_KEYS.TOKEN);  }
function getSkin()   { return localStorage.getItem(STORAGE_KEYS.SKIN) || 'normal'; }
function saveConfig(token) { localStorage.setItem(STORAGE_KEYS.TOKEN, token); }

function showSetup() {
    setupScreen.classList.remove('hidden');
    recorderScreen.classList.add('hidden');
    if (getToken()) {
        cancelSetupBtn.classList.remove('hidden');
    } else {
        cancelSetupBtn.classList.add('hidden');
    }
}

function showRecorder() {
    setupScreen.classList.add('hidden');
    recorderScreen.classList.remove('hidden');
}

function init() {
    if (getToken()) {
        showRecorder();
    } else {
        showSetup();
    }
    applySkin(getSkin());
}

saveTokenBtn.addEventListener('click', () => {
    const token  = tokenInput.value.trim();
    setupError.textContent = '';
    if (!token) {
        setupError.textContent = '❌ Ingresa tu token de acceso';
        return;
    }
    saveConfig(token);
    cancelSetupBtn.classList.add('hidden');
    showRecorder();
    showNotification('success', '✅', 'Configuración guardada');
});

cancelSetupBtn.addEventListener('click', showRecorder);

settingsBtn.addEventListener('click', () => {
    if (isRecording) return; 
    showSetup();
});

// LOG SYSTEM
function hasLogEntries() {
    return Boolean(logEntries.querySelector('.log-entry'));
}

function showLogPreview() {
    logPanel.classList.remove('hidden', 'fullscreen');
    recorderScreen.classList.add('log-preview-visible');
    recorderScreen.classList.remove('log-fullscreen-open');
}

function hideLogPanel() {
    logPanel.classList.add('hidden');
    logPanel.classList.remove('fullscreen');
    recorderScreen.classList.remove('log-preview-visible', 'log-fullscreen-open');
}

function openLogFullscreen() {
    logPanel.classList.remove('hidden');
    logPanel.classList.add('fullscreen');
    recorderScreen.classList.add('log-fullscreen-open');
    recorderScreen.classList.remove('log-preview-visible');
    logCount = 0;
    updateLogBadge();
}

function closeLogFullscreen() {
    logPanel.classList.remove('fullscreen');
    recorderScreen.classList.remove('log-fullscreen-open');
    if (hasLogEntries()) {
        showLogPreview();
    } else {
        hideLogPanel();
    }
}

function addLog(icon, message, type = 'info') {
    const now = new Date();
    const time = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const emptyMsg = logEntries.querySelector('.log-empty');
    if (emptyMsg) emptyMsg.remove();

    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.innerHTML = `<span class="log-time">${time}</span> <span class="log-icon">${icon}</span> <span class="log-msg">${message}</span>`;
    logEntries.prepend(entry);

    if (!logPanel.classList.contains('fullscreen')) {
        showLogPreview();
    }

    logCount++;
    updateLogBadge();
}

function updateLogBadge() {
    let badge = logToggleBtn.querySelector('.log-badge');
    if (!logPanel.classList.contains('fullscreen') && logCount > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'log-badge';
            logToggleBtn.appendChild(badge);
        }
        badge.textContent = logCount > 9 ? '9+' : logCount;
    } else if (badge) {
        badge.remove();
        logCount = 0;
    }
}

logToggleBtn.addEventListener('click', () => {
    if (logPanel.classList.contains('fullscreen')) {
        closeLogFullscreen();
    } else {
        openLogFullscreen();
    }
});

$('#log-clear-btn').addEventListener('click', () => {
    logEntries.innerHTML = '<p class="log-empty">Sin actividad aún</p>';
    logCount = 0;
    if (!logPanel.classList.contains('fullscreen')) {
        hideLogPanel();
    }
    updateLogBadge();
});
$('#log-close-btn').addEventListener('click', () => {
    if (logPanel.classList.contains('fullscreen')) {
        closeLogFullscreen();
    } else {
        hideLogPanel();
    }
});

// ACCOUNT SYSTEM
accountBtn.addEventListener('click', () => {
    accountModal.classList.remove('hidden');
    fetchAccountInfo();
});
accountCloseBtn.addEventListener('click', () => {
    accountModal.classList.add('hidden');
});
accountModal.addEventListener('click', (e) => {
    if (e.target === accountModal) accountModal.classList.add('hidden');
});

async function fetchAccountInfo() {
    const token = getToken();
    if (!token) return;
    accountContent.innerHTML = '<p class="account-loading">⏳ Cargando información...</p>';
    try {
        const resp = await fetch(`${API_SERVER}/api/account`, {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'ngrok-skip-browser-warning': 'true'
            },
        });
        if (resp.ok) {
            const data = await resp.json();
            renderAccountInfo(data);
        } else {
            accountContent.innerHTML = '<p class="account-error">❌ No se pudo cargar la información</p>';
        }
    } catch (err) {
        accountContent.innerHTML = '<p class="account-error">🌐 Error de conexión</p>';
    }
}

function renderAccountInfo(data) {
    const statusColor = data.payment_status === 'Al día' ? '#22c55e' 
        : data.payment_status.includes('Gracia') ? '#f59e0b' : '#ef4444';
    const telegramIcon = data.is_telegram_linked ? '✅' : '❌';
    const docIcon = data.has_transcription_doc ? '✅' : '❌';
    
    accountContent.innerHTML = `
        <div class="account-row"><span class="account-label">📧 Correo</span><span class="account-value">${data.email}</span></div>
        <div class="account-row"><span class="account-label">📊 Estado de pago</span><span class="account-value" style="color:${statusColor}">${data.payment_status}</span></div>
        <div class="account-row"><span class="account-label">📅 Próximo corte</span><span class="account-value">${data.next_payment_date}</span></div>
        <div class="account-row"><span class="account-label">⏳ Días restantes</span><span class="account-value">${data.days_remaining}</span></div>
        <div class="account-row"><span class="account-label">💳 Último pago</span><span class="account-value">${data.last_payment_date || 'Sin registro'}</span></div>
        <div class="account-row"><span class="account-label">📱 Telegram</span><span class="account-value">${telegramIcon} ${data.is_telegram_linked ? 'Vinculado' : 'No vinculado'}</span></div>
        <div class="account-row"><span class="account-label">📄 Doc. transcripciones</span><span class="account-value">${docIcon} ${data.has_transcription_doc ? 'Configurado' : 'Sin configurar'}</span></div>
        <div class="account-row"><span class="account-label">🟢 Estado</span><span class="account-value">${data.is_active ? 'Activa' : 'Inactiva'}</span></div>
    `;
}

// SKINS
function applySkin(skin) {
    document.body.classList.remove('skin-dim', 'skin-zen', 'skin-neon', 'skin-studio', 'skin-stealth');
    if (skin === 'dim')  document.body.classList.add('skin-dim');
    if (skin === 'zen')  document.body.classList.add('skin-zen');
    if (skin === 'neon') document.body.classList.add('skin-neon');
    if (skin === 'studio') document.body.classList.add('skin-studio');
    if (skin === 'stealth') document.body.classList.add('skin-stealth');

    $$('.skin-btn').forEach(btn => btn.classList.remove('active'));
    $(`#skin-${skin}`)?.classList.add('active');

    localStorage.setItem(STORAGE_KEYS.SKIN, skin);
}

$('#skin-normal').addEventListener('click', () => applySkin('normal'));
$('#skin-dim').addEventListener('click',    () => applySkin('dim'));
$('#skin-zen').addEventListener('click',    () => applySkin('zen'));
$('#skin-neon')?.addEventListener('click',   () => applySkin('neon'));
$('#skin-studio')?.addEventListener('click', () => applySkin('studio'));
$('#skin-stealth')?.addEventListener('click', () => applySkin('stealth'));

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

let notifTimeout = null;
function showNotification(type, icon, text, duration = 4000) {
    if (notifTimeout) clearTimeout(notifTimeout);

    notification.className = `notification ${type}`;
    notifIcon.textContent = icon;
    notifText.textContent = text;

    void notification.offsetWidth;
    notification.classList.add('visible');

    if (duration > 0) {
        notifTimeout = setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => notification.classList.add('hidden'), 400);
        }, duration);
    }
}

// AUDIO RECORDING
recordBtn.addEventListener('click', async () => {
    if (isRecording) stopRecording();
    else await startRecording();
});

discardBtn.addEventListener('click', () => {
    if (isRecording) {
        discardNext = true;
        stopRecording();
    }
});

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 } 
        });

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
            : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';

        const options = mimeType ? { mimeType } : {};
        mediaRecorder = new MediaRecorder(stream, options);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            
            if (discardNext) {
                discardNext = false;
                addLog('🗑️', 'Grabación desechada', 'warning');
                showNotification('warning', '🗑️', 'Grabación desechada', 3000);
                resetUI();
                return;
            }
            
            addLog('⏹️', `Grabación detenida (${timerEl.textContent})`, 'info');
            const ext = mediaRecorder.mimeType.includes('mp4') ? '.mp4' : '.webm';
            const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
            sendAudio(blob, ext);
        };

        mediaRecorder.onerror = (e) => {
            addLog('❌', `Error de grabación: ${e.error?.message}`, 'error');
            showNotification('error', '❌', `Error de grabación: ${e.error?.message || 'desconocido'}`);
            resetUI();
        };

        mediaRecorder.start(1000); 
        isRecording = true;
        startTimer();
        addLog('🎙️', 'Grabación iniciada', 'info');

        if (canvasCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createMediaStreamSource(stream);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            visualize();
        }

        recordBtn.classList.add('recording');
        discardBtn.classList.remove('hidden');
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
    
    if (drawVisual) cancelAnimationFrame(drawVisual);
    if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
    if (canvasCtx && canvas) canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    recordBtn.classList.remove('recording');
    discardBtn.classList.add('hidden');
    
    if (!discardNext) {
        recordBtn.classList.add('sending');
        statusIcon.textContent = '📤';
        statusText.textContent = 'Enviando y procesando...';
    }
}

function resetUI() {
    isRecording = false;
    discardNext = false;
    stopTimer();
    
    if (drawVisual) cancelAnimationFrame(drawVisual);
    if (audioCtx && audioCtx.state !== 'closed') audioCtx.close();
    if (canvasCtx && canvas) canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    
    recordBtn.classList.remove('recording', 'sending');
    discardBtn.classList.add('hidden');
    statusIcon.textContent = '🎙️';
    statusText.textContent = 'Toca para grabar';
    timerEl.textContent = '00:00';
}

function visualize() {
    if (!isRecording) return;
    drawVisual = requestAnimationFrame(visualize);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    let avgVolume = sum / dataArray.length;
    let volumeNorm = avgVolume / 256;

    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!document.body.classList.contains('skin-studio')) return;

    const time = Date.now() / 1000;
    const centerY = canvas.height / 2;
    const waves = [
        { color: 'rgba(94, 106, 210, 0.7)', freq: 0.01, speed: 2, ampOffset: 1 },
        { color: 'rgba(255, 74, 150, 0.7)', freq: 0.015, speed: 3, ampOffset: 0.8 },
        { color: 'rgba(74, 255, 200, 0.7)', freq: 0.008, speed: 1.5, ampOffset: 1.2 }
    ];

    canvasCtx.globalCompositeOperation = 'screen';
    waves.forEach(wave => {
        canvasCtx.beginPath();
        canvasCtx.lineWidth = 4;
        canvasCtx.strokeStyle = wave.color;
        const amplitude = (volumeNorm * 250 * wave.ampOffset) + 10;
        for (let x = 0; x < canvas.width; x += 5) {
            const y = centerY + Math.sin(x * wave.freq + time * wave.speed) * amplitude * Math.sin(x * Math.PI / canvas.width);
            if (x === 0) canvasCtx.moveTo(x, y);
            else canvasCtx.lineTo(x, y);
        }
        canvasCtx.stroke();
    });
    canvasCtx.globalCompositeOperation = 'source-over';
}

async function sendAudio(blob, ext) {
    const token  = getToken();
    if (!token) {
        showNotification('error', '⚙️', 'Token no configurado');
        resetUI();
        showSetup();
        return;
    }

    if (blob.size < 100) {
        addLog('⚠️', 'Audio demasiado corto', 'warning');
        showNotification('warning', '⚠️', 'Audio demasiado corto, intenta de nuevo');
        resetUI();
        return;
    }

    const formData = new FormData();
    formData.append('audio', blob, `recording${ext}`);
    addLog('📤', 'Enviando audio al servidor...', 'info');

    try {
        const response = await fetch(`${API_SERVER}/api/audio`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        if (response.ok) {
            const data = await response.json();
            addLog('✅', data.message || 'Audio procesado correctamente', 'success');
            addLog('📄', 'Transcripción confirmada en el documento de transcripciones', 'success');
            showNotification('success', '✅', data.message || 'Procesado y disponible en tu Google Doc');
        } else {
            let errorDetail = '';
            try {
                const errData = await response.json();
                errorDetail = errData.detail || '';
            } catch {
                errorDetail = response.statusText;
            }

            if (response.status === 401) {
                addLog('🔑', `Token inválido (401): ${errorDetail}`, 'error');
                showNotification('error', '🔑', `Token inválido (401): ${errorDetail}`, 6000);
            } else if (response.status === 400) {
                addLog('⚠️', `Solicitud inválida (400): ${errorDetail}`, 'error');
                showNotification('error', '⚠️', `Solicitud inválida (400): ${errorDetail}`, 6000);
            } else if (response.status === 500) {
                addLog('🔥', `Error del servidor (500): ${errorDetail}`, 'error');
                showNotification('error', '🔥', `Error en el servidor (500): ${errorDetail}`, 6000);
            } else {
                addLog('❌', `Error ${response.status}: ${errorDetail}`, 'error');
                showNotification('error', '❌', `Error ${response.status}: ${errorDetail}`, 6000);
            }
        }
    } catch (err) {
        if (!navigator.onLine) {
            addLog('📡', 'Sin conexión a internet', 'error');
            showNotification('error', '📡', 'Sin conexión a internet', 6000);
        } else if (err.name === 'TypeError' && err.message.includes('fetch')) {
            addLog('🌐', 'Error de red: no se pudo conectar al servidor', 'error');
            showNotification('error', '🌐', `Error de red: no se pudo conectar al servidor. Verifica la URL.`, 8000);
        } else {
            addLog('❌', `Error de conexión: ${err.message}`, 'error');
            showNotification('error', '❌', `Error de conexión: ${err.message}`, 6000);
        }
    } finally {
        resetUI();
    }
}

document.addEventListener('DOMContentLoaded', init);
