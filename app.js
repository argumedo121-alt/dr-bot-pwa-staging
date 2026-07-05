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

saveTokenBtn.addEventListener('click', async () => {
    const token  = tokenInput.value.trim();
    setupError.textContent = '';
    if (!token) {
        setupError.textContent = '❌ Ingresa tu token de acceso';
        return;
    }

    // Validación contra el backend antes de aceptar el token.
    const originalText = saveTokenBtn.textContent;
    saveTokenBtn.disabled = true;
    saveTokenBtn.textContent = 'Verificando…';

    try {
        const resp = await fetch(`${API_SERVER}/api/account`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'ngrok-skip-browser-warning': 'true'
            },
        });

        if (resp.ok) {
            saveConfig(token);
            cancelSetupBtn.classList.add('hidden');
            showRecorder();
            showNotification('success', '✅', 'Token válido. Conectado');
        } else if (resp.status === 401) {
            setupError.textContent = '❌ Token inválido. Revísalo e intenta de nuevo.';
        } else {
            // Error del servidor (5xx, etc.): no concluimos que el token esté mal.
            saveConfig(token);
            cancelSetupBtn.classList.add('hidden');
            showRecorder();
            showNotification('warning', '⚠️', 'No se pudo verificar el token, pero se guardó. Si falla, revisa tu conexión.');
        }
    } catch (err) {
        // Error de red: mantenemos el token (podría ser válido) y dejamos avanzar al médico.
        saveConfig(token);
        cancelSetupBtn.classList.add('hidden');
        showRecorder();
        showNotification('warning', '🌐', 'Sin conexión para verificar el token. Se guardó; verifícalo si falla.');
    } finally {
        saveTokenBtn.disabled = false;
        saveTokenBtn.textContent = originalText;
    }
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
    if (recordBtn.classList.contains('failed')) { manualRetry(); return; }
    if (isRecording) stopRecording();
    else await startRecording();
});

discardBtn.addEventListener('click', () => {
    // Modo 1: estado .failed terminal → descartar definitivo.
    if (recordBtn.classList.contains('failed')) { manualDiscard(); return; }
    // Modo 2: reintento en background → señalar cancelación para el orquestador.
    if (discardBtn.classList.contains('background-discard')) {
        userCancelledSend = true;
        return;
    }
    // Modo 3: grabando → descartar la grabación en curso.
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
    clearMicFeedback();

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
    clearMicFeedback();

    recordBtn.classList.remove('recording', 'sending');
    discardBtn.classList.add('hidden');
    statusIcon.textContent = '🎙️';
    statusText.textContent = 'Toca para grabar';
    timerEl.textContent = '00:00';
}

function clearMicFeedback() {
    // Limpia los estilos inline aplicados al status-icon por el feedback de skins sobrias.
    statusIcon.style.opacity = '';
    statusIcon.style.transform = '';
}

function visualize() {
    if (!isRecording) return;
    drawVisual = requestAnimationFrame(visualize);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    let avgVolume = sum / dataArray.length;
    let volumeNorm = avgVolume / 256;

    const isZen     = document.body.classList.contains('skin-zen');
    const isStealth = document.body.classList.contains('skin-stealth');

    // Skins sobrias: feedback mínimo vía el icono de estado (sin dibujar en canvas),
    // para que el médico sepa que el micrófono está captando. Preserva la estética.
    if (isZen || isStealth) {
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        const intensity = Math.min(1, volumeNorm * 3); // amplifica la señal útil
        statusIcon.style.opacity  = (0.2 + intensity * 0.5).toFixed(2);
        statusIcon.style.transform = `scale(${(1 + intensity * 0.25).toFixed(3)})`;
        return;
    }

    if (!document.body.classList.contains('skin-studio')) return;

    // Limpia los estilos inline aplicados en skins sobrias si se rotó de skin en caliente.
    statusIcon.style.opacity = '';
    statusIcon.style.transform = '';

    const time = Date.now() / 1000;
    const centerY = canvas.height / 2;
    const waves = [
        { color: 'rgba(94, 106, 210, 0.7)', freq: 0.01, speed: 2, ampOffset: 1 },
        { color: 'rgba(255, 74, 150, 0.7)', freq: 0.015, speed: 3, ampOffset: 0.8 },
        { color: 'rgba(74, 255, 200, 0.7)', freq: 0.008, speed: 1.5, ampOffset: 1.2 }
    ];

    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
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

// ─── Send status (color del botón en reposo) ───
// 'virgin' (azul, default) | 'success' (verde) | 'failed' (rojo)
let lastSendStatus = 'virgin';

function setButtonStatus(status) {
    lastSendStatus = status;
    recordBtn.classList.remove('status-success', 'status-failed');
    if (status === 'success') recordBtn.classList.add('status-success');
    else if (status === 'failed') recordBtn.classList.add('status-failed');
}

// ─── Failed state UI (reintento manual / descartar) ───
let pendingSend = null; // { blob, ext } de la grabación que está en reintento

function setFailedState(message) {
    recordBtn.classList.remove('sending');
    recordBtn.classList.add('failed');
    recordBtn.setAttribute('aria-label', 'Reintentar envío');
    statusIcon.textContent = '⚠️';
    statusText.textContent = message || 'Sin conexión. Toca reintentar o descartar.';
    // En .failed: el botón grande = "Reintentar", el botón secundario = "Descartar".
    discardBtn.classList.remove('hidden');
    discardBtn.setAttribute('aria-label', 'Descartar envío');
    discardBtn.querySelector('.discard-icon').textContent = '🗑️';
    discardBtn.lastChild.textContent = ' Descartar';
    setButtonStatus('failed');
}

function clearFailedState() {
    recordBtn.classList.remove('failed');
    recordBtn.setAttribute('aria-label', 'Grabar');
    discardBtn.classList.add('hidden');
    discardBtn.setAttribute('aria-label', 'Desechar');
    discardBtn.querySelector('.discard-icon').textContent = '🗑️';
    discardBtn.lastChild.textContent = ' Cancelar';
    pendingSend = null;
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

    // Orquestación de reintentos con backoff exponencial.
    // - Microcortes transitorios: el médico no toca nada, se resuelven solos.
    // - Sin señal persistente: el Descartar aparece desde el primer fallo para que el médico
    //   decida irse al Google Doc ya, sin esperar a que terminen los reintentos automáticos.
    const BACKOFF_MS = [2000, 5000, 15000]; // 3 reintentos automáticos
    let attempt = 0;
    userCancelledSend = false; // reset por si viene de un envío anterior

    while (true) {
        if (userCancelledSend) {
            // El médico tocó Descartar durante un reintento en background.
            addLog('🗑️', 'Envío cancelado por el médico', 'warning');
            clearFailedState();
            resetUI();
            return;
        }

        const result = await attemptSend(blob, ext, token);
        attempt++;

        if (result.outcome === 'completed') {
            addLog('📄', result.message || 'Transcripción escrita en Google Doc', 'success');
            showNotification('success', '✅', result.message || 'Transcripción escrita');
            setButtonStatus('success');
            clearFailedState();
            resetUI();
            return;
        }
        if (result.outcome === 'processing-done') {
            // El backend procesó sin SSE/job_id; asumimos éxito.
            addLog('📄', 'Transcripción procesada', 'success');
            showNotification('success', '✅', 'Transcripción procesada');
            setButtonStatus('success');
            clearFailedState();
            resetUI();
            return;
        }
        if (result.outcome === 'failed-job') {
            // El servidor respondió pero el job reportó fallo: no reintentar (no es de red).
            addLog('❌', result.message || 'Error procesando audio', 'error');
            showNotification('error', '❌', result.message || 'Error', 6000);
            setButtonStatus('failed');
            clearFailedState();
            resetUI();
            return;
        }
        if (result.outcome === 'auth-error') {
            // 401: token malo, no reintentar.
            addLog('🔑', `Token inválido (401): ${result.message}`, 'error');
            showNotification('error', '🔑', `Token inválido (401): ${result.message}`, 6000);
            setButtonStatus('failed');
            clearFailedState();
            resetUI();
            showSetup();
            return;
        }

        // outcome === 'retryable'
        // Fail-fast cuando sabemos que estamos offline: no tiene sentido esperar backoff.
        // El médico ve el estado .failed de inmediato.
        if (result.offline) {
            addLog('⚠️', result.message || 'Sin conexión.', 'error');
            showNotification('error', '📡', 'Sin conexión. Reintentar o descartar para escribir tú.', 8000);
            pendingSend = { blob, ext };
            setFailedState('Sin conexión. Toca reintentar o descartar.');
            return;
        }

        if (attempt <= BACKOFF_MS.length) {
            const wait = BACKOFF_MS[attempt - 1];
            addLog('🔄', `Reintento ${attempt}/${BACKOFF_MS.length} en ${wait / 1000}s…`, 'warning');
            // Estado visible: además del log, mostramos el progreso en el status-text
            // y dejamos el Descartar disponible por si el médico no quiere esperar.
            statusText.textContent = `Reintentando ${attempt}/${BACKOFF_MS.length}… (toca Descartar para escribir tú)`;
            showBackgroundDiscard();
            await new Promise(r => setTimeout(r, wait));
            hideBackgroundDiscard();
            continue;
        }

        // Reintentos automáticos agotados → ceder el control al médico.
        addLog('⚠️', result.message || 'No se pudo enviar tras varios intentos.', 'error');
        showNotification('error', '⚠️', 'Sin conexión. Reintentar o descartar para escribir tú.', 8000);
        pendingSend = { blob, ext };
        setFailedState();
        return;
    }
}

// Flag que el médico puede activar con Descartar durante un reintento en background.
let userCancelledSend = false;

// Muestra un Descartar "background" durante los reintentos automáticos (sin abandonar el envío).
// Reusa el botón secundario con un texto distinto.
function showBackgroundDiscard() {
    discardBtn.classList.remove('hidden');
    discardBtn.setAttribute('aria-label', 'Descartar envío');
    discardBtn.querySelector('.discard-icon').textContent = '🗑️';
    discardBtn.lastChild.textContent = ' Descartar';
    discardBtn.classList.add('background-discard');
}
function hideBackgroundDiscard() {
    discardBtn.classList.add('hidden');
    discardBtn.classList.remove('background-discard');
    discardBtn.setAttribute('aria-label', 'Desechar');
    discardBtn.lastChild.textContent = ' Cancelar';
}

// Reintento manual: el médico tocó el botón secundario en estado .failed.
async function manualRetry() {
    if (!pendingSend) return;
    const { blob, ext } = pendingSend;
    userCancelledSend = false;
    recordBtn.classList.remove('failed');
    recordBtn.classList.add('sending');
    discardBtn.classList.add('hidden');
    statusIcon.textContent = '📤';
    statusText.textContent = 'Reintentando envío…';
    await sendAudio(blob, ext);
}

// Descarte limpio: el médico decide irse al Google Doc.
function manualDiscard() {
    userCancelledSend = true; // por si hay un reintento en background aún corriendo
    addLog('🗑️', 'Envío cancelado por el médico', 'warning');
    showNotification('warning', '🗑️', 'Envío cancelado. Puedes escribir directamente en el Google Doc.', 4000);
    clearFailedState();
    hideBackgroundDiscard();
    resetUI();
}

/**
 * Un solo intent de envío + escucha del SSE de estado.
 * Devuelve un resultado estructurado; la orquestación de reintentos vive en sendAudio().
 *
 * outcomes:
 *   'completed'      → job reportó transcripción OK
 *   'processing-done'→ respuesta OK sin job_id (backend síncrono)
 *   'failed-job'     → job reportó fallo (no reintentar)
 *   'auth-error'     → 401 (no reintentar)
 *   'retryable'      → fallo de red / timeout / 5xx / 4xx (excepto 401) / SSE caído
 */
async function attemptSend(blob, ext, token) {
    // Fail-fast explícito: si el navegador ya sabe que estamos offline, no lanzamos fetch
    // (en móvil un fetch sin ruta puede quedar colgado decenas de segundos antes de fallar).
    if (!navigator.onLine) {
        addLog('📡', 'Sin conexión a internet', 'warning');
        return { outcome: 'retryable', message: 'Sin conexión a internet.', offline: true };
    }

    const formData = new FormData();
    formData.append('audio', blob, `recording${ext}`);
    addLog('📤', 'Enviando audio al servidor...', 'info');

    const controller = new AbortController();
    // Timeout de CONEXIÓN corto: si en 8s no llegó respuesta HTTP, abortamos.
    // Esto es lo que detecta "sin señal persistente" rápido en vez de quedar colgado.
    // (El upload en sí, una vez establecida la conexión, puede tardar hasta 10 min.)
    const CONNECTION_TIMEOUT_MS = 8000;
    const UPLOAD_TIMEOUT_MS = 600000;
    let connectionSettled = false;
    const connectionTimer = setTimeout(() => {
        if (!connectionSettled) controller.abort();
    }, CONNECTION_TIMEOUT_MS);
    // Timer de respaldo para el cuerpo completo del upload (10 min).
    const uploadTimer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
        const response = await fetch(`${API_SERVER}/api/audio`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
            signal: controller.signal
        });
        connectionSettled = true;     // llegó respuesta HTTP → ya hay conexión
        clearTimeout(connectionTimer);

        if (response.ok) {
            const data = await response.json();
            clearTimeout(uploadTimer);
            const initialMessage = data.message || 'Audio recibido, procesando con Gemini...';
            addLog('📥', initialMessage, 'info');

            if (!data.job_id) {
                return { outcome: 'processing-done' };
            }

            // SSE de estado con timeout propio (~5 min): si el stream se cuelga, es reintentable.
            const sseOutcome = await listenForStatus(data.job_id);
            if (sseOutcome.outcome === 'completed')  return { outcome: 'completed',  message: sseOutcome.message };
            if (sseOutcome.outcome === 'failed-job') return { outcome: 'failed-job', message: sseOutcome.message };
            // SSE caído/timeout sin veredicto → reintentable (el backend puede haber recibido el audio).
            return { outcome: 'retryable', message: 'Conexión interrumpida mientras se procesaba el audio.' };
        }

        clearTimeout(uploadTimer);
        // Respuesta de error del servidor.
        let errorDetail = '';
        try {
            const errData = await response.json();
            errorDetail = errData.detail || '';
        } catch {
            errorDetail = response.statusText;
        }

        if (response.status === 401) {
            return { outcome: 'auth-error', message: errorDetail };
        }
        // 400 es "solicitud inválida" (p.ej. audio corrupto): reintentar el mismo blob no ayuda,
        // pero como no podemos distinguirlo de un transitorio, lo dejamos retryable y el backoff
        // rápido lo resolverá si es transitorio; si no, el médico descarta.
        const label = response.status === 400 ? 'Solicitud inválida (400)'
                    : response.status === 500 ? 'Error del servidor (500)'
                    : `Error ${response.status}`;
        addLog('❌', `${label}: ${errorDetail}`, 'error');
        return { outcome: 'retryable', message: `${label}: ${errorDetail}` };
    } catch (err) {
        clearTimeout(connectionTimer);
        clearTimeout(uploadTimer);
        if (err.name === 'AbortError') {
            // Si abortó antes de tener respuesta HTTP, fue el timeout de CONEXIÓN (8s):
            // señal persistente mala. Mensaje claro para el médico.
            const msg = connectionSettled
                ? 'Timeout: el servidor tardó demasiado en procesar.'
                : 'Sin señal: no se pudo establecer conexión.';
            return { outcome: 'retryable', message: msg, offline: !connectionSettled };
        }
        if (!navigator.onLine) {
            return { outcome: 'retryable', message: 'Sin conexión a internet.', offline: true };
        }
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
            return { outcome: 'retryable', message: 'No se pudo conectar al servidor.' };
        }
        return { outcome: 'retryable', message: `Error de conexión: ${err.message}` };
    }
}

/**
 * Escucha el stream SSE de estado del job con timeout de 5 min.
 * Devuelve { outcome: 'completed' | 'failed-job' | 'interrupted' }.
 */
async function listenForStatus(jobId) {
    const sseController = new AbortController();
    const sseTimeout = setTimeout(() => sseController.abort(), 300000); // 5 min

    try {
        const statusResponse = await fetch(`${API_SERVER}/api/audio/status/${jobId}`, {
            headers: { 'ngrok-skip-browser-warning': 'true' },
            signal: sseController.signal
        });

        if (!statusResponse.ok) {
            return { outcome: 'interrupted' };
        }

        const reader = statusResponse.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop();

            for (const part of parts) {
                if (!part.startsWith('data: ')) continue;
                try {
                    const statusData = JSON.parse(part.substring(6));
                    if (statusData.status === 'completed') {
                        clearTimeout(sseTimeout);
                        try { await reader.cancel(); } catch {}
                        return { outcome: 'completed', message: statusData.message };
                    }
                    if (statusData.status === 'failed') {
                        clearTimeout(sseTimeout);
                        try { await reader.cancel(); } catch {}
                        return { outcome: 'failed-job', message: statusData.message };
                    }
                } catch (e) {
                    console.error('SSE Parse error', e);
                }
            }
        }
        // El stream terminó sin veredicto explícito: lo tratamos como interrumpido.
        return { outcome: 'interrupted' };
    } catch (err) {
        return { outcome: 'interrupted' };
    } finally {
        clearTimeout(sseTimeout);
    }
}

document.addEventListener('DOMContentLoaded', init);
