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

// === DOM Elements ===
// Pages
const landingPage = document.getElementById('landing-page') as HTMLDivElement;
const explorerApp = document.getElementById('explorer-app') as HTMLDivElement;

// Navigation
const tileExplorer = document.getElementById('tile-explorer') as HTMLDivElement;
const tileGames = document.getElementById('tile-games') as HTMLDivElement;
const backButton = document.getElementById('back-button') as HTMLButtonElement;

// Explorer App Elements
const canvas = document.getElementById('wave-canvas') as HTMLCanvasElement;
const frequencySlider = document.getElementById('frequency') as HTMLInputElement;
const amplitudeSlider = document.getElementById('amplitude') as HTMLInputElement;
const playButton = document.getElementById('play-button') as HTMLButtonElement;
const micButton = document.getElementById('mic-button') as HTMLButtonElement;
const frequencyValueDisplay = document.getElementById('frequency-value') as HTMLSpanElement;
const amplitudeValueDisplay = document.getElementById('amplitude-value') as HTMLSpanElement;

const ctx = canvas.getContext('2d')!;

// === Navigation ===
function showExplorer() {
    landingPage.classList.remove('active');
    explorerApp.classList.add('active');
}

function showLandingPage() {
    // Stop any audio before navigating away
    if (isPlaying) {
        togglePlayback();
    }
    if (isListening) {
        toggleMicrophone();
    }

    explorerApp.classList.remove('active');
    landingPage.classList.add('active');
}


// === Audio Control ===
function initializeAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
}

function togglePlayback() {
    initializeAudio();
    if (audioContext!.state === 'suspended') {
        audioContext!.resume();
    }

    isPlaying = !isPlaying;

    if (isPlaying) {
        if (isListening) toggleMicrophone(); // Stop mic if it's on

        oscillator = audioContext!.createOscillator();
        gainNode = audioContext!.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext!.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(currentFrequency, audioContext!.currentTime);
        gainNode.gain.setValueAtTime(currentAmplitude, audioContext!.currentTime);
        oscillator.start();
        
        playButton.textContent = 'Stop Toon';
        playButton.setAttribute('aria-label', 'Stop Toon');
        micButton.disabled = true;
        frequencySlider.disabled = false;
        amplitudeSlider.disabled = false;

    } else {
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            gainNode?.disconnect();
            oscillator = null;
            gainNode = null;
        }
        playButton.textContent = 'Speel Toon Af';
        playButton.setAttribute('aria-label', 'Speel Toon Af');
        micButton.disabled = false;
    }
}

async function toggleMicrophone() {
    initializeAudio();
    if (audioContext!.state === 'suspended') {
        await audioContext!.resume();
    }
    
    isListening = !isListening;

    if(isListening) {
        if (isPlaying) togglePlayback(); // Stop synth if it's on

        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micSource = audioContext!.createMediaStreamSource(micStream);
            analyser = audioContext!.createAnalyser();
            analyser.fftSize = 2048;
            micSource.connect(analyser);

            micButton.textContent = 'Stop Microfoon';
            micButton.setAttribute('aria-label', 'Stop Microfoon');
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
        micButton.setAttribute('aria-label', 'Gebruik Microfoon');
        playButton.disabled = false;
        frequencySlider.disabled = false;
        amplitudeSlider.disabled = false;
        
        // Reset to slider values
        updateFrequency(parseFloat(frequencySlider.value));
        updateAmplitude(parseFloat(amplitudeSlider.value));
    }
}


// === Analysis Logic ===
function analyseMicrophoneInput() {
    if (!analyser || !isListening) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(dataArray);

    // --- Amplitude (RMS) ---
    let sumSquares = 0.0;
    for (const amplitude of dataArray) {
        sumSquares += amplitude * amplitude;
    }
    const rms = Math.sqrt(sumSquares / bufferLength);
    // Scale and clamp amplitude, add a noise gate
    const sensitivity = 5; // Adjust sensitivity
    const noiseGate = 0.01;
    let newAmplitude = rms > noiseGate ? Math.min(rms * sensitivity, 1.0) : 0;
    updateAmplitude(newAmplitude);
    
    // --- Frequency (Autocorrelation) ---
    if (newAmplitude > 0.05) { // Only calculate frequency if sound is loud enough
         let bestOffset = -1;
         let bestCorrelation = 0;
         let rm_s = 0;
 
         for (let i = 0; i < bufferLength; i++) {
             rm_s += dataArray[i] * dataArray[i];
         }
         rm_s = Math.sqrt(rm_s / bufferLength);
         if (rm_s < 0.01) return; // Not enough signal
 
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


// === Drawing Logic ===
function resizeCanvasIfNeeded(): boolean {
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    const displayWidth = Math.round(width);
    const displayHeight = Math.round(height);

    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
        return true;
    }
    return false;
}

function drawGrid(width: number, height: number) {
    const midHeight = height / 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const verticalLineCount = Math.floor(width / 50);
    ctx.beginPath();
    for (let i = 1; i <= verticalLineCount; i++) {
        const x = i * 50;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    const horizontalLinePositions = [midHeight * 0.5, midHeight * 1.5];
    for(const y of horizontalLinePositions) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, midHeight);
    ctx.lineTo(width, midHeight);
    ctx.stroke();
    ctx.restore();
}

function renderWave(width: number, height: number) {
    const midHeight = height / 2;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'hsl(165, 100%, 50%)';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'hsl(165, 100%, 70%)';
    ctx.beginPath();
    ctx.moveTo(0, midHeight);

    if (currentFrequency > 0) {
        // Gebruik een lineaire schaal voor de visuele frequentie, wat intuïtiever is
        // voor het kleinere bereik van 100-2000 Hz.
        const numCycles = currentFrequency / 50;
        const totalAngle = numCycles * 2 * Math.PI;

        for (let x = 0; x < width; x++) {
            const angle = (x / width) * totalAngle + phase;
            const y = midHeight - Math.sin(angle) * (midHeight * currentAmplitude * 0.9);
            ctx.lineTo(x, y);
        }
    } else {
        // Als de frequentie 0 is (of stil), teken dan een platte lijn.
        ctx.lineTo(width, midHeight);
    }
    
    ctx.stroke();
    ctx.restore();
}

function animationLoop() {
    requestAnimationFrame(animationLoop);
    
    // Only render if the explorer is active
    if (!explorerApp.classList.contains('active')) return;

    resizeCanvasIfNeeded();

    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: width, clientHeight: height } = canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    
    drawGrid(width, height);

    if (isListening) {
        analyseMicrophoneInput();
    }
    
    renderWave(width, height);
    phase += 0.05;
    
    ctx.restore();
}


// === UI Updates ===
function updateFrequency(value: number) {
    currentFrequency = value;
    frequencyValueDisplay.textContent = `${Math.round(currentFrequency)} Hz`;
    if (isPlaying && oscillator) {
        oscillator.frequency.setValueAtTime(currentFrequency, audioContext!.currentTime);
    }
}

function updateAmplitude(value: number) {
    currentAmplitude = value;
    amplitudeValueDisplay.textContent = `${Math.round(currentAmplitude * 100)}%`;
    if (isPlaying && gainNode) {
        gainNode.gain.setValueAtTime(currentAmplitude, audioContext!.currentTime);
    }
}


// === Event Listeners ===
function setupEventListeners() {
    // Navigation
    tileExplorer.addEventListener('click', showExplorer);
    tileGames.addEventListener('click', () => {
        alert('Deze functie is binnenkort beschikbaar!');
    });
    backButton.addEventListener('click', showLandingPage);
    
    // Explorer controls
    frequencySlider.addEventListener('input', (e) => {
        updateFrequency(parseFloat((e.target as HTMLInputElement).value));
    });
    amplitudeSlider.addEventListener('input', (e) => {
        updateAmplitude(parseFloat((e.target as HTMLInputElement).value));
    });
    playButton.addEventListener('click', togglePlayback);
    micButton.addEventListener('click', toggleMicrophone);
}

// === Initialization ===
function main() {
    if (!canvas || !frequencySlider || !amplitudeSlider || !playButton || !micButton) {
        console.error("One or more required elements are not found in the DOM.");
        return;
    }
    setupEventListeners();
    requestAnimationFrame(animationLoop);
}

main();