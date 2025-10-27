<script lang="ts">
  import { onMount } from "svelte"

  type Point = { x: number; y: number }

  type Enemy = {
    id: number
    x: number
    y: number
    health: number
    maxHealth: number
    speed: number
    baseSpeed: number
    pathIndex: number
    reward: number
    type: "basic" | "fast" | "tank"
    slowedUntil: number
    isSecondaryPath?: boolean
  }

  type Tower = {
    id: number
    gridX: number
    gridY: number
    x: number
    y: number
    type: "basic" | "sniper" | "blast" | "laser" | "freeze" | "missile"
    damage: number
    range: number
    fireRate: number
    lastFired: number
    cost: number
    level: number
    burstCount?: number
    burstMax?: number
  }

  type Projectile = {
    id: number
    x: number
    y: number
    targetX: number
    targetY: number
    damage: number
    speed: number
    target: Enemy | null
    type: "basic" | "sniper" | "blast" | "laser" | "freeze" | "missile"
  }

  const GRID_SIZE = 40
  const GRID_WIDTH = 20
  const GRID_HEIGHT = 15
  const CANVAS_WIDTH = GRID_WIDTH * GRID_SIZE
  const CANVAS_HEIGHT = GRID_HEIGHT * GRID_SIZE

  // ============================================================
  // 🎮 GAME BALANCE CONFIGURATION - TWEAK THESE VALUES EASILY
  // ============================================================
  const DEFAULT_CONFIG = {
    // 💰 Economy Settings
    startingMoney: 200,
    startingHealth: 20,
    levelCompletionBonus: 100, // Extra money for beating a level
    keepMoneyBetweenLevels: false, // Set to true to not reset money

    // 🌊 Wave & Level Progression
    wavesPerLevel: 5,
    baseEnemyCount: 5, // Starting count for wave 1
    enemyCountPerWave: 3, // Add this many enemies per wave (5 + wave * 3)

    // ⏱️ Spawn Timing
    baseSpawnInterval: 1500, // ms between enemy spawns on wave 1
    spawnIntervalDecrease: 100, // Decrease by this much per wave
    minSpawnInterval: 1000, // Never spawn faster than this

    // 👾 Enemy Difficulty Scaling
    enemyHealthPerWave: 0.2, // Multiply by (1 + (wave-1) * THIS) - 0.2 = 20% per wave
    enemySpeedPerLevel: 0.15, // Multiply by THIS per level - use 0.10 for additive, 1.15 for multiplicative
    enemySpeedScalingType: "multiplicative", // "additive" or "multiplicative"

    // 👾 Enemy Base Speeds
    baseEnemySpeed: 2.2, // Basic enemy speed
    fastEnemySpeed: 4.4, // Fast enemy speed
    tankEnemySpeed: 1.1, // Tank enemy speed

    // 🎲 Enemy Spawn Probabilities (must add up to 1.0)
    enemySpawnWeights: {
      basic: 0.6, // 60% chance
      fast: 0.3,  // 30% chance
      tank: 0.1,  // 10% chance
    },

    // 🏰 Tower Quantities Per Level
    towerQuantities: {
      basic: 5,
      sniper: 2,
      blast: 4,
      laser: 2,
      freeze: 3,
      missile: 1,
    },

    // 🗼 Tower Persistence
    clearTowersBetweenLevels: true, // Set to false to keep towers between levels

    // 🗼 Tower Power Multipliers
    towerDamageMultiplier: 1.0, // Multiply all tower damage by this
    towerRangeMultiplier: 1.0, // Multiply all tower range by this

    // ⚡ Special Mechanics
    warpSpeedMultiplier: 10, // Fast-forward speed when no action needed
    freezeSlowPercent: 0.5, // 0.5 = 50% slow
    freezeDuration: 5000, // ms

    // 💣 Splash Damage Radii
    blastRadius: 60,
    missileRadius: 120,

    // ✈️ Air Attack Settings
    airAttackWave: 5, // Which wave number triggers air attack (every 5 waves)
    airAttackRefundPercent: 0.5, // 50% refund on destroyed tower
  }

  // Load config from localStorage or use defaults
  function loadConfig() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('towerDefenseConfig')
      if (saved) {
        try {
          return {...DEFAULT_CONFIG, ...JSON.parse(saved)}
        } catch (e) {
          return {...DEFAULT_CONFIG}
        }
      }
    }
    return {...DEFAULT_CONFIG}
  }

  function saveConfig() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('towerDefenseConfig', JSON.stringify(GAME_CONFIG))
    }
  }

  function resetConfig() {
    GAME_CONFIG = {...DEFAULT_CONFIG}
    saveConfig()
  }

  let GAME_CONFIG = $state(loadConfig())
  let showConfigPanel = $state(false)

  // Game state
  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D
  let animationId: number
  let gameRunning = $state(false)
  let gameOver = $state(false)
  let health = $state(GAME_CONFIG.startingHealth)
  let money = $state(GAME_CONFIG.startingMoney)
  let wave = $state(0)
  let score = $state(0)
  let enemies = $state<Enemy[]>([])
  let towers = $state<Tower[]>([])
  let projectiles = $state<Projectile[]>([])
  let selectedTowerType = $state<"basic" | "sniper" | "blast" | "laser" | "freeze" | "missile" | null>(null)
  let hoveredCell = $state<{ x: number; y: number } | null>(null)
  let nextEnemyId = 0
  let nextTowerId = 0
  let nextProjectileId = 0
  let enemiesSpawned = $state(0)
  let lastSpawnTime = $state(0)
  let enemySpeedMultiplier = $state(1)
  let randomizePath = $state(true) // Default to true
  let secondEntrance = $state(false)
  let soundEnabled = $state(true) // Add sound toggle
  let airAttackEnabled = $state(true) // Add air attack mode
  let airAttackUsedThisWave = $state(false) // Track if air attack happened this wave
  let jetPosition = $state<{ x: number; y: number } | null>(null) // Jet emoji position for animation
  let explosionPosition = $state<{ x: number; y: number } | null>(null) // Explosion position
  let level = $state(1) // Add level system
  let levelCompleted = $state(false) // Show celebration when level is completed
  let countdown = $state(0) // Countdown timer before wave starts
  let countdownInterval: number | null = null
  let showBuyPlaceTowers = $state(false) // Show "Buy & Place Towers" overlay
  let blockedSquares = $state<Set<string>>(new Set()) // Squares blocked by air attack (stored as "x,y")

  // Tower quantity limits (loaded from config)
  let towerQuantities = $state({...GAME_CONFIG.towerQuantities})

  // Predefined path patterns
  const pathPatterns: Point[][] = [
    // Pattern 1 (Original)
    [
      { x: 0, y: 7 },
      { x: 5, y: 7 },
      { x: 5, y: 3 },
      { x: 10, y: 3 },
      { x: 10, y: 11 },
      { x: 15, y: 11 },
      { x: 15, y: 7 },
      { x: 20, y: 7 },
    ],
    // Pattern 2 (Zigzag)
    [
      { x: 0, y: 4 },
      { x: 7, y: 4 },
      { x: 7, y: 10 },
      { x: 13, y: 10 },
      { x: 13, y: 4 },
      { x: 20, y: 4 },
    ],
    // Pattern 3 (S-curve)
    [
      { x: 0, y: 10 },
      { x: 5, y: 10 },
      { x: 5, y: 5 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
      { x: 15, y: 10 },
      { x: 15, y: 5 },
      { x: 20, y: 5 },
    ],
    // Pattern 4 (U-shape)
    [
      { x: 0, y: 3 },
      { x: 10, y: 3 },
      { x: 10, y: 12 },
      { x: 20, y: 12 },
    ],
    // Pattern 5 (Spiral-like)
    [
      { x: 0, y: 7 },
      { x: 8, y: 7 },
      { x: 8, y: 3 },
      { x: 12, y: 3 },
      { x: 12, y: 11 },
      { x: 20, y: 11 },
    ],
  ]

  // Secondary entrance paths - these merge with primary path before exit
  // They need to connect to a point on the primary path, not go directly to edge
  const getSecondaryPathForPrimary = (primaryPath: Point[]): Point[][] => {
    // Find a merge point in the middle section of the primary path
    const mergeIndex = Math.floor(primaryPath.length / 2)
    const mergePoint = primaryPath[mergeIndex]

    return [
      // Pattern 1 (From top, merges with main path)
      [
        { x: mergePoint.x - 3, y: 0 },
        { x: mergePoint.x - 3, y: mergePoint.y },
        mergePoint,
      ],
      // Pattern 2 (From bottom, merges with main path)
      [
        { x: mergePoint.x + 3, y: 15 },
        { x: mergePoint.x + 3, y: mergePoint.y },
        mergePoint,
      ],
      // Pattern 3 (From top right, merges with main path)
      [
        { x: mergePoint.x + 5, y: 0 },
        { x: mergePoint.x + 5, y: mergePoint.y - 2 },
        { x: mergePoint.x, y: mergePoint.y - 2 },
        mergePoint,
      ],
    ]
  }

  let secondaryPathPatterns: Point[][] = $state(getSecondaryPathForPrimary(pathPatterns[0]))

  // Current active paths
  let path: Point[] = $state(pathPatterns[0])
  let secondaryPath: Point[] = $state(secondaryPathPatterns[0])
  let pathPixels: Point[] = $state([])
  let secondaryPathPixels: Point[] = $state([])

  // Sound effects using Web Audio API
  // Create a single AudioContext to prevent memory leaks and browser limits
  let audioContext: AudioContext | null = null

  const getAudioContext = () => {
    if (!audioContext) {
      try {
        audioContext = new AudioContext()
      } catch (e) {
        console.error("Failed to create AudioContext:", e)
      }
    }
    return audioContext
  }

  const playSound = (frequency: number, duration: number, type: OscillatorType = "sine") => {
    if (!soundEnabled) return

    try {
      const ctx = getAudioContext()
      if (!ctx) return

      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.frequency.value = frequency
      oscillator.type = type

      gainNode.gain.setValueAtTime(0.1, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + duration)
    } catch (e) {
      // Silently fail if audio context not available
    }
  }

  const sounds = {
    shoot: () => playSound(400, 0.1, "square"),
    hit: () => playSound(200, 0.1, "sawtooth"),
    explosion: () => {
      playSound(100, 0.2, "sawtooth")
      setTimeout(() => playSound(50, 0.1, "sawtooth"), 50)
    },
    laser: () => playSound(800, 0.15, "sine"),
    freeze: () => playSound(600, 0.2, "triangle"),
    missile: () => playSound(300, 0.3, "square"),
    enemyDeath: () => playSound(150, 0.15, "triangle"),
    damage: () => playSound(100, 0.1, "sawtooth"),
  }

  // Tower types with distinct colors and emojis
  const towerTypes = {
    basic: {
      name: "Basic Tower",
      emoji: "🔵",
      cost: 50,
      damage: 10,
      range: 120,
      fireRate: 800,
      color: "#3b82f6", // Blue
      description: "Balanced tower",
    },
    sniper: {
      name: "Sniper Tower",
      emoji: "🎯",
      cost: 120,
      damage: 30,
      range: 200,
      fireRate: 1500,
      color: "#a855f7", // Purple (changed for distinction)
      description: "Long range, slow fire",
    },
    blast: {
      name: "Blast Tower",
      emoji: "💥",
      cost: 75,
      damage: 25,
      range: 100,
      fireRate: 1250,
      color: "#f59e0b", // Orange
      description: "Area damage",
    },
    laser: {
      name: "Laser Tower",
      emoji: "⚡",
      cost: 150,
      damage: 3,
      range: 150,
      fireRate: 100,
      color: "#10b981", // Green (changed from cyan for distinction)
      description: "15 burst shots, 2s reload",
    },
    freeze: {
      name: "Freeze Tower",
      emoji: "❄️",
      cost: 90,
      damage: 0,
      range: 160,
      fireRate: 2500,
      color: "#06b6d4", // Cyan
      description: "Slows 50%, 5s duration",
    },
    missile: {
      name: "Missile Tower",
      emoji: "🚀",
      cost: 200,
      damage: 40,
      range: 250,
      fireRate: 1500,
      color: "#dc2626", // Red
      description: "Massive damage (70%)",
    },
  }

  // Enemy types (speeds now controlled by config)
  function getEnemyTypes() {
    return {
      basic: { health: 50, speed: GAME_CONFIG.baseEnemySpeed, reward: 10, color: "#ef4444" },
      fast: { health: 30, speed: GAME_CONFIG.fastEnemySpeed, reward: 15, color: "#ec4899" },
      tank: { health: 150, speed: GAME_CONFIG.tankEnemySpeed, reward: 30, color: "#78350f" },
    }
  }

  function convertPathToPixels(gridPath: Point[]): Point[] {
    return gridPath.map((p) => ({
      x: p.x * GRID_SIZE + GRID_SIZE / 2,
      y: p.y * GRID_SIZE + GRID_SIZE / 2,
    }))
  }

  function selectRandomPath() {
    if (randomizePath) {
      const randomIndex = Math.floor(Math.random() * pathPatterns.length)
      path = pathPatterns[randomIndex]
    } else {
      path = pathPatterns[0]
    }
    pathPixels = convertPathToPixels(path)

    if (secondEntrance) {
      // Regenerate secondary paths based on the selected primary path
      secondaryPathPatterns = getSecondaryPathForPrimary(path)
      const randomSecondaryIndex = Math.floor(Math.random() * secondaryPathPatterns.length)
      secondaryPath = secondaryPathPatterns[randomSecondaryIndex]
      secondaryPathPixels = convertPathToPixels(secondaryPath)
    }
  }

  onMount(() => {
    ctx = canvas.getContext("2d")!
    selectRandomPath()
    draw()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  })

  function startGame() {
    gameRunning = true
    gameOver = false
    health = GAME_CONFIG.startingHealth
    money = GAME_CONFIG.startingMoney
    wave = 0
    level = 1
    score = 0
    enemies = []
    towers = []
    projectiles = []
    selectedTowerType = null
    nextEnemyId = 0
    nextTowerId = 0
    nextProjectileId = 0
    enemiesSpawned = 0
    lastSpawnTime = 0
    towerQuantities = {...GAME_CONFIG.towerQuantities}
    blockedSquares = new Set()
    selectRandomPath()

    // Start countdown timer - auto-starts wave when it reaches 0
    countdown = 5
    if (countdownInterval) clearInterval(countdownInterval)

    countdownInterval = setInterval(() => {
      countdown--
      if (countdown <= 0) {
        if (countdownInterval) clearInterval(countdownInterval)
        countdownInterval = null
        startWave()
      }
    }, 1000) as unknown as number
  }

  function startWave() {
    if (enemies.length > 0) return

    // Check if we just completed a level (all waves done)
    if (wave > 0 && wave % GAME_CONFIG.wavesPerLevel === 0) {
      // Level completed! Show celebration
      levelCompleted = true

      // Play celebration sound
      if (soundEnabled) {
        playSound(523, 0.15, "sine") // C
        setTimeout(() => playSound(659, 0.15, "sine"), 150) // E
        setTimeout(() => playSound(784, 0.15, "sine"), 300) // G
        setTimeout(() => playSound(1047, 0.3, "sine"), 450) // High C
      }

      // Hide celebration after 1 second, then start countdown that auto-starts wave
      setTimeout(() => {
        levelCompleted = false

        // Start 5 second countdown that auto-starts the next wave
        countdown = 5
        if (countdownInterval) clearInterval(countdownInterval)

        countdownInterval = setInterval(() => {
          countdown--
          if (countdown <= 0) {
            if (countdownInterval) clearInterval(countdownInterval)
            countdownInterval = null
            // Auto-start the next wave after countdown
            wave++
            enemiesSpawned = 0
            lastSpawnTime = Date.now()
            airAttackUsedThisWave = false
          }
        }, 1000) as unknown as number
      }, 1000)

      // Reset for next level
      level++
      wave = 0 // Reset wave counter

      // Increase enemy speed based on config
      if (GAME_CONFIG.enemySpeedScalingType === "multiplicative") {
        enemySpeedMultiplier *= (1 + GAME_CONFIG.enemySpeedPerLevel)
      } else {
        enemySpeedMultiplier += GAME_CONFIG.enemySpeedPerLevel
      }

      // Clear all towers if configured
      if (GAME_CONFIG.clearTowersBetweenLevels) {
        towers = []
      }

      // Restore all tower quantities
      towerQuantities = {...GAME_CONFIG.towerQuantities}

      // Clear blocked squares for new level
      blockedSquares = new Set()

      // Keep same road pattern if randomize is off, otherwise select new one
      if (randomizePath) {
        selectRandomPath()
      }

      // Reset or keep money based on config, plus bonus for level completion
      if (!GAME_CONFIG.keepMoneyBetweenLevels) {
        money = GAME_CONFIG.startingMoney + GAME_CONFIG.levelCompletionBonus
      } else {
        money += GAME_CONFIG.levelCompletionBonus
      }

      // Don't continue - countdown will auto-start wave
      return
    }

    wave++
    enemiesSpawned = 0
    lastSpawnTime = Date.now()
    airAttackUsedThisWave = false // Reset air attack for new wave
  }

  function spawnEnemy() {
    const types: Array<"basic" | "fast" | "tank"> = ["basic", "fast", "tank"]
    const weights = [
      GAME_CONFIG.enemySpawnWeights.basic,
      GAME_CONFIG.enemySpawnWeights.fast,
      GAME_CONFIG.enemySpawnWeights.tank
    ]
    const rand = Math.random()
    let type: "basic" | "fast" | "tank" = "basic"

    if (rand < weights[0]) type = "basic"
    else if (rand < weights[0] + weights[1]) type = "fast"
    else type = "tank"

    const enemyConfig = getEnemyTypes()[type]
    const healthMultiplier = 1 + (wave - 1) * GAME_CONFIG.enemyHealthPerWave

    // Choose which entrance to spawn from
    const useSecondEntrance = secondEntrance && Math.random() > 0.5
    const spawnPath = useSecondEntrance ? secondaryPathPixels : pathPixels

    enemies.push({
      id: nextEnemyId++,
      x: spawnPath[0].x,
      y: spawnPath[0].y,
      health: enemyConfig.health * healthMultiplier,
      maxHealth: enemyConfig.health * healthMultiplier,
      speed: enemyConfig.speed * enemySpeedMultiplier,
      baseSpeed: enemyConfig.speed * enemySpeedMultiplier,
      pathIndex: 0,
      reward: enemyConfig.reward,
      type,
      slowedUntil: 0,
      isSecondaryPath: useSecondEntrance,
    })
  }

  function updateEnemies(deltaTime: number) {
    // Spawn enemies for current wave using config
    const enemyCount = GAME_CONFIG.baseEnemyCount + wave * GAME_CONFIG.enemyCountPerWave
    if (gameRunning && wave > 0 && enemiesSpawned < enemyCount) {
      const now = Date.now()
      const spawnInterval = Math.max(
        GAME_CONFIG.minSpawnInterval,
        GAME_CONFIG.baseSpawnInterval - (wave - 1) * GAME_CONFIG.spawnIntervalDecrease
      )
      if (now - lastSpawnTime > spawnInterval) {
        spawnEnemy()
        enemiesSpawned++
        lastSpawnTime = now
      }
    }

    // Check if we should enable warp speed
    // 1. Check if any enemy is in range of any tower OR will pass a tower ahead
    let anyEnemyInRangeOrWillPass = false
    for (const tower of towers) {
      for (const enemy of enemies) {
        // Check current distance
        const dx = enemy.x - tower.x
        const dy = enemy.y - tower.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance <= tower.range) {
          anyEnemyInRangeOrWillPass = true
          break
        }

        // Check if enemy will pass this tower (look ahead on path)
        const enemyPath = enemy.isSecondaryPath ? secondaryPathPixels : pathPixels
        for (let j = enemy.pathIndex; j < enemyPath.length; j++) {
          const pathPoint = enemyPath[j]
          const pathDx = pathPoint.x - tower.x
          const pathDy = pathPoint.y - tower.y
          const pathDistance = Math.sqrt(pathDx * pathDx + pathDy * pathDy)
          if (pathDistance <= tower.range) {
            anyEnemyInRangeOrWillPass = true
            break
          }
        }
        if (anyEnemyInRangeOrWillPass) break
      }
      if (anyEnemyInRangeOrWillPass) break
    }

    // 2. Check if player can afford any available towers
    let canAffordAnyTower = false
    for (const [key, tower] of Object.entries(towerTypes)) {
      const quantity = towerQuantities[key as keyof typeof towerQuantities]
      const isOutOfStock = quantity !== 0 && quantity <= 0
      if (!isOutOfStock && money >= tower.cost) {
        canAffordAnyTower = true
        break
      }
    }

    // Enable warp speed if no enemies will pass towers and can't afford more towers
    const warpSpeed = !anyEnemyInRangeOrWillPass && !canAffordAnyTower && enemies.length > 0

    // Move enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i]

      // Update slow effect
      const now = Date.now()
      if (now < enemy.slowedUntil) {
        enemy.speed = enemy.baseSpeed * GAME_CONFIG.freezeSlowPercent
      } else if (warpSpeed) {
        enemy.speed = enemy.baseSpeed * GAME_CONFIG.warpSpeedMultiplier
      } else {
        enemy.speed = enemy.baseSpeed
      }

      // Use appropriate path for this enemy
      let enemyPath = enemy.isSecondaryPath ? secondaryPathPixels : pathPixels

      // Check if enemy from secondary path has reached the merge point
      if (enemy.isSecondaryPath && enemy.pathIndex >= secondaryPathPixels.length - 1) {
        // Switch to primary path at the merge point
        const mergePoint = secondaryPathPixels[secondaryPathPixels.length - 1]

        // Find the index of this merge point in the primary path
        let mergeIndexInPrimary = -1
        for (let j = 0; j < pathPixels.length; j++) {
          if (Math.abs(pathPixels[j].x - mergePoint.x) < 5 && Math.abs(pathPixels[j].y - mergePoint.y) < 5) {
            mergeIndexInPrimary = j
            break
          }
        }

        if (mergeIndexInPrimary !== -1) {
          enemy.isSecondaryPath = false
          enemy.pathIndex = mergeIndexInPrimary
          enemyPath = pathPixels
        }
      }

      if (enemy.pathIndex >= enemyPath.length - 1) {
        // Enemy reached the end
        enemies.splice(i, 1)
        health--
        sounds.damage()
        if (health <= 0) {
          gameOver = true
          gameRunning = false
        }
        continue
      }

      const target = enemyPath[enemy.pathIndex + 1]
      const dx = target.x - enemy.x
      const dy = target.y - enemy.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < 5) {
        enemy.pathIndex++
      } else {
        const moveDistance = enemy.speed * deltaTime * 60
        enemy.x += (dx / distance) * moveDistance
        enemy.y += (dy / distance) * moveDistance
      }

      // Remove dead enemies
      if (enemy.health <= 0) {
        money += enemy.reward
        score += enemy.reward
        enemies.splice(i, 1)
        sounds.enemyDeath()
      }
    }
  }

  function updateTowers() {
    const now = Date.now()

    for (const tower of towers) {
      // Special handling for laser tower burst fire
      if (tower.type === "laser") {
        if (tower.burstCount === undefined) {
          tower.burstCount = 15
          tower.burstMax = 15
        }

        // If in reload mode (burst depleted)
        if (tower.burstCount === 0) {
          if (now - tower.lastFired >= 2000) {
            tower.burstCount = 15
          } else {
            continue
          }
        }

        // Check fire rate
        if (now - tower.lastFired < tower.fireRate) continue
      } else {
        if (now - tower.lastFired < tower.fireRate) continue
      }

      // Find enemy in range
      let closestEnemy: Enemy | null = null
      let closestDistance = Infinity

      for (const enemy of enemies) {
        // Skip already frozen enemies for freeze tower
        if (tower.type === "freeze" && now < enemy.slowedUntil) {
          continue
        }

        const dx = enemy.x - tower.x
        const dy = enemy.y - tower.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance <= tower.range && distance < closestDistance) {
          closestEnemy = enemy
          closestDistance = distance
        }
      }

      if (closestEnemy) {
        // Fire projectile
        projectiles.push({
          id: nextProjectileId++,
          x: tower.x,
          y: tower.y,
          targetX: closestEnemy.x,
          targetY: closestEnemy.y,
          damage: tower.damage,
          speed: tower.type === "laser" ? 15 : tower.type === "missile" ? 8 : 10,
          target: closestEnemy,
          type: tower.type,
        })
        tower.lastFired = now

        // Update burst count for laser
        if (tower.type === "laser" && tower.burstCount !== undefined) {
          tower.burstCount--
        }

        // Play sound based on tower type
        if (tower.type === "laser") sounds.laser()
        else if (tower.type === "freeze") sounds.freeze()
        else if (tower.type === "missile") sounds.missile()
        else sounds.shoot()
      }
    }
  }

  function updateProjectiles(deltaTime: number) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const projectile = projectiles[i]

      // Update target position if tracking
      if (projectile.target && projectile.type !== "sniper") {
        projectile.targetX = projectile.target.x
        projectile.targetY = projectile.target.y
      }

      const dx = projectile.targetX - projectile.x
      const dy = projectile.targetY - projectile.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance < 10) {
        // Hit target
        if (projectile.type === "freeze") {
          // Freeze effect using config
          if (projectile.target) {
            const now = Date.now()
            projectile.target.slowedUntil = now + GAME_CONFIG.freezeDuration
            sounds.hit()
          }
        } else if (projectile.type === "blast" || projectile.type === "missile") {
          // Splash damage using config
          sounds.explosion()
          for (const enemy of enemies) {
            const edx = enemy.x - projectile.targetX
            const edy = enemy.y - projectile.targetY
            const edist = Math.sqrt(edx * edx + edy * edy)
            const radius = projectile.type === "missile" ? GAME_CONFIG.missileRadius : GAME_CONFIG.blastRadius
            if (edist < radius) {
              enemy.health -= projectile.damage * (1 - edist / radius)
            }
          }
        } else if (projectile.target) {
          projectile.target.health -= projectile.damage
          sounds.hit()
        }
        projectiles.splice(i, 1)
      } else {
        const moveDistance = projectile.speed * deltaTime * 60
        projectile.x += (dx / distance) * moveDistance
        projectile.y += (dy / distance) * moveDistance
      }
    }
  }

  function triggerAirAttack() {
    // Only trigger during configured wave of each level (e.g., wave 5 in each level)
    const waveInLevel = ((wave - 1) % GAME_CONFIG.wavesPerLevel) + 1
    if (!airAttackEnabled || towers.length === 0 || airAttackUsedThisWave || waveInLevel !== GAME_CONFIG.airAttackWave) return

    // Trigger once at halfway through wave
    const enemyCount = GAME_CONFIG.baseEnemyCount + wave * GAME_CONFIG.enemyCountPerWave
    const waveProgress = enemiesSpawned / enemyCount
    if (waveProgress < 0.5) return // Wait until halfway through wave

    // Find tower causing most damage
    const towerDamageStats = new Map<number, number>()

    // Calculate total damage potential for each tower
    for (const tower of towers) {
      const damageScore = tower.damage * (tower.level || 1) * (1000 / tower.fireRate)
      towerDamageStats.set(tower.id, damageScore)
    }

    // Find tower with highest damage
    let maxDamage = 0
    let targetTower: Tower | null = null
    for (const tower of towers) {
      const damage = towerDamageStats.get(tower.id) || 0
      if (damage > maxDamage) {
        maxDamage = damage
        targetTower = tower
      }
    }

    if (targetTower) {
      airAttackUsedThisWave = true

      // Store the target tower's grid position for later reference
      const targetGridX = targetTower.gridX
      const targetGridY = targetTower.gridY
      const targetX = targetTower.x
      const targetY = targetTower.y

      // Start jet animation from left side
      jetPosition = { x: -50, y: targetY }

      // Animate jet flying to tower
      const jetInterval = setInterval(() => {
        if (jetPosition) {
          jetPosition = { x: jetPosition.x + 20, y: jetPosition.y }

          // When jet reaches tower, drop explosion
          if (jetPosition.x >= targetX) {
            clearInterval(jetInterval)

            // Remove tower
            const index = towers.findIndex(t => t.id === targetTower.id)
            if (index !== -1) {
              towers.splice(index, 1)
              sounds.explosion()
              // Give some money back based on config
              money += Math.floor(targetTower.cost * GAME_CONFIG.airAttackRefundPercent)
            }

            // Add permanent skull marker to blocked squares
            blockedSquares.add(`${targetGridX},${targetGridY}`)

            // Clear jet after animation, but keep explosion as permanent skull
            setTimeout(() => {
              jetPosition = null
            }, 500)
          }
        }
      }, 50)
    }
  }

  function update(deltaTime: number) {
    if (!gameRunning) return

    updateEnemies(deltaTime)
    updateTowers()
    updateProjectiles(deltaTime)
    triggerAirAttack()
  }

  let lastTime = Date.now()

  function draw() {
    const now = Date.now()
    const deltaTime = (now - lastTime) / 1000
    lastTime = now

    update(deltaTime)

    // Clear canvas
    ctx.fillStyle = "#1f2937"
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Draw grid
    ctx.strokeStyle = "#374151"
    ctx.lineWidth = 1
    for (let x = 0; x <= GRID_WIDTH; x++) {
      ctx.beginPath()
      ctx.moveTo(x * GRID_SIZE, 0)
      ctx.lineTo(x * GRID_SIZE, CANVAS_HEIGHT)
      ctx.stroke()
    }
    for (let y = 0; y <= GRID_HEIGHT; y++) {
      ctx.beginPath()
      ctx.moveTo(0, y * GRID_SIZE)
      ctx.lineTo(CANVAS_WIDTH, y * GRID_SIZE)
      ctx.stroke()
    }

    // Draw primary path
    ctx.strokeStyle = "#4b5563"
    ctx.lineWidth = GRID_SIZE * 0.8
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    ctx.moveTo(pathPixels[0].x, pathPixels[0].y)
    for (let i = 1; i < pathPixels.length; i++) {
      ctx.lineTo(pathPixels[i].x, pathPixels[i].y)
    }
    ctx.stroke()

    // Draw secondary path if enabled
    if (secondEntrance && secondaryPathPixels.length > 0) {
      ctx.strokeStyle = "#6b7280"
      ctx.beginPath()
      ctx.moveTo(secondaryPathPixels[0].x, secondaryPathPixels[0].y)
      for (let i = 1; i < secondaryPathPixels.length; i++) {
        ctx.lineTo(secondaryPathPixels[i].x, secondaryPathPixels[i].y)
      }
      ctx.stroke()
    }

    // Draw hover highlight
    if (hoveredCell && selectedTowerType) {
      const canPlace = canPlaceTower(hoveredCell.x, hoveredCell.y)
      ctx.fillStyle = canPlace ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"
      ctx.fillRect(
        hoveredCell.x * GRID_SIZE,
        hoveredCell.y * GRID_SIZE,
        GRID_SIZE,
        GRID_SIZE,
      )

      if (canPlace) {
        // Draw range preview
        const range = towerTypes[selectedTowerType].range
        ctx.strokeStyle = "rgba(59, 130, 246, 0.3)"
        ctx.fillStyle = "rgba(59, 130, 246, 0.1)"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(
          hoveredCell.x * GRID_SIZE + GRID_SIZE / 2,
          hoveredCell.y * GRID_SIZE + GRID_SIZE / 2,
          range,
          0,
          Math.PI * 2,
        )
        ctx.fill()
        ctx.stroke()
      }
    }

    // Draw towers
    for (const tower of towers) {
      const towerNow = Date.now()
      const config = towerTypes[tower.type]
      ctx.fillStyle = config.color
      ctx.fillRect(
        tower.gridX * GRID_SIZE + 5,
        tower.gridY * GRID_SIZE + 5,
        GRID_SIZE - 10,
        GRID_SIZE - 10,
      )

      // Draw reload cooldown timer
      const timeSinceLastFired = towerNow - tower.lastFired
      let reloadTime = tower.fireRate

      // Special handling for laser tower - show reload timer when burst is depleted
      if (tower.type === "laser" && tower.burstCount === 0) {
        reloadTime = 2000 // 2s reload
      }

      const reloadProgress = Math.min(timeSinceLastFired / reloadTime, 1)

      if (reloadProgress < 1) {
        // Draw circular reload timer
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(
          tower.x,
          tower.y,
          18,
          -Math.PI / 2,
          -Math.PI / 2 + (Math.PI * 2 * reloadProgress),
        )
        ctx.stroke()
      }

      // Draw emoji icon
      ctx.font = "20px Arial"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(
        config.emoji,
        tower.x,
        tower.y,
      )

      // Draw level
      if (tower.level > 1) {
        ctx.fillStyle = "#ffffff"
        ctx.font = "bold 12px monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "alphabetic"
        ctx.fillText(
          `${tower.level}`,
          tower.x,
          tower.gridY * GRID_SIZE + GRID_SIZE - 5,
        )
      }
    }

    // Draw enemies
    for (const enemy of enemies) {
      const config = getEnemyTypes()[enemy.type]
      const isSlowed = Date.now() < enemy.slowedUntil

      // Draw slowed indicator
      if (isSlowed) {
        ctx.strokeStyle = "#0ea5e9"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(enemy.x, enemy.y, 15, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.fillStyle = config.color
      ctx.beginPath()
      ctx.arc(enemy.x, enemy.y, 12, 0, Math.PI * 2)
      ctx.fill()

      // Health bar
      const healthPercent = enemy.health / enemy.maxHealth
      ctx.fillStyle = "#1f2937"
      ctx.fillRect(enemy.x - 15, enemy.y - 20, 30, 4)
      ctx.fillStyle = healthPercent > 0.5 ? "#22c55e" : healthPercent > 0.25 ? "#eab308" : "#ef4444"
      ctx.fillRect(enemy.x - 15, enemy.y - 20, 30 * healthPercent, 4)
    }

    // Draw projectiles
    for (const projectile of projectiles) {
      if (projectile.type === "blast") {
        ctx.fillStyle = "#f59e0b"
        ctx.beginPath()
        ctx.arc(projectile.x, projectile.y, 6, 0, Math.PI * 2)
        ctx.fill()
      } else if (projectile.type === "sniper") {
        ctx.fillStyle = "#8b5cf6"
        ctx.fillRect(projectile.x - 3, projectile.y - 3, 6, 6)
      } else if (projectile.type === "laser") {
        // Draw laser beam
        ctx.strokeStyle = "#06b6d4"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(projectile.x, projectile.y)
        const angle = Math.atan2(projectile.targetY - projectile.y, projectile.targetX - projectile.x)
        ctx.lineTo(projectile.x + Math.cos(angle) * 20, projectile.y + Math.sin(angle) * 20)
        ctx.stroke()
        ctx.fillStyle = "#06b6d4"
        ctx.beginPath()
        ctx.arc(projectile.x, projectile.y, 3, 0, Math.PI * 2)
        ctx.fill()
      } else if (projectile.type === "freeze") {
        ctx.fillStyle = "#0ea5e9"
        ctx.strokeStyle = "#7dd3fc"
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(projectile.x, projectile.y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      } else if (projectile.type === "missile") {
        // Draw missile
        ctx.fillStyle = "#dc2626"
        ctx.save()
        ctx.translate(projectile.x, projectile.y)
        const angle = Math.atan2(projectile.targetY - projectile.y, projectile.targetX - projectile.x)
        ctx.rotate(angle)
        ctx.fillRect(-8, -3, 16, 6)
        ctx.fillStyle = "#fca5a5"
        ctx.fillRect(-8, -2, 4, 4)
        ctx.restore()
      } else {
        ctx.fillStyle = "#3b82f6"
        ctx.beginPath()
        ctx.arc(projectile.x, projectile.y, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Draw jet for air attack
    if (jetPosition) {
      ctx.font = "30px Arial"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("✈️", jetPosition.x, jetPosition.y)
    }

    // Draw permanent skull markers on blocked squares
    for (const coordStr of blockedSquares) {
      const [gridX, gridY] = coordStr.split(',').map(Number)
      ctx.font = "30px Arial"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("💀", gridX * GRID_SIZE + GRID_SIZE / 2, gridY * GRID_SIZE + GRID_SIZE / 2)
    }

    animationId = requestAnimationFrame(draw)
  }

  function canPlaceTower(gridX: number, gridY: number): boolean {
    // Check if square is blocked by air attack
    if (blockedSquares.has(`${gridX},${gridY}`)) {
      return false
    }

    // Check if on primary path
    for (let i = 0; i < path.length - 1; i++) {
      const p1 = path[i]
      const p2 = path[i + 1]
      const minX = Math.min(p1.x, p2.x)
      const maxX = Math.max(p1.x, p2.x)
      const minY = Math.min(p1.y, p2.y)
      const maxY = Math.max(p1.y, p2.y)

      if (gridX >= minX && gridX <= maxX && gridY >= minY && gridY <= maxY) {
        return false
      }
    }

    // Check if on secondary path
    if (secondEntrance) {
      for (let i = 0; i < secondaryPath.length - 1; i++) {
        const p1 = secondaryPath[i]
        const p2 = secondaryPath[i + 1]
        const minX = Math.min(p1.x, p2.x)
        const maxX = Math.max(p1.x, p2.x)
        const minY = Math.min(p1.y, p2.y)
        const maxY = Math.max(p1.y, p2.y)

        if (gridX >= minX && gridX <= maxX && gridY >= minY && gridY <= maxY) {
          return false
        }
      }
    }

    // Check if tower already exists
    return !towers.some((t) => t.gridX === gridX && t.gridY === gridY)
  }

  function handleCanvasClick(e: MouseEvent) {
    if (!selectedTowerType) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const gridX = Math.floor(x / GRID_SIZE)
    const gridY = Math.floor(y / GRID_SIZE)

    if (gridX < 0 || gridX >= GRID_WIDTH || gridY < 0 || gridY >= GRID_HEIGHT)
      return

    const towerConfig = towerTypes[selectedTowerType]
    if (money < towerConfig.cost) return
    if (!canPlaceTower(gridX, gridY)) return

    // Check tower quantity limit (0 means no limit)
    if (towerQuantities[selectedTowerType] !== 0 && towerQuantities[selectedTowerType] <= 0) return

    towers.push({
      id: nextTowerId++,
      gridX,
      gridY,
      x: gridX * GRID_SIZE + GRID_SIZE / 2,
      y: gridY * GRID_SIZE + GRID_SIZE / 2,
      type: selectedTowerType,
      damage: towerConfig.damage * GAME_CONFIG.towerDamageMultiplier,
      range: towerConfig.range * GAME_CONFIG.towerRangeMultiplier,
      fireRate: towerConfig.fireRate,
      lastFired: 0,
      cost: towerConfig.cost,
      level: 1,
    })

    money -= towerConfig.cost

    // Decrement tower quantity if limited
    if (towerQuantities[selectedTowerType] > 0) {
      towerQuantities[selectedTowerType]--
    }

    selectedTowerType = null
  }

  function handleCanvasMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const gridX = Math.floor(x / GRID_SIZE)
    const gridY = Math.floor(y / GRID_SIZE)

    if (gridX >= 0 && gridX < GRID_WIDTH && gridY >= 0 && gridY < GRID_HEIGHT) {
      hoveredCell = { x: gridX, y: gridY }
    } else {
      hoveredCell = null
    }
  }

  function selectTowerType(type: "basic" | "sniper" | "blast" | "laser" | "freeze" | "missile") {
    selectedTowerType = selectedTowerType === type ? null : type

    // Hide "Buy & Place Towers" overlay when first tower is selected
    if (showBuyPlaceTowers && selectedTowerType !== null) {
      showBuyPlaceTowers = false
    }
  }
</script>

<svelte:head>
  <title>🗼 Tower Assault | Dougie's Game Hub</title>
</svelte:head>

<div class="container mx-auto p-4 sm:p-8">
  <h1 class="text-4xl font-bold mb-6">🗼 Tower Assault</h1>

  <div class="flex flex-col xl:flex-row gap-8 xl:h-[calc(100vh-200px)]">
    <!-- Game Canvas + Config Container -->
    <div class="flex-shrink-0 flex flex-col gap-4">
      <div class="relative">
        <canvas
          bind:this={canvas}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          class="border-4 border-base-300 rounded-lg shadow-xl"
          onclick={handleCanvasClick}
          onmousemove={handleCanvasMouseMove}
          onmouseleave={() => (hoveredCell = null)}
        ></canvas>

        <!-- Subtle Countdown Timer (Top Right) -->
        {#if countdown > 0}
          <div class="absolute top-4 right-4 pointer-events-none">
            <div class="bg-black bg-opacity-80 rounded-lg px-4 py-2 text-center border-2 border-blue-500">
              <div class="text-sm text-blue-300 font-semibold mb-1">Wave starts in</div>
              <div class="text-4xl font-bold text-white">{countdown}</div>
            </div>
          </div>
        {/if}

        <!-- Level Complete Celebration Overlay -->
        {#if levelCompleted}
          <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div class="bg-gradient-to-br from-green-500 to-blue-500 bg-opacity-95 rounded-lg p-16 text-center shadow-2xl animate-pulse">
              <div class="text-6xl mb-4">🎉</div>
              <div class="text-5xl font-bold text-white mb-4">Level {level - 1} Complete!</div>
              <div class="text-3xl text-white">Starting Level {level}...</div>
              <div class="text-8xl mt-6">✨🎊✨</div>
            </div>
          </div>
        {/if}
      </div>

      <!-- Game Configuration Panel -->
      <div class="card bg-base-200 shadow-xl">
        <div class="card-body">
          <button
            class="flex justify-between items-center w-full text-left hover:bg-base-300 -m-2 p-2 rounded-lg transition-colors"
            onclick={() => showConfigPanel = !showConfigPanel}
            disabled={gameRunning}
          >
            <h2 class="card-title">⚙️ Game Configuration</h2>
            <span class="text-sm">
              {showConfigPanel ? '▼ Hide' : '▶ Show'}
            </span>
          </button>

          {#if showConfigPanel}
            <div class="divider my-2"></div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[400px] overflow-y-auto">
              <!-- Economy Settings -->
              <div class="space-y-4">
                <h3 class="font-semibold text-lg">💰 Economy</h3>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Starting Money</span>
                    <span class="label-text-alt">${GAME_CONFIG.startingMoney}</span>
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="500"
                    step="50"
                    bind:value={GAME_CONFIG.startingMoney}
                    onchange={saveConfig}
                    class="range range-primary range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Starting Health</span>
                    <span class="label-text-alt">{GAME_CONFIG.startingHealth}</span>
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="50"
                    step="5"
                    bind:value={GAME_CONFIG.startingHealth}
                    onchange={saveConfig}
                    class="range range-primary range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Level Completion Bonus</span>
                    <span class="label-text-alt">${GAME_CONFIG.levelCompletionBonus}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="500"
                    step="50"
                    bind:value={GAME_CONFIG.levelCompletionBonus}
                    onchange={saveConfig}
                    class="range range-primary range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label cursor-pointer">
                    <span class="label-text">Keep Money Between Levels</span>
                    <input
                      type="checkbox"
                      class="checkbox checkbox-primary"
                      bind:checked={GAME_CONFIG.keepMoneyBetweenLevels}
                      onchange={saveConfig}
                    />
                  </label>
                </div>

                <div class="form-control">
                  <label class="label cursor-pointer">
                    <span class="label-text">Clear Towers Between Levels</span>
                    <input
                      type="checkbox"
                      class="checkbox checkbox-primary"
                      bind:checked={GAME_CONFIG.clearTowersBetweenLevels}
                      onchange={saveConfig}
                    />
                  </label>
                </div>
              </div>

              <!-- Wave & Enemy Settings -->
              <div class="space-y-4">
                <h3 class="font-semibold text-lg">🌊 Waves & Enemies</h3>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Waves Per Level</span>
                    <span class="label-text-alt">{GAME_CONFIG.wavesPerLevel}</span>
                  </label>
                  <input
                    type="range"
                    min="3"
                    max="10"
                    step="1"
                    bind:value={GAME_CONFIG.wavesPerLevel}
                    onchange={saveConfig}
                    class="range range-secondary range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Base Enemy Count</span>
                    <span class="label-text-alt">{GAME_CONFIG.baseEnemyCount}</span>
                  </label>
                  <input
                    type="range"
                    min="3"
                    max="15"
                    step="1"
                    bind:value={GAME_CONFIG.baseEnemyCount}
                    onchange={saveConfig}
                    class="range range-secondary range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Enemies Added Per Wave</span>
                    <span class="label-text-alt">+{GAME_CONFIG.enemyCountPerWave}</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    bind:value={GAME_CONFIG.enemyCountPerWave}
                    onchange={saveConfig}
                    class="range range-secondary range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Enemy Health Per Wave</span>
                    <span class="label-text-alt">+{(GAME_CONFIG.enemyHealthPerWave * 100).toFixed(0)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.05"
                    bind:value={GAME_CONFIG.enemyHealthPerWave}
                    onchange={saveConfig}
                    class="range range-secondary range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Base Enemy Speed</span>
                    <span class="label-text-alt">{GAME_CONFIG.baseEnemySpeed.toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min="1.0"
                    max="4.0"
                    step="0.1"
                    bind:value={GAME_CONFIG.baseEnemySpeed}
                    onchange={saveConfig}
                    class="range range-secondary range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Fast Enemy Speed</span>
                    <span class="label-text-alt">{GAME_CONFIG.fastEnemySpeed.toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min="2.0"
                    max="6.0"
                    step="0.1"
                    bind:value={GAME_CONFIG.fastEnemySpeed}
                    onchange={saveConfig}
                    class="range range-secondary range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Tank Enemy Speed</span>
                    <span class="label-text-alt">{GAME_CONFIG.tankEnemySpeed.toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    bind:value={GAME_CONFIG.tankEnemySpeed}
                    onchange={saveConfig}
                    class="range range-secondary range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Enemy Speed Per Level</span>
                    <span class="label-text-alt">
                      {GAME_CONFIG.enemySpeedScalingType === 'multiplicative'
                        ? `×${(1 + GAME_CONFIG.enemySpeedPerLevel).toFixed(2)}`
                        : `+${GAME_CONFIG.enemySpeedPerLevel.toFixed(2)}`}
                    </span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="0.3"
                    step="0.05"
                    bind:value={GAME_CONFIG.enemySpeedPerLevel}
                    onchange={saveConfig}
                    class="range range-secondary range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Speed Scaling Type</span>
                  </label>
                  <select
                    class="select select-bordered select-sm w-full"
                    bind:value={GAME_CONFIG.enemySpeedScalingType}
                    onchange={saveConfig}
                  >
                    <option value="additive">Additive (Linear)</option>
                    <option value="multiplicative">Multiplicative (Exponential)</option>
                  </select>
                </div>
              </div>

              <!-- Tower Settings -->
              <div class="space-y-4">
                <h3 class="font-semibold text-lg">🏰 Tower Quantities</h3>

                {#each Object.entries(GAME_CONFIG.towerQuantities) as [towerKey, quantity]}
                  {@const towerName = towerTypes[towerKey as keyof typeof towerTypes].name}
                  <div class="form-control">
                    <label class="label">
                      <span class="label-text">{towerName}</span>
                      <span class="label-text-alt">{quantity}</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="1"
                      bind:value={GAME_CONFIG.towerQuantities[towerKey]}
                      onchange={saveConfig}
                      class="range range-accent range-xs"
                    />
                  </div>
                {/each}

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Tower Damage Multiplier</span>
                    <span class="label-text-alt">×{GAME_CONFIG.towerDamageMultiplier.toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.1"
                    bind:value={GAME_CONFIG.towerDamageMultiplier}
                    onchange={saveConfig}
                    class="range range-accent range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Tower Range Multiplier</span>
                    <span class="label-text-alt">×{GAME_CONFIG.towerRangeMultiplier.toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    bind:value={GAME_CONFIG.towerRangeMultiplier}
                    onchange={saveConfig}
                    class="range range-accent range-xs"
                  />
                </div>
              </div>

              <!-- Spawn & Special Settings -->
              <div class="space-y-4">
                <h3 class="font-semibold text-lg">⚡ Advanced Settings</h3>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Base Spawn Interval (ms)</span>
                    <span class="label-text-alt">{GAME_CONFIG.baseSpawnInterval}ms</span>
                  </label>
                  <input
                    type="range"
                    min="500"
                    max="3000"
                    step="100"
                    bind:value={GAME_CONFIG.baseSpawnInterval}
                    onchange={saveConfig}
                    class="range range-warning range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Warp Speed Multiplier</span>
                    <span class="label-text-alt">×{GAME_CONFIG.warpSpeedMultiplier}</span>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="20"
                    step="1"
                    bind:value={GAME_CONFIG.warpSpeedMultiplier}
                    onchange={saveConfig}
                    class="range range-warning range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Freeze Slow Percent</span>
                    <span class="label-text-alt">{(GAME_CONFIG.freezeSlowPercent * 100).toFixed(0)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0.25"
                    max="0.75"
                    step="0.05"
                    bind:value={GAME_CONFIG.freezeSlowPercent}
                    onchange={saveConfig}
                    class="range range-warning range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Freeze Duration (ms)</span>
                    <span class="label-text-alt">{GAME_CONFIG.freezeDuration}ms</span>
                  </label>
                  <input
                    type="range"
                    min="2000"
                    max="10000"
                    step="500"
                    bind:value={GAME_CONFIG.freezeDuration}
                    onchange={saveConfig}
                    class="range range-warning range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Blast Radius</span>
                    <span class="label-text-alt">{GAME_CONFIG.blastRadius}px</span>
                  </label>
                  <input
                    type="range"
                    min="40"
                    max="120"
                    step="10"
                    bind:value={GAME_CONFIG.blastRadius}
                    onchange={saveConfig}
                    class="range range-warning range-xs"
                  />
                </div>

                <div class="form-control">
                  <label class="label">
                    <span class="label-text">Missile Radius</span>
                    <span class="label-text-alt">{GAME_CONFIG.missileRadius}px</span>
                  </label>
                  <input
                    type="range"
                    min="80"
                    max="200"
                    step="10"
                    bind:value={GAME_CONFIG.missileRadius}
                    onchange={saveConfig}
                    class="range range-warning range-xs"
                  />
                </div>
              </div>
            </div>

            <div class="divider my-4"></div>

            <div class="flex gap-2 justify-end">
              <button
                class="btn btn-error btn-sm"
                onclick={resetConfig}
              >
                Reset to Defaults
              </button>
              <button
                class="btn btn-success btn-sm"
                onclick={saveConfig}
              >
                💾 Save Configuration
              </button>
            </div>

            <div class="alert alert-info mt-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <span>Configuration is saved to your browser's local storage. Changes take effect on the next game.</span>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Controls Panel -->
    <div class="flex-1 flex flex-col gap-4">
      <!-- Stats Container -->
      <div class="card bg-base-200 shadow-xl">
        <div class="card-body p-4">
          <div class="stats stats-vertical lg:stats-horizontal shadow w-full">
            <div class="stat py-2">
              <div class="stat-title text-xs">Health</div>
              <div class="stat-value text-2xl text-error">{health}</div>
            </div>
            <div class="stat py-2">
              <div class="stat-title text-xs">Money</div>
              <div class="stat-value text-2xl text-success">${money}</div>
            </div>
            <div class="stat py-2">
              <div class="stat-title text-xs">Wave</div>
              <div class="stat-value text-2xl text-info">
                {wave}
              </div>
            </div>
            <div class="stat py-2">
              <div class="stat-title text-xs">Level</div>
              <div class="stat-value text-2xl text-warning">{level}</div>
            </div>
            <div class="stat py-2">
              <div class="stat-title text-xs">Score</div>
              <div class="stat-value text-2xl">{score}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings Container -->
      <div class="card bg-base-200 shadow-xl flex-1 xl:overflow-y-auto xl:max-h-full">
        <div class="card-body">
          <h2 class="card-title">Settings</h2>

        <div class="space-y-4">
          <!-- Options Section -->
          <div class="mb-2">
            <span class="label-text font-semibold">Options</span>
          </div>

          <!-- Sound Effects Toggle -->
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">Sound Effects</span>
              <input type="checkbox" class="checkbox" bind:checked={soundEnabled} />
            </label>
          </div>

          <!-- Randomize Path Option -->
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">Randomize Road Pattern</span>
              <input type="checkbox" class="checkbox" bind:checked={randomizePath} disabled={gameRunning} />
            </label>
          </div>

          <!-- Second Entrance Option -->
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">Second Enemy Entrance</span>
              <input type="checkbox" class="checkbox" bind:checked={secondEntrance} disabled={gameRunning} />
            </label>
          </div>

          <!-- Air Attack Option -->
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">Air Attack</span>
              <input type="checkbox" class="checkbox" bind:checked={airAttackEnabled} disabled={gameRunning} />
            </label>
          </div>

          <!-- Enemy Speed Setting -->
          <div class="divider my-2"></div>
          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Enemy Speed</span>
            </label>
            <div class="flex gap-2">
              <button
                class="btn btn-xs flex-1 {enemySpeedMultiplier === 0.5 ? 'btn-success' : 'btn-outline'}"
                onclick={() => (enemySpeedMultiplier = 0.5)}
                disabled={gameRunning}
              >
                Slow (0.5x)
              </button>
              <button
                class="btn btn-xs flex-1 {enemySpeedMultiplier === 1 ? 'btn-warning' : 'btn-outline'}"
                onclick={() => (enemySpeedMultiplier = 1)}
                disabled={gameRunning}
              >
                Normal (1x)
              </button>
              <button
                class="btn btn-xs flex-1 {enemySpeedMultiplier === 1.5 ? 'btn-error' : 'btn-outline'}"
                onclick={() => (enemySpeedMultiplier = 1.5)}
                disabled={gameRunning}
              >
                Fast (1.5x)
              </button>
            </div>
          </div>

          <!-- Game Status -->
          {#if gameOver}
            <div class="alert alert-error">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="stroke-current shrink-0 h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Game Over! Final Score: {score}</span>
            </div>
          {/if}

          <!-- Tower Selection -->
          <div class="divider">Select Tower to Place</div>
          <div class="grid grid-cols-1 gap-2">
            {#each Object.entries(towerTypes).sort(([, a], [, b]) => a.cost - b.cost) as [key, tower]}
              {@const quantity = towerQuantities[key as keyof typeof towerQuantities]}
              {@const isOutOfStock = quantity !== 0 && quantity <= 0}
              {@const isSelected = selectedTowerType === key}
              <button
                class="btn btn-block justify-start text-left {isSelected ? 'btn-success' : ''}"
                style="{isSelected ? 'background-color: #15803d; border-color: #15803d; color: white;' : `background-color: ${tower.color}; border-color: ${tower.color}; color: white;`}"
                onclick={() => selectTowerType(key as "basic" | "sniper" | "blast" | "laser" | "freeze" | "missile")}
                disabled={!gameRunning || money < tower.cost || isOutOfStock}
              >
                <div class="flex justify-between items-center w-full gap-2">
                  <div class="flex items-center gap-2">
                    <span class="font-bold">{tower.emoji} {tower.name}</span>
                    <span class="text-xs opacity-90">- {tower.description}</span>
                  </div>
                  <div class="flex gap-2 items-center flex-shrink-0">
                    <span>${tower.cost}</span>
                    {#if quantity > 0}
                      <span class="badge badge-sm">{quantity} left</span>
                    {/if}
                  </div>
                </div>
              </button>
            {/each}
          </div>

          {#if selectedTowerType}
            <div class="alert alert-success">
              <span>✓ Click on the grid to place tower</span>
            </div>
          {/if}

          <!-- Instructions -->
          <div class="divider"></div>
          <div>
            <h3 class="font-semibold mb-2">How to Play:</h3>
            <ul class="list-disc list-inside space-y-1 text-sm">
              <li>Start the game and then start each wave</li>
              <li>Select a tower type and click to place it</li>
              <li>Towers automatically shoot enemies in range</li>
              <li>Don't let enemies reach the end of the path</li>
              <li>Earn money by defeating enemies</li>
              <li>Complete {GAME_CONFIG.wavesPerLevel} waves to advance a level</li>
              <li>Enemy speed increases {GAME_CONFIG.enemySpeedScalingType === 'multiplicative' ? (GAME_CONFIG.enemySpeedPerLevel * 100).toFixed(0) + '%' : GAME_CONFIG.enemySpeedPerLevel + 'x'} each level</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Game Controls - Always Visible -->
    <div class="card bg-base-200 shadow-xl">
      <div class="card-body p-4">
        <div class="flex gap-2">
          {#if !gameRunning && !gameOver}
            <button class="btn btn-primary flex-1" onclick={startGame}>
              Start Game
            </button>
          {:else if gameOver}
            <button class="btn btn-primary flex-1" onclick={startGame}>
              New Game
            </button>
          {:else if wave === 0 || (enemies.length === 0 && enemiesSpawned >= GAME_CONFIG.baseEnemyCount + (wave - 1) * GAME_CONFIG.enemyCountPerWave)}
            {@const justCompletedLevel = wave > 0 && wave % GAME_CONFIG.wavesPerLevel === 0}
            {@const nextLevel = level + 1}
            <button class="btn btn-success flex-1" onclick={startWave}>
              {justCompletedLevel ? `Start Level ${nextLevel}` : `Start Wave ${wave + 1}`}
            </button>
          {:else}
            <button class="btn btn-disabled flex-1" disabled>
              Wave {wave} in Progress
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
  </div>
</div>

<style>
  canvas {
    display: block;
    background: #1f2937;
    cursor: crosshair;
  }
</style>
