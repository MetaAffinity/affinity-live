// Version marker - if you see this in console, the new code is loaded
console.log('🔵 App.js loaded - Version 2.0 with session_complete handler');

let ws = null;
let mediaStream = null;
let audioChunks = [];
let isConnected = false;
let audioContext = null;
let microphone = null;
let processor = null;
let isVoiceMode = false;
let recognition = null;
// shouldListen indicates the user intends the assistant to keep listening
let shouldListen = false;
// recognitionActive tracks whether the SpeechRecognition is actually started
let recognitionActive = false;
// awaitingVoiceReady tracks if we're waiting for the server to confirm voice session is ready
let awaitingVoiceReady = false;

// DOM Elements
const startVoiceBtn = document.getElementById('startVoiceBtn');
const startBtn = document.getElementById('startBtn');
const shareScreenBtn = document.getElementById('shareScreenBtn');
const captureBtn = document.getElementById('captureBtn');
const stopBtn = document.getElementById('stopBtn');
const promptInput = document.getElementById('promptInput');
const responseDisplay = document.getElementById('responseDisplay');
const audioPlayer = document.getElementById('audioPlayer');
const downloadAudioBtn = document.getElementById('downloadAudioBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const screenCanvas = document.getElementById('screenCanvas');
const screenPreview = document.getElementById('screenPreview');
const chatHistory = document.getElementById('chatHistory');
const screenStatusBadge = document.getElementById('screenStatusBadge');
const pipBtn = document.getElementById('pipBtn');
const voiceOutputToggle = document.getElementById('voiceOutputToggle');
const startWebcamBtn = document.getElementById('startWebcamBtn');
const captureWebcamBtn = document.getElementById('captureWebcamBtn');
const webcamPreview = document.getElementById('webcamPreview');
const webcamPromptContainer = document.getElementById('webcamPromptContainer');
const webcamPromptInput = document.getElementById('webcamPromptInput');
const webcamStatusBadge = document.getElementById('webcamStatusBadge');
let webcamStream = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    promptInput.value = 'Hello! Can you tell me what is on my screen?';
    // Initialize voice output toggle default
    if (voiceOutputToggle) {
        voiceOutputToggle.checked = false;
    }
});

// Webcam handling
async function startWebcam() {
    if (webcamStream) return;
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.srcObject = webcamStream;
        video.style.width = '100%';
        video.style.height = 'auto';

        // Clear placeholder and append
        const placeholder = webcamPreview.querySelector('.preview-placeholder');
        if (placeholder) placeholder.style.display = 'none';
        webcamPreview.appendChild(video);

        // Update button and enable capture
        startWebcamBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            </svg>
            Stop Webcam
        `;
        captureWebcamBtn.disabled = false;

        // Show status badge
        if (webcamStatusBadge) {
            webcamStatusBadge.style.display = 'block';
        }

        // Show manual prompt input container
        if (webcamPromptContainer) {
            webcamPromptContainer.style.display = 'block';
        }
    } catch (error) {
        console.error('Error starting webcam:', error);
        alert('Failed to start webcam. Please grant permission.');
    }
}

function stopWebcam() {
    if (!webcamStream) return;
    try {
        webcamStream.getTracks().forEach(t => t.stop());
    } catch (e) { }
    webcamStream = null;
    const video = webcamPreview.querySelector('video');
    if (video) video.remove();
    const placeholder = webcamPreview.querySelector('.preview-placeholder');
    if (placeholder) placeholder.style.display = 'flex';

    // Reset button
    startWebcamBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
        </svg>
        Start Webcam
    `;
    captureWebcamBtn.disabled = true;

    // Hide status badge
    if (webcamStatusBadge) {
        webcamStatusBadge.style.display = 'none';
    }

    // Hide manual prompt input container
    if (webcamPromptContainer) {
        webcamPromptContainer.style.display = 'none';
    }

    // Clear the prompt input
    if (webcamPromptInput) {
        webcamPromptInput.value = '';
    }
}

async function captureWebcamImage() {
    try {
        const video = webcamPreview.querySelector('video');
        if (!video) return null;
        const canvas = screenCanvas; // reuse canvas element
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.9);
    } catch (error) {
        console.error('Error capturing webcam image:', error);
        return null;
    }
}

// Helper function to capture screen
async function captureScreenImage() {
    try {
        const video = screenPreview.querySelector('video');
        if (!video) return null;

        const canvas = screenCanvas;
        const ctx = canvas.getContext('2d');

        // Wait for video to be ready if needed
        if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
            await new Promise((resolve) => {
                let resolved = false;
                const onReady = () => {
                    if (!resolved) {
                        resolved = true;
                        video.removeEventListener('playing', onReady);
                        video.removeEventListener('loadeddata', onReady);
                        resolve(null);
                    }
                };
                video.addEventListener('playing', onReady);
                video.addEventListener('loadeddata', onReady);
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        video.removeEventListener('playing', onReady);
                        video.removeEventListener('loadeddata', onReady);
                        resolve(null);
                    }
                }, 500);
            });
        }

        // Capture the screen
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Return base64 image data
        return canvas.toDataURL('image/jpeg', 0.8);
    } catch (error) {
        console.error('Error capturing screen:', error);
        return null;
    }
}

// Add message to chat history
function addChatMessage(text, type = 'assistant', imageData = null) {
    // Remove the initial placeholder if it exists
    const placeholder = chatHistory.querySelector('.chat-message.system');
    if (placeholder && placeholder.textContent.includes('Start a conversation')) {
        placeholder.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;

    // If there's an image, add it first
    if (imageData) {
        const imageContainer = document.createElement('div');
        imageContainer.className = 'chat-image-container';

        const img = document.createElement('img');
        img.src = imageData;
        img.className = 'chat-image';
        img.alt = 'Captured screenshot';

        imageContainer.appendChild(img);
        messageDiv.appendChild(imageContainer);
    }

    // Create content container
    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-message-content';

    // For assistant messages, render markdown
    if (type === 'assistant' && typeof marked !== 'undefined') {
        try {
            const htmlContent = marked.parse(text);
            contentDiv.innerHTML = htmlContent;
            contentDiv.classList.add('markdown-content-chat');
        } catch (error) {
            console.error('Markdown rendering error in chat:', error);
            contentDiv.textContent = text;
        }
    } else {
        // For user and system messages, use plain text
        contentDiv.textContent = text;
    }

    messageDiv.appendChild(contentDiv);

    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    const now = new Date();
    timestamp.textContent = now.toLocaleTimeString();
    messageDiv.appendChild(timestamp);

    chatHistory.appendChild(messageDiv);

    // Auto-scroll to bottom
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// Centralized updater for prompt disabled state. The prompt should be
// disabled only when voice mode is active and there's no active screen
// share. This keeps it editable during screen sharing and when not in
// live voice mode.
function updatePromptDisabled() {
    if (!promptInput) return;
    promptInput.disabled = !!(isVoiceMode && !mediaStream);
}

// Start Voice Chat
startVoiceBtn.addEventListener('click', async () => {
    try {
        isVoiceMode = true;

        // Initialize speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            alert('Speech recognition not supported in your browser. Please use Chrome.');
            return;
        }

        // Create recognition instance and prepare handlers, but don't start yet
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        // Install handlers (this defines tryStartRecognition on window)
        setupSpeechRecognition();

        // Properly await WebSocket connection
        try {
            await connectWebSocket();
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            alert('Failed to connect to server. Please try again.');
            awaitingVoiceReady = false;
            return;
        }

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'start_voice' }));

            // Wait for 'connected' from server before actually starting recognition
            awaitingVoiceReady = true;

            updateStatus('connected', '🎤 Preparing voice session...');
            startVoiceBtn.textContent = '🎤 Preparing...';
            startVoiceBtn.classList.add('listening');
            startVoiceBtn.disabled = true;
            startBtn.disabled = true;
            stopBtn.disabled = false;

            displayResponse('🎤 Voice conversation active! Preparing session...');
        }
    } catch (error) {
        console.error('Error starting voice chat:', error);
        alert('Failed to start voice recognition. Please grant microphone permission.');
        awaitingVoiceReady = false;
    }
});

// Setup Speech Recognition handlers (safe start/stop, results, errors)
function setupSpeechRecognition() {
    let finalTranscript = '';

    // Expose safe starters on window so other code can call them
    window.tryStartRecognition = function tryStartRecognition() {
        if (!recognition) return;
        if (recognitionActive) return;
        try {
            recognition.start();
        } catch (e) {
            setTimeout(() => {
                if (shouldListen && !recognitionActive) tryStartRecognition();
            }, 500);
        }
    };

    window.tryStopRecognition = function tryStopRecognition() {
        if (!recognition) return;
        shouldListen = false;
        try { recognition.stop(); } catch (e) { }
    };

    recognition.onstart = () => {
        recognitionActive = true;
        console.log('SpeechRecognition started');
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }

        if (interimTranscript) {
            displayResponse('🎤 You: ' + interimTranscript + '...');
        }

        if (finalTranscript.trim()) {
            const userMessage = finalTranscript.trim();
            finalTranscript = '';

            // Add user message to chat history
            addChatMessage(userMessage, 'user');

                // Check if screen sharing or webcam is active - if so, auto-capture
                if ((mediaStream || webcamStream) && ws && ws.readyState === WebSocket.OPEN) {
                    const sourceLabel = webcamStream ? 'webcam' : 'screen';
                    displayResponse('✓ You said: ' + userMessage + '\n\n📸 Auto-capturing ' + sourceLabel + '...');

                    // Auto-capture appropriate source and send with voice query
                    const capturePromise = webcamStream ? captureWebcamImage() : captureScreenImage();
                    capturePromise.then(imageData => {
                        if (imageData) {
                            // Add to chat history showing it included screen/webcam
                            addChatMessage('📸 ' + userMessage + (webcamStream ? ' (webcam)' : ' (with screen capture)'), 'user', imageData);

                            // Determine desired modalities from the UI toggle
                            const wantAudio = voiceOutputToggle && voiceOutputToggle.checked;
                            const modalities = wantAudio ? ['AUDIO', 'TEXT'] : ['TEXT'];

                            ws.send(JSON.stringify({
                                type: 'send_image',
                                image: imageData,
                                prompt: userMessage,
                                responseModalities: modalities
                            }));

                            displayResponse('⏳ Analyzing your question with ' + sourceLabel + ' context...');
                        } else {
                            // Fallback to text-only if capture failed
                            const wantAudio = voiceOutputToggle && voiceOutputToggle.checked;
                            const startModalities = wantAudio ? ['AUDIO', 'TEXT'] : ['TEXT'];
                            ws.send(JSON.stringify({ type: 'start', prompt: userMessage, responseModalities: startModalities }));
                            displayResponse('✓ You said: ' + userMessage + '\n\n⏳ I am thinking...');
                        }
                    });
                } else if (ws && ws.readyState === WebSocket.OPEN) {
                    // No screen/webcam sharing - send voice query as text only (request TEXT response)
                    displayResponse('✓ You said: ' + userMessage + '\n\n⏳ I am thinking...');
                    const wantAudio = voiceOutputToggle && voiceOutputToggle.checked;
                    const startModalities = wantAudio ? ['AUDIO', 'TEXT'] : ['TEXT'];
                    ws.send(JSON.stringify({ type: 'start', prompt: userMessage, responseModalities: startModalities }));
            }
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
            recognitionActive = false;
            setTimeout(() => {
                if (shouldListen && !recognitionActive) tryStartRecognition();
            }, 700);
        } else if (event.error === 'not-allowed') {
            alert('Microphone access denied. Please grant permission and try again.');
            stopBtn.click();
        }
    };

    recognition.onend = () => {
        recognitionActive = false;
        console.log('SpeechRecognition ended');
        if (shouldListen && isVoiceMode) {
            setTimeout(() => tryStartRecognition(), 500);
        }
    };
}

// Setup Audio Streaming (deprecated - keeping for reference)
async function setupAudioStreaming(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
    });

    microphone = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
        if (ws && ws.readyState === WebSocket.OPEN && isVoiceMode) {
            const inputData = e.inputBuffer.getChannelData(0);

            // Convert to PCM16
            const pcm16 = float32ToPCM16(inputData);
            const base64Audio = arrayBufferToBase64(pcm16);

            // Send audio chunk to server
            ws.send(JSON.stringify({
                type: 'audio_chunk',
                data: base64Audio
            }));
        }
    };

    microphone.connect(processor);
    processor.connect(audioContext.destination);
}

// Convert Float32 to PCM16
function float32ToPCM16(float32Array) {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16.buffer;
}

// Array Buffer to Base64
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Start Text Session
startBtn.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();

    if (!prompt) {
        alert('Please enter a message first!');
        return;
    }

    // Add user message to chat history
    addChatMessage(prompt, 'user');

    isVoiceMode = false;

    // Properly await WebSocket connection
    try {
        await connectWebSocket();
    } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        alert('Failed to connect to server. Please try again.');
        return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'start', prompt: prompt }));

        updateStatus('connected', 'Connected');
        startBtn.disabled = true;
        startVoiceBtn.disabled = true;
        stopBtn.disabled = false;
        displayResponse('⏳ Waiting for MetaAffinity\'s response...');
        // Keep the textarea editable for text-mode so users can refine
        // the prompt between requests. It will still be disabled during
        // voice sessions.
        updatePromptDisabled();
    }
});

// Share Screen
shareScreenBtn.addEventListener('click', async () => {
    // If already sharing, stop it
    if (mediaStream) {
        stopScreenShare();
        return;
    }

    try {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always',
                displaySurface: 'monitor'
            }
        });

        // Display the stream in preview
        const video = document.createElement('video');
        video.srcObject = mediaStream;
        video.autoplay = true;
        video.style.width = '100%';
        video.style.height = 'auto';

    screenPreview.querySelector('.preview-placeholder').style.display = 'none';
        screenPreview.appendChild(video);

    shareScreenBtn.textContent = '⏹️ Stop Sharing';
    captureBtn.disabled = false;
    captureBtn.classList.add('pulse');

    // Show the status badge
    if (screenStatusBadge) {
        screenStatusBadge.style.display = 'block';
    }

    // Update prompt disabled state when screen sharing starts
    updatePromptDisabled();

        // Handle stream end (when user stops from browser)
        mediaStream.getVideoTracks()[0].addEventListener('ended', () => {
            stopScreenShare();
        });
        // Enable PiP button when sharing starts if supported
        if (pipBtn) {
            pipBtn.disabled = false;
            pipBtn.title = 'Toggle Picture-in-Picture';
        }
    } catch (error) {
        console.error('Error sharing screen:', error);
        alert('Failed to share screen. Please make sure you grant permission.');
    }
});

// Start/Stop Webcam button
if (startWebcamBtn) {
    startWebcamBtn.addEventListener('click', async () => {
        if (webcamStream) {
            stopWebcam();
        } else {
            await startWebcam();
        }
    });
}

// Capture Webcam button
if (captureWebcamBtn) {
    captureWebcamBtn.addEventListener('click', async () => {
        if (!webcamStream) {
            alert('Start the webcam first');
            return;
        }

        const imageData = await captureWebcamImage();
        if (!imageData) {
            alert('Failed to capture image from webcam');
            return;
        }

        // Use webcam-specific prompt input if available, otherwise use default
        let userPrompt = 'Please describe this webcam photo.';
        if (webcamPromptInput && webcamPromptInput.value.trim()) {
            userPrompt = webcamPromptInput.value.trim();
        }

        // Respect the voice output toggle
        const wantAudio = voiceOutputToggle && voiceOutputToggle.checked;
        const modalities = wantAudio ? ['AUDIO', 'TEXT'] : undefined;

        // Add to chat and send using existing capture path (so history matches)
        addChatMessage(`📸 ${userPrompt}`, 'user', imageData);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            try { await connectWebSocket(); } catch (e) { alert('Failed to connect to server'); return; }
        }

        const payload = {
            type: 'send_image',
            image: imageData,
            prompt: userPrompt
        };
        if (Array.isArray(modalities)) payload.responseModalities = modalities;
        ws.send(JSON.stringify(payload));
        displayResponse('⏳ Analyzing webcam photo...');
        stopBtn.disabled = false;
    });
}

// Capture and Ask
async function captureAndSend(prompt) {
    if (!mediaStream) {
        alert('Please start screen sharing first!');
        return;
    }

    const userPrompt = (prompt || '').trim() || 'What do you see on my screen? Please describe it.';

    try {
        const video = screenPreview.querySelector('video');
        const canvas = screenCanvas;
        const ctx = canvas.getContext('2d');

        if (!video) {
            alert('No video element found for screen preview. Please share your screen first.');
            return;
        }

        if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
            await new Promise((resolve) => {
                let resolved = false;
                const onReady = () => {
                    if (!resolved) {
                        resolved = true;
                        video.removeEventListener('playing', onReady);
                        video.removeEventListener('loadeddata', onReady);
                        resolve(null);
                    }
                };
                video.addEventListener('playing', onReady);
                video.addEventListener('loadeddata', onReady);
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        video.removeEventListener('playing', onReady);
                        video.removeEventListener('loadeddata', onReady);
                        resolve(null);
                    }
                }, 500);
            });
        }

        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = canvas.toDataURL('image/jpeg', 0.8);

        // Clear previous audio
        audioChunks = [];
        audioPlayer.src = '';
        downloadAudioBtn.disabled = true;
        responseDisplay.innerHTML = '<p class="placeholder-text">Processing...</p>';

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            try {
                displayResponse('⏳ Connecting to server...');
                await connectWebSocket();
            } catch (error) {
                console.error('Failed to connect WebSocket:', error);
                alert('Failed to connect to server. Please try again.');
                responseDisplay.innerHTML = '<p class="placeholder-text">Connection failed. Try again.</p>';
                return;
            }
        }

        addChatMessage(`📸 ${userPrompt}`, 'user', imageData);

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'send_image',
                image: imageData,
                prompt: userPrompt
            }));

            displayResponse('⏳ Analyzing screen capture...');
            stopBtn.disabled = false;
        } else {
            alert('Failed to connect to server. Please try again.');
            responseDisplay.innerHTML = '<p class="placeholder-text">Connection failed. Try again.</p>';
        }
    } catch (error) {
        console.error('Error capturing screen:', error);
        alert('Failed to capture screen.');
    }
}

// reuse the shared function for the original capture button
captureBtn.addEventListener('click', async () => {
    await captureAndSend(promptInput.value);
});

// hook up the new button placed under the input
const captureAskBtn = document.getElementById('captureAskBtn');
if (captureAskBtn) {
    captureAskBtn.addEventListener('click', async () => {
        await captureAndSend(promptInput.value);
    });
}

// Stop Session
stopBtn.addEventListener('click', () => {
    if (ws) {
        ws.send(JSON.stringify({ type: 'stop' }));
        ws.close();
    }

    stopAudioStreaming();
    // Don't stop screen sharing - let it continue independently
    resetUI();
});

// Stop Audio Streaming
function stopAudioStreaming() {
    // Stop speech recognition
    if (recognition && shouldListen) {
        shouldListen = false;
        try {
            recognition.stop();
        } catch (e) {
            console.log('Recognition already stopped');
        }
    }

    // Stop old audio streaming (deprecated)
    if (processor) {
        processor.disconnect();
        processor = null;
    }
    if (microphone) {
        microphone.disconnect();
        microphone = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    isVoiceMode = false;
}

// WebSocket Connection
function connectWebSocket() {
    // If already connected, return existing connection
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('WebSocket already connected, reusing connection');
        return Promise.resolve(ws);
    }

    // If connecting, wait for it
    if (ws && ws.readyState === WebSocket.CONNECTING) {
        console.log('WebSocket already connecting, waiting...');
        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    clearInterval(checkInterval);
                    resolve(ws);
                } else if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
                    clearInterval(checkInterval);
                    reject(new Error('Connection failed'));
                }
            }, 100);
        });
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    // Return a promise that resolves when connected
    return new Promise((resolve, reject) => {
        ws.onopen = () => {
            console.log('WebSocket connected');
            isConnected = true;
            resolve(ws);
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateStatus('error', 'Connection Error');
            displayResponse('❌ Connection error. Please check your internet and try again.');
            reject(error);
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            handleServerMessage(message);
        };

        ws.onclose = (event) => {
            console.log('WebSocket disconnected', event.code, event.reason);
            isConnected = false;

            // Only update UI if not already handled by 'disconnected' message
            if (!event.wasClean) {
                updateStatus('disconnected', 'Connection Lost');
                displayResponse('⚠️ Connection lost. Please start a new session.');
                setTimeout(() => resetUI(), 100);
            }
        };
    });
}

// Handle Server Messages
function handleServerMessage(message) {
    console.log('Received:', message.type);

    switch (message.type) {
        case 'connected':
            updateStatus('connected', isVoiceMode ? 'Voice Chat Active' : 'Connected to MetaAffinity');

            // If we were waiting for voice session to be ready, now start listening
            if (awaitingVoiceReady && isVoiceMode) {
                awaitingVoiceReady = false;
                shouldListen = true;

                // Update UI to show we're ready to listen
                startVoiceBtn.textContent = '🎤 Listening...';
                startVoiceBtn.disabled = true;
                displayResponse('🎤 Voice session ready! Start speaking...');

                // Start speech recognition
                if (window.tryStartRecognition) {
                    window.tryStartRecognition();
                }
            }
            break;

        case 'text':
            // Display the text response
            const textContent = message.content || '';
            if (textContent.trim()) {
                displayResponse(textContent);
                // Add assistant text response to chat history
                addChatMessage(textContent, 'assistant');
            }
            break;

        case 'audio':
            audioChunks.push(message.data);
            break;

        case 'turn_complete':
            console.log('Turn complete - audio chunks:', audioChunks.length);
            if (audioChunks.length > 0) {
                createAudioBlob();
            } else {
                // No audio received - only show message in voice mode
                console.log('No audio chunks received in this turn');
                if (isVoiceMode) {
                    displayResponse('✓ Response received (text only)');
                }
            }

            // In voice mode, continue listening after MetaAffinity finishes speaking
            if (isVoiceMode && shouldListen) {
                setTimeout(() => {
                    displayResponse('🎤 Listening... Speak now!');
                }, 500);
            }
            break;

        case 'error':
            alert('Error: ' + message.message);
            displayResponse('Error: ' + message.message);
            break;

        case 'session_complete':
            // Image capture session completed successfully
            console.log('✅ session_complete received:', message.reason);
            console.log('✅ Response preserved, not showing error message');
            updateStatus('disconnected', 'Ready');

            // Just re-enable the start buttons, keep capture enabled if screen sharing
            startBtn.disabled = false;
            startVoiceBtn.disabled = false;
            stopBtn.disabled = true;

            // Keep the response visible - don't overwrite it
            break;

        case 'disconnected':
            // For non-voice mode (screen capture), session ending is normal after processing
            // Only show error-like message for voice mode or unexpected disconnects
            if (isVoiceMode || awaitingVoiceReady) {
                updateStatus('disconnected', 'Session Ended');

                // Show detailed reason if provided
                let disconnectMessage = '⚠️ Session ended.';
                if (message.reason) {
                    disconnectMessage += '\n\nReason: ' + message.reason;
                }
                disconnectMessage += '\n\nClick "Start Voice Chat" or "Start" to begin a new conversation.';

                displayResponse(disconnectMessage);

                // Add system message to chat
                addChatMessage('Session ended' + (message.reason ? ': ' + message.reason : ''), 'system');

                // Clean up voice-related state
                if (awaitingVoiceReady) {
                    awaitingVoiceReady = false;
                }
                if (shouldListen) {
                    shouldListen = false;
                    if (window.tryStopRecognition) {
                        window.tryStopRecognition();
                    }
                }

                // Reset UI for voice mode
                setTimeout(() => {
                    resetUI();
                }, 100);
            } else {
                // For screen capture mode, just update status silently
                // Don't call resetUI or overwrite the response
                updateStatus('disconnected', 'Ready');
                console.log('Session closed after processing (normal for capture mode)');

                // Just re-enable the start buttons, keep capture enabled if screen sharing
                startBtn.disabled = false;
                startVoiceBtn.disabled = false;
                stopBtn.disabled = true;
            }
            break;
    }
}

// Configure marked.js for better rendering
if (typeof marked !== 'undefined') {
    marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
    });
}

// Display Response with Markdown formatting
function displayResponse(text) {
    if (!text) {
        responseDisplay.innerHTML = '<p class="placeholder-text">No response</p>';
        return;
    }

    // Check if marked.js is loaded
    if (typeof marked !== 'undefined') {
        try {
            // Render markdown to HTML
            const htmlContent = marked.parse(text);
            responseDisplay.innerHTML = `<div class="markdown-content">${htmlContent}</div>`;
        } catch (error) {
            console.error('Markdown rendering error:', error);
            // Fallback to plain text
            responseDisplay.innerHTML = `<p class="response-text">${escapeHtml(text)}</p>`;
        }
    } else {
        // Fallback if marked.js is not loaded
        responseDisplay.innerHTML = `<p class="response-text">${escapeHtml(text)}</p>`;
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Create Audio Blob
function createAudioBlob() {
    try {
        // Convert base64 chunks to WAV
        const wavData = convertToWav(audioChunks);
        const blob = new Blob([wavData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);

        audioPlayer.src = url;

        // Auto-play and show feedback
        audioPlayer.play()
            .then(() => {
                console.log('Audio playing successfully');
                displayResponse('🔊 Playing MetaAffinity\'s response...');
            })
            .catch((error) => {
                console.error('Error playing audio:', error);
                displayResponse('⚠️ Audio received but autoplay blocked. Click the play button below.');
            });

        downloadAudioBtn.disabled = false;

        // Store for download
        downloadAudioBtn.onclick = () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = 'metaaffinity-response.wav';
            a.click();
        };

        // Add event listener for when audio finishes playing
        audioPlayer.onended = () => {
            if (isVoiceMode && shouldListen) {
                displayResponse('🎤 Listening... Your turn to speak!');
            }
        };

        // Reset for next response
        audioChunks = [];
    } catch (error) {
        console.error('Error creating audio:', error);
        displayResponse('❌ Error processing audio response.');
    }
}

// Convert Base64 Audio to WAV
function convertToWav(base64Chunks) {
    // Concatenate all chunks
    const combinedData = base64Chunks.join('');

    // Convert base64 to binary
    const binaryString = atob(combinedData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // Default WAV settings
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;

    // Create WAV header
    const header = createWavHeader(bytes.length, {
        numChannels,
        sampleRate,
        bitsPerSample
    });

    // Combine header and data
    const wavData = new Uint8Array(header.length + bytes.length);
    wavData.set(header, 0);
    wavData.set(bytes, header.length);

    return wavData;
}

// Create WAV Header
function createWavHeader(dataLength, options) {
    const { numChannels, sampleRate, bitsPerSample } = options;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);

    // "RIFF" chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');

    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (PCM)
    view.setUint16(20, 1, true);  // AudioFormat (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    return new Uint8Array(buffer);
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

// Stop Screen Share
function stopScreenShare() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }

    const video = screenPreview.querySelector('video');
    if (video) {
        video.remove();
    }

    screenPreview.querySelector('.preview-placeholder').style.display = 'flex';
    shareScreenBtn.textContent = '📺 Share Screen';
    shareScreenBtn.disabled = false;
    captureBtn.disabled = true;
    captureBtn.classList.remove('pulse');

    // Hide the status badge
    if (screenStatusBadge) {
        screenStatusBadge.style.display = 'none';
    }

    // Update prompt disabled state when screen sharing stops
    updatePromptDisabled();
    // Disable PiP button and exit PiP if active
    if (pipBtn) {
        try {
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture().catch(() => {});
            }
        } catch (e) {
            // ignore
        }
        pipBtn.disabled = true;
        pipBtn.title = 'Picture-in-Picture';
    }
}

// Picture-in-Picture toggle
if (pipBtn) {
    pipBtn.addEventListener('click', async () => {
        try {
            const video = screenPreview.querySelector('video');
            if (!video) {
                alert('No video available for Picture-in-Picture. Start screen sharing first.');
                return;
            }

            // If already in PiP, exit
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                return;
            }

            // Request PiP on the video element
            if (video.requestPictureInPicture) {
                await video.requestPictureInPicture();
            } else {
                alert('Picture-in-Picture is not supported in this browser.');
            }
        } catch (error) {
            console.error('PiP error:', error);
            alert('Failed to enter Picture-in-Picture.');
        }
    });

    // Keep PiP button state updated when PiP enters/exits
    document.addEventListener('enterpictureinpicture', (e) => {
        if (pipBtn) pipBtn.classList.add('active');
    });
    document.addEventListener('leavepictureinpicture', (e) => {
        if (pipBtn) pipBtn.classList.remove('active');
    });
}

// Update Status
function updateStatus(status, text) {
    statusText.textContent = text;
    statusIndicator.className = 'status-indicator';

    if (status === 'connected') {
        statusIndicator.classList.add('connected');
    }
}

// Reset UI
function resetUI() {
    startBtn.disabled = false;
    startVoiceBtn.disabled = false;
    startVoiceBtn.textContent = '🎤 Start Voice Chat';
    startVoiceBtn.classList.remove('listening');
    // Keep screen share enabled if not active
    if (!mediaStream) {
        shareScreenBtn.disabled = false;
    }
    // Keep capture enabled if screen is shared
    if (mediaStream) {
        captureBtn.disabled = false;
    } else {
        captureBtn.disabled = true;
    }
    stopBtn.disabled = true;
    updatePromptDisabled();
    updateStatus('disconnected', 'Disconnected');
    audioChunks = [];
    awaitingVoiceReady = false;
    stopAudioStreaming();
}

// Handle window unload
window.addEventListener('beforeunload', () => {
    if (ws) {
        ws.close();
    }
    stopScreenShare();
    stopAudioStreaming();
});
