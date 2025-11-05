import React from "https://esm.sh/react";
import ReactDOM from "https://esm.sh/react-dom";

// === Web Audio Setup ===
let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let analyser: AnalyserNode | null = null;
let micStream: MediaStream | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;

// === State ===
let isPlaying = false;
let isListening = false;
let currentFrequency = 440;
let currentAmplitude = 0.5;
let phase = 0;

// Toon Matchen Game State
let isToonMatchenActive = false;
let targetFrequency = 0;
let targetAmplitude = 0;
let winTimeout: number | null = null;

// Amplitude Parcours Game State
let isAmplitudeGameActive = false;
let gameOver = true;
let score = 0;
const gameSpeed = 2.5;
let obstacles: { x: number; width: number; gapY: number; gapHeight: number, passed: boolean }[] = [];
let frameCount = 0;
const player = {
    x: 60,
    y: 100,
    radius: 12
};


// === DOM Elements ===
// Pages
const landingPage = document.getElementById('landing-page') as HTMLDivElement;
const explorerApp = document.getElementById('explorer-app') as HTMLDivElement;
const gameSelectionPage = document.getElementById('game-selection-page') as HTMLDivElement;
const gamePage = document.getElementById('game-page') as HTMLDivElement;
const amplitudeGamePage = document.getElementById('amplitude-game-page') as HTMLDivElement;

// Navigation
const tileExplorer = document.getElementById('tile-explorer') as HTMLDivElement;
const tileGames = document.getElementById('tile-games') as HTMLDivElement;
const tileToonMatchen = document.getElementById('tile-toon-matchen') as HTMLDivElement;
const tileAmplitudeParcours = document.getElementById('tile-amplitude-parcours') as HTMLDivElement;
const backButtonExplorer = document.getElementById('back-button-explorer') as HTMLButtonElement;
const backButtonGameSelection = document.getElementById('back-button-game-selection') as HTMLButtonElement;
const backButtonGame = document.getElementById('back-button-game') as HTMLButtonElement;
const backButtonAmplitudeGame = document.getElementById('back-button-amplitude-game') as HTMLButtonElement;


// Explorer App Elements
const canvas = document.getElementById('wave-canvas') as HTMLCanvasElement;
const frequencySlider = document.getElementById('frequency') as HTMLInputElement;
const amplitudeSlider = document.getElementById('amplitude') as HTMLInputElement;
const playButton = document.getElementById('play-button') as HTMLButtonElement;
const micButton = document.getElementById('mic-button') as HTMLButtonElement;
const frequencyValueDisplay = document.getElementById('frequency-value') as HTMLSpanElement;
const amplitudeValueDisplay = document.getElementById('amplitude-value') as HTMLSpanElement;
const ctx = canvas.getContext('2d')!;

// Toon Matchen Game Elements
const gameCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const targetFreqDisplay = document.getElementById('target-freq-value') as HTMLSpanElement;
const userFreqDisplay = document.getElementById('user-freq-value') as HTMLSpanElement;
const targetAmpDisplay = document.getElementById('target-amp-value') as HTMLSpanElement;
const userAmpDisplay = document.getElementById('user-amp-value') as HTMLSpanElement;
const newChallengeButton = document.getElementById('new-challenge-button') as HTMLButtonElement;
const successMessage = document.getElementById('success-message') as HTMLDivElement;
const gameCtx = gameCanvas.getContext('2d')!;

// Amplitude Parcours Game Elements
const amplitudeGameCanvas = document.getElementById('amplitude-game-canvas') as HTMLCanvasElement;
const amplitudeGameCtx = amplitudeGameCanvas.getContext('2d')!;
const scoreDisplay = document.getElementById('score-display') as HTMLSpanElement;
const amplitudeGameOverlay = document.getElementById('amplitude-game-overlay') as HTMLDivElement;
const amplitudeGameMessage = document.getElementById('amplitude-game-message') as HTMLHeadingElement;
const amplitudeRestartButton = document.getElementById('amplitude-restart-button') as HTMLButtonElement;


// === Navigation ===
function showExplorer() {
    landingPage.classList.remove('active');
    gameSelectionPage.classList.remove('active');
    explorerApp.classList.add('active');
}

function showGameSelectionPage() {
    landingPage.classList.remove('active');
    explorerApp.classList.remove('active');
    gamePage.classList.remove('active');
    amplitudeGamePage.classList.remove('active');
    gameSelectionPage.classList.add('active');
    
    // Stop any active games
    isToonMatchenActive = false;
    isAmplitudeGameActive = false;

    // A single back button on a game page might have brought us here,
    // but the microphone might still be needed if the user selects the other game.
    // So we don't stop the mic here, only when returning to the landing page.
}

async function showGamePage() { // Toon Matchen
    gameSelectionPage.classList.remove('active');
    gamePage.classList.add('active');
    isToonMatchenActive = true;
    startNewChallenge();
    await startMicIfNeeded();
}

async function showAmplitudeGamePage() {
    gameSelectionPage.classList.remove('active');
    amplitudeGamePage.classList.add('active');
    isAmplitudeGameActive = true;
    resetAmplitudeGame();
    await startMicIfNeeded();
}


function showLandingPage() {
    if (isPlaying) togglePlayback();
    if (isListening) toggleMicrophone(); // Stops mic and resets state

    explorerApp.classList.remove('active');
    gamePage.classList.remove('active');
    gameSelectionPage.classList.remove('active');
    amplitudeGamePage.classList.remove('active');
    landingPage.classList.add('active');
    
    isToonMatchenActive = false;
    isAmplitudeGameActive = false;
    if (winTimeout) clearTimeout(winTimeout);
    winTimeout = null;
}


// === Audio Control ===
function initializeAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
}

async function startMicIfNeeded() {
     if (!isListening) {
        initializeAudio();
        if (audioContext!.state === 'suspended') await audioContext!.resume();
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micSource = audioContext!.createMediaStreamSource(micStream);
            analyser = audioContext!.createAnalyser();
            analyser.fftSize = 2048;
            micSource.connect(analyser);
            isListening = true; // Set listening state globally
        } catch (err) {
            console.error('Error starting mic for game:', err);
            alert('Kon geen toegang krijgen tot de microfoon. Controleer de browserrechten.');
            showLandingPage();
        }
    }
}


function togglePlayback() {
    initializeAudio();
    if (audioContext!.state === 'suspended') {
        audioContext!.resume();
    }

    isPlaying = !isPlaying;

    if (isPlaying) {
        if (isListening) toggleMicrophone();

        oscillator = audioContext!.createOscillator();
        gainNode = audioContext!.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext!.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(currentFrequency, audioContext!.currentTime);
        gainNode.gain.setValueAtTime(currentAmplitude, audioContext!.currentTime);
        oscillator.start();
        
        playButton.textContent = 'Stop Toon';
        micButton.disabled = true;

    } else {
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            gainNode?.disconnect();
            oscillator = null;
            gainNode = null;
        }
        playButton.textContent = 'Speel Toon Af';
        micButton.disabled = false;
    }
}

async function toggleMicrophone() { // Only used in explorer now
    initializeAudio();
    if (audioContext!.state === 'suspended') {
        await audioContext!.resume();
    }
    
    isListening = !isListening;

    if(isListening) {
        if (isPlaying) togglePlayback();

        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micSource = audioContext!.createMediaStreamSource(micStream);
            analyser = audioContext!.createAnalyser();
            analyser.fftSize = 2048;
            micSource.connect(analyser);

            micButton.textContent = 'Stop Microfoon';
            playButton.disabled = true;
            frequencySlider.disabled = true;
            amplitudeSlider.disabled = true;

        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Kon geen toegang krijgen tot de microfoon. Controleer de browserrechten.');
            isListening = false;
        }
    } else {
        if (micStream) {
            micStream.getTracks().forEach(track => track.stop());
        }
        if (micSource) {
            micSource.disconnect();
        }
        micStream = null;
        micSource = null;
        analyser = null;

        micButton.textContent = 'Gebruik Microfoon';
        playButton.disabled = false;
        frequencySlider.disabled = false;
        amplitudeSlider.disabled = false;
        
        updateFrequency(parseFloat(frequencySlider.value));
        updateAmplitude(parseFloat(amplitudeSlider.value));
    }
}


// === Analysis & Game Logic ===
function analyseMicrophoneInput() {
    if (!analyser || !isListening) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(dataArray);

    let sumSquares = 0.0;
    for (const amplitude of dataArray) {
        sumSquares += amplitude * amplitude;
    }
    const rms = Math.sqrt(sumSquares / bufferLength);
    const sensitivity = 5;
    const noiseGate = 0.01;
    let newAmplitude = rms > noiseGate ? Math.min(rms * sensitivity, 1.0) : 0;
    updateAmplitude(newAmplitude);
    
    if (newAmplitude > 0.05) {
         let bestOffset = -1;
         let bestCorrelation = 0;
         let rm_s = 0;
 
         for (let i = 0; i < bufferLength; i++) {
             rm_s += dataArray[i] * dataArray[i];
         }
         rm_s = Math.sqrt(rm_s / bufferLength);
         if (rm_s < 0.01) return;
 
         for (let offset = 80; offset < 1000; offset++) {
             let correlation = 0;
             for (let i = 0; i < bufferLength - offset; i++) {
                 correlation += dataArray[i] * dataArray[i + offset];
             }
             if (correlation > bestCorrelation) {
                 bestCorrelation = correlation;
                 bestOffset = offset;
             }
         }
 
         if (bestOffset > 0) {
             const newFrequency = audioContext!.sampleRate / bestOffset;
             updateFrequency(newFrequency);
         }
    } else {
         updateFrequency(0);
    }
}

// --- Toon Matchen Logic ---
function startNewChallenge() {
    successMessage.classList.remove('visible');
    if(winTimeout) clearTimeout(winTimeout);
    winTimeout = null;

    targetFrequency = Math.random() * (600 - 150) + 150; // Vocal range
    targetAmplitude = Math.random() * (0.7 - 0.3) + 0.3;

    targetFreqDisplay.textContent = `${Math.round(targetFrequency)} Hz`;
    targetAmpDisplay.textContent = `${Math.round(targetAmplitude * 100)}%`;
}

function checkWinCondition() {
    if (!isToonMatchenActive || winTimeout) return;

    const freqTolerance = 0.07; // 7%
    const ampTolerance = 0.20; // 20%

    const freqMatch = Math.abs(currentFrequency - targetFrequency) < targetFrequency * freqTolerance;
    const ampMatch = Math.abs(currentAmplitude - targetAmplitude) < ampTolerance;

    if (freqMatch && ampMatch && currentAmplitude > 0.1) {
        winTimeout = window.setTimeout(() => {
            successMessage.classList.add('visible');
        }, 500); // Must hold for 0.5 seconds
    }
}

// --- Amplitude Parcours Logic ---
function resetAmplitudeGame() {
    gameOver = true;
    score = 0;
    obstacles = [];
    frameCount = 0;
    player.y = amplitudeGameCanvas.height / 2;
    scoreDisplay.textContent = '0';
    amplitudeGameOverlay.style.display = 'flex';
    amplitudeGameMessage.textContent = 'Klaar om te Starten?';
    amplitudeRestartButton.textContent = 'Start';
}

function startGame() {
    gameOver = false;
    amplitudeGameOverlay.style.display = 'none';
}

function updateAmplitudeGameState() {
    if (gameOver) return;

    const { width, height } = amplitudeGameCanvas;
    
    // Update player position based on amplitude
    const targetY = height - (currentAmplitude * height * 1.5); // *1.5 for more sensitivity
    player.y += (targetY - player.y) * 0.1; // Smooth movement

    // Move and generate obstacles
    frameCount++;
    if (frameCount % 120 === 0) { // Add obstacle every 2 seconds at 60fps
        const gapHeight = 120;
        const gapY = Math.random() * (height - gapHeight - 40) + 20;
        obstacles.push({ x: width, width: 40, gapY, gapHeight, passed: false });
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.x -= gameSpeed;

        // Collision detection
        const playerTop = player.y - player.radius;
        const playerBottom = player.y + player.radius;
        const playerLeft = player.x - player.radius;
        const playerRight = player.x + player.radius;

        if (playerRight > o.x && playerLeft < o.x + o.width) {
            if (playerTop < o.gapY || playerBottom > o.gapY + o.gapHeight) {
                gameOver = true;
                amplitudeGameOverlay.style.display = 'flex';
                amplitudeGameMessage.textContent = 'Game Over!';
                amplitudeRestartButton.textContent = 'Opnieuw';
            }
        }
        
        // Score
        if (!o.passed && o.x + o.width < player.x) {
            score++;
            o.passed = true;
            scoreDisplay.textContent = score.toString();
        }

        // Remove off-screen obstacles
        if (o.x + o.width < 0) {
            obstacles.splice(i, 1);
        }
    }
}


// === Drawing Logic ===
function resizeCanvasIfNeeded(canvasEl: HTMLCanvasElement): boolean {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvasEl.getBoundingClientRect();
    const displayWidth = Math.round(width * dpr);
    const displayHeight = Math.round(height * dpr);

    if (canvasEl.width !== displayWidth || canvasEl.height !== displayHeight) {
        canvasEl.width = displayWidth;
        canvasEl.height = displayHeight;
        return true;
    }
    return false;
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number) {
    const midHeight = height / 2;
    context.save();
    context.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    context.lineWidth = 1;
    context.setLineDash([4, 4]);
    const verticalLineCount = Math.floor(width / 50);
    context.beginPath();
    for (let i = 1; i <= verticalLineCount; i++) {
        const x = i * 50;
        context.moveTo(x, 0);
        context.lineTo(x, height);
    }
    const horizontalLinePositions = [midHeight * 0.5, midHeight * 1.5];
    for(const y of horizontalLinePositions) {
        context.moveTo(0, y);
        context.lineTo(width, y);
    }
    context.stroke();
    context.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    context.lineWidth = 1.5;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(0, midHeight);
    context.lineTo(width, midHeight);
    context.stroke();
    context.restore();
}

function drawWave(context: CanvasRenderingContext2D, width: number, height: number, frequency: number, amplitude: number, color: string, shadowColor: string, wavePhase: number) {
    const midHeight = height / 2;
    context.save();
    context.lineWidth = 3;
    context.strokeStyle = color;
    context.shadowBlur = 10;
    context.shadowColor = shadowColor;
    context.beginPath();
    context.moveTo(0, midHeight);

    if (frequency > 0) {
        const numCycles = frequency / 100;
        const totalAngle = numCycles * 2 * Math.PI;

        for (let x = 0; x < width; x++) {
            const angle = (x / width) * totalAngle + wavePhase;
            const y = midHeight - Math.sin(angle) * (midHeight * amplitude * 0.8);
            context.lineTo(x, y);
        }
    } else {
        context.lineTo(width, midHeight);
    }
    
    context.stroke();
    context.restore();
}

function drawAmplitudeGameScene() {
    const { width, height } = amplitudeGameCanvas;
    amplitudeGameCtx.clearRect(0, 0, width, height);

    // Draw obstacles
    amplitudeGameCtx.fillStyle = 'hsl(210, 80%, 60%)';
    for (const o of obstacles) {
        amplitudeGameCtx.fillRect(o.x, 0, o.width, o.gapY); // Top part
        amplitudeGameCtx.fillRect(o.x, o.gapY + o.gapHeight, o.width, height - (o.gapY + o.gapHeight)); // Bottom part
    }

    // Draw player
    amplitudeGameCtx.beginPath();
    amplitudeGameCtx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    amplitudeGameCtx.fillStyle = 'hsl(350, 100%, 70%)';
    amplitudeGameCtx.shadowColor = 'hsl(350, 100%, 80%)';
    amplitudeGameCtx.shadowBlur = 15;
    amplitudeGameCtx.fill();
    amplitudeGameCtx.shadowBlur = 0;
}


function animationLoop() {
    requestAnimationFrame(animationLoop);
    
    // Always analyse mic if it's on
    if (isListening) {
        analyseMicrophoneInput();
    }

    if (explorerApp.classList.contains('active')) {
        resizeCanvasIfNeeded(canvas);
        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);
        drawGrid(ctx, width, height);
        drawWave(ctx, width, height, currentFrequency, currentAmplitude, 'hsl(165, 100%, 50%)', 'hsl(165, 100%, 70%)', phase);
        phase += 0.05;
    } else if (gamePage.classList.contains('active')) {
        resizeCanvasIfNeeded(gameCanvas);
        const { width, height } = gameCanvas;
        gameCtx.clearRect(0, 0, width, height);
        drawGrid(gameCtx, width, height);
        
        if (isToonMatchenActive) checkWinCondition();

        drawWave(gameCtx, width, height, targetFrequency, targetAmplitude, 'hsl(120, 100%, 50%)', 'hsl(120, 100%, 70%)', 0);
        drawWave(gameCtx, width, height, currentFrequency, currentAmplitude, 'hsl(0, 100%, 60%)', 'hsl(0, 100%, 70%)', phase);
        phase += 0.05;
    } else if (amplitudeGamePage.classList.contains('active')) {
        resizeCanvasIfNeeded(amplitudeGameCanvas);
        updateAmplitudeGameState();
        drawAmplitudeGameScene();
    }
}


// === UI Updates ===
function updateFrequency(value: number) {
    currentFrequency = value;
    const roundedFreq = Math.round(currentFrequency);
    frequencyValueDisplay.textContent = `${roundedFreq} Hz`;
    if(isToonMatchenActive) userFreqDisplay.textContent = `${roundedFreq} Hz`;

    if (isPlaying && oscillator) {
        oscillator.frequency.setValueAtTime(currentFrequency, audioContext!.currentTime);
    }
}

function updateAmplitude(value: number) {
    currentAmplitude = value;
    const roundedAmp = Math.round(currentAmplitude * 100);
    amplitudeValueDisplay.textContent = `${roundedAmp}%`;
    if(isToonMatchenActive) userAmpDisplay.textContent = `${roundedAmp}%`;

    if (isPlaying && gainNode) {
        gainNode.gain.setValueAtTime(currentAmplitude, audioContext!.currentTime);
    }
}


// === Event Listeners ===
function setupEventListeners() {
    // Navigation
    tileExplorer.addEventListener('click', showExplorer);
    tileGames.addEventListener('click', showGameSelectionPage);
    backButtonExplorer.addEventListener('click', showLandingPage);
    backButtonGameSelection.addEventListener('click', showLandingPage);
    backButtonGame.addEventListener('click', showGameSelectionPage);
    backButtonAmplitudeGame.addEventListener('click', showGameSelectionPage);

    // Game Selection
    tileToonMatchen.addEventListener('click', showGamePage);
    tileAmplitudeParcours.addEventListener('click', showAmplitudeGamePage);

    // Explorer controls
    frequencySlider.addEventListener('input', (e) => {
        updateFrequency(parseFloat((e.target as HTMLInputElement).value));
    });
    amplitudeSlider.addEventListener('input', (e) => {
        updateAmplitude(parseFloat((e.target as HTMLInputElement).value));
    });
    playButton.addEventListener('click', togglePlayback);
    micButton.addEventListener('click', toggleMicrophone);

    // Toon Matchen controls
    newChallengeButton.addEventListener('click', startNewChallenge);

    // Amplitude Parcours controls
    amplitudeRestartButton.addEventListener('click', () => {
        if (gameOver) {
            resetAmplitudeGame();
            startGame();
        }
    });
}

// === Initialization ===
function main() {
    setupEventListeners();
    requestAnimationFrame(animationLoop);
}

main();