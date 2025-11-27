// Backend game engine for EndlessRunner
// This module contains all core game logic migrated from client-side
// Adapted for server-side execution without DOM dependencies

class EndlessRunnerGame {
  constructor(sessionId, options = {}) {
    this.sessionId = sessionId;
    this.gameState = "start"; // start, playing, catching, paused, gameOver
    this.score = 0;
    this.distance = 0;
    this.isNightMode = false;
    this.highScore = 0;
    this.gameSpeed = 7;
    this.baseGameSpeed = 7;
    this.gravity = 0.7;
    this.slowdownTimer = 0;
    this.hitTimestamps = [];
    this.hitFlash = 0;
    this.lastHitTime = 0;
    this.hitCooldown = false;
    this.consecutiveDangers = 0;
    this.catchingAnimation = 0;
    this.catchingPhase = 0;
    this.catchingTimer = 0;
    this.monsterCatchX = 0;
    this.monsterCatchY = 0;
    this.playerCatchX = 0;
    this.playerCatchY = 0;
    this.monsterTargetX = 0;
    this.monsterTargetY = 0;
    this.playerShakeOffset = 0;
    this.playerShakeDirection = 1;
    this.fadeAlpha = 0;

    // Session tracking
    this.sessionStartTime = null;
    this.sessionStats = {
      coinsCollected: 0,
      obstaclesHit: 0,
      powerupsCollected: 0,
      distanceTraveled: 0,
      gameResult: null
    };

    // Game world constants
    this.ground = options.ground || 500; // Ground height from client window
    this.canvas = { width: 1200, height: 600 }; // Canvas approximation for server-side

    // Ground details arrays
    this.grassBlades = [];
    this.dirtParticles = [];
    this.fallenLeaves = [];
    this.mossPatches = [];
    this.groundNoise = [];
    this.leafColors = ['#8B4513', '#A0522D', '#CD853F', '#D2691E'];

    // Player properties
    this.player = {
      x: 150,
      y: this.ground - 60,
      width: 40,
      height: 60,
      velocityY: 0,
      jumping: false,
      doubleJumpUsed: false,
      sliding: false,
      slideTimer: 0,
      runFrame: 0,
    };

    // Game objects arrays
    this.obstacles = [];
    this.birds = [];
    this.spikes = [];
    this.movingPlatforms = [];
    this.gaps = [];
    this.coins = [];
    this.powerUps = [];
    this.fireTraps = [];
    this.monster = null;
    this.clouds = [];
    this.trees = [];
    this.particles = [];
    this.dangerousAreas = [];

    // Timers for spawning
    this.obstacleTimer = 0;
    this.birdTimer = 0;
    this.spikeTimer = 0;
    this.platformTimer = 0;
    this.ballTimer = 0;
    this.cloudTimer = 0;
    this.treeTimer = 0;
    this.gapTimer = 0;
    this.coinTimer = 0;
    this.powerUpTimer = 0;
    this.treeTimer = 0;
    this.fireTimer = 0;
    this.collectibleTimer = 0;

    // Power-up states
    this.invulnerable = false;
    this.invulnerableTimer = 0;
    this.shieldHits = 0;
    this.magnetCoins = false;
    this.magnetTimer = 0;
    this.speedBoost = false;
    this.speedBoostTimer = 0;
    this.scoreMultiplier = false;
    this.scoreMultiplierTimer = 0;

    // Input state
    this.keys = {};

    // Anti-tampering
    this.integrityCheck = Math.random();
    this.lastUpdateTime = Date.now();

    // UI state for client-side updates
    this.uiState = {};

    // Initialize ground details
    this.initializeGroundDetails();
  }

  initializeGroundDetails() {
    // Initialize grass blades
    this.grassBlades = [];
    for (let i = 0; i < 50; i++) {
      this.grassBlades.push({
        x: Math.random() * this.canvas.width,
        y: this.ground - Math.random() * 10,
        height: 8 + Math.random() * 12,
        phase: Math.random() * Math.PI * 2
      });
    }

    // Initialize dirt particles
    this.dirtParticles = [];
    for (let i = 0; i < 30; i++) {
      const seed = Math.random() * 1000;
      this.dirtParticles.push({
        x: Math.random() * this.canvas.width,
        y: this.ground + 5 + (seed % (this.canvas.height - this.ground - 25)),
        size: 1 + (seed % 3)
      });
    }

    // Initialize fallen leaves
    this.fallenLeaves = [];
    for (let i = 0; i < 20; i++) {
      const seed = Math.random() * 1000;
      this.fallenLeaves.push({
        x: Math.random() * this.canvas.width,
        y: this.ground + 10 + (seed % (this.canvas.height - this.ground - 30)),
        size: 3 + (seed % 4),
        rotation: (seed % (Math.PI * 2)),
        color: this.leafColors[Math.floor(seed % this.leafColors.length)]
      });
    }

    // Initialize moss patches
    this.mossPatches = [];
    for (let i = 0; i < 15; i++) {
      const seed = Math.random() * 1000;
      this.mossPatches.push({
        x: Math.random() * this.canvas.width,
        y: this.ground + 15 + (seed % (this.canvas.height - this.ground - 35)),
        width: 20 + (seed % 40),
        height: 8 + (seed % 15),
        rotation: (seed % Math.PI)
      });
    }

    // Initialize ground noise
    this.groundNoise = [];
    for (let i = 0; i < 100; i++) {
      const seed = Math.random() * 1000;
      this.groundNoise.push({
        x: Math.random() * this.canvas.width,
        y: this.ground + (seed % (this.canvas.height - this.ground)),
        size: 0.5 + (seed % 1.5)
      });
    }
  }

  processInput(input) {
    if (this.gameState !== 'playing') return;

    switch (input.type) {
      case 'keydown':
        this.keys[input.code] = true;

        // Handle jump
        if (input.code === 'Space') {
          this.jump();
        }

        // Handle slide
        if ((input.code === 'ArrowDown' || input.code === 'KeyS')) {
          this.slide();
        }
        break;

      case 'keyup':
        this.keys[input.code] = false;

        // Handle stop slide
        if ((input.code === 'ArrowDown' || input.code === 'KeyS')) {
          this.stopSlide();
        }
        break;
    }
  }

  start() {
    if (this.gameState === 'start') {
      this.gameState = 'playing';
      this.sessionStartTime = Date.now();
    }
  }

  pause() {
    if (this.gameState === 'playing') {
      this.gameState = 'paused';
    }
  }

  resume() {
    if (this.gameState === 'paused') {
      this.gameState = 'playing';
    }
  }

  restart() {
    // Reset game state
    this.gameState = 'start';
    this.score = 0;
    this.distance = 0;
    this.gameSpeed = this.baseGameSpeed;
    this.slowdownTimer = 0;
    this.hitTimestamps = [];
    this.hitFlash = 0;
    this.lastHitTime = 0;
    this.consecutiveDangers = 0;
    this.catchingAnimation = 0;
    this.catchingPhase = 0;
    this.catchingTimer = 0;
    this.monsterCatchX = 0;
    this.monsterCatchY = 0;
    this.playerCatchX = 0;
    this.playerCatchY = 0;
    this.monsterTargetX = 0;
    this.monsterTargetY = 0;
    this.playerShakeOffset = 0;
    this.playerShakeDirection = 1;
    this.fadeAlpha = 0;

    // Reset session stats
    this.sessionStats = {
      coinsCollected: 0,
      obstaclesHit: 0,
      powerupsCollected: 0,
      distanceTraveled: 0,
      gameResult: null
    };

    // Reset player
    this.player = {
      x: 150,
      y: this.ground - 60,
      width: 40,
      height: 60,
      velocityY: 0,
      jumping: false,
      doubleJumpUsed: false,
      sliding: false,
      slideTimer: 0,
      runFrame: 0,
    };

    // Clear all game objects
    this.obstacles = [];
    this.birds = [];
    this.spikes = [];
    this.movingPlatforms = [];
    this.gaps = [];
    this.coins = [];
    this.powerUps = [];
    this.fireTraps = [];
    this.monster = null;
    this.clouds = [];
    this.trees = [];
    this.particles = [];
    this.dangerousAreas = [];
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
    this.collectibleTimer = 0;

    // Reset power-ups
    this.invulnerable = false;
    this.invulnerableTimer = 0;
    this.shieldHits = 0;
    this.magnetCoins = false;
    this.magnetTimer = 0;
    this.speedBoost = false;
    this.speedBoostTimer = 0;
    this.scoreMultiplier = false;
    this.scoreMultiplierTimer = 0;

    this.keys = {};
  }

  update() {
    if (this.gameState === 'catching') {
      this.updateCatchingAnimation();
      return this.getState();
    }
    
    if (this.gameState === 'paused') {
      return this.getState();
    }

    if (this.gameState !== 'playing') {
      return this.getState();
    }

    // Update player physics
    this.updatePlayer();

    // Update all game objects
    this.updateObstacles();
    this.updateCollectibles();
    this.updateBackground();

    // Check collisions
    this.checkCollisions();

    // Update game speed and effects
    this.updateGameSpeed();
    this.updatePowerUps();

    // Update hit flash timer so it only triggers briefly
    if (this.hitFlash > 0) {
      this.hitFlash--;
    }

    // Update hit timestamps for anti-cheat
    this.updateHitTimestamps();

    // Update hit timestamps for anti-cheat
    this.updateHitTimestamps();

    // Spawn new obstacles and collectibles
    this.spawnObstacle();
    this.spawnCollectibles();
    this.spawnBackground();
    this.spawnMonster();

    // Update monster AI
    this.updateMonster();

    // Update distance and score
    if (this.gameState === 'playing') {
      this.distance += this.gameSpeed;
      this.score += Math.floor(this.gameSpeed / 10);
    }

    // Update UI elements
    this.updateUI();

    // Return current state for client
    return this.getState();
  }

  updateUI() {
    // Server-side UI state updates - actual DOM manipulation handled client-side
    // Update score display state
    this.uiState = {
      score: this.score,
      distance: Math.floor(this.distance),
      level: Math.floor(this.score / 75) + 1,
      highScore: this.highScore,
      gameState: this.gameState,
      invulnerable: this.invulnerable,
      invulnerableTimer: this.invulnerableTimer,
      magnetCoins: this.magnetCoins,
      magnetTimer: this.magnetTimer,
      speedBoost: this.speedBoost,
      speedBoostTimer: this.speedBoostTimer,
      scoreMultiplier: this.scoreMultiplier,
      scoreMultiplierTimer: this.scoreMultiplierTimer,
      hitFlash: this.hitFlash,
      sessionStats: this.sessionStats
    };
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

    // Platform collision (check before ground collision)
    let onPlatform = false;
    if (this.player.velocityY >= 0) { // Only check when falling or moving down
      for (let platform of this.movingPlatforms) {
        if (this.player.x + this.player.width > platform.x &&
            this.player.x < platform.x + platform.width &&
            this.player.y + this.player.height >= platform.y &&
            this.player.y + this.player.height <= platform.y + platform.height + 10) { // Allow some tolerance
          // Land on platform
          this.player.y = platform.y - this.player.height;
          this.player.velocityY = 0;
          this.player.jumping = false;
          this.player.doubleJumpUsed = false; // Reset double jump when landing
          onPlatform = true;
          break;
        }
      }
    }

    // Ground collision (only if not on a platform)
    if (!onPlatform && this.player.y >= this.ground - this.player.height) {
      this.player.y = this.ground - this.player.height;
      this.player.velocityY = 0;
      this.player.jumping = false;
      this.player.doubleJumpUsed = false; // Reset double jump when landing
    }

    // Running animation - slower for more natural movement
    this.player.runFrame += 0.18; // Slower animation frame increment
    if (this.player.runFrame >= 4) this.player.runFrame = 0;
  }

  updateObstacles() {
    // Update obstacles
    this.obstacles = this.obstacles.filter((obstacle) => {
      obstacle.x -= this.gameSpeed;
      return obstacle.x + obstacle.width > -300;
    });

    // Update birds
    this.birds = this.birds.filter((bird) => {
      bird.x -= this.gameSpeed * 1.5;
      bird.frame += 0.3;
      if (bird.frame >= 4) bird.frame = 0;
      const time = Date.now() * 0.003;
      bird.y = bird.initialY + Math.sin(time + bird.waveOffset) * 15;
      return bird.x + bird.width > -300;
    });

    // Update fire traps
    this.fireTraps = this.fireTraps.filter((trap) => {
      trap.x -= this.gameSpeed;
      trap.timer--;
      if (trap.timer <= 0) {
        trap.active = !trap.active;
        trap.timer = trap.active ? 60 : 90;
      }
      if (trap.active) {
        trap.frame += 0.5;
        if (trap.frame >= 8) trap.frame = 0;
      }
      return trap.x + trap.width > -300;
    });

    // Update moving platforms
    this.movingPlatforms = this.movingPlatforms.filter((platform) => {
      platform.x -= this.gameSpeed;
      platform.y += platform.velocityY;
      // Adjust bounce bounds for higher floating platforms
      const minY = this.ground - 160;
      const maxY = this.ground - 70;
      if (platform.y <= minY || platform.y >= maxY) {
        platform.velocityY *= -1;
        // Keep within bounds
        platform.y = Math.max(minY, Math.min(maxY, platform.y));
      }
      return platform.x + platform.width > -300;
    });

    // Update gaps
    this.gaps = this.gaps.filter((gap) => {
      gap.x -= this.gameSpeed;
      return gap.x + gap.width > -300;
    });

    // Update dangerous areas
    this.dangerousAreas = this.dangerousAreas.filter((area) => {
      return area.x + area.width > -400;
    });

    // Update particles
    this.particles = this.particles.filter((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.2;
      particle.life--;
      return particle.life > 0;
    });
  }

  updateCollectibles() {
    // Update coins
    this.coins = this.coins.filter((coin) => {
      coin.x -= this.gameSpeed;
      
      // Magnet attraction logic
      if (this.magnetCoins && this.magnetTimer > 0) {
        const coinCenterX = coin.x + coin.width / 2;
        const coinCenterY = coin.y + coin.height / 2;
        const playerCenterX = this.player.x + this.player.width / 2;
        const playerCenterY = this.player.y + this.player.height / 2;
        
        const distance = Math.sqrt(
          Math.pow(coinCenterX - playerCenterX, 2) + 
          Math.pow(coinCenterY - playerCenterY, 2)
        );
        
        // Attract coins within 200 pixels
        if (distance < 200 && distance > 5) {
          const attractSpeed = Math.min(8, 200 / distance); // Faster when closer
          const angle = Math.atan2(playerCenterY - coinCenterY, playerCenterX - coinCenterX);
          coin.x += Math.cos(angle) * attractSpeed;
          coin.y += Math.sin(angle) * attractSpeed;
        }
      }
      
      coin.frame += 0.3;
      if (coin.frame >= 8) coin.frame = 0;
      return coin.x + coin.width > -300 && !coin.collected;
    });

    // Update power-ups
    this.powerUps = this.powerUps.filter((powerUp) => {
      powerUp.x -= this.gameSpeed;
      powerUp.frame += 0.2;
      if (powerUp.frame >= 4) powerUp.frame = 0;
      return powerUp.x + powerUp.width > -300 && !powerUp.collected;
    });
  }

  updatePowerUps() {
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

  checkCollisions() {
    // Check coin collection
    for (let i = this.coins.length - 1; i >= 0; i--) {
      let coin = this.coins[i];
      if (!coin.collected && this.isColliding(this.player, coin)) {
        coin.collected = true;
        const coinValue = 1;
        const multiplier = this.scoreMultiplier ? 2 : 1;
        this.score += coinValue * multiplier;
        this.sessionStats.coinsCollected++;
        this.coins.splice(i, 1);
      }
    }

    // Check power-up collection
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      let powerUp = this.powerUps[i];
      if (!powerUp.collected && this.isColliding(this.player, powerUp)) {
        powerUp.collected = true;
        this.activatePowerUp(powerUp.type);
        this.sessionStats.powerupsCollected++;
        this.powerUps.splice(i, 1);
      }
    }

    // Check obstacle collisions
    // Check regular obstacles
    for (let obstacle of this.obstacles) {
      if (this.isColliding(this.player, obstacle)) {
        if (this.invulnerable && this.shieldHits > 0) {
          // Shield active - consume it on hit
          this.shieldHits--;
          if (this.shieldHits <= 0) {
            this.invulnerable = false;
            this.invulnerableTimer = 0;
          }
          // Show shield break effect
          this.showShieldBreakEffect();
        } else if (!this.invulnerable) {
          this.handleObstacleHit();
        }
        break;
      }
    }

    // Check birds
    for (let bird of this.birds) {
      if (this.isColliding(this.player, bird)) {
        if (this.invulnerable && this.shieldHits > 0) {
          // Shield active - consume it on hit
          this.shieldHits--;
          if (this.shieldHits <= 0) {
            this.invulnerable = false;
            this.invulnerableTimer = 0;
          }
          // Show shield break effect
          this.showShieldBreakEffect();
        } else if (!this.invulnerable) {
          this.handleObstacleHit();
        }
        break;
      }
    }

    // Check fire traps
    for (let trap of this.fireTraps) {
      if (trap.active && this.isColliding(this.player, trap)) {
        if (this.invulnerable && this.shieldHits > 0) {
          // Shield active - consume it on hit
          this.shieldHits--;
          if (this.shieldHits <= 0) {
            this.invulnerable = false;
            this.invulnerableTimer = 0;
          }
          // Show shield break effect
          this.showShieldBreakEffect();
        } else if (!this.invulnerable) {
          this.handleObstacleHit();
        }
        break;
      }
    }


    // Check gap collisions (falling)
    for (let gap of this.gaps) {
      if (this.player.x + this.player.width > gap.x && this.player.x < gap.x + gap.width &&
          this.player.y + this.player.height >= this.ground) {
        this.gameState = 'gameOver';
        this.sessionStats.gameResult = 'fell';
        break;
      }
    }
  }

  handleObstacleHit() {
    // Prevent multiple hits within a short cooldown period
    let currentTime = Date.now();
    if (this.lastHitTime > 0 && currentTime - this.lastHitTime < 1000) {
      return; // Ignore hit if less than 1 second since last hit
    }

    // Record the hit
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

    // After 3 hits, game over immediately
    if (this.hitTimestamps.length >= 3) {
      this.gameOver();
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

  showShieldBreakEffect() {
    // Shield break effect - particles and flash
    this.hitFlash = 20; // Shorter flash for shield break
    // Create shield break particles
    this.createShieldBreakParticles(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2);
  }

  createShieldBreakParticles(x, y) {
    // Create shield break particles
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const speed = 2 + Math.random() * 3;
      const particle = {
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 30 + Math.random() * 20,
        color: '#00ffff' // Cyan color for shield particles
      };
      this.particles.push(particle);
    }
  }

  playHitSound() {
    // Sound effects are handled client-side
    // This is a no-op on the server
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
    this.stopBackgroundMusic();
    this.playGameOverSound();
    this.saveScore();
    this.endSession();
    this.fetchGlobalHighScore();
  }

  stopBackgroundMusic() {
    // Server-side: no-op (music handled client-side)
  }

  playGameOverSound() {
    // Server-side: no-op (sounds handled client-side)
  }

  saveScore() {
    // Save score to database
    if (this.db && this.sessionId) {
      const query = 'INSERT INTO scores (session_id, score, distance, result) VALUES (?, ?, ?, ?)';
      this.db.query(query, [this.sessionId, this.score, this.distance, this.sessionStats.gameResult], (err) => {
        if (err) {
          console.error('Error saving score:', err);
        }
      });
    }
  }

  endSession() {
    // Mark session as ended
    if (this.db && this.sessionId) {
      const query = 'UPDATE sessions SET end_time = NOW(), score = ?, distance = ?, result = ? WHERE id = ?';
      this.db.query(query, [this.score, this.distance, this.sessionStats.gameResult, this.sessionId], (err) => {
        if (err) {
          console.error('Error ending session:', err);
        }
      });
    }
  }

  fetchGlobalHighScore() {
    // Fetch and update global high score
    if (this.db) {
      const query = 'SELECT MAX(score) as highScore FROM scores';
      this.db.query(query, (err, results) => {
        if (err) {
          console.error('Error fetching high score:', err);
        } else if (results.length > 0) {
          this.highScore = results[0].highScore || 0;
        }
      });
    }
  }

  startGame() {
    this.gameState = "playing";
    this.spawnMonster(); // Spawn the single monster
    this.startBackgroundMusic(); // Start background music
    this.startSession(); // Start tracking session
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
      this.stopBackgroundMusic(); // Pause background music
    }
  }

  resumeGame() {
    if (this.gameState === "paused") {
      this.gameState = "playing";
      this.startBackgroundMusic(); // Resume background music
    }
  }

  restartGame() {
    this.gameState = "playing";
    this.score = 0;
    this.distance = 0; // Reset distance
    this.isNightMode = false; // Reset night mode
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
    this.grassBlades = [];
    this.dirtParticles = [];
    this.fallenLeaves = [];
    this.mossPatches = [];
    this.groundNoise = [];    this.dangerousAreas = []; // Reset dangerous areas tracking
    this.player.y = this.ground - 60;
    this.player.velocityY = 0;
    this.player.jumping = false;
    this.player.doubleJumpUsed = false;
    this.player.sliding = false;
    this.player.slideTimer = 0;
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
    this.collectibleTimer = 0;
    this.invulnerable = false;
    this.invulnerableTimer = 0;
    this.shieldHits = 0;
    this.magnetCoins = false;
    this.magnetTimer = 0;
    this.speedBoost = false;
    this.speedBoostTimer = 0;
    this.scoreMultiplier = false;
    this.scoreMultiplierTimer = 0;
    this.generateClouds();
    this.generateTrees();
    this.spawnMonster(); // Spawn the single monster
    this.startBackgroundMusic(); // Restart background music
    this.startSession(); // Start new session
  }

  startBackgroundMusic() {
    // Server-side: no-op (music handled client-side)
  }

  generateClouds() {
    // Generate initial clouds
    this.clouds = [];
    for (let i = 0; i < 10; i++) {
      const radius = 15 + Math.random() * 25;
      this.clouds.push({
        x: Math.random() * 1200,
        y: 30 + Math.random() * 120,
        radius: radius,
        speed: this.gameSpeed * 0.4 + Math.random() * 0.3, // Variable speed based on game speed
        width: 50 + Math.random() * 30, // Cloud width for wrapping logic
        height: radius * 0.6, // Cloud height for drawing
      });
    }
  }

  generateTrees() {
    // Generate initial background trees
    this.trees = [];
    for (let i = 0; i < 8; i++) {
      const height = 80 + Math.random() * 120;
      const treeType = Math.floor(Math.random() * 4); // 4 different tree types now
      // Add size variation: small, medium, large
      const sizeMultiplier = Math.random() < 0.3 ? 0.7 : Math.random() < 0.7 ? 1.0 : 1.4; // 30% small, 40% medium, 30% large
      this.trees.push({
        x: Math.random() * 1200,
        y: this.ground - height * sizeMultiplier,
        width: (20 + Math.random() * 30) * sizeMultiplier,
        height: height * sizeMultiplier,
        speed: this.gameSpeed * 0.3 + Math.random() * 0.2, // Slower than clouds for parallax
        type: treeType, // Different tree types: 0=Oak, 1=Pine, 2=Birch, 3=Willow
        sizeMultiplier: sizeMultiplier // Store for drawing functions
      });
    }
  }

  startSession() {
    // Server-side session tracking is handled in the constructor and update methods
    // This is a placeholder for client-side compatibility
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
        this.speedBoostTimer = 420; // 7 seconds - increases game speed
        this.gameSpeed = this.baseGameSpeed * 1.8; // Much faster
        break;
      case "doublecoins":
        this.scoreMultiplier = true;
        this.scoreMultiplierTimer = 420; // 7 seconds - double coins/score
        break;
    }
  }

  updateGameSpeed() {
    if (this.slowdownTimer > 0) {
      this.slowdownTimer--;
      if (this.slowdownTimer === 0) {
        this.gameSpeed = this.baseGameSpeed;
      }
    }

    // Gradually increase speed based on score
    const targetSpeed = this.baseGameSpeed + Math.floor(this.score / 100);
    if (this.gameSpeed < targetSpeed && this.slowdownTimer === 0) {
      this.gameSpeed = Math.min(targetSpeed, this.gameSpeed + 0.01);
    }
  }

  updateHitTimestamps() {
    const currentTime = Date.now();
    if (this.lastHitTime > 0 && currentTime - this.lastHitTime >= 10000) {
      this.hitTimestamps = [];
      this.lastHitTime = 0;
    }
    this.hitTimestamps = this.hitTimestamps.filter(
      (time) => currentTime - time < 10000
    );
  }

  spawnObstacle() {
    if (this.obstacleTimer <= 0) {
      // Randomly choose obstacle type based on score
      const obstacleType = Math.random();
      const baseX = 2000;

      if (this.score < 50) {
        // Easier gameplay: Stone most common, then birds, gaps, fire rarest
        if (obstacleType < 0.45) {
          // 45% - Ground obstacles (Rock) - Most common
          const obstacleX = baseX;
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
            this.markDangerousArea(obstacleX + obstacleWidth / 2, obstacleWidth, "obstacle");
            this.consecutiveDangers = 0;
          }
        } else if (obstacleType < 0.6) {
          // 15% - Flying birds (reduced from 25%)
          this.birds.push({
            x: baseX,
            y: this.ground - 120,
            width: 40,
            height: 30,
            initialY: this.ground - 120,
            waveOffset: Math.random() * Math.PI * 2,
            frame: 0,
          });
          this.markDangerousArea(baseX + 20, 40, "bird");
          this.consecutiveDangers = 0;
        } else if (obstacleType < 0.8) {
          // 20% - Wide gaps (water pits)
          const gapWidth = 350 + Math.random() * 350; // 350–700px wide
          this.gaps.push({
            x: baseX,
            y: this.ground,
            width: gapWidth,
            height: 60,
          });
          this.markDangerousArea(baseX + gapWidth / 2, gapWidth, "gap");
        } else {
          // 20% - Fire traps
          const trapX = baseX;
          const trapWidth = 30;
          const wouldOverlapGap = this.gaps.some(
            (gap) => trapX < gap.x + gap.width && trapX + trapWidth > gap.x
          );
          if (!wouldOverlapGap) {
            this.fireTraps.push({
              x: trapX,
              y: this.ground - 50,
              width: trapWidth,
              height: 50,
              active: true,
              timer: 60,
              frame: 0,
            });
            this.markDangerousArea(trapX + trapWidth / 2, trapWidth, "fire");
          }
        }
      } else {
        // Score >= 50: Stone most common, then birds, gaps, fire rarest
        if (obstacleType < 0.5) {
          // 50% - Ground obstacles - Most common
          const obstacleX = baseX;
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
            this.markDangerousArea(obstacleX + obstacleWidth / 2, obstacleWidth, "obstacle");
            this.consecutiveDangers = 0;
          }
        } else if (obstacleType < 0.68) {
          // 18% - Flying birds (reduced from 28%)
          this.birds.push({
            x: baseX,
            y: this.ground - 120,
            width: 40,
            height: 30,
            initialY: this.ground - 120,
            waveOffset: Math.random() * Math.PI * 2,
            frame: 0,
          });
          this.markDangerousArea(baseX + 20, 40, "bird");
          this.consecutiveDangers = 0;
        } else if (obstacleType < 0.82) {
          // 14% - Wider gaps at higher difficulty
          const gapWidth = 220 + Math.random() * 260; // 220–480px wide
          this.gaps.push({
            x: baseX,
            y: this.ground,
            width: gapWidth,
            height: 60,
          });
          this.markDangerousArea(baseX + gapWidth / 2, gapWidth, "gap");
        } else {
          // 18% - Fire traps
          const trapX = baseX;
          const trapWidth = 30;
          const wouldOverlapGap = this.gaps.some(
            (gap) => trapX < gap.x + gap.width && trapX + trapWidth > gap.x
          );
          if (!wouldOverlapGap) {
            this.fireTraps.push({
              x: trapX,
              y: this.ground - 50,
              width: trapWidth,
              height: 50,
              active: true,
              timer: 60,
              frame: 0,
            });
            this.markDangerousArea(trapX + trapWidth / 2, trapWidth, "fire");
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

  spawnCollectibles() {
    if (this.collectibleTimer <= 0) {
      const rand = Math.random();
      const baseX = 2000;

      if (rand < 0.5) {
        // Single Coin
        this.coins.push({
          x: baseX,
          y: this.ground - 60 - Math.random() * 40,
          width: 16,
          height: 16,
          frame: 0,
          collected: false,
        });
      } else if (rand < 0.6) {
        // Grouped Coins (2-4 coins in a small area)
        const numCoins = 2 + Math.floor(Math.random() * 3); // 2-4 coins
        const groupX = baseX;
        const groupY = this.ground - 60 - Math.random() * 40;
        
        for (let i = 0; i < numCoins; i++) {
          this.coins.push({
            x: groupX + (Math.random() - 0.5) * 80, // Spread within 80 pixels horizontally
            y: groupY + (Math.random() - 0.5) * 60, // Spread within 60 pixels vertically
            width: 16,
            height: 16,
            frame: 0,
            collected: false,
          });
        }
      } else if (rand < 0.7) {
        // Shield power-up
        this.powerUps.push({
          x: baseX,
          y: this.ground - 70,
          width: 36,
          height: 36,
          type: "shield",
          frame: 0,
          collected: false,
        });
      } else if (rand < 0.8) {
        // Magnet power-up
        this.powerUps.push({
          x: baseX,
          y: this.ground - 70,
          width: 36,
          height: 36,
          type: "magnet",
          frame: 0,
          collected: false,
        });
      } else if (rand < 0.85) {
        // Speed boost
        this.powerUps.push({
          x: baseX,
          y: this.ground - 70,
          width: 36,
          height: 36,
          type: "boost",
          frame: 0,
          collected: false,
        });
      } else if (rand < 0.95) {
        // Double coins
        this.powerUps.push({
          x: baseX,
          y: this.ground - 70,
          width: 36,
          height: 36,
          type: "doublecoins",
          frame: 0,
          collected: false,
        });
      }

      this.collectibleTimer = Math.random() * 50 + 50;
    }
    this.collectibleTimer--;
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
    // Spawn floating platforms near gaps to help players cross them
    // Since there are no multiple gaps combined, spawn platforms based on single gap width

    // Determine number of platforms needed based on gap width
    let numPlatforms;
    if (gapWidth < 150) {
      numPlatforms = 1; // Small gap - one platform
    } else if (gapWidth < 300) {
      numPlatforms = 2; // Medium gap - two platforms
    } else if (gapWidth < 450) {
      numPlatforms = 3; // Large gap - three platforms
    } else {
      numPlatforms = 4; // Very large gap - four platforms
    }

    // Spawn platforms distributed across the gap
    for (let i = 0; i < numPlatforms; i++) {
      // Distribute platforms evenly before and across the gap
      let platformX, platformY, platformWidth;

      if (i === 0) {
        // First platform: before the gap
        platformX = gapX - gapWidth / 2 - 120 - Math.random() * 20;
        platformY = this.ground - 100 - Math.random() * 10; // Higher and more visible
        platformWidth = 120 + Math.random() * 20; // Wider for better visibility
      } else {
        // Subsequent platforms: distributed across the gap
        const spacing = gapWidth / (numPlatforms - 0.5);
        platformX = gapX - gapWidth / 2 + spacing * i - 60;
        platformY = this.ground - 110 - Math.random() * 20; // Higher floating position
        platformWidth = 100 + Math.random() * 30; // Good size for jumping
      }

      // Check if there's already a platform too close
      const tooClose = this.movingPlatforms.some(
        (p) => Math.abs(p.x - platformX) < 120 // More spacing
      );

      if (!tooClose) {
        this.movingPlatforms.push({
          x: platformX,
          y: platformY,
          width: platformWidth,
          height: 20, // Slightly taller for better collision
          velocityY: (Math.random() - 0.5) * 2.0, // More noticeable floating
          bounceRange: 40, // Allow more vertical movement
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

  updateBackground() {
    // Update clouds
    this.updateClouds();

    // Update trees
    this.updateTrees();

    // Update ground details
    this.updateGroundDetails();

    // Toggle night mode occasionally
    if (Math.random() < 0.001) {
      this.isNightMode = !this.isNightMode;
    }
  }

  updateGroundDetails() {
    // Move ground details left to create running effect
    const scrollSpeed = this.gameSpeed; // Match obstacle speed

    // Update grass blades
    for (let blade of this.grassBlades) {
      blade.x -= scrollSpeed;
      // Wrap around when off screen
      if (blade.x < -10) {
        blade.x = this.canvas.width + Math.random() * 50;
        blade.height = 8 + (blade.x * 0.01) % 12; // Recalculate height
        blade.phase = (blade.x * 0.1) % (Math.PI * 2); // Recalculate phase
      }
    }

    // Update dirt particles
    for (let particle of this.dirtParticles) {
      particle.x -= scrollSpeed;
      if (particle.x < -10) {
        particle.x = this.canvas.width + Math.random() * 100;
        const seed = particle.x * 17;
        particle.y = this.ground + 5 + (seed % (this.canvas.height - this.ground - 25));
        particle.size = 1 + (seed % 3);
      }
    }

    // Update fallen leaves
    for (let leaf of this.fallenLeaves) {
      leaf.x -= scrollSpeed;
      if (leaf.x < -20) {
        leaf.x = this.canvas.width + Math.random() * 150;
        const seed = leaf.x * 29;
        leaf.y = this.ground + 10 + (seed % (this.canvas.height - this.ground - 30));
        leaf.size = 3 + (seed % 4);
        leaf.rotation = (seed % (Math.PI * 2));
        leaf.color = this.leafColors[Math.floor(seed % this.leafColors.length)];
      }
    }

    // Update moss patches
    for (let moss of this.mossPatches) {
      moss.x -= scrollSpeed;
      if (moss.x < -50) {
        moss.x = this.canvas.width + Math.random() * 200;
        const seed = moss.x * 53;
        moss.y = this.ground + 15 + (seed % (this.canvas.height - this.ground - 35));
        moss.width = 20 + (seed % 40);
        moss.height = 8 + (seed % 15);
        moss.rotation = (seed % Math.PI);
      }
    }

    // Update ground noise
    for (let noise of this.groundNoise) {
      noise.x -= scrollSpeed;
      if (noise.x < -5) {
        noise.x = this.canvas.width + Math.random() * 50;
        const seed = noise.x * 79;
        noise.y = this.ground + (seed % (this.canvas.height - this.ground));
        noise.size = 0.5 + (seed % 1.5);
      }
    }
  }

  updateClouds() {
    this.clouds.forEach((cloud) => {
      cloud.x -= cloud.speed;
      if (cloud.x + cloud.width < 0) {
        cloud.x = 2000; // Canvas width approximation
        cloud.y = Math.random() * 200 + 50;
      }
    });
  }

  updateTrees() {
    this.trees.forEach((tree) => {
      tree.x -= tree.speed;
      if (tree.x + tree.width < 0) {
        tree.x = 2000; // Canvas width approximation
        tree.y = this.ground - tree.height; // Reset to ground level
      }
    });
  }

  spawnBackground() {
    // Spawn clouds
    if (this.cloudTimer <= 0 && this.clouds.length < 15) { // Limit to 15 clouds max
      const radius = 15 + Math.random() * 25;
      this.clouds.push({
        x: 2000 + Math.random() * 200,
        y: 30 + Math.random() * 120,
        radius: radius,
        speed: this.gameSpeed * 0.4 + Math.random() * 0.3, // Variable speed based on game speed
        width: 50 + Math.random() * 30, // Cloud width for wrapping logic
        height: radius * 0.6, // Cloud height for drawing
      });
      this.cloudTimer = Math.random() * 120 + 60; // More frequent spawning
    }
    this.cloudTimer--;

    // Spawn trees
    if (this.treeTimer <= 0 && this.trees.length < 12) { // Limit to 12 trees max
      const height = 80 + Math.random() * 120;
      const treeType = Math.floor(Math.random() * 4); // 4 different tree types
      // Add size variation: small, medium, large
      const sizeMultiplier = Math.random() < 0.3 ? 0.7 : Math.random() < 0.7 ? 1.0 : 1.4; // 30% small, 40% medium, 30% large
      this.trees.push({
        x: 2000 + Math.random() * 300,
        y: this.ground - height * sizeMultiplier,
        width: (20 + Math.random() * 30) * sizeMultiplier,
        height: height * sizeMultiplier,
        speed: this.gameSpeed * 0.3 + Math.random() * 0.2, // Slower than clouds
        type: treeType, // Different tree types: 0=Oak, 1=Pine, 2=Birch, 3=Willow
        sizeMultiplier: sizeMultiplier // Store for drawing functions
      });
      this.treeTimer = Math.random() * 150 + 100; // Less frequent than clouds
    }
    this.treeTimer--;
  }

  spawnMonster() {
    // Only spawn one monster if it doesn't exist
    if (!this.monster) {
      // Spawn monster from the left side (behind the player)
      this.monster = {
        x: -300, // Spawn further left for larger initial gap
        y: this.ground - 80,
        width: 150, // Increased from 100 to 150 (50% bigger)
        height: 570, // Increased from 380 to 570 (50% bigger)
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

  getMonsterChaseDistance(hitCount) {
    const baseDistance = 400; // Increased initial gap
    const distanceReduction = 80; // Larger reduction per hit
    return Math.max(40, baseDistance - hitCount * distanceReduction);
  }

  updateMonster() {
    if (!this.monster) return;

    // Ghost behavior - no obstacle avoidance, just floats and follows player
    // Calculate distance to player
    let distanceToPlayer = Math.abs(this.monster.x - this.player.x);

    // Monster gets progressively closer with each obstacle hit
    // Level 2 monsters are more aggressive - they get closer faster
    let hitCount = this.hitTimestamps ? this.hitTimestamps.length : 0;
    let chaseDistance = this.getMonsterChaseDistance(hitCount);
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
    if (this.monster.x < -400) {
      this.monster.x = -400;
    }
    if (this.monster.x > 1200 - this.monster.width - 50) {
      this.monster.x = 1200 - this.monster.width - 50;
    }

    // Vertical floating - ghost follows player vertically but doesn't jump
    let verticalDistance = Math.abs(this.monster.y - this.player.y);
    let verticalChaseDistance = Math.max(20, 50 - hitCount * 10); // Increased from 35 to 50 pixels, minimum increased from 10 to 20
    let verticalDeadZone = 5; // Add dead zone for vertical movement too

    if (
      this.monster.y >
        this.player.y + verticalChaseDistance + verticalDeadZone
    ) {
      this.monster.y -= 2;
    } else if (
      this.monster.y <
        this.player.y - verticalChaseDistance - verticalDeadZone
    ) {
      this.monster.y += 2;
    }

    // Monster speed increases progressively with each hit
    let baseSpeedMultiplier = 1.0 + hitCount * 0.8; // Increased from 0.5 to 0.8 per hit
    if (this.slowdownTimer > 0) {
      // Additional speed boost when player is slowed
      this.monster.speed = this.monster.baseSpeed * baseSpeedMultiplier * 1.8; // Increased from 1.5 to 1.8
    } else {
      this.monster.speed = this.monster.baseSpeed * baseSpeedMultiplier;
    }

    // Ghost floating animation - subtle ethereal movement
    this.monster.frame += 0.1; // Much slower for floating effect
    if (this.monster.frame >= Math.PI * 2) this.monster.frame = 0;

    // Monster can only catch player after 3 obstacle hits in recent time
    let deadlyHitThreshold = 3;

    if (
      distanceToPlayer < this.monster.catchDistance &&
      verticalDistance < 30
    ) {
      // Only catch if player has hit enough obstacles recently (within 10 seconds)
      if (
        this.hitTimestamps &&
        this.hitTimestamps.length >= deadlyHitThreshold
      ) {
        this.gameState = 'gameOver';
        this.sessionStats.gameResult = 'caught';
      }
      // If less than threshold hits, monster just follows but cannot catch
    }
  }

  updateMonsterPhysics() {
    // Handle monster sliding
    if (this.monster.sliding) {
      this.monster.slideTimer--;
      if (this.monster.slideTimer <= 0) {
        this.monster.sliding = false;
        this.monster.height = 570; // Reset to full height
        if (!this.monster.jumping) {
          this.monster.y = this.ground - 570;
        }
      }
    }

    // Apply gravity and movement
    if (!this.monster.sliding || this.monster.jumping) {
      if (this.monster.velocityY > 0) {
        this.monster.velocityY += this.gravity * 1.8; // Heavier gravity for monster
      } else {
        this.monster.velocityY += this.gravity;
      }
      this.monster.y += this.monster.velocityY;
    }

    // Ground collision
    if (this.monster.y >= this.ground - this.monster.height) {
      this.monster.y = this.ground - this.monster.height;
      this.monster.velocityY = 0;
      this.monster.jumping = false;
    }

    // Keep vertical bounds
    const minY = this.ground - 620; // Allow some space above ground
    const maxY = this.ground - this.monster.height;
    if (this.monster.y < minY) this.monster.y = minY;
    if (this.monster.y > maxY) this.monster.y = maxY;
  }

  checkCollisions() {
    // Check coin collection
    for (let i = this.coins.length - 1; i >= 0; i--) {
      let coin = this.coins[i];
      if (!coin.collected && this.isColliding(this.player, coin)) {
        coin.collected = true;
        const coinValue = 1;
        const multiplier = this.scoreMultiplier ? 2 : 1;
        this.score += coinValue * multiplier;
        this.sessionStats.coinsCollected++;
        this.createCoinParticles(coin.x + coin.width / 2, coin.y + coin.height / 2);
        this.coins.splice(i, 1);
      }
    }

    // Check power-up collection
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      let powerUp = this.powerUps[i];
      if (!powerUp.collected && this.isColliding(this.player, powerUp)) {
        powerUp.collected = true;
        this.activatePowerUp(powerUp.type);
        this.sessionStats.powerupsCollected++;
        this.createPowerUpParticles(powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height / 2);
        this.powerUps.splice(i, 1);
      }
    }

    // Check obstacle collisions
    if (!this.invulnerable) {
      // Check regular obstacles
      for (let obstacle of this.obstacles) {
        if (this.isColliding(this.player, obstacle)) {
          this.handleObstacleHit();
          break;
        }
      }

      // Check birds
      for (let bird of this.birds) {
        if (this.isColliding(this.player, bird)) {
          this.handleObstacleHit();
          break;
        }
      }

      // Check fire traps
      for (let trap of this.fireTraps) {
        if (trap.active && this.isColliding(this.player, trap)) {
          this.handleObstacleHit();
          break;
        }
      }


      // Check gap collisions (falling)
      for (let gap of this.gaps) {
        if (this.player.x + this.player.width > gap.x && this.player.x < gap.x + gap.width &&
            this.player.y + this.player.height >= this.ground) {
          this.gameState = 'gameOver';
          this.sessionStats.gameResult = 'fell';
          break;
        }
      }
    }
  }

  isColliding(rect1, rect2) {
    return (
      rect1.x < rect2.x + rect2.width - 2 &&
      rect1.x + rect1.width - 2 > rect2.x &&
      rect1.y < rect2.y + rect2.height - 2 &&
      rect1.y + rect1.height - 2 > rect2.y
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

  hitObstacle() {
  }

  updateScore() {
    // Server-side: update score display and difficulty
    // This is handled client-side, but we can track it here
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

  playCoinSound() {
    // Server-side: sounds are handled client-side
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

  playPowerUpSound() {
    // Server-side: sounds are handled client-side
  }

  playSound(frequency, duration, type, volume) {
    // Server-side: sounds are handled client-side
  }

  playJumpSound() {
    // Server-side: sounds are handled client-side
  }

  showHitEffect() {
    // Flash effect (implemented in draw method)
    this.hitFlash = 40; // Flash for about 0.7 seconds
  }

  getState() {
    return {
      gameState: this.gameState,
      score: this.score,
      distance: this.distance,
      level: Math.floor(this.score / 75) + 1,
      highScore: this.highScore,
      ground: this.ground,
      player: this.player,
      obstacles: this.obstacles,
      birds: this.birds,
      spikes: this.spikes,
      movingPlatforms: this.movingPlatforms,
      gaps: this.gaps,
      coins: this.coins,
      powerUps: this.powerUps,
      fireTraps: this.fireTraps,
      monster: this.monster,
      clouds: this.clouds,
      trees: this.trees,
      grassBlades: this.grassBlades,
      dirtParticles: this.dirtParticles,
      fallenLeaves: this.fallenLeaves,
      mossPatches: this.mossPatches,
      groundNoise: this.groundNoise,
      particles: this.particles,
      isNightMode: this.isNightMode,
      invulnerable: this.invulnerable,
      invulnerableTimer: this.invulnerableTimer,
      magnetCoins: this.magnetCoins,
      magnetTimer: this.magnetTimer,
      speedBoost: this.speedBoost,
      speedBoostTimer: this.speedBoostTimer,
      scoreMultiplier: this.scoreMultiplier,
      scoreMultiplierTimer: this.scoreMultiplierTimer,
      hitTimestamps: this.hitTimestamps,
      slowdownTimer: this.slowdownTimer,
      hitFlash: this.hitFlash,
      sessionStats: this.sessionStats,
      catchingPhase: this.catchingPhase,
      catchingTimer: this.catchingTimer,
      monsterCatchX: this.monsterCatchX,
      monsterCatchY: this.monsterCatchY,
      playerCatchX: this.playerCatchX,
      playerCatchY: this.playerCatchY,
      monsterTargetX: this.monsterTargetX,
      monsterTargetY: this.monsterTargetY,
      playerShakeOffset: this.playerShakeOffset,
      playerShakeDirection: this.playerShakeDirection,
      fadeAlpha: this.fadeAlpha,
      uiState: this.uiState,
    };
  }
}

export default EndlessRunnerGame;
