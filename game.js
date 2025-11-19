class EndlessRunner {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Audio setup
    this.audioContext = null;
    this.backgroundMusic = new Audio("song/song.mp3"); // Load MP3 file
    this.backgroundMusic.loop = true; // Loop the music
    this.backgroundMusic.volume = 0.5; // Set volume to 50%
    this.audioEnabled = localStorage.getItem("audioEnabled") !== "false"; // Default to true
    this.musicEnabled = localStorage.getItem("musicEnabled") !== "false"; // Default to true
    this.initAudio();

    this.gameState = "start"; // start, playing, catching, paused, gameOver
    this.score = 0;
    this.distance = 0; // Add distance tracking
    this.highScore = localStorage.getItem("highScore") || 0;
    this.gameSpeed = 7; // Increased from 4 to 6, now to 7
    this.baseGameSpeed = 7; // Increased from 4 to 6, now to 7
    this.gravity = 0.7; // Increased from 0.8 to 1.0
    this.slowdownTimer = 0;
    this.hitTimestamps = [];
    this.hitFlash = 0;
    this.lastHitTime = 0; // Track when the last obstacle was hit
    this.consecutiveDangers = 0; // Track consecutive dangerous obstacles spawned
    this.catchingAnimation = 0; // Animation timer for monster catching player
    this.catchingPhase = 0; // Phase of catching animation

    // Session tracking
    this.sessionId = null;
    this.sessionStartTime = null;
    this.sessionStats = {
      coinsCollected: 0,
      obstaclesHit: 0,
      powerupsCollected: 0,
      distanceTraveled: 0,
      gameResult: null
    };

    this.ground = this.canvas.height - 100;

    // Player properties
    this.player = {
      x: 400,
      y: this.ground - 60,
      width: 40,
      height: 60,
      velocityY: 0,
      jumping: false,
      doubleJumpUsed: false,
      sliding: false,
      slideTimer: 0,
      runFrame: 0,
      onRope: false, // New: tracking if player is on rope
      ropeSwing: 0, // New: rope swing animation
      ropeCrossing: null, // New: reference to the rope being crossed
    };

    this.obstacles = [];
    this.birds = [];
    this.spikes = [];
    this.movingPlatforms = [];
    this.gaps = [];
    this.coins = [];
    this.powerUps = [];
    this.fireTraps = [];
    this.monster = null; // Single monster
    this.clouds = [];
    this.backgroundTrees = [];
    this.particles = []; // For visual effects
    this.dangerousAreas = []; // Track dangerous obstacles that need platform assistance
    this.pendulums = []; // Swinging axe pendulums
    this.ropes = []; // New: Rope crossing obstacles

    this.obstacleTimer = 0;
    this.birdTimer = 0;
    this.spikeTimer = 0;
    this.platformTimer = 0;
    this.ballTimer = 0;
    this.cloudTimer = 0;
    this.gapTimer = 0;
    this.coinTimer = 0;
    this.powerUpTimer = 0;
    this.treeTimer = 0;
    this.fireTimer = 0;
    this.pendulumTimer = 0;
    this.collectibleTimer = 0;
    this.invulnerable = false;
    this.invulnerableTimer = 0;
    this.shieldHits = 0; // Number of hits the shield can take
    this.magnetCoins = false;
    this.magnetTimer = 0;
    this.speedBoost = false;
    this.speedBoostTimer = 0;
    this.autoDodge = false; // Auto-dodge during boost
    this.scoreMultiplier = false;
    this.scoreMultiplierTimer = 0;

    this.keys = {};

    this.setupEventListeners();
    this.generateClouds();
    this.generateBackgroundTrees();
    this.updateHighScore();
    this.updateAudioButtons(); // Initialize audio button states
    this.updatePauseButton(); // Initialize pause button state
    this.gameLoop();
  }

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

  setupEventListeners() {
    document.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
      if (e.code === "Space") {
        e.preventDefault();
        this.jump();
      }
      if (e.code === "ArrowDown" || e.code === "KeyS") {
        e.preventDefault();
        this.slide();
      }
    });

    document.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
      if (e.code === "ArrowDown" || e.code === "KeyS") {
        this.stopSlide();
      }
    });

    document.getElementById("startBtn").addEventListener("click", () => {
      this.startGame();
    });

    document.getElementById("restartBtn").addEventListener("click", () => {
      this.restartGame();
    });

    // Pause button
    document.getElementById("pauseBtn").addEventListener("click", () => {
      this.togglePause();
    });

    // Resume button
    document.getElementById("resumeBtn").addEventListener("click", () => {
      this.resumeGame();
    });

    // Pause restart button
    document.getElementById("pauseRestartBtn").addEventListener("click", () => {
      this.restartGame();
    });

    // Audio toggle buttons
    document.getElementById("audioToggle").addEventListener("click", () => {
      this.toggleAudio();
    });

    document.getElementById("musicToggle").addEventListener("click", () => {
      this.toggleMusic();
    });

    // Handle canvas clicks for jump
    this.canvas.addEventListener("click", () => {
      if (this.gameState === "playing") {
        this.jump();
      }
    });
  }

  startGame() {
    this.gameState = "playing";
    document.getElementById("startScreen").classList.add("hidden");
    document.getElementById("backLink").style.display = "none";
    this.spawnMonster(); // Spawn the single monster
    this.startBackgroundMusic(); // Start background music
    this.startSession(); // Start tracking session
    this.updatePauseButton(); // Update pause button for playing state
  }

  togglePause() {
    if (this.gameState === "playing") {
      this.pauseGame();
    } else if (this.gameState === "paused") {
      this.resumeGame();
    }
  }

  pauseGame() {
    if (this.gameState === "playing") {
      this.gameState = "paused";
      document.getElementById("pauseScreen").classList.remove("hidden");
      this.stopBackgroundMusic(); // Pause background music
      this.updatePauseButton();
    }
  }

  resumeGame() {
    if (this.gameState === "paused") {
      this.gameState = "playing";
      document.getElementById("pauseScreen").classList.add("hidden");
      this.startBackgroundMusic(); // Resume background music
      this.updatePauseButton();
    }
  }

  updatePauseButton() {
    const pauseBtn = document.getElementById("pauseBtn");
    if (this.gameState === "paused") {
      pauseBtn.textContent = "▶️ Resume";
      pauseBtn.className = "bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm";
    } else if (this.gameState === "playing") {
      pauseBtn.textContent = "⏸️ Pause";
      pauseBtn.className = "bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm";
    } else {
      pauseBtn.textContent = "⏸️ Pause";
      pauseBtn.className = "bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm";
    }
  }

  restartGame() {
    this.gameState = "playing";
    this.score = 0;
    this.distance = 0; // Reset distance
    this.gameSpeed = 7;
    this.baseGameSpeed = 7;
    this.slowdownTimer = 0;
    this.hitTimestamps = [];
    this.hitFlash = 0;
    this.lastHitTime = 0;
    this.consecutiveDangers = 0; // Reset consecutive danger counter
    this.obstacles = [];
    this.birds = [];
    this.movingPlatforms = [];
    this.gaps = [];
    this.coins = [];
    this.powerUps = [];
    this.fireTraps = [];
    this.monster = null;
    this.particles = [];
    this.pendulums = [];
    this.backgroundTrees = [];
    this.ropes = []; // Reset ropes
    this.dangerousAreas = []; // Reset dangerous areas tracking
    this.player.y = this.ground - 60;
    this.player.velocityY = 0;
    this.player.jumping = false;
    this.player.doubleJumpUsed = false;
    this.player.sliding = false;
    this.player.slideTimer = 0;
    this.player.onRope = false; // Reset rope state
    this.player.ropeSwing = 0;
    this.player.ropeCrossing = null;
    this.obstacleTimer = 0;
    this.birdTimer = 0;
    this.spikeTimer = 0;
    this.platformTimer = 0;
    this.ballTimer = 0;
    this.gapTimer = 0;
    this.coinTimer = 0;
    this.powerUpTimer = 0;
    this.treeTimer = 0;
    this.fireTimer = 0;
    this.pendulumTimer = 0;
    this.collectibleTimer = 0;
    this.invulnerable = false;
    this.invulnerableTimer = 0;
    this.shieldHits = 0;
    this.magnetCoins = false;
    this.magnetTimer = 0;
    this.speedBoost = false;
    this.speedBoostTimer = 0;
    this.autoDodge = false;
    this.scoreMultiplier = false;
    this.scoreMultiplierTimer = 0;
    document.getElementById("gameOverScreen").classList.add("hidden");
    document.getElementById("pauseScreen").classList.add("hidden"); // Hide pause screen on restart
    document.getElementById("backLink").style.display = "none";
    // Update UI to show reset coin count
    document.getElementById("score").textContent = "0";
    document.getElementById("distance").textContent = "0";
    this.generateClouds();
    this.generateBackgroundTrees();
    this.spawnMonster(); // Spawn the single monster
    this.startBackgroundMusic(); // Restart background music
    this.startSession(); // Start new session
    this.updatePauseButton(); // Update pause button for playing state
  }

  jump() {
    if (this.gameState === "playing") {
      // First jump
      if (!this.player.jumping) {
        this.player.velocityY = -12; // Reduced from -18 to -12
        this.player.jumping = true;
        this.player.doubleJumpUsed = false;
        this.playJumpSound();
      }
      // Double jump
      else if (!this.player.doubleJumpUsed) {
        this.player.velocityY = -9; // Reduced from -15 to -9
        this.player.doubleJumpUsed = true;
        this.playJumpSound();
      }
    }
  }

  slide() {
    if (
      this.gameState === "playing" &&
      !this.player.sliding &&
      !this.player.jumping
    ) {
      this.player.sliding = true;
      this.player.slideTimer = 20; // Reduced from 30 to 20 frames (shorter slide)
      this.player.height = 30; // Reduce height while sliding
      this.player.y = this.ground - 30; // Adjust position
      this.playSlideSound();
    }
  }

  stopSlide() {
    if (this.player.sliding) {
      this.player.sliding = false;
      this.player.height = 60; // Restore normal height
      // Only adjust y position if player is on the ground
      if (!this.player.jumping) {
        this.player.y = this.ground - 60; // Restore normal position
      }
    }
  }

  updatePlayer() {
    // Handle rope crossing
    if (this.player.onRope && this.player.ropeCrossing) {
      // Check if space is still being held
      if (this.keys["Space"]) {
        // Player is holding on to rope - move forward along rope
        this.player.ropeSwing += 0.05; // Swing animation
        // Rope pulls player forward slightly
        // Player stays at rope height with slight swinging motion
        this.player.y =
          this.player.ropeCrossing.y + Math.sin(this.player.ropeSwing) * 10;

        // Check if player has crossed the rope
        if (
          this.player.x >
          this.player.ropeCrossing.x + this.player.ropeCrossing.width
        ) {
          // Successfully crossed!
          this.player.onRope = false;
          this.player.ropeCrossing = null;
          this.player.jumping = true; // Start falling after rope
        }
      } else {
        // Player let go of space - fall!
        this.player.onRope = false;
        this.player.ropeCrossing = null;
        this.player.jumping = true;
        this.player.velocityY = 2; // Start falling
      }
    }

    // Handle sliding timer
    if (this.player.sliding) {
      this.player.slideTimer--;
      if (this.player.slideTimer <= 0) {
        this.stopSlide();
      }
    }

    // Apply gravity only when not sliding or when jumping
    if (!this.player.sliding || this.player.jumping) {
      if (this.player.velocityY > 0) {
        this.player.velocityY += this.gravity * 1.5; // Increased from 1.2 to 1.5 for faster falling
      } else {
        this.player.velocityY += this.gravity;
      }
      this.player.y += this.player.velocityY;
    }

    // Ground collision
    if (this.player.y >= this.ground - this.player.height) {
      this.player.y = this.ground - this.player.height;
      this.player.velocityY = 0;
      this.player.jumping = false;
      this.player.doubleJumpUsed = false; // Reset double jump when landing
    }

    // Running animation - slower for more natural movement
    this.player.runFrame += 0.18; // Slower animation frame increment
    if (this.player.runFrame >= 4) this.player.runFrame = 0;
  }

  spawnObstacle() {
    if (this.obstacleTimer <= 0) {
      // Randomly choose obstacle type based on score
      const obstacleType = Math.random();

      if (this.score < 50) {
        // Easier gameplay: Stone most common, then birds, gaps, fire rarest
        if (obstacleType < 0.45) {
          // 45% - Ground obstacles (Rock) - Most common
          const obstacleX = this.canvas.width;
          const obstacleWidth = 35;
          const wouldOverlapGap = this.gaps.some(
            (gap) =>
              obstacleX < gap.x + gap.width && obstacleX + obstacleWidth > gap.x
          );
          if (!wouldOverlapGap) {
            this.obstacles.push({
              x: obstacleX,
              y: this.ground - 45,
              width: obstacleWidth,
              height: 45,
              type: "rock",
            });
            this.consecutiveDangers = 0;
          }
        } else if (obstacleType < 0.6) {
          // 15% - Flying birds (reduced from 25%)
          this.spawnBird();
          this.consecutiveDangers = 0;
        } else if (obstacleType < 0.75) {
          // 15% - Gaps
          this.spawnGap();
        } else if (obstacleType < 0.78) {
          // 3% - Rope crossing
          this.spawnRope();
        } else if (obstacleType < 0.67) {
          // 4% - Fire traps
          const trapX = this.canvas.width;
          const trapWidth = 60;
          const wouldOverlapGap = this.gaps.some(
            (gap) => trapX < gap.x + gap.width && trapX + trapWidth > gap.x
          );
          if (!wouldOverlapGap) {
            this.spawnFireTrap();
          }
        }
      } else {
        // Score >= 50: Stone most common, then birds, gaps, fire rarest
        if (obstacleType < 0.5) {
          // 50% - Ground obstacles - Most common
          const obstacleX = this.canvas.width;
          const obstacleWidth = 35;
          const wouldOverlapGap = this.gaps.some(
            (gap) =>
              obstacleX < gap.x + gap.width && obstacleX + obstacleWidth > gap.x
          );
          if (!wouldOverlapGap) {
            this.obstacles.push({
              x: obstacleX,
              y: this.ground - 45,
              width: obstacleWidth,
              height: 45,
              type: "rock",
            });
            this.consecutiveDangers = 0;
          }
        } else if (obstacleType < 0.68) {
          // 18% - Flying birds (reduced from 28%)
          this.spawnBird();
          this.consecutiveDangers = 0;
        } else if (obstacleType < 0.8) {
          // 12% - Gaps
          this.spawnGap();
        } else if (obstacleType < 0.83) {
          // 3% - Rope crossing
          this.spawnRope();
        } else if (obstacleType < 0.7) {
          // 4% - Fire traps
          const trapX = this.canvas.width;
          const trapWidth = 60;
          const wouldOverlapGap = this.gaps.some(
            (gap) => trapX < gap.x + gap.width && trapX + trapWidth > gap.x
          );
          if (!wouldOverlapGap) {
            this.spawnFireTrap();
          }
        }
      }

      // Set obstacle timer based on score
      if (this.score < 50) {
        this.obstacleTimer = Math.random() * 40 + 40; // 40-80 frames
      } else {
        this.obstacleTimer = Math.random() * 45 + 30; // 30-75 frames
      }
    }
    this.obstacleTimer--;
  }
  spawnBird() {
    // Creates flying bird obstacles that move in wavy patterns
    // Birds fly at two distinct heights: high (requires crouch) or low (requires jump)

    const birdType = Math.random();
    let height;

    if (birdType < 0.5) {
      // High flying birds - player must CROUCH/SLIDE under them
      // Fly at head height (60-80 pixels above ground)
      height = 60 + Math.random() * 20; // 60-80 range
    } else {
      // Low flying birds - player must JUMP over them
      // Fly at knee/waist height (20-35 pixels above ground)
      height = 20 + Math.random() * 15; // 20-35 range
    }

    this.birds.push({
      x: this.canvas.width,
      y: this.ground - height,
      width: 35,
      height: 20,
      initialY: this.ground - height, // Store initial Y position for wave motion
      waveOffset: Math.random() * Math.PI * 2, // Random starting phase
      frame: Math.random() * 4,
      birdHeight: height, // Store the height category for reference
    });
  }

  spawnSpikes() {
    // Creates ground spike obstacles that must be jumped over
    // Large spike clusters (4+ spikes) automatically spawn helper platforms
    const spikeCount = Math.floor(Math.random() * 4) + 3; // Increased from 2-4 to 3-6 spikes
    const totalWidth = spikeCount * 22;
    for (let i = 0; i < spikeCount; i++) {
      this.spikes.push({
        x: this.canvas.width + i * 22, // Reduced spacing from 25 to 22
        y: this.ground - 30, // Increased height from 25 to 30
        width: 22, // Increased width from 20 to 22
        height: 30, // Increased height from 25 to 30
      });
    }

    // Mark spike cluster as dangerous area needing platform assistance
    if (spikeCount >= 4) {
      // Only for large spike clusters
      this.markDangerousArea(
        this.canvas.width + totalWidth / 2,
        totalWidth,
        "spikes"
      );
    }
  }

  spawnMovingPlatform() {
    // Creates floating platforms that move vertically up and down
    // These are safe platforms players can land on to avoid ground obstacles
    this.movingPlatforms.push({
      x: this.canvas.width,
      y: this.ground - 80 - Math.random() * 50,
      width: 80,
      height: 15,
      velocityY: (Math.random() - 0.5) * 4, // Vertical movement
      bounceRange: 60,
    });
  }

  spawnGap() {
    // Creates ground gaps that must be jumped over
    // Always deadly if player falls in, automatically spawns helper platforms
    // Often spawns multiple gaps close together for increased challenge

    // Randomly decide how many gaps to spawn - weighted toward multiple gaps
    const gapPattern = Math.random();
    let numGaps;

    if (gapPattern < 0.15) {
      numGaps = 1; // 15% chance: single gap (reduced from 30%)
    } else if (gapPattern < 0.5) {
      numGaps = 2; // 35% chance: two gaps (reduced from 40%)
    } else if (gapPattern < 0.8) {
      numGaps = 3; // 30% chance: three gaps (same)
    } else {
      numGaps = 4; // 20% chance: four gaps (NEW)
    }

    const gapWidth = 80 + Math.random() * 60; // Base gap width
    const groundSpacing = 0; // No space between gaps - pits are connected

    for (let i = 0; i < numGaps; i++) {
      // Calculate position for this gap
      let gapX;
      if (i === 0) {
        gapX = this.canvas.width;
      } else {
        // Position after previous gap plus ground spacing
        const prevGap = this.gaps[this.gaps.length - 1];
        gapX = prevGap.x + prevGap.width + groundSpacing;
      }

      // Add some variation to gap width for each gap in the cluster
      const thisGapWidth = gapWidth + (Math.random() - 0.5) * 30; // Vary by ±15 pixels

      this.gaps.push({
        x: gapX,
        width: Math.max(60, thisGapWidth), // Minimum width of 60
        y: this.ground,
        height: this.canvas.height - this.ground,
      });

      // Mark this gap as a dangerous area that needs a platform
      this.markDangerousArea(gapX + thisGapWidth / 2, thisGapWidth, "gap");
    }
  }

  spawnRope() {
    // Creates a long gap with a rope that must be crossed by holding space
    // Rope swings slightly and player must maintain grip
    const gapWidth = 200 + Math.random() * 100; // Wide gap (200-300 pixels)
    const ropeHeight = this.ground - 100 - Math.random() * 40; // Rope hangs above gap

    // Create the gap under the rope
    this.gaps.push({
      x: this.canvas.width,
      width: gapWidth,
      y: this.ground,
      height: this.canvas.height - this.ground,
      hasRope: true, // Mark this gap as having a rope
    });

    // Create the rope
    this.ropes.push({
      x: this.canvas.width,
      width: gapWidth,
      y: ropeHeight,
      height: 15,
      swingAngle: 0,
      swingSpeed: 0.02,
      maxSwing: 0.15, // Maximum swing angle in radians
      gripRequired: true, // Player must hold space to stay on
    });
  }

  spawnCoins() {
    // Creates collectible coin groups that give points when collected
    // Coins appear in horizontal, vertical, or curved patterns
    // More likely to spawn 1-2 coins, less likely to spawn large groups
    const coinGroupType = Math.random();
    let coinCount;

    if (coinGroupType < 0.3) {
      // 30% chance: Single coin (reduced from 50%)
      coinCount = 1;
    } else if (coinGroupType < 0.6) {
      // 30% chance: Two coins (increased from 30%)
      coinCount = 2;
    } else if (coinGroupType < 0.85) {
      // 25% chance: Small group (3-4 coins, increased from 12%)
      coinCount = Math.floor(Math.random() * 2) + 3; // 3-4 coins
    } else {
      // 15% chance: Large group (5-7 coins, increased from 8%)
      coinCount = Math.floor(Math.random() * 3) + 5; // 5-7 coins
    }

    const pattern = Math.random();

    for (let i = 0; i < coinCount; i++) {
      let coinX, coinY;

      if (coinCount === 1) {
        // Single coin - simple placement
        coinX = this.canvas.width + 20;
        coinY = this.ground - 60 - Math.random() * 40;
      } else if (coinCount === 2) {
        // Two coins - simple horizontal or vertical spacing
        if (pattern < 0.5) {
          // Horizontal
          coinX = this.canvas.width + 20 + i * 30;
          coinY = this.ground - 60 - Math.random() * 20;
        } else {
          // Vertical
          coinX = this.canvas.width + 20;
          coinY = this.ground - 50 - i * 25;
        }
      } else {
        // Larger groups - use patterns
        if (pattern < 0.33) {
          // Horizontal line
          coinX = this.canvas.width + i * 25;
          coinY = this.ground - 60 - Math.random() * 40;
        } else if (pattern < 0.66) {
          // Vertical line
          coinX = this.canvas.width + 20;
          coinY = this.ground - 40 - i * 20;
        } else {
          // Curved pattern
          coinX = this.canvas.width + i * 20;
          coinY = this.ground - 60 - Math.sin(i * 0.5) * 30;
        }
      }

      this.coins.push({
        x: coinX,
        y: coinY,
        width: 16,
        height: 16,
        frame: Math.random() * 8,
        collected: false,
      });
    }
  }

  spawnPowerUp(type) {
    // Creates power-up items that give special abilities when collected
    // Types: shield (invulnerability), magnet (attracts coins), boost (speed), doublecoins (score multiplier)

    this.powerUps.push({
      x: this.canvas.width,
      y: this.ground - 70 - Math.random() * 30,
      width: 36, // Increased from 24 to 36 (50% bigger)
      height: 36, // Increased from 24 to 36 (50% bigger)
      type: type,
      frame: 0,
      collected: false,
    });
  }

  spawnCollectibles() {
    // Creates collectible items (coins and power-ups) with specific spawn percentages
    // Uses separate timer from obstacles for independent spawning
    if (this.collectibleTimer <= 0) {
      const rand = Math.random();
      if (rand < 0.8) {
        // 80% chance for coins
        this.spawnCoins();
      } else if (rand < 0.9) {
        // 10% chance for shield power-up
        this.spawnPowerUp("shield");
      } else if (rand < 0.9) {
        // 10% chance for magnet power-up
        this.spawnPowerUp("magnet");
      } else if (rand < 0.95) {
        // 5% chance for boost power-up
        this.spawnPowerUp("boost");
      } else {
        // 5% chance for doublecoins power-up
        this.spawnPowerUp("doublecoins");
      }

      // Set collectible timer - shorter than obstacle timer for more frequent spawning
      this.collectibleTimer = Math.random() * 50 + 50; // 50-100 frames (more frequent than obstacles)
    }
    this.collectibleTimer--;
  }

  spawnFireTrap() {
    // Creates fire trap obstacles that activate periodically
    // Dangerous only when active (flames visible), safe when inactive
    this.fireTraps.push({
      x: this.canvas.width,
      y: this.ground - 30,
      width: 60,
      height: 30,
      active: true, // Start active so player can see them
      timer: 120, // Start with longer active period (2 seconds)
      frame: 0,
    });

    // Fire traps are dangerous and may need platform assistance
    this.markDangerousArea(this.canvas.width + 30, 60, "fire");
  }

  spawnPendulum() {
    // Creates swinging axe pendulum traps that move in arcs
    // Axes swing back and forth on chains, dangerous when in swing path
    const pendulumLength = 80 + Math.random() * 40; // Length of pendulum chain/rope
    const swingSpeed = 0.02 + Math.random() * 0.01; // Swing speed (radians per frame)
    const swingAngle = Math.PI / 4 + (Math.random() * Math.PI) / 6; // Maximum swing angle

    this.pendulums.push({
      x: this.canvas.width + 50, // Pivot point x position
      y: this.ground - 120 - Math.random() * 60, // Pivot point y position (height)
      length: pendulumLength,
      angle: 0, // Current swing angle
      maxAngle: swingAngle,
      speed: swingSpeed,
      direction: 1, // 1 for right, -1 for left
      axeWidth: 25,
      axeHeight: 35,
      chainSegments: 8, // Number of chain links to draw
    });

    // Pendulums are dangerous and may need platform assistance
    this.markDangerousArea(
      this.canvas.width + 50,
      pendulumLength + 25,
      "pendulum"
    );
  }

  markDangerousArea(centerX, width, type) {
    // Add dangerous area to tracking
    this.dangerousAreas.push({
      x: centerX,
      width: width,
      type: type,
      needsPlatform: true,
      timestamp: Date.now(),
    });

    // Increment consecutive danger counter
    this.consecutiveDangers++;

    // Check if this is a gap and spawn a platform near it
    if (type === "gap") {
      this.spawnPlatformNearGap(centerX, width);
    }

    // Check for multiple obstacles clustered together and spawn strategic platforms
    this.checkForObstacleClusters(centerX, width);
  }

  spawnPlatformNearGap(gapX, gapWidth) {
    // Spawn platforms near gaps to help players cross them
    // Position multiple platforms for better coverage of large gap clusters

    // Calculate total gap cluster width if multiple gaps
    let totalClusterWidth = gapWidth;
    let clusterStartX = gapX - gapWidth / 2;

    // Check if there are other gaps nearby (within 300 pixels)
    this.gaps.forEach((gap) => {
      const distance = Math.abs(gap.x - gapX);
      if (distance < 300 && distance > 0) {
        // Expand cluster width to include this gap
        const gapEnd = gap.x + gap.width;
        const currentEnd = clusterStartX + totalClusterWidth;
        totalClusterWidth = Math.max(gapEnd - clusterStartX, totalClusterWidth);
      }
    });

    // Determine number of platforms needed based on cluster size
    let numPlatforms;
    if (totalClusterWidth < 150) {
      numPlatforms = 1; // Single gap - one platform
    } else if (totalClusterWidth < 300) {
      numPlatforms = 2; // Two gaps - two platforms
    } else if (totalClusterWidth < 450) {
      numPlatforms = 3; // Three gaps - three platforms
    } else {
      numPlatforms = 4; // Four or more gaps - four platforms
    }

    // Spawn platforms distributed across the gap cluster
    for (let i = 0; i < numPlatforms; i++) {
      // Distribute platforms evenly before and across the gap
      let platformX, platformY, platformWidth;

      if (i === 0) {
        // First platform: before the gap cluster
        platformX = clusterStartX - 100 - Math.random() * 30;
        platformY = this.ground - 80 - Math.random() * 20;
        platformWidth = 100 + Math.random() * 30;
      } else {
        // Subsequent platforms: distributed across the gap
        const spacing = totalClusterWidth / (numPlatforms - 0.5);
        platformX = clusterStartX + spacing * i - 50;
        platformY = this.ground - 90 - Math.random() * 30;
        platformWidth = 90 + Math.random() * 40;
      }

      // Check if there's already a platform too close
      const tooClose = this.movingPlatforms.some(
        (p) => Math.abs(p.x - platformX) < 100
      );

      if (!tooClose) {
        this.movingPlatforms.push({
          x: platformX,
          y: platformY,
          width: platformWidth,
          height: 15,
          velocityY: (Math.random() - 0.5) * 1.5, // Slower movement for stability
          bounceRange: 35,
          strategic: true, // Mark as strategic platform
          dangerType: "gap",
        });
      }
    }
  }

  checkForObstacleClusters(centerX, width) {
    // Check if multiple obstacles are clustered together and spawn strategic platforms
    const clusterDistance = 250; // Distance to consider obstacles as clustered
    const minClusterSize = 2; // Minimum number of obstacles to trigger platform spawning

    // Count dangerous areas within cluster distance
    let nearbyObstacles = 0;
    let clusterCenterX = centerX;
    let totalWidth = width;

    this.dangerousAreas.forEach((area) => {
      const distance = Math.abs(area.x - centerX);
      if (distance <= clusterDistance) {
        nearbyObstacles++;
        // Update cluster center and total width
        clusterCenterX = (clusterCenterX + area.x) / 2;
        totalWidth = Math.max(totalWidth, area.width);
      }
    });

    // Platforms only spawn near gaps, not for obstacle clusters
    // Removed: if (nearbyObstacles >= minClusterSize) {
    //     this.spawnPlatformForObstacleCluster(clusterCenterX, totalWidth);
    // }
  }

  spawnPlatformForObstacleCluster(clusterX, clusterWidth) {
    // Spawn a strategic platform to help navigate through clustered obstacles
    let platformX, platformY, platformWidth;

    // Position platform before the cluster center to give player time to prepare
    platformX = clusterX - clusterWidth / 2 - 60 - Math.random() * 40;
    platformY = this.ground - 90 - Math.random() * 30; // Slightly higher for better visibility
    platformWidth = 100 + Math.random() * 40; // Wider platforms for cluster navigation

    // Check if there's already a platform too close
    const tooClose = this.movingPlatforms.some(
      (p) => Math.abs(p.x - platformX) < 150 // More spacing for cluster platforms
    );

    if (!tooClose) {
      this.movingPlatforms.push({
        x: platformX,
        y: platformY,
        width: platformWidth,
        height: 15,
        velocityY: (Math.random() - 0.5) * 1.5, // Slower movement for stability
        bounceRange: 35,
        strategic: true, // Mark as strategic platform
        dangerType: "cluster", // Different type for cluster assistance
      });
    }
  }

  spawnMonster() {
    // Only spawn one monster if it doesn't exist
    if (!this.monster) {
      // Spawn monster from the left side (behind the player)
      this.monster = {
        x: -100, // Spawn further left (increased gap from 0 to -200)
        y: this.ground - 80,
        width: 100,
        height: 380,
        baseSpeed: 3.0, // Increased from 2.0 to 3.0
        speed: 3.0,
        frame: 0,
        catchDistance: 100, // Increased from 80 to 100
        jumping: false,
        velocityY: 0,
        sliding: false,
        slideTimer: 0,
      };
    }
  }

  generateClouds() {
    for (let i = 0; i < 5; i++) {
      this.clouds.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * 200 + 50,
        width: Math.random() * 60 + 40,
        height: Math.random() * 30 + 20,
        speed: Math.random() * 0.5 + 0.2,
      });
    }
  }

  generateBackgroundTrees() {
    for (let i = 0; i < 8; i++) {
      this.backgroundTrees.push({
        x: Math.random() * this.canvas.width * 2,
        y: this.ground - 80 - Math.random() * 40,
        width: Math.random() * 40 + 60,
        height: Math.random() * 60 + 100,
        depth: Math.random() * 0.5 + 0.3, // For parallax effect
        type: Math.floor(Math.random() * 3), // Different tree types
      });
    }
  }

  updateObstacles() {
    // Update ground obstacles
    this.obstacles = this.obstacles.filter((obstacle) => {
      obstacle.x -= this.gameSpeed;
      return obstacle.x + obstacle.width > 0;
    });

    // Update birds
    this.birds = this.birds.filter((bird) => {
      bird.x -= this.gameSpeed * 1.5; // Move faster towards the left
      bird.frame += 0.3;
      if (bird.frame >= 4) bird.frame = 0;

      // Smooth flapping motion using time and wave offset
      const time = Date.now() * 0.003; // Slower wave motion
      bird.y = bird.initialY + Math.sin(time + bird.waveOffset) * 15; // Wave up and down

      return bird.x + bird.width > 0;
    });

    // Update fire traps
    this.fireTraps = this.fireTraps.filter((trap) => {
      trap.x -= this.gameSpeed;
      trap.timer--;

      // Activate fire trap periodically
      if (trap.timer <= 0) {
        if (trap.type === "boulder") {
          // Boulder falls immediately when spawned
          trap.falling = true;
          trap.velocityY += 0.5; // Gravity
          trap.y += trap.velocityY;
          // Remove boulder after it falls off screen
          if (trap.y > this.canvas.height) {
            return false;
          }
        } else {
          trap.active = !trap.active;
          trap.timer = trap.active ? 60 : 90; // Active for 1s, inactive for 1.5s
        }
      }

      if (trap.active && trap.type !== "boulder") {
        trap.frame += 0.5;
        if (trap.frame >= 8) trap.frame = 0;
      }

      return trap.x + trap.width > 0;
    });
    this.movingPlatforms = this.movingPlatforms.filter((platform) => {
      platform.x -= this.gameSpeed;
      platform.y += platform.velocityY;

      // Bounce within range
      if (platform.y <= this.ground - 150 || platform.y >= this.ground - 60) {
        platform.velocityY *= -1;
      }

      return platform.x + platform.width > 0;
    });

    // Update gaps
    this.gaps = this.gaps.filter((gap) => {
      gap.x -= this.gameSpeed;
      return gap.x + gap.width > 0;
    });

    // Clean up old dangerous areas that have scrolled off screen
    this.dangerousAreas = this.dangerousAreas.filter((area) => {
      return area.x + area.width > -100;
    });

    // Update coins
    this.coins = this.coins.filter((coin) => {
      coin.x -= this.gameSpeed;
      coin.frame += 0.3;
      if (coin.frame >= 8) coin.frame = 0;

      // Coin magnet effect
      if (this.magnetCoins && !coin.collected) {
        const dx =
          this.player.x + this.player.width / 2 - (coin.x + coin.width / 2);
        const dy =
          this.player.y + this.player.height / 2 - (coin.y + coin.height / 2);
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 100) {
          const attraction = 3;
          coin.x += (dx / distance) * attraction;
          coin.y += (dy / distance) * attraction;
        }
      }

      return coin.x + coin.width > 0 && !coin.collected;
    });

    // Update power-ups
    this.powerUps = this.powerUps.filter((powerUp) => {
      powerUp.x -= this.gameSpeed;
      powerUp.frame += 0.2;
      if (powerUp.frame >= 4) powerUp.frame = 0;
      return powerUp.x + powerUp.width > 0 && !powerUp.collected;
    });

    // Update pendulums
    this.pendulums = this.pendulums.filter((pendulum) => {
      pendulum.x -= this.gameSpeed;

      // Update pendulum swing physics
      pendulum.angle += pendulum.speed * pendulum.direction;

      // Reverse direction at maximum swing angles
      if (Math.abs(pendulum.angle) >= pendulum.maxAngle) {
        pendulum.direction *= -1;
      }

      return pendulum.x + pendulum.length + pendulum.axeWidth > 0;
    });

    // Update ropes
    this.ropes = this.ropes.filter((rope) => {
      rope.x -= this.gameSpeed;

      // Swing animation
      rope.swingAngle += rope.swingSpeed;
      if (Math.abs(Math.sin(rope.swingAngle)) >= rope.maxSwing) {
        rope.swingSpeed *= -1; // Reverse swing direction
      }

      return rope.x + rope.width > 0;
    });

    // Update particles
    this.particles = this.particles.filter((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.2; // Gravity
      particle.life--;
      return particle.life > 0;
    });

    // Update power-up timers
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer--;
      if (this.invulnerableTimer === 0) {
        this.invulnerable = false;
        this.shieldHits = 0;
      }
    }

    if (this.magnetTimer > 0) {
      this.magnetTimer--;
      if (this.magnetTimer === 0) {
        this.magnetCoins = false;
      }
    }

    if (this.speedBoostTimer > 0) {
      this.speedBoostTimer--;
      if (this.speedBoostTimer === 0) {
        this.speedBoost = false;
        this.autoDodge = false;
        this.gameSpeed = this.baseGameSpeed;
      }
    }

    if (this.scoreMultiplierTimer > 0) {
      this.scoreMultiplierTimer--;
      if (this.scoreMultiplierTimer === 0) {
        this.scoreMultiplier = false;
      }
    }
  }

  updateMonster() {
    if (!this.monster) return;

    // Monster copies player movements when obstacles come
    // Check for incoming obstacles relative to monster position
    let shouldJump = false;
    let shouldSlide = false;

    // Check gaps/pits - monster must jump over them
    for (let gap of this.gaps) {
      const distanceToMonster = gap.x - this.monster.x;
      // Check if gap is approaching
      if (distanceToMonster > 0 && distanceToMonster < 200) {
        shouldJump = true;
        break;
      }
    }

    // Check ground obstacles
    if (!shouldJump) {
      for (let obstacle of this.obstacles) {
        const distanceToMonster = obstacle.x - this.monster.x;
        if (distanceToMonster > 0 && distanceToMonster < 150) {
          shouldJump = true;
          break;
        }
      }
    }

    // Check fire traps - monster jumps over active ones
    if (!shouldJump) {
      for (let trap of this.fireTraps) {
        const distanceToMonster = trap.x - this.monster.x;
        if (trap.active && distanceToMonster > 0 && distanceToMonster < 150) {
          shouldJump = true;
          break;
        }
      }
    }

    // Check fire traps - monster jumps over active ones
    if (!shouldJump) {
      for (let trap of this.fireTraps) {
        const distanceToMonster = trap.x - this.monster.x;
        if (trap.active && distanceToMonster > 0 && distanceToMonster < 150) {
          shouldJump = true;
          break;
        }
      }
    }

    // Check birds - monster slides under them
    if (!shouldSlide && !shouldJump) {
      for (let bird of this.birds) {
        const distanceToMonster = bird.x - this.monster.x;
        if (distanceToMonster > 0 && distanceToMonster < 150) {
          shouldSlide = true;
          break;
        }
      }
    }

    // Execute jump
    if (shouldJump && !this.monster.jumping) {
      this.monster.velocityY = -12;
      this.monster.jumping = true;
    }

    // Execute slide
    if (shouldSlide && !this.monster.sliding) {
      this.monster.sliding = true;
      this.monster.slideTimer = 20;
    }

    // Handle monster sliding
    if (this.monster.sliding) {
      this.monster.slideTimer--;
      if (this.monster.slideTimer <= 0) {
        this.monster.sliding = false;
      }
    }

    // Handle monster jumping physics
    if (this.monster.jumping) {
      this.monster.velocityY += 0.5; // Gravity
      this.monster.y += this.monster.velocityY;

      // Ground collision
      if (this.monster.y >= this.ground - 80) {
        this.monster.y = this.ground - 80;
        this.monster.velocityY = 0;
        this.monster.jumping = false;
      }
    }

    // Calculate distance to player
    let distanceToPlayer = Math.abs(this.monster.x - this.player.x);

    // Monster gets progressively closer with each obstacle hit
    // Level 2 monsters are more aggressive - they get closer faster
    let hitCount = this.hitTimestamps ? this.hitTimestamps.length : 0;
    let baseDistance = 250; // Start with much more distance (increased from 150)
    let distanceReduction = 50; // Reduce distance by 50 pixels per hit (increased from 40)

    let chaseDistance = Math.max(
      40,
      baseDistance - hitCount * distanceReduction
    ); // Minimum distance increased from 20 to 40
    let isDeadly = hitCount >= 3;

    // Calculate ideal position (behind the player)
    let idealX = this.player.x - chaseDistance;
    let distanceToIdeal = this.monster.x - idealX;

    // Add a dead zone to prevent shaking (only move if significantly off position)
    let deadZone = 10; // pixels of tolerance

    // Move toward player to maintain chase distance
    if (distanceToIdeal > deadZone) {
      // Monster is too far to the right, move left
      this.monster.x -= this.monster.speed;
    } else if (distanceToIdeal < -deadZone) {
      // Monster is too far to the left, move right toward player
      this.monster.x += this.monster.speed;
    }
    // If within dead zone, don't move horizontally (prevents shaking)

    // Keep monster on screen - constrain position
    if (this.monster.x < 50) {
      this.monster.x = 50;
    }
    if (this.monster.x > this.canvas.width - this.monster.width - 50) {
      this.monster.x = this.canvas.width - this.monster.width - 50;
    }

    // Vertical following - only when not jumping
    if (!this.monster.jumping) {
      let verticalDistance = Math.abs(this.monster.y - this.player.y);
      let verticalChaseDistance = Math.max(20, 50 - hitCount * 10); // Increased from 35 to 50 pixels, minimum increased from 10 to 20
      let verticalDeadZone = 5; // Add dead zone for vertical movement too

      if (
        this.monster.y >
          this.player.y + verticalChaseDistance + verticalDeadZone &&
        this.monster.y > this.ground - 80
      ) {
        this.monster.y -= 2;
      } else if (
        this.monster.y <
          this.player.y - verticalChaseDistance - verticalDeadZone &&
        this.monster.y < this.ground - 80
      ) {
        this.monster.y += 2;
      }
    }

    // Monster speed increases progressively with each hit
    let baseSpeedMultiplier = 1.0 + hitCount * 0.8; // Increased from 0.5 to 0.8 per hit
    if (this.slowdownTimer > 0) {
      // Additional speed boost when player is slowed
      this.monster.speed = this.monster.baseSpeed * baseSpeedMultiplier * 1.8; // Increased from 1.5 to 1.8
    } else {
      this.monster.speed = this.monster.baseSpeed * baseSpeedMultiplier;
    }

    // Animation
    this.monster.frame += 0.3;
    if (this.monster.frame >= 4) this.monster.frame = 0;

    // Monster can only catch player after 3 obstacle hits in recent time
    let deadlyHitThreshold = 3;

    let verticalDistance = Math.abs(this.monster.y - this.player.y);
    if (
      distanceToPlayer < this.monster.catchDistance &&
      verticalDistance < 30
    ) {
      // Only catch if player has hit enough obstacles recently (within 10 seconds)
      if (
        this.hitTimestamps &&
        this.hitTimestamps.length >= deadlyHitThreshold
      ) {
        this.gameOver();
      }
      // If less than threshold hits, monster just follows but cannot catch
    }
  }

  updateClouds() {
    this.clouds.forEach((cloud) => {
      cloud.x -= cloud.speed;
      if (cloud.x + cloud.width < 0) {
        cloud.x = this.canvas.width;
        cloud.y = Math.random() * 200 + 50;
      }
    });
  }

  updateBackgroundTrees() {
    this.backgroundTrees.forEach((tree) => {
      tree.x -= this.gameSpeed * tree.depth; // Parallax effect based on depth
      if (tree.x + tree.width < 0) {
        tree.x = this.canvas.width + Math.random() * 200;
        tree.y = this.ground - 80 - Math.random() * 40;
      }
    });
  }

  checkCollisions() {
    // Auto-dodge obstacles during boost
    if (this.autoDodge) {
      // Automatically jump over ground obstacles during boost
      for (let obstacle of this.obstacles) {
        if (
          obstacle.x - this.player.x < 100 &&
          obstacle.x > this.player.x &&
          !this.player.jumping
        ) {
          this.jump();
          break;
        }
      }
      for (let trap of this.fireTraps) {
        if (
          trap.x - this.player.x < 100 &&
          trap.x > this.player.x &&
          trap.active &&
          !this.player.jumping
        ) {
          this.jump();
          break;
        }
      }
      // Auto-slide under birds during boost
      for (let bird of this.birds) {
        if (
          bird.x - this.player.x < 100 &&
          bird.x > this.player.x &&
          !this.player.sliding
        ) {
          this.slide();
          break;
        }
      }
    }

    // Skip damage if invulnerable or auto-dodging
    const canTakeDamage = !this.invulnerable && !this.autoDodge;

    // Check ground obstacle collisions
    if (canTakeDamage) {
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        let obstacle = this.obstacles[i];
        if (this.isColliding(this.player, obstacle)) {
          this.hitObstacle();
          this.obstacles.splice(i, 1);
          return;
        }
      }

      // Check bird collisions
      for (let i = this.birds.length - 1; i >= 0; i--) {
        let bird = this.birds[i];
        if (this.isColliding(this.player, bird)) {
          this.hitObstacle();
          this.birds.splice(i, 1);
          return;
        }
      }

      // Check fire trap collisions (only when active)
      for (let i = this.fireTraps.length - 1; i >= 0; i--) {
        let trap = this.fireTraps[i];
        if (trap.active && this.isColliding(this.player, trap)) {
          this.hitObstacle();
          return; // Don't remove fire trap, it stays
        }
      }

      // Check pendulum collisions
      for (let i = this.pendulums.length - 1; i >= 0; i--) {
        let pendulum = this.pendulums[i];
        // Calculate axe position for collision
        const px = pendulum.x; // Fixed: Remove width/2 since width is not set
        const py = pendulum.y;
        const axeX = px + Math.sin(pendulum.angle) * pendulum.length;
        const axeY = py + Math.cos(pendulum.angle) * pendulum.length;

        // Create axe collision box
        const axeBox = {
          x: axeX - pendulum.axeWidth / 2,
          y: axeY - pendulum.axeHeight / 2,
          width: pendulum.axeWidth,
          height: pendulum.axeHeight,
        };

        if (this.isColliding(this.player, axeBox)) {
          this.hitObstacle();
          return;
        }
      }
    } else if (this.invulnerable && this.shieldHits > 0) {
      // Shield can take one hit
      let hitDetected = false;

      // Check all obstacle types for hits
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        if (this.isColliding(this.player, this.obstacles[i])) {
          this.obstacles.splice(i, 1);
          hitDetected = true;
          break;
        }
      }

      if (!hitDetected) {
        for (let i = this.birds.length - 1; i >= 0; i--) {
          if (this.isColliding(this.player, this.birds[i])) {
            this.birds.splice(i, 1);
            hitDetected = true;
            break;
          }
        }
      }

      if (!hitDetected) {
        for (let i = this.fireTraps.length - 1; i >= 0; i--) {
          if (
            this.fireTraps[i].active &&
            this.isColliding(this.player, this.fireTraps[i])
          ) {
            hitDetected = true;
            break;
          }
        }
      }

      if (!hitDetected) {
        for (let i = this.fireTraps.length - 1; i >= 0; i--) {
          if (
            this.fireTraps[i].active &&
            this.isColliding(this.player, this.fireTraps[i])
          ) {
            hitDetected = true;
            break;
          }
        }
      }

      if (!hitDetected) {
        for (let i = this.pendulums.length - 1; i >= 0; i--) {
          let pendulum = this.pendulums[i];
          // Calculate axe position for collision
          const px = pendulum.x + pendulum.width / 2;
          const py = pendulum.y;
          const axeX = px + Math.sin(pendulum.angle) * pendulum.length;
          const axeY = py + Math.cos(pendulum.angle) * pendulum.length;

          // Create axe collision box
          const axeBox = {
            x: axeX - pendulum.axeWidth / 2,
            y: axeY - pendulum.axeHeight / 2,
            width: pendulum.axeWidth,
            height: pendulum.axeHeight,
          };

          if (this.isColliding(this.player, axeBox)) {
            hitDetected = true;
            break;
          }
        }
      }

      // If shield was hit, remove it
      if (hitDetected) {
        this.shieldHits--;
        if (this.shieldHits <= 0) {
          this.invulnerable = false;
          this.invulnerableTimer = 0;
        }
        // Play shield break sound
        this.playSound(300, 0.2, "square", 0.3);
      }
    }

    // Check gap collisions (always deadly, even with invulnerability)
    for (let gap of this.gaps) {
      if (
        this.player.x + this.player.width > gap.x &&
        this.player.x < gap.x + gap.width &&
        this.player.y + this.player.height >= gap.y
      ) {
        this.gameOver();
        return;
      }
    }

    // Check coin collections
    for (let i = this.coins.length - 1; i >= 0; i--) {
      let coin = this.coins[i];
      if (!coin.collected && this.isColliding(this.player, coin)) {
        coin.collected = true;
        const coinValue = 1; // 1 point per coin (score equals coins collected)
        this.score += coinValue; // Score equals number of coins collected
        this.sessionStats.coinsCollected++; // Track coins collected in session
        this.updateScore(); // Update display and check for difficulty increase
        this.createCoinParticles(
          coin.x + coin.width / 2,
          coin.y + coin.height / 2
        );
        this.playCoinSound();
        this.coins.splice(i, 1);
      }
    }

    // Check power-up collections
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      let powerUp = this.powerUps[i];
      if (!powerUp.collected && this.isColliding(this.player, powerUp)) {
        powerUp.collected = true;
        this.sessionStats.powerupsCollected++; // Track power-ups collected in session
        this.activatePowerUp(powerUp.type);
        this.createPowerUpParticles(
          powerUp.x + powerUp.width / 2,
          powerUp.y + powerUp.height / 2
        );
        this.playPowerUpSound();
        this.powerUps.splice(i, 1);
      }
    }

    // Check moving platform collisions (these don't hurt, they help!)
    for (let platform of this.movingPlatforms) {
      if (
        this.player.velocityY > 0 && // Player is falling
        this.player.x < platform.x + platform.width - 5 &&
        this.player.x + this.player.width - 5 > platform.x &&
        this.player.y + this.player.height > platform.y &&
        this.player.y + this.player.height < platform.y + platform.height + 10
      ) {
        // Land on platform
        this.player.y = platform.y - this.player.height;
        this.player.velocityY = 0;
        this.player.jumping = false;
        this.player.doubleJumpUsed = false;
      }
    }

    // Check rope grab (player must hold space to grab and cross)
    for (let rope of this.ropes) {
      if (
        !this.player.onRope &&
        this.keys["Space"] && // Holding space
        this.player.x + this.player.width > rope.x &&
        this.player.x < rope.x + rope.width &&
        Math.abs(this.player.y - rope.y) < 50
      ) {
        // Near rope height

        // Grab the rope!
        this.player.onRope = true;
        this.player.ropeCrossing = rope;
        this.player.ropeSwing = 0;
        this.player.y = rope.y;
        this.player.velocityY = 0;
        this.player.jumping = false;
        this.playJumpSound(); // Play grab sound
      }
    }
  }

  isColliding(rect1, rect2) {
    return (
      rect1.x < rect2.x + rect2.width - 5 &&
      rect1.x + rect1.width - 5 > rect2.x &&
      rect1.y < rect2.y + rect2.height - 5 &&
      rect1.y + rect1.height - 5 > rect2.y
    );
  }

  isCollidingWithCircle(rect, circle) {
    const distX = Math.abs(rect.x + rect.width / 2 - circle.x);
    const distY = Math.abs(rect.y + rect.height / 2 - circle.y);

    if (distX > rect.width / 2 + circle.radius) return false;
    if (distY > rect.height / 2 + circle.radius) return false;

    if (distX <= rect.width / 2) return true;
    if (distY <= rect.height / 2) return true;

    const dx = distX - rect.width / 2;
    const dy = distY - rect.height / 2;
    return dx * dx + dy * dy <= circle.radius * circle.radius;
  }

  activatePowerUp(type) {
    switch (type) {
      case "shield":
        this.invulnerable = true;
        this.invulnerableTimer = 420; // 7 seconds
        this.shieldHits = 1; // Can take one hit
        break;
      case "magnet":
        this.magnetCoins = true;
        this.magnetTimer = 420; // 7 seconds - pulls in nearby coins
        break;
      case "boost":
        this.speedBoost = true;
        this.speedBoostTimer = 420; // 7 seconds - rockets forward, auto-dodges obstacles
        this.gameSpeed = this.baseGameSpeed * 1.8; // Much faster
        this.autoDodge = true; // Auto-dodge obstacles during boost
        break;
      case "doublecoins":
        this.scoreMultiplier = true;
        this.scoreMultiplierTimer = 420; // 7 seconds - double coins/score
        break;
    }
  }

  createCoinParticles(x, y) {
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8 - 2,
        color: "#FFD700",
        life: 30,
      });
    }
  }

  createPowerUpParticles(x, y) {
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10 - 3,
        color: ["#FF6B6B", "#4ECDC4", "#45B7D1"][Math.floor(Math.random() * 3)],
        life: 40,
      });
    }
  }

  hitObstacle() {
    // Record the hit
    let currentTime = Date.now();
    this.hitTimestamps.push(currentTime);
    this.lastHitTime = currentTime; // Track the time of the last hit
    this.sessionStats.obstaclesHit++; // Track obstacle hits in session

    // Remove old timestamps (older than 10 seconds)
    this.hitTimestamps = this.hitTimestamps.filter(
      (time) => currentTime - time < 10000
    );

    // Slow down the game
    this.gameSpeed = this.baseGameSpeed * 0.6; // Reduced slowdown from 0.5 to 0.6 (less slowdown)
    this.slowdownTimer = 120; // Reduced from 180 to 120 frames (2 seconds instead of 3)

    // After 3 hits, start catching animation
    if (this.hitTimestamps.length >= 3) {
      this.startCatchingAnimation();
      return;
    }

    // Visual feedback
    this.showHitEffect();

    // Play hit sound
    this.playHitSound();
  }

  showHitEffect() {
    // Flash effect (implemented in draw method)
    this.hitFlash = 40; // Flash for about 0.7 seconds
  }

  updateGameSpeed() {
    // Gradually restore speed after hitting obstacle
    if (this.slowdownTimer > 0) {
      this.slowdownTimer--;
      if (this.slowdownTimer === 0) {
        this.gameSpeed = this.baseGameSpeed;
      }
    }
  }

  updateHitTimestamps() {
    let currentTime = Date.now();

    // If 10 seconds have passed since the last hit, reset all hits
    if (this.lastHitTime > 0 && currentTime - this.lastHitTime >= 10000) {
      this.hitTimestamps = [];
      this.lastHitTime = 0;
    }

    // Also remove old timestamps (this was already in hitObstacle, but good to double-check)
    this.hitTimestamps = this.hitTimestamps.filter(
      (time) => currentTime - time < 10000
    );
  }

  startCatchingAnimation() {
    this.gameState = "catching";
    this.catchingAnimation = 0;
    this.catchingPhase = 0;
    this.gameSpeed = 0; // Stop the game
    this.playHitSound();
  }

  updateCatchingAnimation() {
    this.catchingAnimation++;

    // Phase 0: Monster rushes toward player (0-30 frames)
    if (this.catchingPhase === 0) {
      if (this.monster) {
        // Monster quickly moves to player
        let dx = this.player.x - this.monster.x;
        this.monster.x += dx * 0.15; // Fast approach

        // Also match vertical position
        let dy = this.player.y - this.monster.y;
        this.monster.y += dy * 0.15;
      }

      if (this.catchingAnimation > 30) {
        this.catchingPhase = 1;
        this.catchingAnimation = 0;
      }
    }
    // Phase 1: Monster grabs player (30-60 frames)
    else if (this.catchingPhase === 1) {
      // Player struggles - shake animation
      this.player.x += Math.sin(this.catchingAnimation * 0.5) * 3;

      if (this.catchingAnimation > 30) {
        this.catchingPhase = 2;
        this.catchingAnimation = 0;
      }
    }
    // Phase 2: Fade to black and show game over (60-90 frames)
    else if (this.catchingPhase === 2) {
      if (this.catchingAnimation > 30) {
        this.gameOver();
      }
    }
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
    document.getElementById("finalHighScore").textContent = this.highScore;
    document.getElementById("gameOverScreen").classList.remove("hidden");
  }

  

  saveScore() {
    // Skip score saving for guest users (they use sessions instead)
    if (window.gameUser && window.gameUser.isGuest) {
      console.log("Guest user - skipping score save, using session save instead");
      return;
    }

    // Calculate level based on score (every 75 points increases difficulty)
    const level = Math.floor(this.score / 75) + 1;

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
        distance: Math.floor(this.distance)
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
    this.sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
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

    // Prepare session data
    const sessionData = {
      sessionId: this.sessionId,
      durationSeconds: duration,
      finalScore: this.score,
      coinsCollected: this.sessionStats.coinsCollected,
      obstaclesHit: this.sessionStats.obstaclesHit,
      powerupsCollected: this.sessionStats.powerupsCollected,
      distanceTraveled: this.sessionStats.distanceTraveled,
      gameResult: this.sessionStats.gameResult
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

  drawCrouchingPlayer(px, py) {
    // Draw player in crouching/sliding position
    const crouchHeight = 30;

    // Bent legs (tucked under body)
    this.ctx.fillStyle = "#1E3A8A"; // Dark blue pants
    // Left leg bent
    this.ctx.beginPath();
    this.ctx.roundRect(px + 8, py + 15, 10, 12, 3);
    this.ctx.fill();
    // Right leg bent
    this.ctx.beginPath();
    this.ctx.roundRect(px + 20, py + 15, 10, 12, 3);
    this.ctx.fill();

    // Lower legs folded back
    this.ctx.fillStyle = "#1E40AF";
    this.ctx.beginPath();
    this.ctx.roundRect(px + 6, py + 20, 8, 10, 2);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.roundRect(px + 24, py + 20, 8, 10, 2);
    this.ctx.fill();

    // Torso bent forward
    this.ctx.fillStyle = "#3B82F6"; // Blue shirt
    this.ctx.beginPath();
    this.ctx.roundRect(px + 5, py + 8, 28, 18, 4);
    this.ctx.fill();

    // Shirt collar
    this.ctx.fillStyle = "#1E40AF";
    this.ctx.beginPath();
    this.ctx.roundRect(px + 14, py + 8, 10, 3, 2);
    this.ctx.fill();

    // Arms extended forward (sliding motion)
    this.ctx.fillStyle = "#FBBF24"; // Skin tone
    // Left arm
    this.ctx.beginPath();
    this.ctx.roundRect(px + 30, py + 12, 12, 5, 2);
    this.ctx.fill();
    // Right arm (slightly lower)
    this.ctx.beginPath();
    this.ctx.roundRect(px + 30, py + 18, 12, 5, 2);
    this.ctx.fill();

    // Hands
    this.ctx.beginPath();
    this.ctx.arc(px + 43, py + 14, 3, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.arc(px + 43, py + 20, 3, 0, Math.PI * 2);
    this.ctx.fill();

    // Neck (bent down)
    this.ctx.fillStyle = "#FBBF24";
    this.ctx.beginPath();
    this.ctx.roundRect(px + 15, py + 5, 8, 5, 3);
    this.ctx.fill();

    // Head (bent forward and down)
    this.ctx.fillStyle = "#FBBF24"; // Skin tone
    this.ctx.beginPath();
    this.ctx.ellipse(px + 20, py + 3, 9, 8, 0.2, 0, Math.PI * 2);
    this.ctx.fill();

    // Hair
    this.ctx.fillStyle = "#92400E"; // Brown hair
    this.ctx.beginPath();
    this.ctx.ellipse(px + 18, py - 1, 10, 7, 0.2, Math.PI * 0.8, Math.PI * 2.2);
    this.ctx.fill();

    // Hair strands
    this.ctx.strokeStyle = "#7C2D12";
    this.ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(px + 12 + i * 4, py - 3);
      this.ctx.lineTo(px + 13 + i * 4, py + 2);
      this.ctx.stroke();
    }

    // Eye (looking forward)
    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.beginPath();
    this.ctx.ellipse(px + 24, py + 2, 3, 2, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Iris
    this.ctx.fillStyle = "#059669"; // Green eye
    this.ctx.beginPath();
    this.ctx.arc(px + 25, py + 2, 1.5, 0, Math.PI * 2);
    this.ctx.fill();

    // Pupil
    this.ctx.fillStyle = "#000000";
    this.ctx.beginPath();
    this.ctx.arc(px + 25, py + 2, 1, 0, Math.PI * 2);
    this.ctx.fill();

    // Shoes (sliding)
    this.ctx.fillStyle = "#1F2937"; // Dark gray shoes
    this.ctx.beginPath();
    this.ctx.roundRect(px + 4, py + 26, 10, 6, 2);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.roundRect(px + 22, py + 26, 10, 6, 2);
    this.ctx.fill();

    // Shoe soles
    this.ctx.fillStyle = "#000000";
    this.ctx.fillRect(px + 4, py + 30, 10, 2);
    this.ctx.fillRect(px + 22, py + 30, 10, 2);

    // Sliding dust effect
    this.ctx.fillStyle = "rgba(139, 92, 246, 0.4)";
    for (let i = 0; i < 5; i++) {
      this.ctx.beginPath();
      this.ctx.arc(
        px - i * 8 - Math.random() * 10,
        py + crouchHeight + Math.random() * 5,
        2 + Math.random() * 3,
        0,
        Math.PI * 2
      );
      this.ctx.fill();
    }
  }

  drawPlayerOnRope(px, py) {
    // Draw player hanging from rope with swinging motion
    const swing = Math.sin(this.player.ropeSwing) * 5;

    // Arms reaching up holding rope
    this.ctx.fillStyle = "#FBBF24"; // Skin tone
    this.ctx.fillRect(px + 15 + swing, py - 15, 5, 15); // Left arm up
    this.ctx.fillRect(px + 25 + swing, py - 15, 5, 15); // Right arm up

    // Hands gripping rope
    this.ctx.beginPath();
    this.ctx.arc(px + 17 + swing, py - 15, 3, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.arc(px + 27 + swing, py - 15, 3, 0, Math.PI * 2);
    this.ctx.fill();

    // Body hanging
    this.ctx.fillStyle = "#3B82F6"; // Blue shirt
    this.ctx.fillRect(px + 12 + swing, py, 20, 22);

    // Head
    this.ctx.fillStyle = "#FBBF24";
    this.ctx.beginPath();
    this.ctx.arc(px + 22 + swing, py - 5, 10, 0, Math.PI * 2);
    this.ctx.fill();

    // Legs dangling
    this.ctx.fillStyle = "#1E3A8A"; // Pants
    this.ctx.fillRect(px + 15 + swing, py + 22, 6, 18);
    this.ctx.fillRect(px + 24 + swing, py + 22, 6, 18);

    // Shoes
    this.ctx.fillStyle = "#1F2937";
    this.ctx.fillRect(px + 14 + swing, py + 38, 8, 6);
    this.ctx.fillRect(px + 23 + swing, py + 38, 8, 6);
  }

  drawPlayer() {
    const px = this.player.x;
    const py = this.player.y;

    // If on rope, draw hanging animation
    if (this.player.onRope) {
      this.drawPlayerOnRope(px, py);
      return;
    }

    const runCycle = Math.sin(this.player.runFrame * 2) * 2; // Slower running cycle
    const armSwing = Math.sin(this.player.runFrame * 1.8) * 8; // Slower arm swing, reduced magnitude
    const bobbing = this.player.sliding
      ? 0
      : Math.abs(Math.sin(this.player.runFrame * 2)) * 1.5; // No bobbing while sliding

    // Define proper arm and leg cycles for natural movement
    const armCycle1 = Math.sin(this.player.runFrame * 1.8); // Slower arm movement
    const armCycle2 = Math.sin(this.player.runFrame * 1.8 + Math.PI); // Opposite arm
    const legCycle1 = Math.sin(this.player.runFrame * 2); // Slower leg movement
    const legCycle2 = Math.sin(this.player.runFrame * 2 + Math.PI); // Opposite leg

    // Adjust position for bobbing animation
    const adjustedY = py - bobbing;

    // Draw realistic shadow (elliptical)
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    this.ctx.beginPath();
    this.ctx.ellipse(px + 20, this.ground + 2, 16, 4, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // If sliding, draw crouched position
    if (this.player.sliding) {
      this.drawCrouchingPlayer(px, adjustedY);
      return;
    }

    // More realistic leg positioning and animation
    const legSwing1 = legCycle1 * 5; // Slower, less pronounced leg swing
    const legSwing2 = legCycle2 * 5;
    const kneeFlexion1 = Math.max(0, legCycle1 * 2.5); // Slower knee movement
    const kneeFlexion2 = Math.max(0, legCycle2 * 2.5);

    // Upper legs (thighs)
    this.ctx.fillStyle = "#1E3A8A"; // Dark blue pants
    this.ctx.beginPath();
    this.ctx.roundRect(
      px + 12 + legSwing1 / 2,
      adjustedY + 40,
      6,
      15 - kneeFlexion1,
      3
    );
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.roundRect(
      px + 22 + legSwing2 / 2,
      adjustedY + 40,
      6,
      15 - kneeFlexion2,
      3
    );
    this.ctx.fill();

    // Lower legs (shins)
    this.ctx.fillStyle = "#1E40AF"; // Slightly different shade
    this.ctx.beginPath();
    this.ctx.roundRect(
      px + 12 + legSwing1,
      adjustedY + 50 - kneeFlexion1,
      6,
      12 + kneeFlexion1,
      2
    );
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.roundRect(
      px + 22 + legSwing2,
      adjustedY + 50 - kneeFlexion2,
      6,
      12 + kneeFlexion2,
      2
    );
    this.ctx.fill();

    // Realistic torso with slight taper
    this.ctx.fillStyle = "#3B82F6"; // Blue shirt
    this.ctx.beginPath();
    this.ctx.roundRect(px + 10, adjustedY + 20, 20, 22, 4);
    this.ctx.fill();

    // Shirt collar
    this.ctx.fillStyle = "#1E40AF";
    this.ctx.beginPath();
    this.ctx.roundRect(px + 16, adjustedY + 20, 8, 4, 2);
    this.ctx.fill();

    // Upper arms - natural running motion (opposite to legs)
    const armSwing1 = armCycle1 * 8; // Slower, more natural arm swing
    const armSwing2 = armCycle2 * 8;
    const armAngle1 = armCycle1 * 0.25; // Slower, more subtle arm rotation
    const armAngle2 = armCycle2 * 0.25;
    const elbowBend1 = Math.abs(armCycle1) * 2; // Slower, less pronounced elbow flexion
    const elbowBend2 = Math.abs(armCycle2) * 2;

    this.ctx.fillStyle = "#FBBF24"; // More realistic skin tone

    // Left upper arm
    this.ctx.save();
    this.ctx.translate(px + 8, adjustedY + 22);
    this.ctx.rotate(armAngle1);
    this.ctx.fillRect(armSwing1 / 4, 0, 5, 12 - elbowBend1);
    this.ctx.restore();

    // Right upper arm
    this.ctx.save();
    this.ctx.translate(px + 32, adjustedY + 22);
    this.ctx.rotate(armAngle2);
    this.ctx.fillRect(armSwing2 / 4, 0, 5, 12 - elbowBend2);
    this.ctx.restore();

    // Forearms - with natural bend
    this.ctx.fillStyle = "#F59E0B";

    // Left forearm
    this.ctx.save();
    this.ctx.translate(px + 8 + armSwing1 / 3, adjustedY + 30 - elbowBend1);
    this.ctx.rotate(armAngle1 * 1.5);
    this.ctx.fillRect(0, 0, 4, 10 + elbowBend1);
    this.ctx.restore();

    // Right forearm
    this.ctx.save();
    this.ctx.translate(px + 32 + armSwing2 / 3, adjustedY + 30 - elbowBend2);
    this.ctx.rotate(armAngle2 * 1.5);
    this.ctx.fillRect(0, 0, 4, 10 + elbowBend2);
    this.ctx.restore();

    // Hands - positioned naturally at end of forearms
    this.ctx.fillStyle = "#FBBF24";
    this.ctx.beginPath();
    this.ctx.arc(
      px + 9 + armSwing1 / 2,
      adjustedY + 40 + elbowBend1 / 2,
      2.5,
      0,
      Math.PI * 2
    );
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.arc(
      px + 33 + armSwing2 / 2,
      adjustedY + 40 + elbowBend2 / 2,
      2.5,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Neck
    this.ctx.fillStyle = "#FBBF24";
    this.ctx.beginPath();
    this.ctx.roundRect(px + 17, adjustedY + 16, 6, 6, 3);
    this.ctx.fill();

    // Head with side profile proportions
    this.ctx.fillStyle = "#FBBF24"; // Skin tone
    this.ctx.beginPath();
    this.ctx.ellipse(px + 20, adjustedY + 10, 11, 13, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Hair with texture (side profile)
    this.ctx.fillStyle = "#92400E"; // Brown hair
    this.ctx.beginPath();
    this.ctx.ellipse(
      px + 18,
      adjustedY + 4,
      12,
      9,
      0,
      Math.PI * 0.8,
      Math.PI * 2.2
    );
    this.ctx.fill();

    // Hair strands for texture (adjusted for side view)
    this.ctx.strokeStyle = "#7C2D12";
    this.ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(px + 11 + i * 4, adjustedY + 2);
      this.ctx.lineTo(px + 12 + i * 4, adjustedY + 8);
      this.ctx.stroke();
    }

    // Eyebrow (single, facing right)
    this.ctx.fillStyle = "#7C2D12";
    this.ctx.beginPath();
    this.ctx.ellipse(px + 24, adjustedY + 7, 4, 1.5, 0.1, 0, Math.PI * 2);
    this.ctx.fill();

    // Eye (single, side profile)
    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.beginPath();
    this.ctx.ellipse(px + 25, adjustedY + 9, 3.5, 2.5, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Iris (side view)
    this.ctx.fillStyle = "#059669"; // Green eye
    this.ctx.beginPath();
    this.ctx.arc(px + 26, adjustedY + 9, 1.8, 0, Math.PI * 2);
    this.ctx.fill();

    // Pupil
    this.ctx.fillStyle = "#000000";
    this.ctx.beginPath();
    this.ctx.arc(px + 26, adjustedY + 9, 1.2, 0, Math.PI * 2);
    this.ctx.fill();

    // Eye shine/reflection
    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.beginPath();
    this.ctx.arc(px + 26.5, adjustedY + 8.5, 0.6, 0, Math.PI * 2);
    this.ctx.fill();

    // Nose (side profile - more prominent)
    this.ctx.fillStyle = "#F59E0B";
    this.ctx.beginPath();
    this.ctx.moveTo(px + 29, adjustedY + 10);
    this.ctx.lineTo(px + 32, adjustedY + 11);
    this.ctx.lineTo(px + 30, adjustedY + 13);
    this.ctx.lineTo(px + 28, adjustedY + 12);
    this.ctx.closePath();
    this.ctx.fill();

    // Nostril (side view)
    this.ctx.fillStyle = "#D97706";
    this.ctx.beginPath();
    this.ctx.arc(px + 30, adjustedY + 12, 0.8, 0, Math.PI * 2);
    this.ctx.fill();

    // Mouth (side profile)
    this.ctx.fillStyle = "#DC2626";
    this.ctx.beginPath();
    this.ctx.ellipse(px + 28, adjustedY + 15, 2.5, 1.2, 0, 0, Math.PI);
    this.ctx.fill();

    // Lip line (side view)
    this.ctx.strokeStyle = "#B91C1C";
    this.ctx.lineWidth = 0.5;
    this.ctx.beginPath();
    this.ctx.arc(px + 28, adjustedY + 15, 2.5, 0, Math.PI);
    this.ctx.stroke();

    // Ear (visible from side)
    this.ctx.fillStyle = "#FBBF24";
    this.ctx.beginPath();
    this.ctx.ellipse(px + 10, adjustedY + 10, 3, 4, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Inner ear detail
    this.ctx.fillStyle = "#F59E0B";
    this.ctx.beginPath();
    this.ctx.ellipse(px + 11, adjustedY + 10, 1.5, 2, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Athletic shoes with natural foot positioning
    const footAngle1 = legCycle1 * 0.12; // Slower, more subtle foot angle
    const footAngle2 = legCycle2 * 0.12;
    const footLift1 = Math.max(0, -legCycle1 * 2); // Slower foot lift
    const footLift2 = Math.max(0, -legCycle2 * 2);

    this.ctx.fillStyle = "#1F2937"; // Dark gray shoes

    // Left shoe
    this.ctx.save();
    this.ctx.translate(px + 16 + legSwing1, adjustedY + 58 - footLift1);
    this.ctx.rotate(footAngle1);
    this.ctx.fillRect(-6, 0, 12, 7);
    this.ctx.restore();

    // Right shoe
    this.ctx.save();
    this.ctx.translate(px + 24 + legSwing2, adjustedY + 58 - footLift2);
    this.ctx.rotate(footAngle2);
    this.ctx.fillRect(-6, 0, 12, 7);
    this.ctx.restore();

    // Shoe laces
    this.ctx.strokeStyle = "#FFFFFF";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(px + 14 + legSwing1, adjustedY + 60 - footLift1);
    this.ctx.lineTo(px + 18 + legSwing1, adjustedY + 62 - footLift1);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(px + 22 + legSwing2, adjustedY + 60 - footLift2);
    this.ctx.lineTo(px + 26 + legSwing2, adjustedY + 62 - footLift2);
    this.ctx.stroke();

    // Shoe soles with natural positioning
    this.ctx.fillStyle = "#000000";

    // Left sole
    this.ctx.save();
    this.ctx.translate(px + 15 + legSwing1, adjustedY + 64 - footLift1);
    this.ctx.rotate(footAngle1);
    this.ctx.fillRect(-6, 0, 14, 2);
    this.ctx.restore();

    // Right sole
    this.ctx.save();
    this.ctx.translate(px + 23 + legSwing2, adjustedY + 64 - footLift2);
    this.ctx.rotate(footAngle2);
    this.ctx.fillRect(-6, 0, 14, 2);
    this.ctx.restore();

    // Draw shield effect if invulnerable
    if (this.invulnerable) {
      const shieldPulse = 0.8 + Math.sin(Date.now() * 0.01) * 0.2;
      this.ctx.strokeStyle = `rgba(59, 130, 246, ${shieldPulse})`;
      this.ctx.lineWidth = 3;
      this.ctx.setLineDash([5, 5]);
      this.ctx.beginPath();
      this.ctx.ellipse(
        px + this.player.width / 2,
        adjustedY + this.player.height / 2,
        this.player.width / 2 + 10,
        this.player.height / 2 + 10,
        0,
        0,
        Math.PI * 2
      );
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    // Draw speed boost effect - rocket boost visual
    if (this.speedBoost) {
      // Rocket flame trail
      for (let i = 0; i < 5; i++) {
        const flameAlpha = 0.5 - i * 0.1;
        this.ctx.fillStyle = `rgba(239, 68, 68, ${flameAlpha})`; // Red flame
        this.ctx.beginPath();
        this.ctx.arc(
          px - i * 12 - 20,
          adjustedY + this.player.height / 2,
          5 - i,
          0,
          Math.PI * 2
        );
        this.ctx.fill();

        // Orange outer flame
        this.ctx.fillStyle = `rgba(251, 191, 36, ${flameAlpha * 0.7})`;
        this.ctx.beginPath();
        this.ctx.arc(
          px - i * 12 - 20,
          adjustedY + this.player.height / 2,
          7 - i,
          0,
          Math.PI * 2
        );
        this.ctx.fill();
      }

      // Speed lines
      for (let i = 0; i < 4; i++) {
        this.ctx.strokeStyle = `rgba(245, 158, 11, ${0.4 - i * 0.1})`;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(
          px - 30 - i * 10,
          adjustedY + this.player.height / 2 - 10 + i * 5
        );
        this.ctx.lineTo(
          px - 40 - i * 10,
          adjustedY + this.player.height / 2 - 10 + i * 5
        );
        this.ctx.stroke();
      }
    }

    // Draw power-up timer displays
    let timerY = adjustedY - 40;
    const timerSpacing = 25;

    if (this.invulnerable && this.invulnerableTimer > 0) {
      const remainingSeconds = Math.ceil(this.invulnerableTimer / 60);
      this.ctx.fillStyle = "#FFFFFF";
      this.ctx.strokeStyle = "#3B82F6";
      this.ctx.lineWidth = 2;
      this.ctx.font = "bold 14px Arial";
      this.ctx.textAlign = "center";
      this.ctx.strokeText(
        `Shield: ${remainingSeconds}s`,
        px + this.player.width / 2,
        timerY
      );
      this.ctx.fillText(
        `Shield: ${remainingSeconds}s`,
        px + this.player.width / 2,
        timerY
      );
      timerY -= timerSpacing;
    }

    if (this.magnetCoins && this.magnetTimer > 0) {
      const remainingSeconds = Math.ceil(this.magnetTimer / 60);
      this.ctx.fillStyle = "#FFFFFF";
      this.ctx.strokeStyle = "#DC2626";
      this.ctx.lineWidth = 2;
      this.ctx.font = "bold 14px Arial";
      this.ctx.textAlign = "center";
      this.ctx.strokeText(
        `Magnet: ${remainingSeconds}s`,
        px + this.player.width / 2,
        timerY
      );
      this.ctx.fillText(
        `Magnet: ${remainingSeconds}s`,
        px + this.player.width / 2,
        timerY
      );
      timerY -= timerSpacing;
    }

    if (this.speedBoost && this.speedBoostTimer > 0) {
      const remainingSeconds = Math.ceil(this.speedBoostTimer / 60);
      this.ctx.fillStyle = "#FFFFFF";
      this.ctx.strokeStyle = "#F59E0B";
      this.ctx.lineWidth = 2;
      this.ctx.font = "bold 14px Arial";
      this.ctx.textAlign = "center";
      this.ctx.strokeText(
        `Boost: ${remainingSeconds}s`,
        px + this.player.width / 2,
        timerY
      );
      this.ctx.fillText(
        `Boost: ${remainingSeconds}s`,
        px + this.player.width / 2,
        timerY
      );
      timerY -= timerSpacing;
    }

    if (this.scoreMultiplier && this.scoreMultiplierTimer > 0) {
      const remainingSeconds = Math.ceil(this.scoreMultiplierTimer / 60);
      this.ctx.fillStyle = "#FFFFFF";
      this.ctx.strokeStyle = "#FFD700";
      this.ctx.lineWidth = 2;
      this.ctx.font = "bold 14px Arial";
      this.ctx.textAlign = "center";
      this.ctx.strokeText(
        `2x Coins: ${remainingSeconds}s`,
        px + this.player.width / 2,
        timerY
      );
      this.ctx.fillText(
        `2x Coins: ${remainingSeconds}s`,
        px + this.player.width / 2,
        timerY
      );
      timerY -= timerSpacing;
    }
  }

  drawObstacles() {
    // Draw gaps (forest theme)
    // Draw gaps (forest theme - deep pits with roots and darkness)
    this.gaps.forEach((gap) => {
      // Deep shadow/darkness at bottom
      const depthGradient = this.ctx.createLinearGradient(
        gap.x,
        gap.y,
        gap.x,
        gap.y + gap.height
      );
      depthGradient.addColorStop(0, "#0a0a0a");
      depthGradient.addColorStop(0.3, "#050505");
      depthGradient.addColorStop(1, "#000000");

      this.ctx.fillStyle = depthGradient;
      this.ctx.fillRect(gap.x, gap.y, gap.width, gap.height);

      // Layered darkness for depth
      for (let i = 0; i < 5; i++) {
        const layerAlpha = 0.15 * (5 - i);
        this.ctx.fillStyle = `rgba(0, 0, 0, ${layerAlpha})`;
        this.ctx.fillRect(gap.x, gap.y + i * 20, gap.width, 20);
      }

      // Left edge - dirt and roots
      const leftEdgeGrad = this.ctx.createLinearGradient(
        gap.x - 8,
        gap.y - 15,
        gap.x + 5,
        gap.y - 15
      );
      leftEdgeGrad.addColorStop(0, "#6B4423");
      leftEdgeGrad.addColorStop(0.5, "#8B4513");
      leftEdgeGrad.addColorStop(1, "#5C3317");

      this.ctx.fillStyle = leftEdgeGrad;
      this.ctx.fillRect(gap.x - 8, gap.y - 15, 8, 15);

      // Right edge - dirt and roots
      const rightEdgeGrad = this.ctx.createLinearGradient(
        gap.x + gap.width - 5,
        gap.y - 15,
        gap.x + gap.width + 8,
        gap.y - 15
      );
      rightEdgeGrad.addColorStop(0, "#5C3317");
      rightEdgeGrad.addColorStop(0.5, "#8B4513");
      rightEdgeGrad.addColorStop(1, "#6B4423");

      this.ctx.fillStyle = rightEdgeGrad;
      this.ctx.fillRect(gap.x + gap.width, gap.y - 15, 8, 15);

      // Grass overhanging the edges
      this.ctx.fillStyle = "#228B22";
      for (let i = 0; i < gap.width / 10; i++) {
        const grassX = gap.x + i * 10;
        // Left edge grass
        this.ctx.fillRect(gap.x - 5, gap.y - 15 + i * 2, 5, 2);
        this.ctx.fillRect(gap.x - 3, gap.y - 18 + i * 2, 3, 3);
        // Right edge grass
        this.ctx.fillRect(gap.x + gap.width, gap.y - 15 + i * 2, 5, 2);
        this.ctx.fillRect(gap.x + gap.width, gap.y - 18 + i * 2, 3, 3);
      }

      // Exposed roots hanging down
      this.ctx.strokeStyle = "#4A2511";
      this.ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const rootX = gap.x + (gap.width / 8) * i;
        const rootLength = 15 + Math.sin(i * 0.7) * 10;
        const rootWave = Math.sin(i * 1.2) * 5;

        this.ctx.beginPath();
        this.ctx.moveTo(rootX, gap.y - 12);
        this.ctx.quadraticCurveTo(
          rootX + rootWave,
          gap.y - 5,
          rootX + rootWave * 0.5,
          gap.y + rootLength
        );
        this.ctx.stroke();

        // Small root branches
        if (i % 2 === 0) {
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(rootX + rootWave * 0.5, gap.y + rootLength * 0.6);
          this.ctx.lineTo(
            rootX + rootWave * 0.5 - 3,
            gap.y + rootLength * 0.6 + 5
          );
          this.ctx.stroke();
          this.ctx.lineWidth = 2;
        }
      }

      // Rocks and debris on pit walls
      this.ctx.fillStyle = "#696969";
      for (let i = 0; i < 6; i++) {
        const rockX = gap.x + 5 + Math.sin(i * 2.3) * (gap.width - 15);
        const rockY = gap.y + 10 + i * 15;
        const rockSize = 3 + Math.sin(i * 1.8) * 2;

        this.ctx.beginPath();
        this.ctx.arc(rockX, rockY, rockSize, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Misty fog at the bottom
      const fogGradient = this.ctx.createRadialGradient(
        gap.x + gap.width / 2,
        gap.y + gap.height - 30,
        0,
        gap.x + gap.width / 2,
        gap.y + gap.height - 30,
        gap.width
      );
      fogGradient.addColorStop(0, "rgba(200, 200, 220, 0.15)");
      fogGradient.addColorStop(0.5, "rgba(150, 150, 170, 0.1)");
      fogGradient.addColorStop(1, "rgba(100, 100, 120, 0)");

      this.ctx.fillStyle = fogGradient;
      this.ctx.fillRect(gap.x, gap.y + gap.height - 50, gap.width, 50);

      // Cracks in the edge walls
      this.ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      this.ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        this.ctx.beginPath();
        this.ctx.moveTo(gap.x - 6, gap.y - 10 + i * 5);
        this.ctx.lineTo(gap.x - 2, gap.y - 12 + i * 5);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(gap.x + gap.width + 2, gap.y - 10 + i * 5);
        this.ctx.lineTo(gap.x + gap.width + 6, gap.y - 12 + i * 5);
        this.ctx.stroke();
      }
    });
    // Draw ground obstacles (forest theme - rocks/boulders)
    this.obstacles.forEach((obstacle) => {
      // Boulder/rock - irregular natural shape
      this.ctx.fillStyle = "#696969";
      this.ctx.beginPath();
      // Create irregular boulder shape with curves
      this.ctx.moveTo(obstacle.x + 5, obstacle.y + obstacle.height);
      this.ctx.quadraticCurveTo(
        obstacle.x,
        obstacle.y + obstacle.height * 0.7,
        obstacle.x + 8,
        obstacle.y + obstacle.height * 0.4
      );
      this.ctx.quadraticCurveTo(
        obstacle.x + obstacle.width * 0.3,
        obstacle.y + 5,
        obstacle.x + obstacle.width * 0.6,
        obstacle.y + 8
      );
      this.ctx.quadraticCurveTo(
        obstacle.x + obstacle.width - 5,
        obstacle.y + obstacle.height * 0.3,
        obstacle.x + obstacle.width - 3,
        obstacle.y + obstacle.height * 0.7
      );
      this.ctx.quadraticCurveTo(
        obstacle.x + obstacle.width,
        obstacle.y + obstacle.height - 5,
        obstacle.x + obstacle.width - 8,
        obstacle.y + obstacle.height
      );
      this.ctx.closePath();
      this.ctx.fill();

      // Rock texture with irregular highlights
      this.ctx.fillStyle = "#808080";
      this.ctx.beginPath();
      this.ctx.moveTo(obstacle.x + 12, obstacle.y + obstacle.height * 0.8);
      this.ctx.quadraticCurveTo(
        obstacle.x + 8,
        obstacle.y + obstacle.height * 0.5,
        obstacle.x + 15,
        obstacle.y + obstacle.height * 0.3
      );
      this.ctx.quadraticCurveTo(
        obstacle.x + obstacle.width * 0.4,
        obstacle.y + 12,
        obstacle.x + obstacle.width * 0.7,
        obstacle.y + 15
      );
      this.ctx.quadraticCurveTo(
        obstacle.x + obstacle.width - 10,
        obstacle.y + obstacle.height * 0.4,
        obstacle.x + obstacle.width - 12,
        obstacle.y + obstacle.height * 0.8
      );
      this.ctx.closePath();
      this.ctx.fill();

      // Add some darker cracks and shadows
      this.ctx.strokeStyle = "#555555";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(obstacle.x + 10, obstacle.y + obstacle.height * 0.6);
      this.ctx.quadraticCurveTo(
        obstacle.x + obstacle.width * 0.3,
        obstacle.y + obstacle.height * 0.4,
        obstacle.x + obstacle.width * 0.5,
        obstacle.y + obstacle.height * 0.7
      );
      this.ctx.stroke();

      // Moss patches on irregular surfaces
      this.ctx.fillStyle = "#32CD32";
      // Top moss patch
      this.ctx.beginPath();
      this.ctx.arc(
        obstacle.x + obstacle.width * 0.3,
        obstacle.y + obstacle.height * 0.2,
        4,
        0,
        Math.PI * 2
      );
      this.ctx.fill();
      // Bottom moss patch
      this.ctx.beginPath();
      this.ctx.arc(
        obstacle.x + obstacle.width * 0.7,
        obstacle.y + obstacle.height * 0.8,
        3,
        0,
        Math.PI * 2
      );
      this.ctx.fill();
    });

    // Draw fire traps - Glowing ground fire (always visible and glowing)
    // Draw fire traps - Glowing ground fire (always visible and glowing)
    this.fireTraps.forEach((trap) => {
      // Animated flickering - more dramatic
      const time = Date.now() * 0.01;
      const flicker1 = Math.sin(time + trap.x * 0.01) * 0.3 + 0.7;
      const flicker2 = Math.sin(time * 1.3 + trap.x * 0.015) * 0.2 + 0.8;
      const flicker3 = Math.cos(time * 0.7 + trap.x * 0.008) * 0.25 + 0.75;

      // Ground crack/opening where fire emerges
      this.ctx.fillStyle = "#1a0a00";
      this.ctx.beginPath();
      this.ctx.ellipse(
        trap.x + trap.width / 2,
        trap.y + trap.height - 3,
        trap.width / 2 - 3,
        6,
        0,
        0,
        Math.PI * 2
      );
      this.ctx.fill();

      // Multiple flame layers - drawing from back to front
      const centerX = trap.x + trap.width / 2;
      const baseY = trap.y + trap.height;

      // Large background glow
      const bgGlow = this.ctx.createRadialGradient(
        centerX,
        baseY - 10,
        0,
        centerX,
        baseY - 10,
        trap.width * 1.2
      );
      bgGlow.addColorStop(0, `rgba(255, 140, 0, ${0.4 * flicker1})`);
      bgGlow.addColorStop(0.4, `rgba(255, 69, 0, ${0.3 * flicker2})`);
      bgGlow.addColorStop(0.7, `rgba(220, 20, 0, ${0.15 * flicker3})`);
      bgGlow.addColorStop(1, "rgba(0, 0, 0, 0)");

      this.ctx.fillStyle = bgGlow;
      this.ctx.beginPath();
      this.ctx.ellipse(
        centerX,
        baseY - 5,
        trap.width * 0.7,
        trap.height * 1.2,
        0,
        0,
        Math.PI * 2
      );
      this.ctx.fill();

      // Draw multiple flame tongues
      for (let i = 0; i < 5; i++) {
        const offsetX = (i - 2) * (trap.width / 6);
        const flameHeight =
          trap.height * (0.8 + Math.sin(time * 2 + i) * 0.3) * flicker2;
        const flameWidth = trap.width / 8 + Math.sin(time * 1.5 + i * 0.5) * 3;

        // Outer flame (red-orange)
        const flameGrad1 = this.ctx.createLinearGradient(
          centerX + offsetX,
          baseY,
          centerX + offsetX,
          baseY - flameHeight
        );
        flameGrad1.addColorStop(0, `rgba(255, 100, 0, ${0.9 * flicker1})`);
        flameGrad1.addColorStop(0.3, `rgba(255, 140, 0, ${0.8 * flicker2})`);
        flameGrad1.addColorStop(0.6, `rgba(255, 200, 0, ${0.6 * flicker3})`);
        flameGrad1.addColorStop(1, "rgba(255, 100, 0, 0)");

        this.ctx.fillStyle = flameGrad1;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX + offsetX - flameWidth, baseY);
        this.ctx.quadraticCurveTo(
          centerX + offsetX - flameWidth * 0.5,
          baseY - flameHeight * 0.5,
          centerX + offsetX + Math.sin(time * 3 + i) * 5,
          baseY - flameHeight
        );
        this.ctx.quadraticCurveTo(
          centerX + offsetX + flameWidth * 0.5,
          baseY - flameHeight * 0.5,
          centerX + offsetX + flameWidth,
          baseY
        );
        this.ctx.closePath();
        this.ctx.fill();
      }

      // Bright inner core flames
      for (let i = 0; i < 3; i++) {
        const offsetX = (i - 1) * (trap.width / 8);
        const coreHeight =
          trap.height * 0.6 * (0.9 + Math.sin(time * 2.5 + i * 1.2) * 0.2);
        const coreWidth = trap.width / 12;

        const coreGrad = this.ctx.createLinearGradient(
          centerX + offsetX,
          baseY,
          centerX + offsetX,
          baseY - coreHeight
        );
        coreGrad.addColorStop(0, `rgba(255, 255, 200, ${0.95 * flicker3})`);
        coreGrad.addColorStop(0.3, `rgba(255, 240, 100, ${0.85 * flicker1})`);
        coreGrad.addColorStop(0.7, `rgba(255, 180, 0, ${0.6 * flicker2})`);
        coreGrad.addColorStop(1, "rgba(255, 140, 0, 0)");

        this.ctx.fillStyle = coreGrad;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX + offsetX - coreWidth, baseY);
        this.ctx.quadraticCurveTo(
          centerX + offsetX,
          baseY - coreHeight * 0.7,
          centerX + offsetX + Math.sin(time * 4 + i * 2) * 3,
          baseY - coreHeight
        );
        this.ctx.quadraticCurveTo(
          centerX + offsetX,
          baseY - coreHeight * 0.7,
          centerX + offsetX + coreWidth,
          baseY
        );
        this.ctx.closePath();
        this.ctx.fill();
      }

      // Hot white core at base
      const hotCore = this.ctx.createRadialGradient(
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

      this.ctx.fillStyle = hotCore;
      this.ctx.beginPath();
      this.ctx.arc(
        centerX,
        baseY - 5,
        trap.width * 0.15 * flicker3,
        0,
        Math.PI * 2
      );
      this.ctx.fill();

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
        const emberGlow = this.ctx.createRadialGradient(
          emberX,
          emberY,
          0,
          emberX,
          emberY,
          glowRadius
        );
        emberGlow.addColorStop(0, `rgba(255, 200, 100, ${emberAlpha * 0.6})`);
        emberGlow.addColorStop(1, "rgba(255, 100, 0, 0)");
        this.ctx.fillStyle = emberGlow;
        this.ctx.beginPath();
        this.ctx.arc(emberX, emberY, glowRadius, 0, Math.PI * 2);
        this.ctx.fill();

        // Ember core
        this.ctx.fillStyle = `rgba(255, 255, 200, ${emberAlpha})`;
        this.ctx.beginPath();
        this.ctx.arc(emberX, emberY, emberSize, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Ground illumination
      const groundLight = this.ctx.createRadialGradient(
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

      this.ctx.fillStyle = groundLight;
      this.ctx.fillRect(centerX - trap.width, baseY - 2, trap.width * 2, 6);
    });

    // Draw pendulums
    this.pendulums.forEach((pendulum) => {
      const px = pendulum.x; // Fixed: Remove width/2 since width is not set
      const py = pendulum.y;
      const angle = pendulum.angle;

      // Calculate axe position at end of chain
      const axeX = px + Math.sin(angle) * pendulum.length;
      const axeY = py + Math.cos(angle) * pendulum.length;

      // Draw chain/rope segments
      this.ctx.strokeStyle = "#8B4513"; // Brown rope
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(px, py);
      this.ctx.lineTo(axeX, axeY);
      this.ctx.stroke();

      // Draw axe head
      this.ctx.save();
      this.ctx.translate(axeX, axeY);
      this.ctx.rotate(angle + Math.PI / 2); // Rotate to face swing direction

      // Axe handle
      this.ctx.fillStyle = "#8B4513";
      this.ctx.fillRect(-2, -15, 4, 30);

      // Axe blade
      this.ctx.fillStyle = "#C0C0C0"; // Silver blade
      this.ctx.beginPath();
      this.ctx.moveTo(-8, -15);
      this.ctx.lineTo(0, -25);
      this.ctx.lineTo(8, -15);
      this.ctx.closePath();
      this.ctx.fill();

      // Axe blade edge
      this.ctx.strokeStyle = "#808080";
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      this.ctx.restore();
    });

    // Draw birds (forest birds)
    this.birds.forEach((bird) => {
      const bx = bird.x;
      const by = bird.y;
      const wingFlap = Math.sin(bird.frame * 4) * 3;

      // Bird body - blue jay colors
      this.ctx.fillStyle = "#4169E1";
      this.ctx.beginPath();
      this.ctx.ellipse(bx + 17, by + 10, 12, 8, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Bird head
      this.ctx.fillStyle = "#000080";
      this.ctx.beginPath();
      this.ctx.arc(bx + 28, by + 8, 6, 0, Math.PI * 2);
      this.ctx.fill();

      // Beak
      this.ctx.fillStyle = "#FFD700";
      this.ctx.beginPath();
      this.ctx.moveTo(bx + 32, by + 8);
      this.ctx.lineTo(bx + 37, by + 6);
      this.ctx.lineTo(bx + 34, by + 10);
      this.ctx.closePath();
      this.ctx.fill();

      // Wings
      this.ctx.fillStyle = "#000080";
      this.ctx.beginPath();
      this.ctx.ellipse(bx + 10, by + 8 + wingFlap, 8, 4, -0.3, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.ellipse(bx + 24, by + 12 - wingFlap, 8, 4, 0.3, 0, Math.PI * 2);
      this.ctx.fill();

      // Eye
      this.ctx.fillStyle = "#000000";
      this.ctx.beginPath();
      this.ctx.arc(bx + 30, by + 6, 2, 0, Math.PI * 2);
      this.ctx.fill();
    });

    // Draw spikes (forest bushes)
    this.spikes.forEach((spike) => {
      // Forest bushes - natural, organic foliage obstacles
      const centerX = spike.x + spike.width / 2;
      const baseY = spike.y + spike.height;

      // Main bush trunk/stem
      this.ctx.strokeStyle = "#654321"; // Brown trunk
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, baseY);
      this.ctx.bezierCurveTo(
        centerX - 2,
        baseY - 8,
        centerX - 3,
        baseY - 18,
        centerX,
        baseY - 25
      );
      this.ctx.stroke();

      // Main bush body - irregular organic shape using multiple overlapping ellipses
      // Dark green base layer
      this.ctx.fillStyle = "#0F4A0F";
      this.ctx.beginPath();
      this.ctx.ellipse(
        centerX,
        baseY - 15,
        spike.width / 2.8,
        18,
        0,
        0,
        Math.PI * 2
      );
      this.ctx.fill();

      // Medium green middle layer
      this.ctx.fillStyle = "#228B22";
      this.ctx.beginPath();
      this.ctx.ellipse(
        centerX - 4,
        baseY - 20,
        spike.width / 3.2,
        16,
        0,
        0,
        Math.PI * 2
      );
      this.ctx.fill();

      // Light green top layer
      this.ctx.fillStyle = "#32CD32";
      this.ctx.beginPath();
      this.ctx.ellipse(
        centerX + 2,
        baseY - 28,
        spike.width / 3.8,
        14,
        0,
        0,
        Math.PI * 2
      );
      this.ctx.fill();

      // Side branches with leaves
      this.ctx.strokeStyle = "#654321";
      this.ctx.lineWidth = 1.5;

      // Left branch
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - 3, baseY - 12);
      this.ctx.bezierCurveTo(
        centerX - 8,
        baseY - 15,
        centerX - 12,
        baseY - 18,
        centerX - 15,
        baseY - 20
      );
      this.ctx.stroke();

      // Right branch
      this.ctx.beginPath();
      this.ctx.moveTo(centerX + 3, baseY - 10);
      this.ctx.bezierCurveTo(
        centerX + 10,
        baseY - 14,
        centerX + 14,
        baseY - 16,
        centerX + 18,
        baseY - 18
      );
      this.ctx.stroke();

      // Upper branches
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - 2, baseY - 22);
      this.ctx.bezierCurveTo(
        centerX - 6,
        baseY - 26,
        centerX - 10,
        baseY - 28,
        centerX - 12,
        baseY - 32
      );
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(centerX + 4, baseY - 25);
      this.ctx.bezierCurveTo(
        centerX + 8,
        baseY - 28,
        centerX + 12,
        baseY - 30,
        centerX + 16,
        baseY - 34
      );
      this.ctx.stroke();

      // Individual leaves - scattered and irregular
      this.ctx.fillStyle = "#90EE90"; // Light green leaves
      const leaves = [
        { x: centerX - 8, y: baseY - 12, size: 2.5 },
        { x: centerX + 6, y: baseY - 14, size: 3 },
        { x: centerX - 12, y: baseY - 18, size: 2 },
        { x: centerX + 10, y: baseY - 16, size: 2.8 },
        { x: centerX - 4, y: baseY - 24, size: 2.2 },
        { x: centerX + 8, y: baseY - 26, size: 2.5 },
        { x: centerX - 14, y: baseY - 28, size: 1.8 },
        { x: centerX + 12, y: baseY - 30, size: 2.3 },
        { x: centerX, y: baseY - 32, size: 2.7 },
        { x: centerX - 6, y: baseY - 35, size: 2 },
        { x: centerX + 4, y: baseY - 36, size: 1.5 },
        { x: centerX - 10, y: baseY - 38, size: 2.1 },
      ];

      leaves.forEach((leaf) => {
        this.ctx.beginPath();
        this.ctx.ellipse(
          leaf.x,
          leaf.y,
          leaf.size,
          leaf.size * 1.3,
          (leaf.x * 0.1 + leaf.y * 0.05) * 0.5 - 0.25,
          0,
          Math.PI * 2
        );
        this.ctx.fill();
      });

      // Create a deterministic seed based on static spike properties
      const spikeSeed =
        spike.width * 1000 + spike.height * 100 + (spike.y || 0) * 10;

      // Small flowers/berries for variety (deterministic based on spike seed)
      const flowerSeed = Math.sin(spikeSeed * 0.001) * 1000;
      if (Math.abs(flowerSeed) % 1000 > 300) {
        // Deterministic condition
        this.ctx.fillStyle = "#FFB6C1"; // Light pink flowers
        this.ctx.beginPath();
        this.ctx.arc(centerX - 5, baseY - 28, 1.5, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.fillStyle = "#FF69B4"; // Hot pink centers
        this.ctx.beginPath();
        this.ctx.arc(centerX - 5, baseY - 28, 0.5, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Small berry clusters (deterministic based on spike seed)
      const berrySeed = Math.sin(spikeSeed * 0.0015) * 1000;
      if (Math.abs(berrySeed) % 1000 > 500) {
        // Deterministic condition
        this.ctx.fillStyle = "#8B0000"; // Dark red berries
        for (let i = 0; i < 3; i++) {
          this.ctx.beginPath();
          this.ctx.arc(centerX + 8 + i * 2, baseY - 22 - i, 1, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }

      // Highlight leaves (bright green tips)
      this.ctx.fillStyle = "#ADFF2F"; // Green yellow highlights
      const highlights = [
        { x: centerX - 6, y: baseY - 16 },
        { x: centerX + 7, y: baseY - 20 },
        { x: centerX - 9, y: baseY - 30 },
        { x: centerX + 11, y: baseY - 32 },
      ];

      highlights.forEach((highlight) => {
        this.ctx.beginPath();
        this.ctx.arc(highlight.x, highlight.y, 1, 0, Math.PI * 2);
        this.ctx.fill();
      });

      // Smaller surrounding bushes with variation
      for (let i = 0; i < 4; i++) {
        const offsetX =
          (i - 1.5) * 10 + Math.sin(i * 0.7 + spikeSeed * 0.0001) * 3;
        const bushHeight = 10 + Math.sin(i * 0.8 + spikeSeed * 0.00005) * 4;
        const bushWidth = 8 + Math.sin(i * 1.2 + spikeSeed * 0.00008) * 3;

        // Vary the green shades for each small bush
        const greenShades = ["#228B22", "#32CD32", "#006400", "#2E8B57"];
        this.ctx.fillStyle = greenShades[i % greenShades.length];

        // Small bush body with slight rotation for natural look
        this.ctx.save();
        this.ctx.translate(centerX + offsetX, baseY - bushHeight / 2);
        this.ctx.rotate(Math.sin(i * 0.5 + spikeSeed * 0.0002) * 0.2);
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, bushWidth, bushHeight, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();

        // Small leaves on surrounding bushes
        this.ctx.fillStyle = "#90EE90";
        for (let j = 0; j < 3; j++) {
          const leafAngle = (j * Math.PI * 2) / 3 + i * 0.3;
          const leafRadius = 4 + Math.sin(j * 0.8 + spikeSeed * 0.0001) * 2;
          const leafX = centerX + offsetX + Math.cos(leafAngle) * leafRadius;
          const leafY =
            baseY - bushHeight / 2 + Math.sin(leafAngle) * leafRadius;
          this.ctx.beginPath();
          this.ctx.arc(leafX, leafY, 1.2, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
    });

    // Draw moving platforms (forest theme)
    this.movingPlatforms.forEach((platform) => {
      // Platform shadow
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      this.ctx.fillRect(
        platform.x + 2,
        platform.y + 2,
        platform.width,
        platform.height
      );

      // Highlight strategic platforms with a glow effect
      if (platform.strategic) {
        const pulseAlpha = 0.3 + Math.sin(Date.now() * 0.005) * 0.15;
        this.ctx.shadowColor = "#4169E1";
        this.ctx.shadowBlur = 15;

        // Helper indicator line showing the danger below
        this.ctx.strokeStyle = `rgba(65, 105, 225, ${pulseAlpha})`;
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(
          platform.x + platform.width / 2,
          platform.y + platform.height
        );
        this.ctx.lineTo(platform.x + platform.width / 2, this.ground);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }

      // Log platform
      this.ctx.fillStyle = platform.strategic ? "#A0522D" : "#8B4513"; // Lighter brown for strategic
      this.ctx.fillRect(
        platform.x,
        platform.y,
        platform.width,
        platform.height
      );

      // Reset shadow
      this.ctx.shadowBlur = 0;

      // Log rings
      this.ctx.strokeStyle = "#654321";
      this.ctx.lineWidth = 1;
      for (let i = 0; i < platform.width; i += 10) {
        this.ctx.beginPath();
        this.ctx.arc(
          platform.x + i + 5,
          platform.y + platform.height / 2,
          3,
          0,
          Math.PI * 2
        );
        this.ctx.stroke();
      }

      // Moss on log - with special color for strategic platforms
      this.ctx.fillStyle = platform.strategic ? "#00FF00" : "#32CD32"; // Brighter green for strategic
      this.ctx.fillRect(platform.x, platform.y, platform.width, 3);

      // Add help icon for strategic platforms
      if (platform.strategic) {
        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.font = "bold 12px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText("!", platform.x + platform.width / 2, platform.y - 5);
      }
    });

    // Draw coins
    this.coins.forEach((coin) => {
      const rotation = coin.frame * 0.3;
      const cx = coin.x + coin.width / 2;
      const cy = coin.y + coin.height / 2;

      this.ctx.save();
      this.ctx.translate(cx, cy);
      this.ctx.rotate(rotation);

      // Coin shadow
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      this.ctx.beginPath();
      this.ctx.arc(1, 1, 8, 0, Math.PI * 2);
      this.ctx.fill();

      // Coin body (gold)
      this.ctx.fillStyle = "#FFD700";
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 8, 0, Math.PI * 2);
      this.ctx.fill();

      // Coin edge (darker gold)
      this.ctx.strokeStyle = "#B8860B";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 8, 0, Math.PI * 2);
      this.ctx.stroke();

      // Coin shine/highlight
      this.ctx.fillStyle = "#FFF8DC";
      this.ctx.beginPath();
      this.ctx.arc(-2, -2, 3, 0, Math.PI * 2);
      this.ctx.fill();

      // Coin inner details (like a dollar sign or just a simple pattern)
      this.ctx.fillStyle = "#B8860B";
      this.ctx.font = "bold 10px Arial";
      this.ctx.textAlign = "center";
      this.ctx.fillText("$", 0, 3);

      this.ctx.restore();
    });

    // Draw power-ups (forest-themed)
    this.powerUps.forEach((powerUp) => {
      const pulsation = 1 + Math.sin(powerUp.frame * 2) * 0.1;
      const px = powerUp.x + powerUp.width / 2;
      const py = powerUp.y + powerUp.height / 2;

      this.ctx.save();
      this.ctx.translate(px, py);
      this.ctx.scale(pulsation, pulsation);

      switch (powerUp.type) {
        case "shield":
          // Shield icon - protective barrier
          this.ctx.fillStyle = "#3B82F6";
          this.ctx.beginPath();
          this.ctx.moveTo(0, -15); // Scaled up from -10
          this.ctx.lineTo(-12, -9); // Scaled up from -8, -6
          this.ctx.lineTo(-12, 6); // Scaled up from -8, 4
          this.ctx.lineTo(0, 15); // Scaled up from 0, 10
          this.ctx.lineTo(12, 6); // Scaled up from 8, 4
          this.ctx.lineTo(12, -9); // Scaled up from 8, -6
          this.ctx.closePath();
          this.ctx.fill();

          this.ctx.strokeStyle = "#60A5FA";
          this.ctx.lineWidth = 3; // Increased from 2
          this.ctx.stroke();

          // Shield cross
          this.ctx.strokeStyle = "#FFFFFF";
          this.ctx.lineWidth = 2; // Increased from 1.5
          this.ctx.beginPath();
          this.ctx.moveTo(-7, 0); // Scaled up from -5
          this.ctx.lineTo(7, 0); // Scaled up from 5
          this.ctx.moveTo(0, -7); // Scaled up from -5
          this.ctx.lineTo(0, 7); // Scaled up from 5
          this.ctx.stroke();
          break;

        case "magnet":
          // Magnet - U shape
          this.ctx.strokeStyle = "#DC2626";
          this.ctx.lineWidth = 6;
          this.ctx.beginPath();
          // Draw U shape: straight sides with curved bottom
          this.ctx.moveTo(-12, -12); // Start at top-left
          this.ctx.lineTo(-12, 6); // Left side down
          this.ctx.quadraticCurveTo(-12, 12, 0, 12); // Bottom curve left to center
          this.ctx.quadraticCurveTo(12, 12, 12, 6); // Bottom curve center to right
          this.ctx.lineTo(12, -12); // Right side up
          this.ctx.stroke();

          // Magnet poles at the bottom ends of the U
          this.ctx.fillStyle = "#DC2626";
          this.ctx.beginPath();
          this.ctx.arc(-12, 6, 3, 0, Math.PI * 2); // Left pole (north)
          this.ctx.fill();
          this.ctx.beginPath();
          this.ctx.arc(12, 6, 3, 0, Math.PI * 2); // Right pole (south)
          this.ctx.fill();

          // Plus/minus symbols on poles
          this.ctx.fillStyle = "#FFFFFF";
          this.ctx.font = "bold 10px Arial";
          this.ctx.textAlign = "center";
          this.ctx.fillText("+", -12, 10); // North pole
          this.ctx.fillText("-", 12, 10); // South pole
          break;

        case "boost":
          // Rocket boost - speed lines and flame
          this.ctx.fillStyle = "#F59E0B";
          this.ctx.beginPath();
          this.ctx.moveTo(-15, 0); // Scaled up from -10
          this.ctx.lineTo(15, -9); // Scaled up from 10, -6
          this.ctx.lineTo(15, 9); // Scaled up from 10, 6
          this.ctx.closePath();
          this.ctx.fill();

          // Flame trail
          this.ctx.fillStyle = "#EF4444";
          this.ctx.beginPath();
          this.ctx.moveTo(-15, 0); // Scaled up from -10
          this.ctx.lineTo(-24, -4); // Scaled up from -16, -3
          this.ctx.lineTo(-21, 0); // Scaled up from -14
          this.ctx.lineTo(-24, 4); // Scaled up from -16, 3
          this.ctx.closePath();
          this.ctx.fill();

          // Speed lines
          this.ctx.strokeStyle = "#FBBF24";
          this.ctx.lineWidth = 3; // Increased from 2
          this.ctx.beginPath();
          this.ctx.moveTo(8, 0); // Scaled up from 5
          this.ctx.lineTo(18, 0); // Scaled up from 12
          this.ctx.stroke();
          break;

        case "doublecoins":
          // Double coins icon - two overlapping coins with 2x
          this.ctx.fillStyle = "#FFD700";
          this.ctx.beginPath();
          this.ctx.arc(-4, -3, 9, 0, Math.PI * 2); // Scaled up from -3, -2, 6
          this.ctx.fill();
          this.ctx.beginPath();
          this.ctx.arc(4, 3, 9, 0, Math.PI * 2); // Scaled up from 3, 2, 6
          this.ctx.fill();

          this.ctx.strokeStyle = "#B8860B";
          this.ctx.lineWidth = 1.5; // Increased from 1
          this.ctx.beginPath();
          this.ctx.arc(-4, -3, 9, 0, Math.PI * 2); // Scaled up
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.arc(4, 3, 9, 0, Math.PI * 2); // Scaled up
          this.ctx.stroke();

          // 2x text
          this.ctx.fillStyle = "#FFFFFF";
          this.ctx.font = "bold 12px Arial"; // Increased from 8px
          this.ctx.textAlign = "center";
          this.ctx.fillText("2x", 0, 2); // Adjusted from 0, 1
          break;
      }

      this.ctx.restore();
    });

    // Draw ropes (vine/rope bridges over gaps)
    this.ropes.forEach((rope) => {
      const swingOffset = Math.sin(rope.swingAngle) * 15; // Rope sway

      // Draw attachment posts from GROUND up
      // Left post
      this.ctx.fillStyle = "#654321"; // Brown wood
      this.ctx.fillRect(
        rope.x - 5,
        rope.y - 20,
        10,
        this.ground - (rope.y - 20)
      ); // From rope to ground

      // Left post leaves/foliage at top
      this.ctx.fillStyle = "#228B22";
      this.ctx.beginPath();
      this.ctx.arc(rope.x, rope.y - 20, 12, 0, Math.PI * 2);
      this.ctx.fill();

      // Right post
      this.ctx.fillStyle = "#654321";
      this.ctx.fillRect(
        rope.x + rope.width - 5,
        rope.y - 20,
        10,
        this.ground - (rope.y - 20)
      ); // From rope to ground

      // Right post leaves/foliage at top
      this.ctx.fillStyle = "#228B22";
      this.ctx.beginPath();
      this.ctx.arc(rope.x + rope.width, rope.y - 20, 12, 0, Math.PI * 2);
      this.ctx.fill();

      // Draw rope/vine line (swings between posts)
      this.ctx.strokeStyle = "#8B4513"; // Brown rope
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.moveTo(rope.x, rope.y - 20); // Attach to left post top
      this.ctx.quadraticCurveTo(
        rope.x + rope.width / 2,
        rope.y + swingOffset,
        rope.x + rope.width,
        rope.y - 20
      ); // Attach to right post top
      this.ctx.stroke();

      // Draw rope texture (twisted strands)
      this.ctx.strokeStyle = "#654321";
      this.ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const segmentX = rope.x + (rope.width / 5) * i;
        const segmentY = rope.y + Math.sin(rope.swingAngle + i * 0.5) * 12;
        this.ctx.beginPath();
        this.ctx.moveTo(segmentX, segmentY - 5);
        this.ctx.lineTo(
          segmentX + rope.width / 5,
          rope.y + Math.sin(rope.swingAngle + (i + 1) * 0.5) * 12 - 5
        );
        this.ctx.stroke();
      }

      // Draw "HOLD SPACE" indicator if player is near
      if (
        this.player.x + this.player.width > rope.x - 50 &&
        this.player.x < rope.x + 50 &&
        !this.player.onRope
      ) {
        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.strokeStyle = "#000000";
        this.ctx.lineWidth = 3;
        this.ctx.font = "bold 16px Arial";
        this.ctx.textAlign = "center";
        this.ctx.strokeText("HOLD SPACE", rope.x + rope.width / 2, rope.y - 50);
        this.ctx.fillText("HOLD SPACE", rope.x + rope.width / 2, rope.y - 50);
      }
    });

    // Draw particles
    this.particles.forEach((particle) => {
      const alpha = particle.life / 40;
      this.ctx.fillStyle =
        particle.color +
        Math.floor(alpha * 255)
          .toString(16)
          .padStart(2, "0");
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  drawMonster() {
    if (!this.monster) return;

    let monster = this.monster;
    let isDeadly = this.hitTimestamps && this.hitTimestamps.length >= 3;
    const mx = monster.x;
    const my = monster.y;
    const bounce = Math.sin(monster.frame * 1.5) * 6;
    const breathe = Math.sin(monster.frame * 0.8) * 3;

    // Draw monster shadow (bigger)
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    this.ctx.fillRect(mx - 4, this.ground - 3, monster.width + 8, 6);

    // Monster body - always use level 1 appearance
    // Temple monster - red/dark
    if (isDeadly) {
      this.ctx.fillStyle = this.slowdownTimer > 0 ? "#1A0000" : "#2D1B1B";
    } else {
      this.ctx.fillStyle = this.slowdownTimer > 0 ? "#4A1515" : "#7F2020";
    }

    // Main body (irregular shape) - scaled proportionally
    this.ctx.beginPath();
    this.ctx.moveTo(mx + 8, my + 25 + bounce);
    this.ctx.lineTo(mx + 52, my + 25 + bounce);
    this.ctx.lineTo(mx + 55, my + 55 + bounce);
    this.ctx.lineTo(mx + 48, my + 72 + bounce);
    this.ctx.lineTo(mx + 12, my + 72 + bounce);
    this.ctx.lineTo(mx + 5, my + 55 + bounce);
    this.ctx.closePath();
    this.ctx.fill();

    // Monster head (larger and more menacing) - always use level 1 appearance
    if (isDeadly) {
      this.ctx.fillStyle = this.slowdownTimer > 0 ? "#000000" : "#1A0A0A";
    } else {
      this.ctx.fillStyle = this.slowdownTimer > 0 ? "#2D0000" : "#450A0A";
    }

    // Head shape (skull-like side profile) - scaled up
    this.ctx.beginPath();
    this.ctx.ellipse(
      mx + 32,
      my + 13 + bounce + breathe,
      28,
      19,
      0,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Monster horns/spikes (facing right) - always use level 1 appearance
    this.ctx.fillStyle = isDeadly ? "#800000" : "#600000";
    this.ctx.beginPath();
    this.ctx.moveTo(mx + 20, my + 3 + bounce);
    this.ctx.lineTo(mx + 24, my - 8 + bounce);
    this.ctx.lineTo(mx + 30, my + 5 + bounce);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.moveTo(mx + 35, my + 2 + bounce);
    this.ctx.lineTo(mx + 42, my - 6 + bounce);
    this.ctx.lineTo(mx + 48, my + 4 + bounce);
    this.ctx.closePath();
    this.ctx.fill();

    // Snout/muzzle (side profile)
    this.ctx.fillStyle = isDeadly ? "#1A0505" : "#3D0A0A";
    this.ctx.beginPath();
    this.ctx.ellipse(
      mx + 50,
      my + 18 + bounce + breathe,
      12,
      8,
      0,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Monster arms/claws - always use level 1 appearance
    this.ctx.fillStyle = isDeadly ? "#2D0505" : "#4A1010";
    const armSwing = Math.sin(monster.frame * 1.2) * 5;

    // Left arm
    this.ctx.beginPath();
    this.ctx.roundRect(mx + 3 + armSwing, my + 30 + bounce, 14, 32, 3);
    this.ctx.fill();

    // Right arm
    this.ctx.beginPath();
    this.ctx.roundRect(mx + 43 - armSwing, my + 30 + bounce, 14, 32, 3);
    this.ctx.fill();

    // Claws - bigger and more menacing
    this.ctx.fillStyle = "#CCCCCC";
    this.ctx.fillRect(mx + 1 + armSwing, my + 58 + bounce, 5, 10);
    this.ctx.fillRect(mx + 7 + armSwing, my + 61 + bounce, 5, 7);
    this.ctx.fillRect(mx + 13 + armSwing, my + 59 + bounce, 5, 9);
    this.ctx.fillRect(mx + 50 - armSwing, my + 58 + bounce, 5, 10);
    this.ctx.fillRect(mx + 44 - armSwing, my + 61 + bounce, 5, 7);
    this.ctx.fillRect(mx + 38 - armSwing, my + 59 + bounce, 5, 9);

    // Monster legs - always use level 1 appearance
    this.ctx.fillStyle = isDeadly ? "#1A0505" : "#3D0A0A";
    this.ctx.beginPath();
    this.ctx.roundRect(mx + 14, my + 67 + bounce, 13, 24, 3);
    this.ctx.fill();
    this.ctx.beginPath();
    this.ctx.roundRect(mx + 33, my + 67 + bounce, 13, 24, 3);
    this.ctx.fill();

    // Eye - always use level 1 appearance
    if (isDeadly) {
      // Deadly monster - bright glowing red eye
      this.ctx.fillStyle = "#FF0000";
      this.ctx.shadowColor = "#FF0000";
      this.ctx.shadowBlur = 15;
    } else {
      // Normal monster - yellow/orange eye
      this.ctx.fillStyle = this.slowdownTimer > 0 ? "#FFD700" : "#FFA500";
      this.ctx.shadowColor = this.slowdownTimer > 0 ? "#FFD700" : "#FFA500";
      this.ctx.shadowBlur = 8;
    }

    // Single visible eye (side profile) - bigger and more menacing
    this.ctx.beginPath();
    this.ctx.arc(mx + 42, my + 10 + bounce + breathe, 8, 0, Math.PI * 2);
    this.ctx.fill();

    // Eye pupil - bigger, slit-like for more menacing look
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = "#000000";
    this.ctx.beginPath();
    this.ctx.ellipse(
      mx + 42,
      my + 10 + bounce + breathe,
      2,
      4,
      0,
      0,
      Math.PI * 2
    );
    this.ctx.fill();

    // Eye reflection
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    this.ctx.beginPath();
    this.ctx.arc(mx + 43, my + 8 + bounce + breathe, 1.5, 0, Math.PI * 2);
    this.ctx.fill();

    // Mouth/teeth - side profile, bigger and more menacing
    this.ctx.fillStyle = "#000000";
    this.ctx.beginPath();
    this.ctx.ellipse(mx + 50, my + 20 + bounce + breathe, 8, 4, 0, 0, Math.PI);
    this.ctx.fill();

    // Teeth - protruding from side profile
    this.ctx.fillStyle = "#FFFFFF";
    for (let i = 0; i < 4; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(mx + 44 + i * 4, my + 20 + bounce + breathe);
      this.ctx.lineTo(mx + 47 + i * 4, my + 14 + bounce + breathe);
      this.ctx.lineTo(mx + 46 + i * 4, my + 20 + bounce + breathe);
      this.ctx.closePath();
      this.ctx.fill();
    }

    // Large protruding fang
    this.ctx.beginPath();
    this.ctx.moveTo(mx + 52, my + 20 + bounce + breathe);
    this.ctx.lineTo(mx + 58, my + 12 + bounce + breathe);
    this.ctx.lineTo(mx + 54, my + 20 + bounce + breathe);
    this.ctx.closePath();
    this.ctx.fill();

    // Draw danger indicator when close
    let distanceToPlayer = Math.abs(monster.x - this.player.x);
    if (distanceToPlayer < 120) {
      if (isDeadly) {
        // Deadly monster - bright red pulsing line
        this.ctx.strokeStyle = "#FF0000";
        this.ctx.lineWidth = 4;
        this.ctx.setLineDash([6, 2]);
        this.ctx.shadowColor = "#FF0000";
        this.ctx.shadowBlur = 6;
      } else {
        // Normal chasing - less threatening yellow/orange line
        this.ctx.strokeStyle = this.slowdownTimer > 0 ? "#FFA500" : "#FFD700";
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([12, 8]);
        this.ctx.shadowBlur = 2;
      }
      this.ctx.beginPath();
      this.ctx.moveTo(monster.x + monster.width / 2, monster.y + 10);
      this.ctx.lineTo(
        this.player.x + this.player.width / 2,
        this.player.y + 10
      );
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.shadowBlur = 0;
    }

    // Visual indicators for monster actions
    if (monster.sliding) {
      // Sliding dust effect
      this.ctx.fillStyle = "rgba(220, 20, 60, 0.5)";
      for (let i = 0; i < 5; i++) {
        this.ctx.beginPath();
        this.ctx.arc(
          mx - i * 8 - Math.random() * 10,
          this.ground - 5 + Math.random() * 5,
          2 + Math.random() * 3,
          0,
          Math.PI * 2
        );
        this.ctx.fill();
      }
    }

    if (monster.jumping) {
      // Jump trail effect
      this.ctx.fillStyle = "rgba(139, 0, 0, 0.3)";
      for (let i = 0; i < 3; i++) {
        this.ctx.beginPath();
        this.ctx.arc(
          mx + monster.width / 2,
          my + monster.height / 2 + i * 15,
          4 - i,
          0,
          Math.PI * 2
        );
        this.ctx.fill();
      }
    }
  }

  drawClouds() {
    this.clouds.forEach((cloud) => {
      this.ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      this.ctx.fillRect(cloud.x, cloud.y, cloud.width, cloud.height);
      this.ctx.fillRect(
        cloud.x + 10,
        cloud.y - 10,
        cloud.width - 20,
        cloud.height
      );
      this.ctx.fillRect(
        cloud.x + 15,
        cloud.y + 10,
        cloud.width - 30,
        cloud.height - 10
      );
    });
  }

  drawBackgroundTrees() {
    this.backgroundTrees.forEach((tree) => {
      const alpha = tree.depth * 0.8 + 0.2; // Closer trees are more opaque
      const tx = tree.x;
      const ty = tree.y;

      // Tree trunk
      this.ctx.fillStyle = `rgba(101, 67, 33, ${alpha})`;
      this.ctx.fillRect(
        tx + tree.width * 0.4,
        ty + tree.height * 0.6,
        tree.width * 0.2,
        tree.height * 0.4
      );

      // Tree foliage based on type
      switch (tree.type) {
        case 0: // Pine tree
          this.ctx.fillStyle = `rgba(34, 139, 34, ${alpha})`;
          this.ctx.beginPath();
          this.ctx.moveTo(tx + tree.width * 0.5, ty);
          this.ctx.lineTo(tx + tree.width * 0.2, ty + tree.height * 0.4);
          this.ctx.lineTo(tx + tree.width * 0.8, ty + tree.height * 0.4);
          this.ctx.closePath();
          this.ctx.fill();

          this.ctx.beginPath();
          this.ctx.moveTo(tx + tree.width * 0.5, ty + tree.height * 0.2);
          this.ctx.lineTo(tx + tree.width * 0.15, ty + tree.height * 0.6);
          this.ctx.lineTo(tx + tree.width * 0.85, ty + tree.height * 0.6);
          this.ctx.closePath();
          this.ctx.fill();

          this.ctx.beginPath();
          this.ctx.moveTo(tx + tree.width * 0.5, ty + tree.height * 0.4);
          this.ctx.lineTo(tx + tree.width * 0.1, ty + tree.height * 0.8);
          this.ctx.lineTo(tx + tree.width * 0.9, ty + tree.height * 0.8);
          this.ctx.closePath();
          this.ctx.fill();
          break;

        case 1: // Round tree
          this.ctx.fillStyle = `rgba(34, 139, 34, ${alpha})`;
          this.ctx.beginPath();
          this.ctx.arc(
            tx + tree.width * 0.5,
            ty + tree.height * 0.3,
            tree.width * 0.4,
            0,
            Math.PI * 2
          );
          this.ctx.fill();

          this.ctx.beginPath();
          this.ctx.arc(
            tx + tree.width * 0.3,
            ty + tree.height * 0.5,
            tree.width * 0.35,
            0,
            Math.PI * 2
          );
          this.ctx.fill();

          this.ctx.beginPath();
          this.ctx.arc(
            tx + tree.width * 0.7,
            ty + tree.height * 0.5,
            tree.width * 0.35,
            0,
            Math.PI * 2
          );
          this.ctx.fill();
          break;

        case 2: // Tall tree
          this.ctx.fillStyle = `rgba(34, 139, 34, ${alpha})`;
          this.ctx.beginPath();
          this.ctx.ellipse(
            tx + tree.width * 0.5,
            ty + tree.height * 0.2,
            tree.width * 0.4,
            tree.height * 0.3,
            0,
            0,
            Math.PI * 2
          );
          this.ctx.fill();

          this.ctx.beginPath();
          this.ctx.ellipse(
            tx + tree.width * 0.5,
            ty + tree.height * 0.4,
            tree.width * 0.35,
            tree.height * 0.25,
            0,
            0,
            Math.PI * 2
          );
          this.ctx.fill();

          this.ctx.beginPath();
          this.ctx.ellipse(
            tx + tree.width * 0.5,
            ty + tree.height * 0.6,
            tree.width * 0.3,
            tree.height * 0.2,
            0,
            0,
            Math.PI * 2
          );
          this.ctx.fill();
          break;
      }
    });
  }

  

  drawGround() {
    // Forest ground - green with leaf litter
    this.ctx.fillStyle = "#228B22";
    this.ctx.fillRect(
      0,
      this.ground,
      this.canvas.width,
      this.canvas.height - this.ground
    );

    // Ground pattern - forest floor with leaves and dirt patches
    this.ctx.fillStyle = "#32CD32";
    for (let i = 0; i < this.canvas.width; i += 60) {
      let offset = (i + this.score) % 120;
      this.ctx.fillRect(offset, this.ground, 30, 8);

      // Add some leaf litter
      this.ctx.fillStyle = "#8B4513";
      this.ctx.fillRect(offset + 5, this.ground + 2, 8, 3);
      this.ctx.fillStyle = "#32CD32";
    }
  }

  update() {
    if (this.gameState === "catching") {
      this.updateCatchingAnimation();
      return;
    }

    if (this.gameState === "paused") {
      return; // Don't update game logic when paused
    }

    if (this.gameState !== "playing") return;

    this.updatePlayer();
    this.spawnObstacle();
    this.spawnCollectibles();
    this.updateObstacles();
    this.updateMonster();
    this.updateClouds();
    this.updateBackgroundTrees();
    this.updateGameSpeed();
    this.checkCollisions();
    this.updateHitTimestamps(); // Check for hit reset
    this.updateUI();

    // Update distance every few frames
    if (this.gameState === "playing") {
      this.distance += 0.5; // Increment distance over time
      document.getElementById("distance").textContent = Math.floor(
        this.distance
      );
      this.updateSessionStats(); // Update session stats with current distance
    }
  }

  updateUI() {
    // Update hit counter safely
    const hitCountElement = document.getElementById("obstacleHits");
    if (hitCountElement) {
      hitCountElement.textContent = this.hitTimestamps
        ? this.hitTimestamps.length
        : 0;
    }

    // Update slowdown indicator
    const slowdownIndicator = document.getElementById("slowdownIndicator");
    if (slowdownIndicator) {
      if (this.slowdownTimer > 0) {
        slowdownIndicator.classList.remove("hidden");
      } else {
        slowdownIndicator.classList.add("hidden");
      }
    }

    // Update double jump indicator
    const doubleJumpIndicator = document.getElementById("doubleJumpIndicator");
    if (doubleJumpIndicator) {
      if (this.player.jumping && !this.player.doubleJumpUsed) {
        doubleJumpIndicator.classList.remove("hidden");
      } else {
        doubleJumpIndicator.classList.add("hidden");
      }
    }

    // Update sliding indicator
    const slidingIndicator = document.getElementById("slidingIndicator");
    if (slidingIndicator) {
      if (this.player.sliding) {
        slidingIndicator.classList.remove("hidden");
      } else {
        slidingIndicator.classList.add("hidden");
      }
    }

    // Update power-up indicators
    const shieldIndicator = document.getElementById("shieldIndicator");
    if (shieldIndicator) {
      if (this.invulnerable) {
        shieldIndicator.classList.remove("hidden");
      } else {
        shieldIndicator.classList.add("hidden");
      }
    }

    const magnetIndicator = document.getElementById("magnetIndicator");
    if (magnetIndicator) {
      if (this.magnetCoins) {
        magnetIndicator.classList.remove("hidden");
      } else {
        magnetIndicator.classList.add("hidden");
      }
    }

    const speedIndicator = document.getElementById("speedIndicator");
    if (speedIndicator) {
      if (this.speedBoost) {
        speedIndicator.classList.remove("hidden");
      } else {
        speedIndicator.classList.add("hidden");
      }
    }

    const doubleJumpBoostIndicator = document.getElementById(
      "doubleJumpBoostIndicator"
    );
    if (doubleJumpBoostIndicator) {
      if (this.doubleJumpBoost) {
        doubleJumpBoostIndicator.classList.remove("hidden");
      } else {
        doubleJumpBoostIndicator.classList.add("hidden");
      }
    }

    const scoreMultiplierIndicator = document.getElementById(
      "scoreMultiplierIndicator"
    );
    if (scoreMultiplierIndicator) {
      if (this.scoreMultiplier) {
        scoreMultiplierIndicator.classList.remove("hidden");
      } else {
        scoreMultiplierIndicator.classList.add("hidden");
      }
    }

    const slowMotionIndicator = document.getElementById("slowMotionIndicator");
    if (slowMotionIndicator) {
      if (this.slowMotion) {
        slowMotionIndicator.classList.remove("hidden");
      } else {
        slowMotionIndicator.classList.add("hidden");
      }
    }
  }

  drawSun() {
    const sunX = this.canvas.width - 100; // Position sun on the right side
    const sunY = 80; // Position sun near the top
    const sunRadius = 45;

    // Add subtle pulsing animation
    const pulse = 1 + Math.sin(Date.now() * 0.002) * 0.05;
    const currentRadius = sunRadius * pulse;

    // Draw outer glow effect
    const glowGradient = this.ctx.createRadialGradient(
      sunX,
      sunY,
      currentRadius,
      sunX,
      sunY,
      currentRadius + 30
    );
    glowGradient.addColorStop(0, "rgba(255, 215, 0, 0.3)");
    glowGradient.addColorStop(0.5, "rgba(255, 165, 0, 0.2)");
    glowGradient.addColorStop(1, "rgba(255, 215, 0, 0)");

    this.ctx.fillStyle = glowGradient;
    this.ctx.beginPath();
    this.ctx.arc(sunX, sunY, currentRadius + 30, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw sun rays with varying lengths and glow
    this.ctx.shadowColor = "#FFD700";
    this.ctx.shadowBlur = 15;

    // Draw 12 rays with different lengths for more dynamic look
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI) / 6;
      const rayLength = 20 + Math.sin(i * 0.5) * 10; // Varying ray lengths
      const rayWidth = 2 + Math.sin(i * 0.7) * 1; // Varying ray widths

      const rayStartX = sunX + Math.cos(angle) * (currentRadius + 5);
      const rayStartY = sunY + Math.sin(angle) * (currentRadius + 5);
      const rayEndX = sunX + Math.cos(angle) * (currentRadius + rayLength);
      const rayEndY = sunY + Math.sin(angle) * (currentRadius + rayLength);

      // Create gradient for each ray
      const rayGradient = this.ctx.createLinearGradient(
        rayStartX,
        rayStartY,
        rayEndX,
        rayEndY
      );
      rayGradient.addColorStop(0, "rgba(255, 215, 0, 0.9)");
      rayGradient.addColorStop(1, "rgba(255, 165, 0, 0)");

      this.ctx.strokeStyle = rayGradient;
      this.ctx.lineWidth = rayWidth;
      this.ctx.beginPath();
      this.ctx.moveTo(rayStartX, rayStartY);
      this.ctx.lineTo(rayEndX, rayEndY);
      this.ctx.stroke();
    }

    // Reset shadow
    this.ctx.shadowBlur = 0;

    // Draw sun body with enhanced gradient
    const sunGradient = this.ctx.createRadialGradient(
      sunX - currentRadius * 0.4,
      sunY - currentRadius * 0.4,
      0,
      sunX,
      sunY,
      currentRadius
    );
    sunGradient.addColorStop(0, "#FFFFFF"); // Bright white center
    sunGradient.addColorStop(0.3, "#FFF8DC"); // Cream
    sunGradient.addColorStop(0.7, "#FFD700"); // Gold
    sunGradient.addColorStop(1, "#FF8C00"); // Dark orange at edges

    this.ctx.fillStyle = sunGradient;
    this.ctx.beginPath();
    this.ctx.arc(sunX, sunY, currentRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Add sun surface details - more realistic texture
    this.ctx.fillStyle = "rgba(255, 215, 0, 0.4)";

    // Larger sunspots with better positioning
    const spots = [
      { x: -12, y: -10, r: 8 },
      { x: 15, y: 8, r: 6 },
      { x: -8, y: 18, r: 5 },
      { x: 10, y: -15, r: 4 },
      { x: -18, y: 5, r: 3 },
    ];

    spots.forEach((spot) => {
      this.ctx.beginPath();
      this.ctx.arc(sunX + spot.x, sunY + spot.y, spot.r, 0, Math.PI * 2);
      this.ctx.fill();
    });

    // Add some corona effect - small particles around the sun
    this.ctx.fillStyle = "rgba(255, 215, 0, 0.6)";
    for (let i = 0; i < 8; i++) {
      const coronaAngle = (i * Math.PI) / 4 + Date.now() * 0.001;
      const coronaDistance =
        currentRadius + 15 + Math.sin(Date.now() * 0.003 + i) * 5;
      const coronaX = sunX + Math.cos(coronaAngle) * coronaDistance;
      const coronaY = sunY + Math.sin(coronaAngle) * coronaDistance;

      this.ctx.beginPath();
      this.ctx.arc(coronaX, coronaY, 2 + Math.sin(i * 0.5) * 1, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Add a subtle inner highlight
    const highlightGradient = this.ctx.createRadialGradient(
      sunX - currentRadius * 0.3,
      sunY - currentRadius * 0.3,
      0,
      sunX - currentRadius * 0.3,
      sunY - currentRadius * 0.3,
      currentRadius * 0.6
    );
    highlightGradient.addColorStop(0, "rgba(255, 255, 255, 0.4)");
    highlightGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    this.ctx.fillStyle = highlightGradient;
    this.ctx.beginPath();
    this.ctx.arc(
      sunX - currentRadius * 0.3,
      sunY - currentRadius * 0.3,
      currentRadius * 0.6,
      0,
      Math.PI * 2
    );
    this.ctx.fill();
  }

  draw() {
    // Clear canvas with forest background
    let gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, "#87CEEB");
    gradient.addColorStop(0.7, "#98FB98");
    gradient.addColorStop(1, "#228B22");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw sun
    this.drawSun();

    // Hit flash effect
    if (this.hitFlash && this.hitFlash > 0) {
      this.ctx.fillStyle = `rgba(255, 0, 0, ${this.hitFlash / 60})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.hitFlash--;
    }

    // Draw clouds and trees
    this.drawClouds();
    this.drawBackgroundTrees();

    this.drawGround();
    this.drawObstacles();
    this.drawMonster();
    this.drawPlayer();

    // Draw catching animation effects
    if (this.gameState === "catching") {
      this.drawCatchingEffects();
    }
  }

  drawCatchingEffects() {
    // Phase 1: Screen shake and red tint
    if (this.catchingPhase === 1) {
      this.ctx.fillStyle = `rgba(255, 0, 0, ${
        0.3 + Math.sin(this.catchingAnimation * 0.3) * 0.2
      })`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Draw "CAUGHT!" text
      this.ctx.save();
      this.ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      this.ctx.strokeStyle = "rgba(255, 0, 0, 0.9)";
      this.ctx.lineWidth = 4;
      this.ctx.font = "bold 80px Arial";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      const shake = Math.sin(this.catchingAnimation * 0.5) * 5;
      this.ctx.strokeText(
        "CAUGHT!",
        this.canvas.width / 2 + shake,
        this.canvas.height / 2
      );
      this.ctx.fillText(
        "CAUGHT!",
        this.canvas.width / 2 + shake,
        this.canvas.height / 2
      );
      this.ctx.restore();
    }

    // Phase 2: Fade to black
    if (this.catchingPhase === 2) {
      const fadeAmount = this.catchingAnimation / 30;
      this.ctx.fillStyle = `rgba(0, 0, 0, ${fadeAmount})`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  gameLoop() {
    this.update();
    this.draw();
    requestAnimationFrame(() => this.gameLoop());
  }
}

// Start the game when page loads
window.addEventListener("load", () => {
  new EndlessRunner();
});

// Handle window resize
window.addEventListener("resize", () => {
  const canvas = document.getElementById("gameCanvas");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});