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
const canvas = document.getElementById('wave-canvas') as HTMLCanvasElement;
const frequencySlider = document.getElementById('frequency') as HTMLInputElement;
const amplitudeSlider = document.getElementById('amplitude') as HTMLInputElement;
const playButton = document.getElementById('play-button') as HTMLButtonElement;
const micButton = document.getElementById('mic-button') as HTMLButtonElement;
const frequencyValueDisplay = document.getElementById('frequency-value') as HTMLSpanElement;
const amplitudeValueDisplay = document.getElementById('amplitude-value') as HTMLSpanElement;

const ctx = canvas.getContext('2d')!;

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
        
        playButton.textContent = 'Stop Tone';
        playButton.setAttribute('aria-label', 'Stop Tone');
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
        playButton.textContent = 'Play Tone';
        playButton.setAttribute('aria-label', 'Play Tone');
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

            micButton.textContent = 'Stop Mic';
            micButton.setAttribute('aria-label', 'Stop Microphone');
            playButton.disabled = true;
            frequencySlider.disabled = true;
            amplitudeSlider.disabled = true;

        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Could not access the microphone. Please check your browser permissions.');
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

        micButton.textContent = 'Use Microphone';
        micButton.setAttribute('aria-label', 'Use Microphone');
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
        // Use a logarithmic scale for visual frequency to keep it from looking too crowded.
        // This ensures that even at high frequencies, the wave is still discernible.
        const LOG_BASE = Math.log10(1000); // Base frequency for scaling (1000 Hz)
        const visualFrequencyFactor = 50 * (Math.log10(currentFrequency) / LOG_BASE);

        for (let x = 0; x < width; x++) {
            const angle = (x / width) * visualFrequencyFactor + (isListening ? 0 : phase);
            const y = midHeight - Math.sin(angle) * (midHeight * currentAmplitude * 0.9);
            ctx.lineTo(x, y);
        }
    } else {
        // If frequency is 0 (or silent), draw a flat line.
        ctx.lineTo(width, midHeight);
    }
    
    ctx.stroke();
    ctx.restore();
}

function renderSpectrum(width: number, height: number) {
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.save();
    
    ctx.shadowBlur = 5;
    ctx.shadowColor = 'hsl(165, 100%, 70%)';

    const numBars = 128;
    const barWidth = width / numBars;
    // How many frequency bins to group into one bar
    const sampleSize = Math.floor(bufferLength / numBars);

    let x = 0;
    for (let i = 0; i < numBars; i++) {
        let sum = 0;
        // Average the values of the bins for the current bar
        for (let j = 0; j < sampleSize; j++) {
            sum += dataArray[i * sampleSize + j];
        }
        const avg = sum / sampleSize;
        const barHeight = (avg / 255) * height;
        
        // Make louder frequencies brighter
        const brightness = 50 + (avg / 255) * 50;
        ctx.fillStyle = `hsl(165, 100%, ${brightness}%)`;
        
        // Draw the bar with a 1px gap
        ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

        x += barWidth;
    }

    ctx.restore();
}

function animationLoop() {
    requestAnimationFrame(animationLoop);
    resizeCanvasIfNeeded();

    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: width, clientHeight: height } = canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    
    drawGrid(width, height);

    if (isListening) {
        analyseMicrophoneInput();
        renderSpectrum(width, height);
    } else {
        renderWave(width, height);
        phase += 0.05;
    }
    
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
function handleKeyDown(e: KeyboardEvent) {
    // Check for focus on input elements to avoid conflicts, but allow space/m
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' && e.key !== ' ' && e.key.toLowerCase() !== 'm') {
        return;
    }

    if (e.key === ' ') {
        e.preventDefault();
        playButton.click();
    } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        micButton.click();
    }

    if (isListening || isPlaying) {
         // Don't allow synth controls when mic is on, but allow when playing
         if(isListening) return;
    }

    const freqStep = e.shiftKey ? 100 : 10;
    const ampStep = e.shiftKey ? 0.1 : 0.01;

    let newFrequency = currentFrequency;
    let newAmplitude = currentAmplitude;
    let changed = false;

    switch (e.key) {
        case 'ArrowUp':
            e.preventDefault();
            newFrequency = Math.min(parseFloat(frequencySlider.max), currentFrequency + freqStep);
            changed = true;
            break;
        case 'ArrowDown':
            e.preventDefault();
            newFrequency = Math.max(parseFloat(frequencySlider.min), currentFrequency - freqStep);
            changed = true;
            break;
        case 'ArrowRight':
             e.preventDefault();
            newAmplitude = Math.min(parseFloat(amplitudeSlider.max), currentAmplitude + ampStep);
            changed = true;
            break;
        case 'ArrowLeft':
             e.preventDefault();
            newAmplitude = Math.max(parseFloat(amplitudeSlider.min), currentAmplitude - ampStep);
            changed = true;
            break;
    }

    if (changed) {
        if (newFrequency !== currentFrequency) {
            frequencySlider.value = String(newFrequency);
            updateFrequency(newFrequency);
        }
        if (newAmplitude !== currentAmplitude) {
            amplitudeSlider.value = String(newAmplitude);
            updateAmplitude(newAmplitude);
        }
    }
}


function setupEventListeners() {
    frequencySlider.addEventListener('input', (e) => {
        updateFrequency(parseFloat((e.target as HTMLInputElement).value));
    });
    amplitudeSlider.addEventListener('input', (e) => {
        updateAmplitude(parseFloat((e.target as HTMLInputElement).value));
    });
    playButton.addEventListener('click', togglePlayback);
    micButton.addEventListener('click', toggleMicrophone);
    document.addEventListener('keydown', handleKeyDown);
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