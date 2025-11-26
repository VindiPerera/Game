// Minimal EndlessRunner client: rendering and input only
const socket = io();

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Client-side game state and methods
class ClientGame {
  constructor() {
    this.gameState = null;
    this.score = 0;
    this.distance = 0;
    this.highScore = parseInt(localStorage.getItem("highScore")) || 0;
    this.sessionId = null;
    this.sessionStartTime = null;
    this.sessionStats = null;
    this._integrityCheck = { tamperingDetected: false };

    // Audio properties
    this.audioContext = null;
    this.audioEnabled = JSON.parse(localStorage.getItem("audioEnabled")) || true;
    this.musicEnabled = JSON.parse(localStorage.getItem("musicEnabled")) || true;
    this.backgroundMusic = new Audio('/sounds/background.mp3');
    this.backgroundMusic.loop = true;
    this.backgroundMusic.volume = 0.3;
  }

  gameOver() {
    this.gameState = "gameOver";
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem("highScore", this.highScore);
    }

    // Stop background music
    this.stopBackgroundMusic();

    // Play game over sound
    this.playGameOverSound();

    document.getElementById("backLink").style.display = "block";
    this.showGameOverScreen();

    // Save score to server
    this.saveScore();

    // End session with result
    this.endSession('died');
  }

  showGameOverScreen() {
    document.getElementById("finalScore").textContent = this.score;
    document.getElementById("finalDistance").textContent = this.distance;
    document.getElementById("finalPersonalBest").textContent = this.highScore; // User's personal best
    
    // Fetch global high score from server
    this.fetchGlobalHighScore().then(globalHighScore => {
      document.getElementById("finalHighScore").textContent = globalHighScore;
    }).catch(error => {
      console.error("Error fetching global high score:", error);
      // Fallback to user's personal best if fetch fails
      document.getElementById("finalHighScore").textContent = this.highScore;
    });
    
    document.getElementById("gameOverScreen").classList.remove("hidden");
  }

  async fetchGlobalHighScore() {
    try {
      const response = await fetch('/api/scores');
      const data = await response.json();
      
      if (data.scores && data.scores.length > 0) {
        // Return the highest score from all players
        return data.scores[0].score;
      } else {
        // If no scores found, return user's personal best
        return this.highScore;
      }
    } catch (error) {
      console.error("Failed to fetch global high score:", error);
      // Fallback to user's personal best
      return this.highScore;
    }
  }

  saveScore() {
    // Skip score saving for guest users (they use sessions instead)
    if (window.gameUser && window.gameUser.isGuest) {
      console.log("Guest user - skipping score save, using session save instead");
      return;
    }

    // Calculate level based on score (every 75 points increases difficulty)
    const level = Math.floor(this.score / 75) + 1;

    // Additional client-side integrity checks
    const currentTime = Date.now();
    const gameDuration = this.sessionStartTime ? (currentTime - this.sessionStartTime) / 1000 : 0;

    // Validate game duration is reasonable (not too short for high scores)
    if (this.score > 100 && gameDuration < 30) {
      console.warn("Score validation failed: Game too short for score", this.score, "duration:", gameDuration);
      return; // Don't save suspicious scores
    }

    // Validate score progression (shouldn't increase too rapidly)
    const maxScoreIncrease = gameDuration * 15; // Max 15 points per second
    if (this.score > maxScoreIncrease) {
      console.warn("Score validation failed: Score increase too rapid", this.score, "max allowed:", maxScoreIncrease);
      this.score = Math.min(this.score, maxScoreIncrease);
    }

    // Send score data to server
    fetch('/api/scores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin', // Include cookies for authentication
      body: JSON.stringify({
        score: this.score,
        level: level,
        distance: Math.floor(this.distance),
        validationToken: btoa(this.score + ':' + gameDuration + ':' + this.sessionId) // Simple integrity token
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.message === "Score saved successfully!") {
        console.log("Score saved successfully!");
      } else {
        console.error("Failed to save score:", data.message);
      }
    })
    .catch(error => {
      console.error("Error saving score:", error);
    });
  }

  // Session tracking methods
  startSession() {
    // Generate a 7-digit session ID (server will generate its own)
    this.sessionId = Math.floor(1000000 + Math.random() * 9000000).toString();
    this.sessionStartTime = Date.now();
    this.sessionStats = {
      coinsCollected: 0,
      obstaclesHit: 0,
      powerupsCollected: 0,
      distanceTraveled: 0,
      gameResult: null
    };
    console.log("Game session started:", this.sessionId);
  }

  updateSessionStats() {
    if (this.sessionId) {
      this.sessionStats.distanceTraveled = Math.floor(this.distance);
    }
  }

  endSession(result) {
    if (!this.sessionId) return;

    this.sessionStats.gameResult = result;
    const duration = Math.floor((Date.now() - this.sessionStartTime) / 1000);

    // Enhanced client-side validation before sending
    const maxReasonableScore = Math.max(duration * 10, 1000);
    if (this.score > maxReasonableScore) {
      console.warn("Score validation failed on client:", this.score, "max allowed:", maxReasonableScore);
      // Reset score to reasonable value
      this.score = Math.min(this.score, maxReasonableScore);
    }

    // Additional integrity checks
    const coinsPerSecond = duration > 0 ? this.sessionStats.coinsCollected / duration : 0;
    if (coinsPerSecond > 5) { // Max 5 coins per second
      console.warn("Coin collection rate too high:", coinsPerSecond, "coins/sec");
      this.sessionStats.coinsCollected = Math.min(this.sessionStats.coinsCollected, duration * 5);
    }

    const obstaclesPerSecond = duration > 0 ? this.sessionStats.obstaclesHit / duration : 0;
    if (obstaclesPerSecond > 2) { // Max 2 obstacles per second
      console.warn("Obstacle hit rate too high:", obstaclesPerSecond, "hits/sec");
      this.sessionStats.obstaclesHit = Math.min(this.sessionStats.obstaclesHit, duration * 2);
    }

    // Prepare session data
    const sessionData = {
      sessionId: this.sessionId,
      durationSeconds: duration,
      finalScore: this.score,
      coinsCollected: this.sessionStats.coinsCollected,
      obstaclesHit: this.sessionStats.obstaclesHit,
      powerupsCollected: this.sessionStats.powerupsCollected,
      distanceTraveled: this.sessionStats.distanceTraveled,
      gameResult: this.sessionStats.gameResult,
      integrityHash: btoa(JSON.stringify({
        score: this.score,
        duration: duration,
        coins: this.sessionStats.coinsCollected,
        obstacles: this.sessionStats.obstaclesHit
      })),
      tamperingDetected: this._integrityCheck.tamperingDetected
    };

    // Add guest user information if playing as guest
    if (window.gameUser && window.gameUser.isGuest) {
      // Use the persistent guest ID from localStorage or the one passed from server
      let guestId = window.gameUser.guestId || localStorage.getItem('guestId');
      
      // If no guest ID exists, create one and store it
      if (!guestId) {
        guestId = 'Guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('guestId', guestId);
      }
      
      sessionData.guestId = guestId;
      console.log("=== GUEST SESSION DEBUG ===");
      console.log("gameUser:", window.gameUser);
      console.log("Using persistent guest ID:", guestId);
      console.log("Session data being sent:", sessionData);
      console.log("=========================");
    }

    // Send session data to server
    fetch('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(sessionData)
    })
    .then(response => response.json())
    .then(data => {
      if (data.message === "Session saved successfully!") {
        console.log("Session saved successfully!");
      } else {
        console.error("Failed to save session:", data.message);
      }
    })
    .catch(error => {
      console.error("Error saving session:", error);
    });

    console.log("Game session ended:", this.sessionId, "Result:", result);
    this.sessionId = null;
    this.sessionStartTime = null;
  }

  updateScore() {
    // Only update the display, don't auto-increment
    document.getElementById("score").textContent = this.score;

    // Increase difficulty gradually based on coin count
    if (this.score > 0 && this.score % 75 === 0) {
      let speedIncrease = 0.5; // Base speed increase
      this.baseGameSpeed += speedIncrease;
      // Limit the maximum base game speed to keep the game playable
      this.baseGameSpeed = Math.min(this.baseGameSpeed, 10); // Max speed cap
      if (this.slowdownTimer === 0) {
        this.gameSpeed = this.baseGameSpeed;
      }
    }
  }

  updateHighScore() {
    document.getElementById("highScore").textContent = this.highScore;
  }

  stopBackgroundMusic() {
    // Client-side: stop any playing background music
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic.currentTime = 0;
    }
  }

  playGameOverSound() {
    // Client-side: play game over sound effect
    if (this.audioEnabled) {
      // Descending game over sound
      this.playSound(400, 0.3, "sawtooth", 0.4);
      setTimeout(() => this.playSound(300, 0.3, "sawtooth", 0.35), 150);
      setTimeout(() => this.playSound(200, 0.5, "sawtooth", 0.3), 300);
    }
  }

  // Client-side game control methods
  startGame() {
    document.getElementById('startScreen').style.display = 'none';
    // Start new session
    this.startSession();
    // Emit start to server if needed
    socket.emit('start');
  }

  togglePause() {
    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  pauseGame() {
    document.getElementById('pauseScreen').style.display = 'flex';
    this.isPaused = true;
    socket.emit('pause');
  }

  resumeGame() {
    document.getElementById('pauseScreen').style.display = 'none';
    this.isPaused = false;
    socket.emit('resume');
  }

  updatePauseButton() {
    const pauseBtn = document.getElementById('pauseBtn');
    if (this.isPaused) {
      pauseBtn.textContent = 'Resume';
    } else {
      pauseBtn.textContent = 'Pause';
    }
  }

  restartGame() {
    document.getElementById('gameOverScreen').style.display = 'none';
    // Start new session
    this.startSession();
    socket.emit('restart');
  }

  // Audio methods
  initAudio() {
    try {
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API not supported");
    }
  }

  playSound(frequency, duration, type = "sine", volume = 0.3) {
    if (!this.audioContext || !this.audioEnabled) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.setValueAtTime(
      frequency,
      this.audioContext.currentTime
    );
    oscillator.type = type;

    gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      this.audioContext.currentTime + duration
    );

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  playJumpSound() {
    // High-pitched jump sound
    this.playSound(400, 0.15, "sine", 0.2);
    // Add a quick lower tone for depth
    setTimeout(() => this.playSound(200, 0.1, "triangle", 0.15), 50);
  }

  playSlideSound() {
    // Low sliding sound
    this.playSound(150, 0.3, "sawtooth", 0.25);
  }

  playCoinSound() {
    // Pleasant coin collection sound
    this.playSound(800, 0.1, "sine", 0.3);
    setTimeout(() => this.playSound(1000, 0.08, "sine", 0.2), 50);
  }

  playPowerUpSound() {
    // Magical power-up sound
    this.playSound(600, 0.15, "triangle", 0.3);
    setTimeout(() => this.playSound(800, 0.12, "triangle", 0.25), 75);
    setTimeout(() => this.playSound(1000, 0.1, "triangle", 0.2), 150);
  }

  playHitSound() {
    // Harsh hit sound
    this.playSound(200, 0.2, "sawtooth", 0.4);
    setTimeout(() => this.playSound(150, 0.15, "sawtooth", 0.3), 100);
  }

  playGameOverSound() {
    // Descending game over sound
    this.playSound(400, 0.3, "sawtooth", 0.4);
    setTimeout(() => this.playSound(300, 0.3, "sawtooth", 0.35), 150);
    setTimeout(() => this.playSound(200, 0.5, "sawtooth", 0.3), 300);
  }

  playLevelUpSound() {
    // Triumphant level up sound
    this.playSound(500, 0.2, "triangle", 0.4);
    setTimeout(() => this.playSound(600, 0.15, "triangle", 0.35), 100);
    setTimeout(() => this.playSound(700, 0.15, "triangle", 0.3), 200);
    setTimeout(() => this.playSound(800, 0.2, "triangle", 0.25), 300);
  }

  // Background music management
  startBackgroundMusic() {
    if (!this.musicEnabled) return;

    // Play the MP3 file
    this.backgroundMusic.currentTime = 0; // Reset to beginning
    this.backgroundMusic.play().catch((err) => {
      console.warn("Failed to play background music:", err);
    });
  }

  stopBackgroundMusic() {
    // Pause the MP3 file
    this.backgroundMusic.pause();
    this.backgroundMusic.currentTime = 0; // Reset to beginning
  }

  toggleAudio() {
    this.audioEnabled = !this.audioEnabled;
    localStorage.setItem("audioEnabled", this.audioEnabled);
    this.updateAudioButtons();
  }

  toggleMusic() {
    this.musicEnabled = !this.musicEnabled;
    localStorage.setItem("musicEnabled", this.musicEnabled);
    this.updateAudioButtons();

    // Start or stop background music based on new setting
    if (this.musicEnabled && this.gameState === "playing") {
      this.startBackgroundMusic();
    } else {
      this.stopBackgroundMusic();
    }
  }

  updateAudioButtons() {
    const audioBtn = document.getElementById("audioToggle");
    const musicBtn = document.getElementById("musicToggle");

    if (this.audioEnabled) {
      audioBtn.textContent = "🔊 Sound";
      audioBtn.className =
        "bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm";
    } else {
      audioBtn.textContent = "🔇 Sound";
      audioBtn.className =
        "bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm";
    }

    if (this.musicEnabled) {
      musicBtn.textContent = "🎵 Music";
      musicBtn.className =
        "bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm";
    } else {
      musicBtn.textContent = "🎵 Music";
      musicBtn.className =
        "bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm";
    }
  }
}

// Create client game instance
const clientGame = new ClientGame();

let gameState = null;

// Listen for game state updates from the server
socket.on("gameState", (state) => {
  gameState = state;
  renderGame(state);
  updateUI(state);
  handleGameState(state);
});

// Send input to server
const keys = {};
window.addEventListener("keydown", (e) => {
  if (!keys[e.code]) {
    keys[e.code] = true;
    socket.emit("input", { type: "keydown", code: e.code });
  }
});
window.addEventListener("keyup", (e) => {
  if (keys[e.code]) {
    keys[e.code] = false;
    socket.emit("input", { type: "keyup", code: e.code });
  }
});

// UI event listeners
document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('startScreen').style.display = 'none';
  // Start new session
  clientGame.startSession();
  // Emit start to server if needed
  socket.emit('start');
});

document.getElementById('pauseBtn').addEventListener('click', () => {
  document.getElementById('pauseScreen').style.display = 'flex';
  socket.emit('pause');
});

document.getElementById('resumeBtn').addEventListener('click', () => {
  document.getElementById('pauseScreen').style.display = 'none';
  socket.emit('resume');
});

document.getElementById('restartBtn').addEventListener('click', () => {
  document.getElementById('gameOverScreen').style.display = 'none';
  // Start new session
  clientGame.startSession();
  socket.emit('restart');
});

document.getElementById('pauseRestartBtn').addEventListener('click', () => {
  document.getElementById('pauseScreen').style.display = 'none';
  // Start new session
  clientGame.startSession();
  socket.emit('restart');
});

// Handle window resize
window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (gameState) renderGame(gameState);
});

// Basic rendering function (expand as needed)
function renderGame(state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!state) return;

  // Draw background gradient
  drawBackground(state);

  // Draw sun or moon
  if (state.isNightMode) {
    drawMoon();
  } else {
    drawSun();
  }

  // Draw clouds and trees
  drawClouds(state);
  drawBackgroundTrees(state);

  // Draw ground
  drawGround(state);

  // Draw obstacles
  drawObstacles(state);

  // Draw birds
  drawBirds(state);

  // Draw monster
  drawMonster(state);

  // Draw player
  drawPlayer(state);

  // Draw catching effects if in catching state
  if (state.gameState === "catching") {
    drawCatchingEffects(state);
  }

  // Draw score
  ctx.fillStyle = "#fff";
  ctx.font = "24px Arial";
  ctx.fillText(`Score: ${state.score || 0}`, 20, 40);
  ctx.fillText(`Distance: ${Math.floor(state.distance || 0)}`, 20, 70);
}

// Update UI elements
function updateUI(state) {
  if (!state) return;
  document.getElementById('score').textContent = state.score || 0;
  document.getElementById('distance').textContent = Math.floor(state.distance || 0) + 'm';
  // Calculate level based on distance
  const level = Math.floor((state.distance || 0) / 500) + 1;
  document.getElementById('level').textContent = level;
  // High score (assume from localStorage or something, but for now, same as score)
  document.getElementById('highScore').textContent = state.score || 0;
  // Update power-up indicators
  document.getElementById('slowdownIndicator').style.display = (state.slowdownTimer > 0) ? 'block' : 'none';
  document.getElementById('doubleJumpIndicator').style.display = (state.player && state.player.doubleJumpUsed) ? 'block' : 'none';
  document.getElementById('slidingIndicator').style.display = (state.player && state.player.sliding) ? 'block' : 'none';
  document.getElementById('shieldIndicator').style.display = state.invulnerable ? 'block' : 'none';
  document.getElementById('magnetIndicator').style.display = (state.magnetTimer > 0) ? 'block' : 'none';
  document.getElementById('speedIndicator').style.display = state.speedBoost ? 'block' : 'none';
  document.getElementById('doubleJumpBoostIndicator').style.display = state.scoreMultiplier ? 'block' : 'none';
  document.getElementById('scoreMultiplierIndicator').style.display = state.scoreMultiplier ? 'block' : 'none';
  document.getElementById('slowMotionIndicator').style.display = (state.slowdownTimer > 0) ? 'block' : 'none';
  // Update obstacle hits
  document.getElementById('obstacleHits').textContent = state.hitTimestamps ? state.hitTimestamps.length : 0;

  // Update client game state
  clientGame.score = state.score || 0;
  clientGame.distance = Math.floor(state.distance || 0);
  clientGame.highScore = Math.max(clientGame.highScore, state.highScore || 0);
}

// Drawing functions
function drawBackground(state) {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  if (state.isNightMode) {
    gradient.addColorStop(0, "#191970");
    gradient.addColorStop(1, "#000080");
  } else {
    gradient.addColorStop(0, "#87CEEB");
    gradient.addColorStop(1, "#98FB98");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawSun() {
  const time = Date.now() * 0.001; // For animations
  const centerX = canvas.width - 100;
  const centerY = 100;

  // Pulsing animation for the sun
  const pulseScale = 1 + Math.sin(time * 2) * 0.05;
  const sunRadius = 50 * pulseScale;

  // Save context for transformations
  ctx.save();

  // Outer glow effect
  const outerGlowGradient = ctx.createRadialGradient(
    centerX, centerY, sunRadius * 0.8,
    centerX, centerY, sunRadius * 2.5
  );
  outerGlowGradient.addColorStop(0, 'rgba(255, 215, 0, 0.8)');
  outerGlowGradient.addColorStop(0.3, 'rgba(255, 200, 0, 0.4)');
  outerGlowGradient.addColorStop(0.6, 'rgba(255, 150, 0, 0.2)');
  outerGlowGradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

  ctx.fillStyle = outerGlowGradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, sunRadius * 2.5, 0, 2 * Math.PI);
  ctx.fill();

  // Inner glow effect
  const innerGlowGradient = ctx.createRadialGradient(
    centerX, centerY, 0,
    centerX, centerY, sunRadius * 1.2
  );
  innerGlowGradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
  innerGlowGradient.addColorStop(0.7, 'rgba(255, 215, 0, 0.9)');
  innerGlowGradient.addColorStop(1, 'rgba(255, 180, 0, 0.3)');

  ctx.fillStyle = innerGlowGradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, sunRadius * 1.2, 0, 2 * Math.PI);
  ctx.fill();

  // Main sun body with gradient
  const sunGradient = ctx.createRadialGradient(
    centerX - sunRadius * 0.3, centerY - sunRadius * 0.3, 0,
    centerX, centerY, sunRadius
  );
  sunGradient.addColorStop(0, '#FFFFFF');
  sunGradient.addColorStop(0.3, '#FFFF99');
  sunGradient.addColorStop(0.7, '#FFD700');
  sunGradient.addColorStop(1, '#FFA500');

  ctx.fillStyle = sunGradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, sunRadius, 0, 2 * Math.PI);
  ctx.fill();

  // Sun surface details - subtle texture
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const x = centerX + Math.cos(angle) * (sunRadius * 0.6);
    const y = centerY + Math.sin(angle) * (sunRadius * 0.6);
    ctx.beginPath();
    ctx.arc(x, y, sunRadius * 0.15, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Enhanced rays with gradients
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
  ctx.lineWidth = 4;
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 10;

  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6;
    const rayLength = 70 + Math.sin(time * 3 + i) * 10;
    const rayWidth = 3 + Math.sin(time * 2 + i * 0.5) * 1;

    // Ray gradient
    const rayGradient = ctx.createLinearGradient(
      centerX + Math.cos(angle) * sunRadius,
      centerY + Math.sin(angle) * sunRadius,
      centerX + Math.cos(angle) * (sunRadius + rayLength),
      centerY + Math.sin(angle) * (sunRadius + rayLength)
    );
    rayGradient.addColorStop(0, 'rgba(255, 215, 0, 0.9)');
    rayGradient.addColorStop(0.5, 'rgba(255, 200, 0, 0.6)');
    rayGradient.addColorStop(1, 'rgba(255, 150, 0, 0)');

    ctx.strokeStyle = rayGradient;
    ctx.lineWidth = rayWidth;

    ctx.beginPath();
    ctx.moveTo(
      centerX + Math.cos(angle) * sunRadius,
      centerY + Math.sin(angle) * sunRadius
    );
    ctx.lineTo(
      centerX + Math.cos(angle) * (sunRadius + rayLength),
      centerY + Math.sin(angle) * (sunRadius + rayLength)
    );
    ctx.stroke();
  }

  // Corona particles orbiting the sun
  ctx.shadowBlur = 0;
  for (let i = 0; i < 16; i++) {
    const particleAngle = time * 0.5 + (i * Math.PI) / 8;
    const particleDistance = sunRadius * 1.3 + Math.sin(time * 2 + i) * 15;
    const particleX = centerX + Math.cos(particleAngle) * particleDistance;
    const particleY = centerY + Math.sin(particleAngle) * particleDistance;
    const particleSize = 2 + Math.sin(time * 3 + i * 0.7) * 1.5;

    // Particle glow
    const particleGlow = ctx.createRadialGradient(
      particleX, particleY, 0,
      particleX, particleY, particleSize * 3
    );
    particleGlow.addColorStop(0, 'rgba(255, 220, 100, 0.8)');
    particleGlow.addColorStop(0.5, 'rgba(255, 200, 50, 0.4)');
    particleGlow.addColorStop(1, 'rgba(255, 150, 0, 0)');

    ctx.fillStyle = particleGlow;
    ctx.beginPath();
    ctx.arc(particleX, particleY, particleSize * 3, 0, 2 * Math.PI);
    ctx.fill();

    // Particle core
    ctx.fillStyle = 'rgba(255, 255, 200, 0.9)';
    ctx.beginPath();
    ctx.arc(particleX, particleY, particleSize, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Restore context
  ctx.restore();
}

function drawMoon() {
  ctx.fillStyle = "#F5F5DC";
  ctx.beginPath();
  ctx.arc(canvas.width - 100, 100, 50, 0, 2 * Math.PI);
  ctx.fill();
  // Craters
  ctx.fillStyle = "#D3D3D3";
  ctx.beginPath();
  ctx.arc(canvas.width - 120, 90, 10, 0, 2 * Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(canvas.width - 85, 110, 8, 0, 2 * Math.PI);
  ctx.fill();
}

function drawClouds(state) {
  if (!state.clouds) return;

  state.clouds.forEach((cloud) => {
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillRect(cloud.x, cloud.y, cloud.width, cloud.height);
    ctx.fillRect(
      cloud.x + 10,
      cloud.y - 10,
      cloud.width - 20,
      cloud.height
    );
    ctx.fillRect(
      cloud.x + 15,
      cloud.y + 10,
      cloud.width - 30,
      cloud.height - 10
    );
  });
}

function drawBackgroundTrees(state) {
  if (!state.backgroundTrees || state.backgroundTrees.length === 0) return;

  state.backgroundTrees.forEach(tree => {
    ctx.save();

    // Apply depth-based opacity and scaling
    const opacity = 0.3 + (tree.depth * 0.7); // Closer trees are more opaque
    const scale = 0.5 + (tree.depth * 0.5); // Closer trees are larger

    ctx.globalAlpha = opacity;
    ctx.translate(tree.x, tree.y);
    ctx.scale(scale, scale);

    // Apply natural rotation
    const rotation = Math.sin(tree.x * 0.01 + tree.y * 0.01) * 0.1;
    ctx.rotate(rotation);

    // Draw the appropriate tree type
    switch (tree.type) {
      case 'pine':
        drawPineTree(tree);
        break;
      case 'oak':
        drawOakTree(tree);
        break;
      case 'willow':
        drawWillowTree(tree);
        break;
      case 'cypress':
        drawCypressTree(tree);
        break;
      case 'maple':
        drawMapleTree(tree);
        break;
      default:
        drawOakTree(tree); // Default fallback
    }

    ctx.restore();
  });
}

function drawPineTree(tree) {
  const trunkHeight = tree.height * 0.6;
  const trunkWidth = tree.width * 0.15;

  // Draw trunk with bark texture
  ctx.fillStyle = "#654321";
  ctx.fillRect(-trunkWidth/2, 0, trunkWidth, trunkHeight);

  // Bark texture lines
  ctx.strokeStyle = "#4a2c17";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-trunkWidth/4 + i * trunkWidth/4, 0);
    ctx.lineTo(-trunkWidth/4 + i * trunkWidth/4, trunkHeight);
    ctx.stroke();
  }

  // Pine needle layers
  const layerCount = 4;
  for (let i = 0; i < layerCount; i++) {
    const layerY = -trunkHeight * 0.8 + i * (trunkHeight * 0.4);
    const layerWidth = tree.width * (0.8 - i * 0.15);
    const layerHeight = tree.height * 0.25;

    // Dark green base
    ctx.fillStyle = "#0f5132";
    ctx.beginPath();
    ctx.moveTo(0, layerY);
    ctx.lineTo(-layerWidth/2, layerY + layerHeight);
    ctx.lineTo(layerWidth/2, layerY + layerHeight);
    ctx.closePath();
    ctx.fill();

    // Lighter green highlights
    ctx.fillStyle = "#1e7e34";
    ctx.beginPath();
    ctx.moveTo(0, layerY);
    ctx.lineTo(-layerWidth/3, layerY + layerHeight * 0.7);
    ctx.lineTo(layerWidth/3, layerY + layerHeight * 0.7);
    ctx.closePath();
    ctx.fill();
  }
}

function drawOakTree(tree) {
  const trunkHeight = tree.height * 0.7;
  const trunkWidth = tree.width * 0.2;

  // Draw trunk
  ctx.fillStyle = "#8B4513";
  ctx.fillRect(-trunkWidth/2, 0, trunkWidth, trunkHeight);

  // Bark texture
  ctx.strokeStyle = "#654321";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const x = -trunkWidth/2 + (i + 0.5) * trunkWidth/4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + Math.sin(i) * 2, trunkHeight);
    ctx.stroke();
  }

  // Oak leaves - multiple clusters
  const leafClusters = 5;
  for (let i = 0; i < leafClusters; i++) {
    const angle = (i / leafClusters) * Math.PI * 2;
    const distance = tree.width * 0.3;
    const clusterX = Math.cos(angle) * distance;
    const clusterY = -trunkHeight * 0.6 + Math.sin(angle) * tree.height * 0.2;

    // Main leaf cluster
    ctx.fillStyle = "#228B22";
    ctx.beginPath();
    ctx.arc(clusterX, clusterY, tree.width * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = "#32CD32";
    ctx.beginPath();
    ctx.arc(clusterX - 3, clusterY - 3, tree.width * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWillowTree(tree) {
  const trunkHeight = tree.height * 0.8;
  const trunkWidth = tree.width * 0.12;

  // Curved trunk
  ctx.strokeStyle = "#8B4513";
  ctx.lineWidth = trunkWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(tree.width * 0.1, -trunkHeight * 0.3, tree.width * 0.05, -trunkHeight);
  ctx.stroke();

  // Willow leaves - drooping branches
  ctx.strokeStyle = "#228B22";
  ctx.lineWidth = 2;
  const branchCount = 6;
  for (let i = 0; i < branchCount; i++) {
    const branchY = -trunkHeight * (0.2 + i * 0.15);
    const branchLength = tree.width * (0.4 + Math.random() * 0.3);

    ctx.beginPath();
    ctx.moveTo(tree.width * 0.05, branchY);
    ctx.quadraticCurveTo(
      tree.width * 0.05 + branchLength * 0.5,
      branchY - branchLength * 0.3,
      tree.width * 0.05 + branchLength,
      branchY + branchLength * 0.2
    );
    ctx.stroke();

    // Small leaves along branch
    ctx.fillStyle = "#32CD32";
    for (let j = 0; j < 3; j++) {
      const leafX = tree.width * 0.05 + branchLength * (0.3 + j * 0.3);
      const leafY = branchY + branchLength * 0.1 * (j - 1);
      ctx.beginPath();
      ctx.arc(leafX, leafY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawCypressTree(tree) {
  const trunkHeight = tree.height * 0.9;
  const trunkWidth = tree.width * 0.08;

  // Tall, straight trunk
  ctx.fillStyle = "#654321";
  ctx.fillRect(-trunkWidth/2, 0, trunkWidth, trunkHeight);

  // Vertical bark lines
  ctx.strokeStyle = "#4a2c17";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-trunkWidth/4 + i * trunkWidth/4, 0);
    ctx.lineTo(-trunkWidth/4 + i * trunkWidth/4, trunkHeight);
    ctx.stroke();
  }

  // Cypress foliage - conical shape
  const foliageLayers = 6;
  for (let i = 0; i < foliageLayers; i++) {
    const layerY = -trunkHeight * 0.7 + i * (trunkHeight * 0.2);
    const layerWidth = tree.width * (0.6 - i * 0.08);

    // Dark green base
    ctx.fillStyle = "#0d5c2a";
    ctx.beginPath();
    ctx.moveTo(0, layerY);
    ctx.lineTo(-layerWidth/2, layerY + tree.height * 0.15);
    ctx.lineTo(layerWidth/2, layerY + tree.height * 0.15);
    ctx.closePath();
    ctx.fill();

    // Lighter green tips
    ctx.fillStyle = "#1e7e34";
    ctx.beginPath();
    ctx.moveTo(0, layerY);
    ctx.lineTo(-layerWidth/3, layerY + tree.height * 0.1);
    ctx.lineTo(layerWidth/3, layerY + tree.height * 0.1);
    ctx.closePath();
    ctx.fill();
  }
}

function drawMapleTree(tree) {
  const trunkHeight = tree.height * 0.6;
  const trunkWidth = tree.width * 0.18;

  // Draw trunk
  ctx.fillStyle = "#8B4513";
  ctx.fillRect(-trunkWidth/2, 0, trunkWidth, trunkHeight);

  // Maple leaves - distinctive star shape
  const leafCount = 7;
  for (let i = 0; i < leafCount; i++) {
    const angle = (i / leafCount) * Math.PI * 2;
    const distance = tree.width * 0.25;
    const leafX = Math.cos(angle) * distance;
    const leafY = -trunkHeight * 0.5 + Math.sin(angle) * tree.height * 0.15;

    // Maple leaf shape
    ctx.fillStyle = "#DC143C"; // Crimson red
    ctx.beginPath();
    ctx.moveTo(leafX, leafY);
    // Star-like points
    for (let j = 0; j < 5; j++) {
      const pointAngle = (j / 5) * Math.PI * 2;
      const pointDistance = tree.width * 0.08;
      const pointX = leafX + Math.cos(pointAngle) * pointDistance;
      const pointY = leafY + Math.sin(pointAngle) * pointDistance;
      ctx.lineTo(pointX, pointY);
    }
    ctx.closePath();
    ctx.fill();

    // Stem
    ctx.strokeStyle = "#8B4513";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leafX, leafY + tree.width * 0.08);
    ctx.lineTo(leafX, leafY + tree.width * 0.12);
    ctx.stroke();
  }
}

function generateBackgroundTrees(state) {
  if (!state.backgroundTrees) {
    state.backgroundTrees = [];
  }

  const treeTypes = ['pine', 'oak', 'willow', 'cypress', 'maple'];
  const treeCount = 15; // Number of background trees

  for (let i = 0; i < treeCount; i++) {
    const tree = {
      x: Math.random() * canvas.width * 2, // Spread across wider area
      y: state.ground - Math.random() * 100 - 50, // Vary ground level
      width: 40 + Math.random() * 30, // Vary size
      height: 80 + Math.random() * 60,
      depth: Math.random(), // 0-1 for parallax effect
      type: treeTypes[Math.floor(Math.random() * treeTypes.length)]
    };
    state.backgroundTrees.push(tree);
  }
}

function updateBackgroundTrees(state) {
  if (!state.backgroundTrees) return;

  const scrollSpeed = state.gameSpeed || 2;

  state.backgroundTrees.forEach(tree => {
    tree.x -= scrollSpeed * (0.5 + tree.depth * 0.5); // Parallax scrolling

    // Wrap around when off screen
    if (tree.x < -100) {
      tree.x = canvas.width + Math.random() * canvas.width;
      tree.y = state.ground - Math.random() * 100 - 50;
      tree.depth = Math.random();
    }
  });
}

function drawGround(state) {
  // Create a more realistic forest ground with gradients, texture, and details
  const groundHeight = canvas.height - state.ground;

  // Base ground layer with gradient for depth
  const groundGradient = ctx.createLinearGradient(0, state.ground, 0, canvas.height);
  groundGradient.addColorStop(0, "#228B22"); // Forest green at top
  groundGradient.addColorStop(0.3, "#228B22"); // Maintain forest green
  groundGradient.addColorStop(1, "#1e5b1e"); // Slightly darker at bottom for depth

  ctx.fillStyle = groundGradient;
  ctx.fillRect(0, state.ground, canvas.width, groundHeight);

  // Add subtle shadow at the bottom for depth
  const shadowGradient = ctx.createLinearGradient(0, canvas.height - 20, 0, canvas.height);
  shadowGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  shadowGradient.addColorStop(1, "rgba(0, 0, 0, 0.3)");

  ctx.fillStyle = shadowGradient;
  ctx.fillRect(0, canvas.height - 20, canvas.width, 20);

  // Add realistic ground details
  drawGroundDetails(state);
}

function drawGroundDetails(state) {
  // Draw grass blades, dirt particles, and fallen leaves for realism
  const groundY = state.ground;

  // Initialize ground details if not already done
  if (!this.groundDetailsInitialized) {
    this.initializeGroundDetails();
  }

  // Update ground detail positions for scrolling effect
  this.updateGroundDetails(state);

  // Draw grass blades along the top edge with gentle sway
  ctx.strokeStyle = "#32CD32"; // Lime green for grass
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.8;

  const time = Date.now() * 0.001; // For animation
  for (let i = 0; i < this.grassBlades.length; i++) {
    const blade = this.grassBlades[i];
    const sway = Math.sin(time + blade.phase) * 1.5; // Gentle sway

    ctx.beginPath();
    ctx.moveTo(blade.x, groundY);
    ctx.quadraticCurveTo(
      blade.x + sway, groundY - blade.height * 0.5,
      blade.x + sway * 0.5, groundY - blade.height
    );
    ctx.stroke();
  }

  // Draw dirt particles and pebbles
  ctx.fillStyle = "#8B4513"; // Saddle brown for dirt
  ctx.globalAlpha = 0.6;

  for (let particle of this.dirtParticles) {
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw fallen leaves
  ctx.globalAlpha = 0.7;

  for (let leaf of this.fallenLeaves) {
    ctx.save();
    ctx.translate(leaf.x, leaf.y);
    ctx.rotate(leaf.rotation);
    ctx.fillStyle = leaf.color;

    // Draw simple leaf shape
    ctx.beginPath();
    ctx.ellipse(0, 0, leaf.size, leaf.size * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Add leaf stem
    ctx.strokeStyle = "#654321";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -leaf.size * 0.3);
    ctx.lineTo(0, leaf.size * 0.3);
    ctx.stroke();

    ctx.restore();
  }

  // Add subtle ground texture with noise
  ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
  ctx.globalAlpha = 0.1;

  for (let noise of this.groundNoise) {
    ctx.beginPath();
    ctx.arc(noise.x, noise.y, noise.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // Reset global alpha
  ctx.globalAlpha = 1.0;
}

function initializeGroundDetails() {
  // Generate static ground details that don't change each frame
  this.grassBlades = [];
  this.dirtParticles = [];
  this.fallenLeaves = [];
  this.mossPatches = [];
  this.groundNoise = [];

  const groundY = this.ground;
  this.leafColors = ["#8B4513", "#A0522D", "#CD853F", "#D2691E"];

  // Generate grass blades
  for (let x = 0; x < canvas.width; x += 3) {
    this.grassBlades.push({
      x: x,
      height: 8 + (x * 0.01) % 12, // Pseudo-random height based on position
      phase: (x * 0.1) % (Math.PI * 2) // Phase for sway animation
    });
  }

  // Generate dirt particles
  for (let i = 0; i < 50; i++) {
    const seed = i * 7.3; // Use seed for consistent "randomness"
    this.dirtParticles.push({
      x: (seed * 13) % canvas.width,
      y: groundY + 5 + (seed * 17) % (canvas.height - groundY - 25),
      size: 1 + (seed * 23) % 3
    });
  }

  // Generate fallen leaves
  for (let i = 0; i < 15; i++) {
    const seed = i * 11.7;
    this.fallenLeaves.push({
      x: (seed * 19) % canvas.width,
      y: groundY + 10 + (seed * 29) % (canvas.height - groundY - 30),
      size: 3 + (seed * 31) % 4,
      rotation: (seed * 37) % (Math.PI * 2),
      color: this.leafColors[Math.floor((seed * 41) % this.leafColors.length)]
    });
  }

  // Generate moss patches
  for (let i = 0; i < 8; i++) {
    const seed = i * 43.1;
    this.mossPatches.push({
      x: (seed * 47) % canvas.width,
      y: groundY + 15 + (seed * 53) % (canvas.height - groundY - 35),
      width: 20 + (seed * 59) % 40,
      height: 8 + (seed * 61) % 15,
      rotation: (seed * 67) % Math.PI
    });
  }

  // Generate ground noise
  for (let i = 0; i < 200; i++) {
    const seed = i * 71.3;
    this.groundNoise.push({
      x: (seed * 73) % canvas.width,
      y: groundY + (seed * 79) % (canvas.height - groundY),
      size: 0.5 + (seed * 83) % 1.5
    });
  }

  this.groundDetailsInitialized = true;
}

function updateGroundDetails(state) {
  // Move ground details left to create running effect
  const scrollSpeed = state.gameSpeed || 2; // Match obstacle speed

  // Update grass blades
  for (let blade of this.grassBlades) {
    blade.x -= scrollSpeed;
    // Wrap around when off screen
    if (blade.x < -10) {
      blade.x = canvas.width + Math.random() * 50;
      blade.height = 8 + (blade.x * 0.01) % 12; // Recalculate height
      blade.phase = (blade.x * 0.1) % (Math.PI * 2); // Recalculate phase
    }
  }

  // Update dirt particles
  for (let particle of this.dirtParticles) {
    particle.x -= scrollSpeed;
    if (particle.x < -10) {
      particle.x = canvas.width + Math.random() * 100;
      const seed = particle.x * 17;
      particle.y = state.ground + 5 + (seed % (canvas.height - state.ground - 25));
      particle.size = 1 + (seed % 3);
    }
  }

  // Update fallen leaves
  for (let leaf of this.fallenLeaves) {
    leaf.x -= scrollSpeed;
    if (leaf.x < -20) {
      leaf.x = canvas.width + Math.random() * 150;
      const seed = leaf.x * 29;
      leaf.y = state.ground + 10 + (seed % (canvas.height - state.ground - 30));
      leaf.size = 3 + (seed % 4);
      leaf.rotation = (seed % (Math.PI * 2));
      leaf.color = this.leafColors[Math.floor(seed % this.leafColors.length)];
    }
  }

  // Update moss patches
  for (let moss of this.mossPatches) {
    moss.x -= scrollSpeed;
    if (moss.x < -50) {
      moss.x = canvas.width + Math.random() * 200;
      const seed = moss.x * 53;
      moss.y = state.ground + 15 + (seed % (canvas.height - state.ground - 35));
      moss.width = 20 + (seed % 40);
      moss.height = 8 + (seed % 15);
      moss.rotation = (seed % Math.PI);
    }
  }

  // Update ground noise
  for (let noise of this.groundNoise) {
    noise.x -= scrollSpeed;
    if (noise.x < -5) {
      noise.x = canvas.width + Math.random() * 50;
      const seed = noise.x * 79;
      noise.y = state.ground + (seed % (canvas.height - state.ground));
      noise.size = 0.5 + (seed % 1.5);
    }
  }
}

function drawObstacles(state) {
  // Draw gaps (water pits - realistic water with enhanced ripples, light rays, and aquatic life)
  // Group consecutive gaps to display 1-3 combined pits as one continuous pit
  const sortedGaps = [...state.gaps].sort((a, b) => a.x - b.x);
  const gapGroups = [];

  // Group consecutive gaps that are adjacent
  let currentGroup = [];
  for (let i = 0; i < sortedGaps.length; i++) {
    const gap = sortedGaps[i];
    if (currentGroup.length === 0) {
      currentGroup.push(gap);
    } else {
      const lastGap = currentGroup[currentGroup.length - 1];
      // Check if this gap is adjacent to the last one in the group
      if (gap.x <= lastGap.x + lastGap.width + 5) { // Small tolerance for positioning
        currentGroup.push(gap);
      } else {
        // Start a new group
        gapGroups.push(currentGroup);
        currentGroup = [gap];
      }
    }
  }
  if (currentGroup.length > 0) {
    gapGroups.push(currentGroup);
  }

  // Draw each group as a continuous pit
  gapGroups.forEach((group) => {
    if (group.length === 0) return;

    // Calculate the bounds of the continuous pit
    const minX = Math.min(...group.map(g => g.x));
    const maxX = Math.max(...group.map(g => g.x + g.width));
    const pitWidth = maxX - minX;
    const pitY = group[0].y; // All gaps in group should have same y
    const pitHeight = group[0].height; // All gaps in group should have same height

    const time = Date.now() * 0.001; // For water animation

    // Water surface with enhanced gradient from light blue at top to deeper blue at bottom
    const waterGradient = ctx.createLinearGradient(
      minX,
      pitY,
      minX,
      pitY + pitHeight
    );
    waterGradient.addColorStop(0, "#87CEEB"); // Sky blue at surface
    waterGradient.addColorStop(0.2, "#4682B4"); // Steel blue
    waterGradient.addColorStop(0.5, "#1e90ff"); // Dodger blue
    waterGradient.addColorStop(0.8, "#00008B"); // Dark blue
    waterGradient.addColorStop(1, "#000080"); // Navy blue at bottom

    ctx.fillStyle = waterGradient;
    ctx.fillRect(minX, pitY, pitWidth, pitHeight);

    // Enhanced water ripples/waves on the surface with more layers
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const waveY = pitY + 8 + i * 6;
      const waveOffset = Math.sin(time * 2 + i * 0.4) * 4;

      ctx.beginPath();
      ctx.moveTo(minX, waveY + waveOffset);
      for (let x = minX; x < minX + pitWidth; x += 8) {
        const waveHeight = Math.sin((x - minX) * 0.12 + time * 4 + i) * 3;
        ctx.lineTo(x, waveY + waveOffset + waveHeight);
      }
      ctx.stroke();
    }

    // Light rays piercing through water surface
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const rayX = minX + (pitWidth / 6) * i + Math.sin(time * 0.5 + i) * 10;
      const rayLength = 30 + Math.sin(time * 1.5 + i * 0.7) * 10;

      ctx.beginPath();
      ctx.moveTo(rayX, pitY);
      ctx.lineTo(rayX + Math.sin(i * 0.8) * 5, pitY + rayLength);
      ctx.stroke();
    }

    // Underwater rocks and pebbles - more detailed
    ctx.fillStyle = "rgba(105, 105, 105, 0.7)"; // Semi-transparent gray rocks
    for (let i = 0; i < 8; i++) {
      const rockX = minX + 10 + Math.sin(i * 2.1) * (pitWidth - 25);
      const rockY = pitY + 18 + i * 10;
      const rockSize = 2.5 + Math.sin(i * 1.7) * 2;

      ctx.beginPath();
      ctx.arc(rockX, rockY, rockSize, 0, Math.PI * 2);
      ctx.fill();

      // Add rock highlights
      ctx.fillStyle = "rgba(169, 169, 169, 0.5)";
      ctx.beginPath();
      ctx.arc(rockX - 1, rockY - 1, rockSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(105, 105, 105, 0.7)"; // Reset
    }

    // Enhanced water plants/reeds along the edges with more variety
    ctx.strokeStyle = "rgba(34, 139, 34, 0.8)"; // Semi-transparent green
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      const reedX = minX + (pitWidth / 12) * i + Math.sin(i * 0.7) * 4;
      const reedHeight = 14 + Math.sin(i * 1.3) * 6;

      ctx.beginPath();
      ctx.moveTo(reedX, pitY - 3);
      ctx.quadraticCurveTo(
        reedX + Math.sin(time + i) * 3,
        pitY - reedHeight * 0.6,
        reedX + Math.sin(time * 1.8 + i) * 2,
        pitY - reedHeight
      );
      ctx.stroke();

      // Add small leaves on reeds
      if (i % 3 === 0) {
        ctx.beginPath();
        ctx.moveTo(reedX + Math.sin(time + i) * 3, pitY - reedHeight * 0.4);
        ctx.lineTo(reedX + Math.sin(time + i) * 3 + 4, pitY - reedHeight * 0.4 - 2);
        ctx.stroke();
      }
    }

    // Enhanced water reflections/sparkles with different sizes
    for (let i = 0; i < 20; i++) {
      const sparkleX = minX + 12 + (pitWidth - 25) * (i / 19);
      const sparkleY = pitY + 6 + Math.sin(time * 1.4 + i * 0.6) * 4;
      const sparkleSize = 0.8 + Math.sin(time * 2.5 + i) * 0.6;

      // Sparkle glow
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.beginPath();
      ctx.arc(sparkleX, sparkleY, sparkleSize * 2, 0, Math.PI * 2);
      ctx.fill();

      // Sparkle core
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Underwater sediment at the bottom with more detail
    const sedimentGradient = ctx.createLinearGradient(
      minX,
      pitY + pitHeight - 25,
      minX,
      pitY + pitHeight
    );
    sedimentGradient.addColorStop(0, "rgba(139, 69, 19, 0.4)"); // Semi-transparent brown
    sedimentGradient.addColorStop(0.5, "rgba(160, 82, 45, 0.6)"); // Semi-transparent saddle brown
    sedimentGradient.addColorStop(1, "rgba(101, 67, 33, 0.8)"); // Semi-transparent dark brown

    ctx.fillStyle = sedimentGradient;
    ctx.fillRect(minX, pitY + pitHeight - 25, pitWidth, 25);

    // Enhanced small fish or water creatures - multiple types
    if (Math.sin(time + minX * 0.01) > 0.6) {
      // Large fish
      const fishX = minX + pitWidth * 0.4 + Math.sin(time * 1.2) * 25;
      const fishY = pitY + pitHeight * 0.5 + Math.sin(time * 1.8) * 12;

      // Fish body with gradient
      const fishGrad = ctx.createLinearGradient(
        fishX - 6, fishY, fishX + 6, fishY
      );
      fishGrad.addColorStop(0, "rgba(255, 215, 0, 0.7)"); // Gold
      fishGrad.addColorStop(0.5, "rgba(255, 255, 0, 0.8)"); // Yellow
      fishGrad.addColorStop(1, "rgba(255, 215, 0, 0.7)"); // Gold

      ctx.fillStyle = fishGrad;
      ctx.beginPath();
      ctx.ellipse(fishX, fishY, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Fish tail with animation
      ctx.fillStyle = "rgba(255, 140, 0, 0.6)"; // Orange
      ctx.beginPath();
      ctx.moveTo(fishX - 6, fishY);
      ctx.lineTo(fishX - 10 - Math.sin(time * 3) * 2, fishY - 3);
      ctx.lineTo(fishX - 10 - Math.sin(time * 3) * 2, fishY + 3);
      ctx.closePath();
      ctx.fill();

      // Fish fins
      ctx.fillStyle = "rgba(255, 215, 0, 0.5)";
      ctx.beginPath();
      ctx.moveTo(fishX - 2, fishY - 2);
      ctx.lineTo(fishX, fishY - 5);
      ctx.lineTo(fishX + 2, fishY - 2);
      ctx.closePath();
      ctx.fill();
    }

    // Small schooling fish
    for (let f = 0; f < 4; f++) {
      if (Math.sin(time * 0.8 + f * 0.5 + minX * 0.005) > 0.4) {
        const smallFishX = minX + pitWidth * 0.6 + Math.sin(time * 1.5 + f) * 15 + f * 8;
        const smallFishY = pitY + pitHeight * 0.7 + Math.sin(time * 2.2 + f * 0.8) * 8;

        ctx.fillStyle = "rgba(173, 216, 230, 0.8)"; // Light blue
        ctx.beginPath();
        ctx.ellipse(smallFishX, smallFishY, 3, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Small tail
        ctx.fillStyle = "rgba(135, 206, 235, 0.6)"; // Sky blue
        ctx.beginPath();
        ctx.moveTo(smallFishX - 3, smallFishY);
        ctx.lineTo(smallFishX - 5, smallFishY - 1);
        ctx.lineTo(smallFishX - 5, smallFishY + 1);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Underwater bubbles rising
    for (let b = 0; b < 6; b++) {
      const bubbleX = minX + 15 + (pitWidth - 30) * (b / 5) + Math.sin(time * 0.7 + b) * 5;
      const bubbleY = pitY + pitHeight - 10 - (time * 20 + b * 30) % (pitHeight - 30);
      const bubbleSize = 1 + Math.sin(b * 0.5) * 0.5;

      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(bubbleX, bubbleY, bubbleSize, 0, Math.PI * 2);
      ctx.fill();

      // Bubble highlight
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(bubbleX - 0.3, bubbleY - 0.3, bubbleSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  // Draw ground obstacles (forest theme - rocks/boulders)
  state.obstacles.forEach((obstacle) => {
    // Boulder/rock - irregular natural shape
    ctx.fillStyle = "#696969";
    ctx.beginPath();
    // Create irregular boulder shape with curves
    ctx.moveTo(obstacle.x + 5, obstacle.y + obstacle.height);
    ctx.quadraticCurveTo(
      obstacle.x,
      obstacle.y + obstacle.height * 0.7,
      obstacle.x + 8,
      obstacle.y + obstacle.height * 0.4
    );
    ctx.quadraticCurveTo(
      obstacle.x + obstacle.width * 0.3,
      obstacle.y + 5,
      obstacle.x + obstacle.width * 0.6,
      obstacle.y + 8
    );
    ctx.quadraticCurveTo(
      obstacle.x + obstacle.width - 5,
      obstacle.y + obstacle.height * 0.3,
      obstacle.x + obstacle.width - 3,
      obstacle.y + obstacle.height * 0.7
    );
    ctx.quadraticCurveTo(
      obstacle.x + obstacle.width,
      obstacle.y + obstacle.height - 5,
      obstacle.x + obstacle.width - 8,
      obstacle.y + obstacle.height
    );
    ctx.closePath();
    ctx.fill();

    // Rock texture with irregular highlights
    ctx.fillStyle = "#808080";
    ctx.beginPath();
    ctx.moveTo(obstacle.x + 12, obstacle.y + obstacle.height * 0.8);
    ctx.quadraticCurveTo(
      obstacle.x + 8,
      obstacle.y + obstacle.height * 0.5,
      obstacle.x + 15,
      obstacle.y + obstacle.height * 0.3
    );
    ctx.quadraticCurveTo(
      obstacle.x + obstacle.width * 0.4,
      obstacle.y + 12,
      obstacle.x + obstacle.width * 0.7,
      obstacle.y + 15
    );
    ctx.quadraticCurveTo(
      obstacle.x + obstacle.width - 10,
      obstacle.y + obstacle.height * 0.4,
      obstacle.x + obstacle.width - 12,
      obstacle.y + obstacle.height * 0.8
    );
    ctx.closePath();
    ctx.fill();

    // Add some darker cracks and shadows
    ctx.strokeStyle = "#555555";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(obstacle.x + 10, obstacle.y + obstacle.height * 0.6);
    ctx.quadraticCurveTo(
      obstacle.x + obstacle.width * 0.3,
      obstacle.y + obstacle.height * 0.4,
      obstacle.x + obstacle.width * 0.5,
      obstacle.y + obstacle.height * 0.7
    );
    ctx.stroke();

    // Moss patches on irregular surfaces
    ctx.fillStyle = "#32CD32";
    // Top moss patch
    ctx.beginPath();
    ctx.arc(
      obstacle.x + obstacle.width * 0.3,
      obstacle.y + obstacle.height * 0.2,
      4,
      0,
      Math.PI * 2
    );
    ctx.fill();
    // Bottom moss patch
    ctx.beginPath();
    ctx.arc(
      obstacle.x + obstacle.width * 0.7,
      obstacle.y + obstacle.height * 0.8,
      3,
      0,
      Math.PI * 2
    );
    ctx.fill();
  });

  // Draw fire traps - Glowing ground fire (always visible and glowing)
  // Draw fire traps - Glowing ground fire (always visible and glowing)
  state.fireTraps.forEach((trap) => {
    // Animated flickering - more dramatic
    const time = Date.now() * 0.01;
    const flicker1 = Math.sin(time + trap.x * 0.01) * 0.3 + 0.7;
    const flicker2 = Math.sin(time * 1.3 + trap.x * 0.015) * 0.2 + 0.8;
    const flicker3 = Math.cos(time * 0.7 + trap.x * 0.008) * 0.25 + 0.75;

    // Ground crack/opening where fire emerges
    ctx.fillStyle = "#1a0a00";
    ctx.beginPath();
    ctx.ellipse(
      trap.x + trap.width / 2,
      trap.y + trap.height - 3,
      trap.width / 2 - 3,
      6,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Multiple flame layers - drawing from back to front
    const centerX = trap.x + trap.width / 2;
    const baseY = trap.y + trap.height;

    // Large background glow
    const bgGlow = ctx.createRadialGradient(
      centerX,
      baseY - 10,
      0,
      centerX,
      baseY - 10,
      trap.width * 1.2
    );
    bgGlow.addColorStop(0, `rgba(255, 140, 0, ${0.4 * flicker1})`);
    bgGlow.addColorStop(0.3, `rgba(255, 69, 0, ${0.3 * flicker2})`);
    bgGlow.addColorStop(0.6, `rgba(220, 20, 0, ${0.15 * flicker3})`);
    bgGlow.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = bgGlow;
    ctx.beginPath();
    ctx.ellipse(
      centerX,
      baseY - 5,
      trap.width * 0.7,
      trap.height * 1.2,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Draw multiple flame tongues
    for (let i = 0; i < 5; i++) {
      const offsetX = (i - 2) * (trap.width / 6);
      const flameHeight =
        trap.height * (0.8 + Math.sin(time * 2 + i) * 0.3) * flicker2;
      const flameWidth = trap.width / 8 + Math.sin(time * 1.5 + i * 0.5) * 3;

      // Outer flame (red-orange)
      const flameGrad1 = ctx.createLinearGradient(
        centerX + offsetX,
        baseY,
        centerX + offsetX,
        baseY - flameHeight
      );
      flameGrad1.addColorStop(0, `rgba(255, 100, 0, ${0.9 * flicker1})`);
      flameGrad1.addColorStop(0.3, `rgba(255, 140, 0, ${0.8 * flicker2})`);
      flameGrad1.addColorStop(0.6, `rgba(255, 200, 0, ${0.6 * flicker3})`);
      flameGrad1.addColorStop(1, "rgba(255, 100, 0, 0)");

      ctx.fillStyle = flameGrad1;
      ctx.beginPath();
      ctx.moveTo(centerX + offsetX - flameWidth, baseY);
      ctx.quadraticCurveTo(
        centerX + offsetX - flameWidth * 0.5,
        baseY - flameHeight * 0.5,
        centerX + offsetX + Math.sin(time * 3 + i) * 5,
        baseY - flameHeight
      );
      ctx.quadraticCurveTo(
        centerX + offsetX + flameWidth * 0.5,
        baseY - flameHeight * 0.5,
        centerX + offsetX + flameWidth,
        baseY
      );
      ctx.closePath();
      ctx.fill();
    }

    // Bright inner core flames
    for (let i = 0; i < 3; i++) {
      const offsetX = (i - 1) * (trap.width / 8);
      const coreHeight =
        trap.height * 0.6 * (0.9 + Math.sin(time * 2.5 + i * 1.2) * 0.2);
      const coreWidth = trap.width / 12;

      const coreGrad = ctx.createLinearGradient(
        centerX + offsetX,
        baseY,
        centerX + offsetX,
        baseY - coreHeight
      );
      coreGrad.addColorStop(0, `rgba(255, 255, 200, ${0.95 * flicker3})`);
      coreGrad.addColorStop(0.3, `rgba(255, 240, 100, ${0.85 * flicker1})`);
      coreGrad.addColorStop(0.7, `rgba(255, 180, 0, ${0.6 * flicker2})`);
      coreGrad.addColorStop(1, "rgba(255, 140, 0, 0)");

      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.moveTo(centerX + offsetX - coreWidth, baseY);
      ctx.quadraticCurveTo(
        centerX + offsetX,
        baseY - coreHeight * 0.7,
        centerX + offsetX + Math.sin(time * 4 + i * 2) * 3,
        baseY - coreHeight
      );
      ctx.quadraticCurveTo(
        centerX + offsetX,
        baseY - coreHeight * 0.7,
        centerX + offsetX + coreWidth,
        baseY
      );
      ctx.closePath();
      ctx.fill();
    }

    // Hot white core at base
    const hotCore = ctx.createRadialGradient(
      centerX,
      baseY - 5,
      0,
      centerX,
      baseY - 5,
      trap.width * 0.15
    );
    hotCore.addColorStop(0, `rgba(255, 255, 255, ${0.9 * flicker1})`);
    hotCore.addColorStop(0.5, `rgba(255, 255, 200, ${0.7 * flicker2})`);
    hotCore.addColorStop(1, "rgba(255, 200, 0, 0)");

    ctx.fillStyle = hotCore;
    ctx.beginPath();
    ctx.arc(
      centerX,
      baseY - 5,
      trap.width * 0.15 * flicker3,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Floating embers
    for (let i = 0; i < 12; i++) {
      const emberX =
        centerX + Math.sin(time * 0.5 + i * 0.8) * trap.width * 0.4;
      const emberY =
        baseY - 10 - Math.abs(Math.sin(time * 0.3 + i)) * trap.height * 1.5;
      const emberSize = Math.max(0.5, 1 + Math.sin(time + i) * 1.5); // Ensure minimum size of 0.5
      const emberAlpha = Math.max(0, Math.sin(time * 0.5 + i * 0.5)) * 0.8;

      // Ember glow
      const glowRadius = Math.max(1, emberSize * 3); // Ensure minimum radius of 1
      const emberGlow = ctx.createRadialGradient(
        emberX,
        emberY,
        0,
        emberX,
        emberY,
        glowRadius
      );
      emberGlow.addColorStop(0, `rgba(255, 200, 100, ${emberAlpha * 0.6})`);
      emberGlow.addColorStop(1, "rgba(255, 100, 0, 0)");
      ctx.fillStyle = emberGlow;
      ctx.beginPath();
      ctx.arc(emberX, emberY, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Ember core
      ctx.fillStyle = `rgba(255, 255, 200, ${emberAlpha})`;
      ctx.beginPath();
      ctx.arc(emberX, emberY, emberSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ground illumination
    const groundLight = ctx.createRadialGradient(
      centerX,
      baseY,
      0,
      centerX,
      baseY,
      trap.width
    );
    groundLight.addColorStop(0, `rgba(255, 150, 0, ${0.5 * flicker1})`);
    groundLight.addColorStop(0.5, `rgba(255, 100, 0, ${0.25 * flicker2})`);
    groundLight.addColorStop(1, "rgba(255, 69, 0, 0)");

    ctx.fillStyle = groundLight;
    ctx.fillRect(centerX - trap.width, baseY - 2, trap.width * 2, 6);
  });

  // Draw pendulums
  state.pendulums.forEach((pendulum) => {
    const px = pendulum.x; // Fixed: Remove width/2 since width is not set
    const py = pendulum.y;
    const angle = pendulum.angle;

    // Calculate axe position at end of chain
    const axeX = px + Math.sin(angle) * pendulum.length;
    const axeY = py + Math.cos(angle) * pendulum.length;

    // Draw chain/rope segments
    ctx.strokeStyle = "#8B4513"; // Brown rope
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(axeX, axeY);
    ctx.stroke();

    // Draw axe head
    ctx.save();
    ctx.translate(axeX, axeY);
    ctx.rotate(angle + Math.PI / 2); // Rotate to face swing direction

    // Axe handle
    ctx.fillStyle = "#8B4513";
    ctx.fillRect(-2, -15, 4, 30);

    // Axe blade
    ctx.fillStyle = "#C0C0C0"; // Silver blade
    ctx.beginPath();
    ctx.moveTo(-8, -15);
    ctx.lineTo(0, -25);
    ctx.lineTo(8, -15);
    ctx.closePath();
    ctx.fill();

    // Axe blade edge
    ctx.strokeStyle = "#808080";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  });
}

function drawBirds(state) {
  // Draw birds (forest birds)
  if (state.birds) {
    state.birds.forEach((bird) => {
      const bx = bird.x;
      const by = bird.y;
      const wingFlap = Math.sin(bird.frame * 4) * 3;

      // Bird body - blue jay colors
      ctx.fillStyle = "#4169E1";
      ctx.beginPath();
      ctx.ellipse(bx + 17, by + 10, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Bird head
      ctx.fillStyle = "#000080";
      ctx.beginPath();
      ctx.arc(bx + 28, by + 8, 6, 0, Math.PI * 2);
      ctx.fill();

      // Beak
      ctx.fillStyle = "#FFD700";
      ctx.beginPath();
      ctx.moveTo(bx + 32, by + 8);
      ctx.lineTo(bx + 37, by + 6);
      ctx.lineTo(bx + 34, by + 10);
      ctx.closePath();
      ctx.fill();

      // Wings
      ctx.fillStyle = "#000080";
      ctx.beginPath();
      ctx.ellipse(bx + 10, by + 8 + wingFlap, 8, 4, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(bx + 24, by + 12 - wingFlap, 8, 4, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Eye
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(bx + 30, by + 6, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

function drawMonster(state) {
  if (!state.monster) return;

  let monster = state.monster;
  let isDeadly = state.hitTimestamps && state.hitTimestamps.length >= 3;
  const mx = monster.x;
  const my = monster.y;
  const time = Date.now() * 0.001;
  const float = Math.sin(monster.frame + time * 0.5) * 3; // Gentle floating motion
  const breathe = Math.sin(monster.frame * 0.8 + time * 0.7) * 4;
  const drift = Math.sin(time * 0.5) * 3; // Slow horizontal drift

  // Save context for ghost effects
  ctx.save();

  // Enhanced outer glow effect for the entire ghost
  drawGhostOuterGlow(mx, my, time, isDeadly);

  // Draw terrifying particles around the ghost for horror atmosphere
  drawGhostParticles(mx, my, isDeadly);

  // Draw dark aura and shadow effects for added scariness
  drawGhostAura(mx, my, time, isDeadly);

  // Draw floating chains for horror effect
  drawGhostChains(mx, my, time, isDeadly);

  // Draw dark mist particles
  drawGhostMist(mx, my, time, isDeadly);

  // Main ghost body - now with jagged, terrifying edges and enhanced glow
  drawGhostBody(mx + drift, my + float, breathe, isDeadly);

  // Internal swirling darkness effect
  drawGhostInterior(mx + drift, my + float, breathe, time, isDeadly);

  // Face features with horrifying ghost appearance
  drawGhostFace(mx + drift, my + float, breathe, isDeadly);

  // Draw glowing red eyes when deadly
  if (isDeadly) {
    drawGhostRedEyes(mx + drift, my + float, breathe, time);
  }

  // Restore context
  ctx.restore();

  // Draw danger indicator when close
  let distanceToPlayer = Math.abs(monster.x - state.player.x);
  if (distanceToPlayer < 120) {
    // Connection line to player - subtle white line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.shadowBlur = 3;
    
    ctx.beginPath();
    ctx.moveTo(monster.x + monster.width / 2, monster.y + 10);
    ctx.lineTo(
      state.player.x + state.player.width / 2,
      state.player.y + 10
    );
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  }
}

function drawGhostParticles(mx, my, isDeadly) {
  // Draw subtle floating particles - enhanced with more particles and glow
  const particleCount = isDeadly ? 8 : 5;
  
  // Add glow effect to particles
  if (isDeadly) {
    ctx.shadowColor = "#FF0000";
    ctx.shadowBlur = 8;
  } else {
    ctx.shadowColor = "#FFFFFF";
    ctx.shadowBlur = 5;
  }
  
  ctx.fillStyle = isDeadly ? "rgba(255, 100, 100, 0.4)" : "rgba(255, 255, 255, 0.3)";

  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2 + Date.now() * 0.001;
    const distance = 35 + Math.sin(Date.now() * 0.002 + i) * 12;
    const px = mx + 32 + Math.cos(angle) * distance;
    const py = my + 40 + Math.sin(angle) * distance;
    const size = 0.8 + Math.sin(Date.now() * 0.003 + i * 0.7) * 0.6;

    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Add additional sparkling particles for more glow
  if (isDeadly) {
    ctx.fillStyle = "rgba(255, 200, 200, 0.6)";
    ctx.shadowBlur = 12;
    
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Date.now() * 0.0015;
      const distance = 50 + Math.sin(Date.now() * 0.0025 + i) * 15;
      const px = mx + 32 + Math.cos(angle) * distance;
      const py = my + 40 + Math.sin(angle) * distance;
      const size = 0.5 + Math.sin(Date.now() * 0.004 + i * 0.8) * 0.4;

      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  // Reset shadow
  ctx.shadowBlur = 0;
}

function drawGhostBody(mx, my, breathe, isDeadly) {
  // Main ghost body - white with black outline, matching reference image
  // Add enhanced glow effect
  if (isDeadly) {
    ctx.shadowColor = "#FF0000";
    ctx.shadowBlur = 15;
  } else {
    ctx.shadowColor = "#FFFFFF";
    ctx.shadowBlur = 10;
  }
  
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#F5F5DC"; // Beige-white
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#000000"; // Black outline

  // Draw main ghost body - round head on top, wider body below
  ctx.beginPath();
  // Head - rounded top
  ctx.arc(mx + 32, my + 25, 22, Math.PI, 0, false);
  // Sides down
  ctx.lineTo(mx + 54, my + 25);
  ctx.lineTo(mx + 54, my + 60);
  
  // Bottom wavy/pointed edge like traditional sheet ghost
  const wavePoints = [
    { x: mx + 54, y: my + 60 },
    { x: mx + 48, y: my + 70 },
    { x: mx + 42, y: my + 62 },
    { x: mx + 36, y: my + 73 },
    { x: mx + 32, y: my + 65 },
    { x: mx + 28, y: my + 73 },
    { x: mx + 22, y: my + 62 },
    { x: mx + 16, y: my + 70 },
    { x: mx + 10, y: my + 60 }
  ];
  
  // Draw smooth curves through wave points
  for (let i = 1; i < wavePoints.length; i++) {
    const prev = wavePoints[i - 1];
    const curr = wavePoints[i];
    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
  }
  
  // Complete back to left side
  ctx.lineTo(mx + 10, my + 25);
  ctx.arc(mx + 32, my + 25, 22, Math.PI, Math.PI * 2, true);
  
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Add subtle shading lines with glow
  ctx.strokeStyle = "rgba(200, 200, 180, 0.3)";
  ctx.lineWidth = 1;
  ctx.shadowBlur = 0; // Reset shadow for internal lines
  
  for (let i = 0; i < 3; i++) {
    const x = mx + 18 + i * 7;
    ctx.beginPath();
    ctx.moveTo(x, my + 30);
    ctx.lineTo(x, my + 55);
    ctx.stroke();
  }
  
  // Reset shadow
  ctx.shadowBlur = 0;
}

function drawGhostInterior(mx, my, breathe, time, isDeadly) {
  // Subtle interior shading for depth
  ctx.globalAlpha = 0.15;
  
  // Left side gradient shading
  const leftGradient = ctx.createLinearGradient(mx + 10, my + 30, mx + 20, my + 30);
  leftGradient.addColorStop(0, "rgba(0, 0, 0, 0.5)");
  leftGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  
  ctx.fillStyle = leftGradient;
  ctx.fillRect(mx + 10, my + 30, 10, 30);
  
  // Right side gradient shading
  const rightGradient = ctx.createLinearGradient(mx + 44, my + 30, mx + 54, my + 30);
  rightGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  rightGradient.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  
  ctx.fillStyle = rightGradient;
  ctx.fillRect(mx + 44, my + 30, 10, 30);
}

function drawGhostFace(mx, my, breathe, isDeadly) {
  // Fill the entire face area with white
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#FFFFFF"; // Pure white
  ctx.beginPath();
  ctx.arc(mx + 32, my + 25, 20, 0, Math.PI * 2); // Face area
  ctx.fill();

  // Face features - simple classic ghost appearance
  ctx.fillStyle = "#000000"; // Black

  // Left eye - large oval
  ctx.beginPath();
  ctx.ellipse(mx + 22, my + 18 + breathe, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Right eye - large oval
  ctx.beginPath();
  ctx.ellipse(mx + 42, my + 18 + breathe, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Add pupils/shine in eyes
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.beginPath();
  ctx.arc(mx + 23, my + 16 + breathe, 2, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(mx + 43, my + 16 + breathe, 2, 0, Math.PI * 2);
  ctx.fill();

  // Nose - two small dots
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(mx + 30, my + 30 + breathe, 1.5, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(mx + 34, my + 30 + breathe, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawGhostAura(mx, my, time, isDeadly) {
  // Draw dark aura around the ghost for added scariness - enhanced glow
  ctx.globalAlpha = 0.4;
  
  // Pulsing dark aura with enhanced glow
  const auraPulse = 1 + Math.sin(time * 2.5) * 0.3;
  const auraRadius = 50 * auraPulse;
  
  // Add shadow glow effect
  if (isDeadly) {
    ctx.shadowColor = "#FF0000";
    ctx.shadowBlur = 20;
  } else {
    ctx.shadowColor = "#FFFFFF";
    ctx.shadowBlur = 15;
  }
  
  const auraGradient = ctx.createRadialGradient(mx + 32, my + 40, 0, mx + 32, my + 40, auraRadius);
  if (isDeadly) {
    auraGradient.addColorStop(0, "rgba(255, 0, 0, 1.0)");
    auraGradient.addColorStop(0.4, "rgba(255, 50, 50, 0.6)");
    auraGradient.addColorStop(0.7, "rgba(255, 100, 100, 0.3)");
    auraGradient.addColorStop(1, "rgba(255, 150, 150, 0)");
  } else {
    auraGradient.addColorStop(0, "rgba(0, 0, 0, 1.0)");
    auraGradient.addColorStop(0.4, "rgba(30, 30, 30, 0.7)");
    auraGradient.addColorStop(0.7, "rgba(60, 60, 60, 0.4)");
    auraGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  }
  
  ctx.fillStyle = auraGradient;
  ctx.beginPath();
  ctx.arc(mx + 32, my + 40, auraRadius, 0, Math.PI * 2);
  ctx.fill();
  
  // Add jagged shadow beneath ghost with glow
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = isDeadly ? "rgba(255, 0, 0, 0.8)" : "rgba(0, 0, 0, 0.8)";
  ctx.beginPath();
  ctx.ellipse(mx + 32, my + 80, 40, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Reset shadow and alpha
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawGhostChains(mx, my, time, isDeadly) {
  // Draw floating chains around the ghost for horror effect
  if (!isDeadly) return;
  
  ctx.strokeStyle = "rgba(50, 50, 50, 0.8)";
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  
  // Left chain
  const leftChainSwing = Math.sin(time * 1.5) * 5;
  ctx.beginPath();
  ctx.moveTo(mx + 10, my + 20);
  ctx.quadraticCurveTo(mx + 5 + leftChainSwing, my + 40, mx - 5, my + 60);
  ctx.stroke();
  
  // Draw chain links
  for (let i = 0; i < 3; i++) {
    const linkY = my + 30 + i * 10;
    ctx.beginPath();
    ctx.arc(mx + 8 + leftChainSwing * 0.3, linkY, 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  // Right chain
  const rightChainSwing = Math.sin(time * 1.5 + Math.PI) * 5;
  ctx.beginPath();
  ctx.moveTo(mx + 54, my + 20);
  ctx.quadraticCurveTo(mx + 59 + rightChainSwing, my + 40, mx + 69, my + 60);
  ctx.stroke();
  
  // Draw chain links
  for (let i = 0; i < 3; i++) {
    const linkY = my + 30 + i * 10;
    ctx.beginPath();
    ctx.arc(mx + 56 + rightChainSwing * 0.3, linkY, 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  ctx.globalAlpha = 1;
}

function drawGhostMist(mx, my, time, isDeadly) {
  // Draw dark mist particles around the ghost - enhanced with glow
  ctx.fillStyle = isDeadly ? "rgba(255, 50, 50, 0.4)" : "rgba(30, 30, 30, 0.4)";
  
  // Add glow to mist particles
  if (isDeadly) {
    ctx.shadowColor = "#FF0000";
    ctx.shadowBlur = 6;
  } else {
    ctx.shadowColor = "#FFFFFF";
    ctx.shadowBlur = 4;
  }
  
  ctx.globalAlpha = 0.6;
  
  const mistCount = isDeadly ? 10 : 6;
  for (let i = 0; i < mistCount; i++) {
    const angle = (i / mistCount) * Math.PI * 2 + time * 0.5;
    const distance = 45 + Math.sin(time * 0.8 + i) * 12;
    const mistX = mx + 32 + Math.cos(angle) * distance;
    const mistY = my + 40 + Math.sin(angle) * distance;
    const mistSize = 4 + Math.sin(time * 1.2 + i * 0.7) * 3;
    
    ctx.beginPath();
    ctx.arc(mistX, mistY, mistSize, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Reset shadow and alpha
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawGhostRedEyes(mx, my, breathe, time) {
  // Draw glowing red eyes that pulse when deadly - enhanced glow
  const eyePulse = 1 + Math.sin(time * 4) * 0.4;
  
  // Enhanced red glow behind eyes
  ctx.shadowColor = "#FF0000";
  ctx.shadowBlur = 15 * eyePulse;
  
  ctx.fillStyle = "#FF0000";
  ctx.globalAlpha = 0.9;
  
  // Left red eye with enhanced glow
  ctx.beginPath();
  ctx.ellipse(mx + 22, my + 18 + breathe, 5 * eyePulse, 7 * eyePulse, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Right red eye with enhanced glow
  ctx.beginPath();
  ctx.ellipse(mx + 42, my + 18 + breathe, 5 * eyePulse, 7 * eyePulse, 0, 0, Math.PI * 2);
  ctx.fill();
  
  // Bright red pupils with intense glow
  ctx.fillStyle = "#FF6666";
  ctx.shadowBlur = 8 * eyePulse;
  
  ctx.beginPath();
  ctx.arc(mx + 22, my + 18 + breathe, 2.5 * eyePulse, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(mx + 42, my + 18 + breathe, 2.5 * eyePulse, 0, Math.PI * 2);
  ctx.fill();
  
  // Add extra bright core to eyes
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowBlur = 3 * eyePulse;
  
  ctx.beginPath();
  ctx.arc(mx + 22, my + 18 + breathe, 1 * eyePulse, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(mx + 42, my + 18 + breathe, 1 * eyePulse, 0, Math.PI * 2);
  ctx.fill();
  
  // Reset shadow
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function drawGhostOuterGlow(mx, my, time, isDeadly) {
  // Enhanced outer glow effect that surrounds the entire ghost
  const glowIntensity = isDeadly ? 1.5 : 1.0;
  const pulse = 1 + Math.sin(time * 2) * 0.2;
  
  // Large outer glow
  const outerGlowGradient = ctx.createRadialGradient(
    mx + 32, my + 40, 0,
    mx + 32, my + 40, 80 * pulse
  );
  
  if (isDeadly) {
    // Deadly ghost: red-tinted glow
    outerGlowGradient.addColorStop(0, `rgba(255, 0, 0, ${0.3 * glowIntensity})`);
    outerGlowGradient.addColorStop(0.3, `rgba(255, 100, 100, ${0.2 * glowIntensity})`);
    outerGlowGradient.addColorStop(0.6, `rgba(255, 150, 150, ${0.1 * glowIntensity})`);
    outerGlowGradient.addColorStop(1, "rgba(255, 200, 200, 0)");
  } else {
    // Normal ghost: ethereal white-blue glow
    outerGlowGradient.addColorStop(0, `rgba(255, 255, 255, ${0.4 * glowIntensity})`);
    outerGlowGradient.addColorStop(0.3, `rgba(173, 216, 230, ${0.3 * glowIntensity})`);
    outerGlowGradient.addColorStop(0.6, `rgba(135, 206, 235, ${0.15 * glowIntensity})`);
    outerGlowGradient.addColorStop(1, "rgba(173, 216, 230, 0)");
  }
  
  ctx.fillStyle = outerGlowGradient;
  ctx.beginPath();
  ctx.arc(mx + 32, my + 40, 80 * pulse, 0, Math.PI * 2);
  ctx.fill();
  
  // Additional inner glow layer for more intensity
  const innerGlowGradient = ctx.createRadialGradient(
    mx + 32, my + 40, 0,
    mx + 32, my + 40, 50 * pulse
  );
  
  if (isDeadly) {
    innerGlowGradient.addColorStop(0, `rgba(255, 50, 50, ${0.5 * glowIntensity})`);
    innerGlowGradient.addColorStop(0.5, `rgba(255, 100, 100, ${0.3 * glowIntensity})`);
    innerGlowGradient.addColorStop(1, "rgba(255, 150, 150, 0)");
  } else {
    innerGlowGradient.addColorStop(0, `rgba(255, 255, 255, ${0.6 * glowIntensity})`);
    innerGlowGradient.addColorStop(0.5, `rgba(200, 220, 255, ${0.4 * glowIntensity})`);
    innerGlowGradient.addColorStop(1, "rgba(173, 216, 230, 0)");
  }
  
  ctx.fillStyle = innerGlowGradient;
  ctx.beginPath();
  ctx.arc(mx + 32, my + 40, 50 * pulse, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(state) {
  if (!state.player) return;

  const px = state.player.x;
  const py = state.player.y;

  // If on rope, draw hanging animation
  if (state.player.onRope) {
    drawPlayerOnRope(px, py, state);
    return;
  }

  const runCycle = Math.sin(state.player.runFrame * 2) * 2; // Slower running cycle
  const armSwing = Math.sin(state.player.runFrame * 1.8) * 8; // Slower arm swing, reduced magnitude
  const bobbing = state.player.sliding
    ? 0
    : Math.abs(Math.sin(state.player.runFrame * 2)) * 1.5; // No bobbing while sliding

  // Define proper arm and leg cycles for natural movement
  const armCycle1 = Math.sin(state.player.runFrame * 1.8); // Slower arm movement
  const armCycle2 = Math.sin(state.player.runFrame * 1.8 + Math.PI); // Opposite arm
  const legCycle1 = Math.sin(state.player.runFrame * 2); // Slower leg movement
  const legCycle2 = Math.sin(state.player.runFrame * 2 + Math.PI); // Opposite leg

  // Adjust position for bobbing animation
  const adjustedY = py - bobbing;

  // Draw realistic shadow (elliptical)
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.ellipse(px + 20, state.ground + 2, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // If sliding, draw crouched position
  if (state.player.sliding) {
    drawCrouchingPlayer(px, adjustedY, state);
    return;
  }

  // More realistic leg positioning and animation
  const legSwing1 = legCycle1 * 5; // Slower, less pronounced leg swing
  const legSwing2 = legCycle2 * 5;
  const kneeFlexion1 = Math.max(0, legCycle1 * 2.5); // Slower knee movement
  const kneeFlexion2 = Math.max(0, legCycle2 * 2.5);

  // Upper legs (thighs)
  ctx.fillStyle = "#1E3A8A"; // Dark blue pants
  ctx.beginPath();
  ctx.roundRect(
    px + 12 + legSwing1 / 2,
    adjustedY + 40,
    6,
    15 - kneeFlexion1,
    3
  );
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(
    px + 22 + legSwing2 / 2,
    adjustedY + 40,
    6,
    15 - kneeFlexion2,
    3
  );
  ctx.fill();

  // Lower legs (shins)
  ctx.fillStyle = "#1E40AF"; // Slightly different shade
  ctx.beginPath();
  ctx.roundRect(
    px + 12 + legSwing1,
    adjustedY + 50 - kneeFlexion1,
    6,
    12 + kneeFlexion1,
    2
  );
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(
    px + 22 + legSwing2,
    adjustedY + 50 - kneeFlexion2,
    6,
    12 + kneeFlexion2,
    2
  );
  ctx.fill();

  // Realistic torso with slight taper
  ctx.fillStyle = "#3B82F6"; // Blue shirt
  ctx.beginPath();
  ctx.roundRect(px + 10, adjustedY + 20, 20, 22, 4);
  ctx.fill();

  // Shirt collar
  ctx.fillStyle = "#1E40AF";
  ctx.beginPath();
  ctx.roundRect(px + 16, adjustedY + 20, 8, 4, 2);
  ctx.fill();

  // Upper arms - natural running motion (opposite to legs)
  const armSwing1 = armCycle1 * 8; // Slower, more natural arm swing
  const armSwing2 = armCycle2 * 8;
  const armAngle1 = armCycle1 * 0.25; // Slower, more subtle arm rotation
  const armAngle2 = armCycle2 * 0.25;
  const elbowBend1 = Math.abs(armCycle1) * 2; // Slower, less pronounced elbow flexion
  const elbowBend2 = Math.abs(armCycle2) * 2;

  ctx.fillStyle = "#FBBF24"; // More realistic skin tone

  // Left upper arm
  ctx.save();
  ctx.translate(px + 8, adjustedY + 22);
  ctx.rotate(armAngle1);
  ctx.fillRect(armSwing1 / 4, 0, 5, 12 - elbowBend1);
  ctx.restore();

  // Right upper arm
  ctx.save();
  ctx.translate(px + 32, adjustedY + 22);
  ctx.rotate(armAngle2);
  ctx.fillRect(armSwing2 / 4, 0, 5, 12 - elbowBend2);
  ctx.restore();

  // Forearms - with natural bend
  ctx.fillStyle = "#F59E0B";

  // Left forearm
  ctx.save();
  ctx.translate(px + 8 + armSwing1 / 3, adjustedY + 30 - elbowBend1);
  ctx.rotate(armAngle1 * 1.5);
  ctx.fillRect(0, 0, 4, 10 + elbowBend1);
  ctx.restore();

  // Right forearm
  ctx.save();
  ctx.translate(px + 32 + armSwing2 / 3, adjustedY + 30 - elbowBend2);
  ctx.rotate(armAngle2 * 1.5);
  ctx.fillRect(0, 0, 4, 10 + elbowBend2);
  ctx.restore();

  // Hands - positioned naturally at end of forearms
  ctx.fillStyle = "#FBBF24";
  ctx.beginPath();
  ctx.arc(
    px + 9 + armSwing1 / 2,
    adjustedY + 40 + elbowBend1 / 2,
    2.5,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.beginPath();
  ctx.arc(
    px + 33 + armSwing2 / 2,
    adjustedY + 40 + elbowBend2 / 2,
    2.5,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Neck
  ctx.fillStyle = "#FBBF24";
  ctx.beginPath();
  ctx.roundRect(px + 17, adjustedY + 16, 6, 6, 3);
  ctx.fill();

  // Head with side profile proportions
  ctx.fillStyle = "#FBBF24"; // Skin tone
  ctx.beginPath();
  ctx.ellipse(px + 20, adjustedY + 10, 11, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair with texture (side profile)
  ctx.fillStyle = "#92400E"; // Brown hair
  ctx.beginPath();
  ctx.ellipse(
    px + 18,
    adjustedY + 4,
    12,
    9,
    0,
    Math.PI * 0.8,
    Math.PI * 2.2
  );
  ctx.fill();

  // Hair strands for texture (adjusted for side view)
  ctx.strokeStyle = "#7C2D12";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(px + 11 + i * 4, adjustedY + 2);
    ctx.lineTo(px + 12 + i * 4, adjustedY + 8);
    ctx.stroke();
  }

  // Eyebrow (single, facing right)
  ctx.fillStyle = "#7C2D12";
  ctx.beginPath();
  ctx.ellipse(px + 24, adjustedY + 7, 4, 1.5, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // Eye (single, side profile)
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.ellipse(px + 25, adjustedY + 9, 3.5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Iris (side view)
  ctx.fillStyle = "#059669"; // Green eye
  ctx.beginPath();
  ctx.arc(px + 26, adjustedY + 9, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Pupil
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.arc(px + 26, adjustedY + 9, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Eye shine/reflection
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(px + 26.5, adjustedY + 8.5, 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Nose (side profile - more prominent)
  ctx.fillStyle = "#F59E0B";
  ctx.beginPath();
  ctx.moveTo(px + 29, adjustedY + 10);
  ctx.lineTo(px + 32, adjustedY + 11);
  ctx.lineTo(px + 30, adjustedY + 13);
  ctx.lineTo(px + 28, adjustedY + 12);
  ctx.closePath();
  ctx.fill();

  // Nostril (side view)
  ctx.fillStyle = "#D97706";
  ctx.beginPath();
  ctx.arc(px + 30, adjustedY + 12, 0.8, 0, Math.PI * 2);
  ctx.fill();

  // Mouth (side profile)
  ctx.fillStyle = "#DC2626";
  ctx.beginPath();
  ctx.ellipse(px + 28, adjustedY + 15, 2.5, 1.2, 0, 0, Math.PI);
  ctx.fill();

  // Lip line (side view)
  ctx.strokeStyle = "#B91C1C";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(px + 28, adjustedY + 15, 2.5, 0, Math.PI);
  ctx.stroke();

  // Ear (visible from side)
  ctx.fillStyle = "#FBBF24";
  ctx.beginPath();
  ctx.ellipse(px + 10, adjustedY + 10, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner ear detail
  ctx.fillStyle = "#F59E0B";
  ctx.beginPath();
  ctx.ellipse(px + 11, adjustedY + 10, 1.5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Athletic shoes with natural foot positioning
  const footAngle1 = legCycle1 * 0.12; // Slower, more subtle foot angle
  const footAngle2 = legCycle2 * 0.12;
  const footLift1 = Math.max(0, -legCycle1 * 2); // Slower foot lift
  const footLift2 = Math.max(0, -legCycle2 * 2);

  ctx.fillStyle = "#1F2937"; // Dark gray shoes

  // Left shoe
  ctx.save();
  ctx.translate(px + 16 + legSwing1, adjustedY + 58 - footLift1);
  ctx.rotate(footAngle1);
  ctx.fillRect(-6, 0, 12, 7);
  ctx.restore();

  // Right shoe
  ctx.save();
  ctx.translate(px + 24 + legSwing2, adjustedY + 58 - footLift2);
  ctx.rotate(footAngle2);
  ctx.fillRect(-6, 0, 12, 7);
  ctx.restore();

  // Shoe laces
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + 14 + legSwing1, adjustedY + 60 - footLift1);
  ctx.lineTo(px + 18 + legSwing1, adjustedY + 62 - footLift1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + 22 + legSwing2, adjustedY + 60 - footLift2);
  ctx.lineTo(px + 26 + legSwing2, adjustedY + 62 - footLift2);
  ctx.stroke();

  // Shoe soles with natural positioning
  ctx.fillStyle = "#000000";

  // Left sole
  ctx.save();
  ctx.translate(px + 15 + legSwing1, adjustedY + 64 - footLift1);
  ctx.rotate(footAngle1);
  ctx.fillRect(-6, 0, 14, 2);
  ctx.restore();

  // Right sole
  ctx.save();
  ctx.translate(px + 23 + legSwing2, adjustedY + 64 - footLift2);
  ctx.rotate(footAngle2);
  ctx.fillRect(-6, 0, 14, 2);
  ctx.restore();

  // Draw shield effect if invulnerable
  if (state.invulnerable) {
    const shieldPulse = 0.8 + Math.sin(Date.now() * 0.01) * 0.2;
    ctx.strokeStyle = `rgba(59, 130, 246, ${shieldPulse})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.ellipse(
      px + state.player.width / 2,
      adjustedY + state.player.height / 2,
      state.player.width / 2 + 10,
      state.player.height / 2 + 10,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw speed boost effect - rocket boost visual
  if (state.speedBoost) {
    // Rocket flame trail
    for (let i = 0; i < 5; i++) {
      const flameAlpha = 0.5 - i * 0.1;
      ctx.fillStyle = `rgba(239, 68, 68, ${flameAlpha})`; // Red flame
      ctx.beginPath();
      ctx.arc(
        px - i * 12 - 20,
        adjustedY + state.player.height / 2,
        5 - i,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Orange outer flame
      ctx.fillStyle = `rgba(251, 191, 36, ${flameAlpha * 0.7})`;
      ctx.beginPath();
      ctx.arc(
        px - i * 12 - 20,
        adjustedY + state.player.height / 2,
        7 - i,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // Speed lines
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(245, 158, 11, ${0.4 - i * 0.1})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(
        px - 30 - i * 10,
        adjustedY + state.player.height / 2 - 10 + i * 5
      );
      ctx.lineTo(
        px - 40 - i * 10,
        adjustedY + state.player.height / 2 - 10 + i * 5
      );
      ctx.stroke();
    }
  }

  // Draw power-up timer displays
  let timerY = adjustedY - 40;
  const timerSpacing = 25;

  if (state.invulnerable && state.invulnerableTimer > 0) {
    const remainingSeconds = Math.ceil(state.invulnerableTimer / 60);
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#3B82F6";
    ctx.lineWidth = 2;
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.strokeText(
      `Shield: ${remainingSeconds}s`,
      px + state.player.width / 2,
      timerY
    );
    ctx.fillText(
      `Shield: ${remainingSeconds}s`,
      px + state.player.width / 2,
      timerY
    );
    timerY -= timerSpacing;
  }

  if (state.magnetCoins && state.magnetTimer > 0) {
    const remainingSeconds = Math.ceil(state.magnetTimer / 60);
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#DC2626";
    ctx.lineWidth = 2;
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.strokeText(
      `Magnet: ${remainingSeconds}s`,
      px + state.player.width / 2,
      timerY
    );
    ctx.fillText(
      `Magnet: ${remainingSeconds}s`,
      px + state.player.width / 2,
      timerY
    );
    timerY -= timerSpacing;
  }

  if (state.speedBoost && state.speedBoostTimer > 0) {
    const remainingSeconds = Math.ceil(state.speedBoostTimer / 60);
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 2;
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.strokeText(
      `Boost: ${remainingSeconds}s`,
      px + state.player.width / 2,
      timerY
    );
    ctx.fillText(
      `Boost: ${remainingSeconds}s`,
      px + state.player.width / 2,
      timerY
    );
    timerY -= timerSpacing;
  }

  if (state.scoreMultiplier && state.scoreMultiplierTimer > 0) {
    const remainingSeconds = Math.ceil(state.scoreMultiplierTimer / 60);
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 2;
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.strokeText(
      `2x Coins: ${remainingSeconds}s`,
      px + state.player.width / 2,
      timerY
    );
    ctx.fillText(
      `2x Coins: ${remainingSeconds}s`,
      px + state.player.width / 2,
      timerY
    );
    timerY -= timerSpacing;
  }
}

function drawPlayerOnRope(px, py, state) {
  // Simplified hanging animation
  ctx.fillStyle = "#FBBF24";
  ctx.fillRect(px, py, state.player.width, state.player.height);
  // Add rope
  ctx.strokeStyle = "#8B4513";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + state.player.width / 2, py - 20);
  ctx.lineTo(px + state.player.width / 2, py);
  ctx.stroke();
}

function drawCrouchingPlayer(px, py, state) {
  // Simplified crouching position
  ctx.fillStyle = "#1E3A8A";
  ctx.fillRect(px + 10, py + 30, 20, 20); // Legs
  ctx.fillStyle = "#3B82F6";
  ctx.fillRect(px + 8, py + 10, 24, 25); // Torso
  ctx.fillStyle = "#FBBF24";
  ctx.beginPath();
  ctx.ellipse(px + 20, py + 5, 11, 13, 0, 0, Math.PI * 2); // Head
  ctx.fill();
}

// Handle game state changes
function handleGameState(state) {
  if (!state) return;
  if (state.gameState === 'gameOver') {
    // Call client-side game over handling
    clientGame.gameOver();
  }
}

function drawCatchingEffects(state) {
  // Phase 1: Screen shake and red tint
  if (state.catchingPhase === 1) {
    ctx.fillStyle = `rgba(255, 0, 0, ${
      0.3 + Math.sin(Date.now() * 0.003) * 0.2
    })`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw "CAUGHT!" text
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.strokeStyle = "rgba(255, 0, 0, 0.9)";
    ctx.lineWidth = 4;
    ctx.font = "bold 80px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const shake = Math.sin(Date.now() * 0.005) * 5;
    ctx.strokeText(
      "CAUGHT!",
      canvas.width / 2 + shake,
      canvas.height / 2
    );
    ctx.fillText(
      "CAUGHT!",
      canvas.width / 2 + shake,
      canvas.height / 2
    );
    ctx.restore();
  }

  // Phase 2: Fade to black
  if (state.catchingPhase === 2) {
    const fadeAmount = (Date.now() - (state.catchingTimer || 0)) / 1000; // Assuming catchingTimer is in milliseconds
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(fadeAmount, 1)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function gameLoop() {
  if (!gameState) return;

  if (gameState.gameState === "playing") {
    // Update game logic would be handled by server, just render here
    renderGame(gameState);
    updateUI(gameState);
    handleGameState(gameState);
  } else if (gameState.gameState === "paused") {
    // Just draw when paused (no updates)
    renderGame(gameState);
    updateUI(gameState);
  } else if (gameState.gameState === "catching") {
    // Update catching animation - handled by server, just render
    renderGame(gameState);
    updateUI(gameState);
    drawCatchingEffects(gameState);
  }

  // Continue the loop
  requestAnimationFrame(() => gameLoop());
}

// Start the game loop
gameLoop();


