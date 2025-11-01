<script lang="ts">
  import { onMount } from "svelte"

  let canvas = $state<HTMLCanvasElement>()
  let ctx: CanvasRenderingContext2D
  let animationId: number

  // Game state
  let gameRunning = $state(false)
  let gameOver = $state(false)
  let gameStarted = $state(false) // Track if game has ever been started
  let score = $state(0)
  let highScore = $state(0)
  let lives = $state(3)
  let level = $state(1)
  let difficulty = $state<"easy" | "normal" | "hard">("normal")
  let combo = $state(0)
  let maxCombo = $state(0)
  let soundEnabled = $state(true)
  let powerUpCount = $state(12) // Number of power-ups per level
  let startingLives = $state(5) // Number of lives at game start
  let powerUpDuration = $state(5) // Duration of power-ups in seconds

  // Canvas dimensions
  const CANVAS_WIDTH = 800
  const CANVAS_HEIGHT = 600

  // Player
  let player = $state({
    x: 375,
    y: 550,
    width: 50,
    height: 30,
    speed: 7,
    invincibleUntil: 0,
  })

  // Bullets
  type Bullet = { x: number; y: number; width: number; height: number; fromPowerUp?: string }
  let bullets = $state<Bullet[]>([])
  let bulletSpeed = $state(8)

  // Missiles
  type Missile = { x: number; y: number; width: number; height: number }
  let missiles = $state<Missile[]>([])
  let missileSpeed = $state(13)

  // Aliens
  type AlienType = "grunt" | "soldier" | "elite" | "boss"
  type Alien = {
    x: number
    y: number
    width: number
    height: number
    alive: boolean
    health: number
    maxHealth: number
    type: AlienType
    color: string
    points: number
    frame: number
  }
  let aliens = $state<Alien[]>([])
  let alienDirection = $state(1)
  let alienSpeed = $state(1)
  let alienFrame = $state(0)

  // Alien bullets
  let alienBullets = $state<
    Array<{ x: number; y: number; width: number; height: number }>
  >([])
  let alienBulletSpeed = $state(4)

  // Power-ups
  type PowerUpType = "rapidfire" | "shield" | "spreadshot" | "laser" | "star" | "missile"
  type PowerUp = {
    x: number
    y: number
    width: number
    height: number
    type: PowerUpType
    emoji: string
  }
  let powerUps = $state<PowerUp[]>([])
  let activePowerUp = $state<PowerUpType | null>(null)
  let powerUpTimeLeft = $state(0)
  let powerUpTotalDuration = $state(0)
  let activePowerUpEmoji = $state("")
  let queuePowerUps = $state(false)
  let powerUpQueue = $state<Array<{type: PowerUpType, emoji: string, duration: number}>>([])

  // Laser beam state
  let laserBeamActive = $state(false)
  let laserBeamTimeLeft = $state(0)
  let laserReadyToFire = $state(false)
  let laserUsed = $state(false)
  let laserInterval: number | null = null

  // Missile state
  let missileAvailable = $state(0)

  // Power-up interval tracking for cleanup
  let powerUpInterval: number | null = null
  let powerUpCountdownSeconds = $state(0)

  // Level transition timeout tracking
  let levelTransitionTimeout: number | null = null

  // Performance monitoring
  let lastFrameTime = 0
  let frameCount = 0
  let fps = 0

  // UFO
  let ufo = $state<{ x: number; y: number; width: number; height: number; active: boolean } | null>(null)
  let lastUfoSpawn = $state(0)

  // Shields/Bunkers
  type ShieldPixel = { x: number; y: number; health: number }
  let shields = $state<ShieldPixel[]>([])

  // Particles
  type Particle = {
    x: number
    y: number
    vx: number
    vy: number
    color: string
    life: number
    maxLife: number
    size: number
  }
  let particles = $state<Particle[]>([])
  const MAX_PARTICLES = 120 // Performance: Limit total particles to prevent lag

  // Score popups
  type ScorePopup = {
    x: number
    y: number
    text: string
    life: number
    maxLife: number
    color: string
  }
  let scorePopups = $state<ScorePopup[]>([])

  // Stars (background)
  type Star = { x: number; y: number; speed: number; size: number; brightness: number; twinkleSpeed: number; twinklePhase: number }
  let stars = $state<Star[]>([])

  // Muzzle flashes
  let playerMuzzleFlash = $state(0)
  let alienMuzzleFlashes = $state<Set<string>>(new Set())

  // Level transition
  let showLevelTransition = $state(false)
  let levelTransitionAlpha = $state(0)
  let levelTransitionTriggered = $state(false)

  // Controls
  let keys = {
    left: false,
    right: false,
    space: false,
    up: false,
    down: false,
  }

  let lastShot = 0
  let shootCooldown = $state(300)
  const BASE_SHOOT_COOLDOWN = 300

  onMount(() => {
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    ctx = context

    // Load high score
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("spaceInvadersHighScore")
      if (saved) highScore = parseInt(saved)
    }

    // Initialize starfield
    initStarfield()

    draw()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  })

  function initStarfield() {
    stars = []
    // PERFORMANCE: Reduced from 100 to 50 stars
    for (let i = 0; i < 50; i++) {
      stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        speed: Math.random() * 0.5 + 0.2,
        size: Math.random() * 2 + 0.5,
        brightness: Math.random(),
        twinkleSpeed: Math.random() * 0.05 + 0.01,
        twinklePhase: Math.random() * Math.PI * 2,
      })
    }
  }

  function updateStarfield() {
    for (let star of stars) {
      star.y += star.speed
      star.twinklePhase += star.twinkleSpeed
      star.brightness = (Math.sin(star.twinklePhase) + 1) / 2

      if (star.y > CANVAS_HEIGHT) {
        star.y = 0
        star.x = Math.random() * CANVAS_WIDTH
      }
    }
  }

  function drawStarfield() {
    if (!ctx) return
    for (let star of stars) {
      const alpha = star.brightness * 0.8 + 0.2
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`
      ctx.fillRect(star.x, star.y, star.size, star.size)
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") keys.left = true
    if (e.key === "ArrowRight") keys.right = true
    if (e.key === " ") {
      e.preventDefault()
      keys.space = true
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      keys.up = true
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      keys.down = true
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") keys.left = false
    if (e.key === "ArrowRight") keys.right = false
    if (e.key === " ") keys.space = false
    if (e.key === "ArrowUp") keys.up = false
    if (e.key === "ArrowDown") keys.down = false
  }

  function getDifficultyMultiplier(): { speed: number; fireRate: number; health: number } {
    switch (difficulty) {
      case "easy":
        return { speed: 0.7, fireRate: 0.5, health: 0.8 }
      case "normal":
        return { speed: 1.0, fireRate: 1.0, health: 1.0 }
      case "hard":
        return { speed: 1.5, fireRate: 2.0, health: 1.5 }
    }
  }

  function initGame() {
    score = 0
    lives = startingLives
    level = 1
    combo = 0
    maxCombo = 0
    gameOver = false
    gameRunning = true
    gameStarted = true
    showLevelTransition = false
    levelTransitionTriggered = false
    player.x = 375
    player.invincibleUntil = 0
    bullets = []
    alienBullets = []
    powerUps = []
    activePowerUp = null
    powerUpTimeLeft = 0
    powerUpTotalDuration = 0
    activePowerUpEmoji = ""
    powerUpQueue = []
    laserBeamActive = false
    laserBeamTimeLeft = 0
    laserReadyToFire = false
    laserUsed = false
    missileAvailable = 0
    missiles = []
    ufo = null
    lastUfoSpawn = Date.now()
    lastShot = 0
    particles = []
    scorePopups = []
    playerMuzzleFlash = 0
    alienMuzzleFlashes.clear()

    // PERFORMANCE: Clean up any lingering intervals
    if (powerUpInterval !== null) {
      clearInterval(powerUpInterval)
      powerUpInterval = null
    }
    if (laserInterval !== null) {
      clearInterval(laserInterval)
      laserInterval = null
    }
    if (levelTransitionTimeout !== null) {
      clearTimeout(levelTransitionTimeout)
      levelTransitionTimeout = null
    }

    const diffMult = getDifficultyMultiplier()
    alienSpeed = 1 * diffMult.speed
    alienBulletSpeed = 4 * diffMult.speed
    shootCooldown = BASE_SHOOT_COOLDOWN

    // Reset power-up tracking
    powerUpsDroppedThisLevel = 0
    powerUpDropIndices = []
    powerUpTypes = []

    createAliens()
    createShields()
  }

  function createAliens() {
    // Clear existing aliens completely
    aliens.length = 0
    aliens = []
    const diffMult = getDifficultyMultiplier()

    // Reset power-up tracking for new level
    powerUpsDroppedThisLevel = 0

    // Boss wave every 5th level
    if (level % 5 === 0) {
      // Boss wave - single large boss
      aliens.push({
        x: CANVAS_WIDTH / 2 - 60,
        y: 80,
        width: 120,
        height: 80,
        alive: true,
        health: Math.floor(20 * diffMult.health),
        maxHealth: Math.floor(20 * diffMult.health),
        type: "boss",
        color: "#ff0000",
        points: 500,
        frame: 0,
      })
    } else {
      // Regular waves with patterns
      const pattern = (level - 1) % 4

      if (pattern === 0) {
        // Classic formation - 4 rows x 10 columns
        for (let row = 0; row < 4; row++) {
          for (let col = 0; col < 10; col++) {
            const alienType: AlienType = row === 0 ? "elite" : row === 1 ? "soldier" : "grunt"
            const colors = { elite: "#ff00ff", soldier: "#00ffff", grunt: "#00ff00" }
            const healthMult = { elite: 2, soldier: 1, grunt: 1 }
            const pointsMult = { elite: 30, soldier: 20, grunt: 10 }

            aliens.push({
              x: 100 + col * 60,
              y: 50 + row * 50,
              width: 40,
              height: 30,
              alive: true,
              health: Math.floor(healthMult[alienType] * diffMult.health),
              maxHealth: Math.floor(healthMult[alienType] * diffMult.health),
              type: alienType,
              color: colors[alienType],
              points: pointsMult[alienType],
              frame: 0,
            })
          }
        }
      } else if (pattern === 1) {
        // V-formation
        for (let row = 0; row < 5; row++) {
          const cols = 6 + row * 2
          const alienWidth = 40
          const spacing = 50
          const totalWidth = (cols - 1) * spacing + alienWidth
          const startX = (CANVAS_WIDTH - totalWidth) / 2
          for (let col = 0; col < cols; col++) {
            const alienType: AlienType = row < 2 ? "elite" : row < 4 ? "soldier" : "grunt"
            const colors = { elite: "#ff00ff", soldier: "#00ffff", grunt: "#00ff00" }
            const healthMult = { elite: 2, soldier: 1, grunt: 1 }
            const pointsMult = { elite: 30, soldier: 20, grunt: 10 }

            aliens.push({
              x: startX + col * spacing,
              y: 50 + row * 45,
              width: alienWidth,
              height: 30,
              alive: true,
              health: Math.floor(healthMult[alienType] * diffMult.health),
              maxHealth: Math.floor(healthMult[alienType] * diffMult.health),
              type: alienType,
              color: colors[alienType],
              points: pointsMult[alienType],
              frame: 0,
            })
          }
        }
      } else if (pattern === 2) {
        // Diamond formation
        const rows = [3, 5, 7, 9, 7, 5, 3]
        for (let row = 0; row < rows.length; row++) {
          const cols = rows[row]
          const alienWidth = 35
          const spacing = 50
          const totalWidth = (cols - 1) * spacing + alienWidth
          const startX = (CANVAS_WIDTH - totalWidth) / 2
          for (let col = 0; col < cols; col++) {
            const alienType: AlienType = row < 2 ? "elite" : row < 5 ? "soldier" : "grunt"
            const colors = { elite: "#ff00ff", soldier: "#00ffff", grunt: "#00ff00" }
            const healthMult = { elite: 2, soldier: 1, grunt: 1 }
            const pointsMult = { elite: 30, soldier: 20, grunt: 10 }

            aliens.push({
              x: startX + col * spacing,
              y: 40 + row * 40,
              width: alienWidth,
              height: 28,
              alive: true,
              health: Math.floor(healthMult[alienType] * diffMult.health),
              maxHealth: Math.floor(healthMult[alienType] * diffMult.health),
              type: alienType,
              color: colors[alienType],
              points: pointsMult[alienType],
              frame: 0,
            })
          }
        }
      } else {
        // Scattered formation
        for (let i = 0; i < 35; i++) {
          const alienType: AlienType = i < 10 ? "elite" : i < 25 ? "soldier" : "grunt"
          const colors = { elite: "#ff00ff", soldier: "#00ffff", grunt: "#00ff00" }
          const healthMult = { elite: 2, soldier: 1, grunt: 1 }
          const pointsMult = { elite: 30, soldier: 20, grunt: 10 }

          aliens.push({
            x: 50 + (i % 10) * 70 + Math.random() * 20,
            y: 50 + Math.floor(i / 10) * 60 + Math.random() * 20,
            width: 40,
            height: 30,
            alive: true,
            health: Math.floor(healthMult[alienType] * diffMult.health),
            maxHealth: Math.floor(healthMult[alienType] * diffMult.health),
            type: alienType,
            color: colors[alienType],
            points: pointsMult[alienType],
            frame: 0,
          })
        }
      }
    }

    // Set up power-up distribution - evenly spread across all aliens
    const totalAliens = aliens.length
    powerUpDropIndices = []
    powerUpTypes = []

    if (totalAliens > 0 && powerUpCount > 0) {
      // Calculate spacing between power-ups
      const spacing = Math.floor(totalAliens / powerUpCount)

      // All available power-up types
      const allTypes: PowerUpType[] = ["shield", "missile", "spreadshot", "rapidfire", "star", "laser"]

      for (let i = 0; i < powerUpCount; i++) {
        // Evenly distribute power-ups across aliens
        const alienIndex = Math.floor((i * totalAliens) / powerUpCount) + Math.floor(Math.random() * spacing / 2)
        powerUpDropIndices.push(Math.min(alienIndex, totalAliens - 1))

        // Randomly select a power-up type
        powerUpTypes.push(allTypes[Math.floor(Math.random() * allTypes.length)])
      }
    }
  }

  function createShields() {
    shields = []
    const shieldShape = [
      [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
      [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 1, 1, 0, 0, 0, 0, 1, 1, 1],
      [1, 1, 0, 0, 0, 0, 0, 0, 1, 1],
    ]

    const shieldPositions = [150, 350, 550]
    const pixelSize = 4

    for (let shieldX of shieldPositions) {
      for (let row = 0; row < shieldShape.length; row++) {
        for (let col = 0; col < shieldShape[row].length; col++) {
          if (shieldShape[row][col] === 1) {
            shields.push({
              x: shieldX + col * pixelSize,
              y: 480 + row * pixelSize,
              health: 1,
            })
          }
        }
      }
    }
  }

  function shoot() {
    const now = Date.now()
    if (now - lastShot > shootCooldown) {
      playerMuzzleFlash = 5

      if (activePowerUp === "spreadshot") {
        // Three bullets
        bullets.push({
          x: player.x + player.width / 2 - 2,
          y: player.y,
          width: 4,
          height: 10,
          fromPowerUp: "spreadshot",
        })
        bullets.push({
          x: player.x + player.width / 2 - 2 - 15,
          y: player.y,
          width: 4,
          height: 10,
          fromPowerUp: "spreadshot",
        })
        bullets.push({
          x: player.x + player.width / 2 - 2 + 15,
          y: player.y,
          width: 4,
          height: 10,
          fromPowerUp: "spreadshot",
        })
      } else if (activePowerUp === "laser") {
        // FIXED: Laser fires ONCE for exactly 0.5 seconds when space is pressed
        if (laserReadyToFire && !laserUsed) {
          laserBeamActive = true
          laserBeamTimeLeft = 500 // 0.5 seconds in milliseconds
          laserReadyToFire = false
          laserUsed = true // Mark as used - prevents re-triggering

          // Clear any existing laser interval to prevent duplicates
          if (laserInterval !== null) {
            clearInterval(laserInterval)
          }

          // Start the countdown timer
          const startTime = Date.now()
          laserInterval = setInterval(() => {
            const elapsed = Date.now() - startTime
            laserBeamTimeLeft = Math.max(0, 500 - elapsed)

            if (laserBeamTimeLeft <= 0) {
              laserBeamActive = false
              laserBeamTimeLeft = 0
              activePowerUp = null
              powerUpTimeLeft = 0
              powerUpTotalDuration = 0
              activePowerUpEmoji = ""
              if (laserInterval !== null) {
                clearInterval(laserInterval)
                laserInterval = null
              }
            }
          }, 50) as unknown as number

          if (soundEnabled) playShootSound()
        }
        return // Don't set lastShot for laser
      } else {
        // Normal bullet
        bullets.push({
          x: player.x + player.width / 2 - 2,
          y: player.y,
          width: 4,
          height: 10,
        })
      }

      lastShot = now
      if (soundEnabled) playShootSound()
    }
  }

  function fireMissile() {
    if (missileAvailable <= 0) return

    // Create missile projectile
    missiles.push({
      x: player.x + player.width / 2 - 4,
      y: player.y - 20,
      width: 8,
      height: 20,
    })

    missileAvailable--
    if (soundEnabled) playShootSound()
  }

  function handleMissileExplosion(missileX: number, missileY: number) {
    // Explosion radius to catch adjacent aliens (left, right, and row above)
    // Aliens are typically 60px apart horizontally and 40-50px vertically
    const explosionRadius = 80

    let totalPoints = 0
    let aliensDestroyed = 0

    for (let alien of aliens) {
      if (!alien.alive) continue

      const alienCenterX = alien.x + alien.width / 2
      const alienCenterY = alien.y + alien.height / 2
      const distance = Math.hypot(alienCenterX - missileX, alienCenterY - missileY)

      if (distance <= explosionRadius) {
        alien.alive = false
        totalPoints += alien.points
        aliensDestroyed++
        createExplosion(alienCenterX, alienCenterY, alien.color)
        dropPowerUp(alien.x, alien.y)
      }
    }

    // Update score and combo
    if (aliensDestroyed > 0) {
      score += totalPoints
      combo += aliensDestroyed
      maxCombo = Math.max(maxCombo, combo)

      // Score popup
      addScorePopup(missileX, missileY, totalPoints, "#ff8800")
    }

    // Big explosion at impact point
    createExplosion(missileX, missileY, "#ff8800")
    createExplosion(missileX, missileY, "#ffff00")
    createExplosion(missileX, missileY, "#ff0000")

    if (soundEnabled) playExplosionSound()
  }

  function alienShoot() {
    // PERFORMANCE: Cap alien bullets to prevent excessive collision checks
    if (alienBullets.length >= 50) {
      return
    }

    const aliveAliens = aliens.filter((a) => a.alive)
    const diffMult = getDifficultyMultiplier()
    const fireChance = 0.02 * diffMult.fireRate

    if (aliveAliens.length > 0 && Math.random() < fireChance) {
      const alien = aliveAliens[Math.floor(Math.random() * aliveAliens.length)]
      alienBullets.push({
        x: alien.x + alien.width / 2 - 2,
        y: alien.y + alien.height,
        width: 4,
        height: 10,
      })
      const key = `${alien.x},${alien.y}`
      alienMuzzleFlashes.add(key)
      setTimeout(() => {
        alienMuzzleFlashes.delete(key)
      }, 100)
    }
  }

  function spawnUfo() {
    const now = Date.now()
    if (!ufo && now - lastUfoSpawn > 15000 && Math.random() < 0.01) {
      ufo = {
        x: -60,
        y: 30,
        width: 60,
        height: 30,
        active: true,
      }
      lastUfoSpawn = now
    }
  }

  // Track power-up drops for even distribution
  let powerUpDropIndices = $state<number[]>([])
  let powerUpTypes = $state<PowerUpType[]>([])
  let powerUpsDroppedThisLevel = $state(0)

  function dropPowerUp(x: number, y: number) {
    const emojis = { rapidfire: "⚡", shield: "🛡️", spreadshot: "💥", laser: "🔫", star: "⭐", missile: "🚀" }

    // Check if this alien should drop a power-up
    const alienIndex = powerUpsDroppedThisLevel
    if (!powerUpDropIndices.includes(alienIndex)) {
      powerUpsDroppedThisLevel++
      return
    }

    // Find which power-up index this is
    const powerUpIndex = powerUpDropIndices.indexOf(alienIndex)
    if (powerUpIndex === -1 || powerUpIndex >= powerUpTypes.length) {
      powerUpsDroppedThisLevel++
      return
    }

    const powerUpType = powerUpTypes[powerUpIndex]
    powerUpsDroppedThisLevel++

    powerUps.push({
      x,
      y,
      width: 20,
      height: 20,
      type: powerUpType,
      emoji: emojis[powerUpType],
    })
  }

  function activatePowerUpEffect(type: PowerUpType, emoji?: string) {
    if (type === "missile") {
      // Missile is instant use, give one missile
      missileAvailable = Math.min(missileAvailable + 1, 3)
      return
    }

    // Determine duration and emoji
    const emojis = { rapidfire: "⚡", shield: "🛡️", spreadshot: "💥", laser: "🔫", star: "⭐", missile: "🚀" }
    const emojiToUse = emoji || emojis[type]
    let duration: number

    if (type === "laser") {
      duration = 1 // Laser fires once for 0.5 seconds when space is pressed
    } else {
      duration = powerUpDuration // Use the configurable power-up duration
    }

    // Check if we should queue this power-up
    if (queuePowerUps && activePowerUp !== null) {
      // Add to queue instead of replacing (missile already handled above)
      powerUpQueue.push({ type, emoji: emojiToUse, duration })
      return
    }

    // NON-QUEUE MODE: Handle special cases
    if (!queuePowerUps && activePowerUp !== null) {
      const now = Date.now()
      const isCurrentlyInvincible = now < player.invincibleUntil

      // If currently invincible (star effect active), keep invincibility and add shooting upgrade
      if (isCurrentlyInvincible && activePowerUp === "star") {
        // Keep invincibility timer running, just add the new weapon type
        if (type === "rapidfire" || type === "spreadshot" || type === "laser" || type === "shield") {
          activePowerUp = type
          activePowerUpEmoji = emojiToUse
          powerUpTimeLeft = duration
          powerUpTotalDuration = duration
          // Shooting speed stays at 3x (already set when star was activated)

          // Clear and restart interval for new power-up
          if (powerUpInterval !== null) clearInterval(powerUpInterval)
          powerUpInterval = setInterval(() => {
            powerUpTimeLeft -= 0.1
            if (powerUpTimeLeft <= 0) {
              activePowerUp = null
              powerUpTimeLeft = 0
              powerUpTotalDuration = 0
              activePowerUpEmoji = ""
              shootCooldown = BASE_SHOOT_COOLDOWN
              if (powerUpInterval !== null) clearInterval(powerUpInterval)
              powerUpInterval = null
            }
          }, 100) as unknown as number
        }
        return // Keep the existing invincibility
      }

      // If picking up invincible while having a weapon, keep weapon and add invincibility
      if (type === "star") {
        // Keep current weapon active, add invincibility on top
        player.invincibleUntil = Date.now() + (powerUpDuration * 1000)
        // Boost current weapon to 3x speed
        shootCooldown = BASE_SHOOT_COOLDOWN / 3
        // activePowerUp stays as current weapon type, don't change it
        return
      }

      // For all other cases, new power-up replaces current one
    }

    // Activate the power-up
    activePowerUp = type
    activePowerUpEmoji = emojiToUse
    powerUpTimeLeft = duration
    powerUpTotalDuration = duration

    if (type === "star") {
      player.invincibleUntil = Date.now() + (powerUpDuration * 1000)
      shootCooldown = BASE_SHOOT_COOLDOWN / 3 // 3x speed for invincible
    }

    if (type === "rapidfire") {
      shootCooldown = BASE_SHOOT_COOLDOWN / 3
    }

    if (type === "laser") {
      // Set laser ready to fire - player must press space to activate
      laserReadyToFire = true
      laserUsed = false
    }

    // PERFORMANCE: Clear any existing interval before creating a new one
    if (powerUpInterval !== null) {
      clearInterval(powerUpInterval)
    }

    powerUpInterval = setInterval(() => {
      powerUpTimeLeft -= 0.1
      if (powerUpTimeLeft <= 0) {
        // Power-up expired - check if there's a queued one
        if (powerUpQueue.length > 0) {
          const nextPowerUp = powerUpQueue.shift()!
          if (powerUpInterval !== null) clearInterval(powerUpInterval)
          activatePowerUpEffect(nextPowerUp.type, nextPowerUp.emoji)
        } else {
          activePowerUp = null
          powerUpTimeLeft = 0
          powerUpTotalDuration = 0
          activePowerUpEmoji = ""
          powerUpCountdownSeconds = 0
          shootCooldown = BASE_SHOOT_COOLDOWN
          if (powerUpInterval !== null) clearInterval(powerUpInterval)
          powerUpInterval = null
        }
      }
    }, 100) as unknown as number
  }

  function deployNextPowerUp() {
    // Only deploy if there's a queued power-up
    if (powerUpQueue.length === 0) return

    // Deploy the next power-up from the queue (removes it immediately)
    const nextPowerUp = powerUpQueue.shift()!

    // Clear existing interval - current power-up ends (not saved)
    if (powerUpInterval !== null) {
      clearInterval(powerUpInterval)
      powerUpInterval = null
    }
    if (laserInterval !== null) {
      clearInterval(laserInterval)
      laserInterval = null
    }

    // Reset shoot cooldown before activating new power-up
    shootCooldown = BASE_SHOOT_COOLDOWN

    // Activate the new power-up immediately
    activePowerUp = nextPowerUp.type
    activePowerUpEmoji = nextPowerUp.emoji
    powerUpTimeLeft = nextPowerUp.duration
    powerUpTotalDuration = nextPowerUp.duration

    // Apply power-up effects
    if (nextPowerUp.type === "star") {
      player.invincibleUntil = Date.now() + (powerUpDuration * 1000)
      shootCooldown = BASE_SHOOT_COOLDOWN / 3
    } else if (nextPowerUp.type === "rapidfire") {
      shootCooldown = BASE_SHOOT_COOLDOWN / 3
    } else if (nextPowerUp.type === "laser") {
      laserReadyToFire = true
      laserUsed = false
    }

    // Start the countdown timer
    powerUpInterval = setInterval(() => {
      powerUpTimeLeft -= 0.1
      if (powerUpTimeLeft <= 0) {
        // Power-up expired
        activePowerUp = null
        powerUpTimeLeft = 0
        powerUpTotalDuration = 0
        activePowerUpEmoji = ""
        shootCooldown = BASE_SHOOT_COOLDOWN
        if (powerUpInterval !== null) clearInterval(powerUpInterval)
        powerUpInterval = null
      }
    }, 100) as unknown as number
  }

  function createExplosion(x: number, y: number, color: string) {
    // PERFORMANCE FIX: Reduced particles per explosion and enforce max particle limit
    const particlesPerExplosion = 4 // Reduced from 6 to 4

    // Remove oldest particles if we're near the limit
    if (particles.length + particlesPerExplosion > MAX_PARTICLES) {
      const overflow = particles.length + particlesPerExplosion - MAX_PARTICLES
      particles.splice(0, overflow) // Remove oldest particles
    }

    for (let i = 0; i < particlesPerExplosion; i++) {
      const angle = (Math.PI * 2 * i) / particlesPerExplosion
      const speed = Math.random() * 3 + 1
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: 0.8, // Reduced lifetime from 1 to 0.8 (40 frames instead of 50)
        maxLife: 0.8,
        size: Math.random() * 3 + 1,
      })
    }
  }

  function addScorePopup(x: number, y: number, points: number, color: string) {
    scorePopups.push({
      x,
      y,
      text: `+${points}`,
      life: 1,
      maxLife: 1,
      color,
    })
  }

  function checkCollision(
    rect1: { x: number; y: number; width: number; height: number },
    rect2: { x: number; y: number; width: number; height: number },
  ) {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    )
  }

  function update() {
    // Performance monitoring
    const now = Date.now()
    if (lastFrameTime > 0) {
      const deltaTime = now - lastFrameTime
      frameCount++

      // Calculate FPS based on average of last 60 frames
      if (frameCount % 60 === 0 && deltaTime > 0) {
        fps = Math.round(1000 / deltaTime)

        // Log performance warnings
        if (fps < 30) {
          console.warn(`Low FPS detected: ${fps} fps, Particles: ${particles.length}, Aliens: ${aliens.filter(a => a.alive).length}, Bullets: ${bullets.length}, Alien Bullets: ${alienBullets.length}`)
        }
      }
    }
    lastFrameTime = now

    updateStarfield()

    // Animate level transition
    if (showLevelTransition) {
      levelTransitionAlpha = Math.min(1, levelTransitionAlpha + 0.05)
      return
    }

    if (!gameRunning || gameOver) return

    alienFrame = (alienFrame + 0.05) % 2

    // Update muzzle flash
    if (playerMuzzleFlash > 0) playerMuzzleFlash--

    // Move player
    if (keys.left && player.x > 0) {
      player.x -= player.speed
    }
    if (keys.right && player.x < CANVAS_WIDTH - player.width) {
      player.x += player.speed
    }
    if (keys.space) {
      shoot()
    }
    if (keys.up) {
      fireMissile()
      keys.up = false // Only fire once per press
    }
    if (keys.down) {
      deployNextPowerUp()
      keys.down = false // Only deploy once per press
    }

    // Move bullets
    bullets = bullets.filter((b) => {
      b.y -= bulletSpeed
      return b.y > 0
    })

    // Move missiles (pass through shields)
    missiles = missiles.filter((m) => {
      m.y -= missileSpeed

      // Check collision with aliens
      for (let alien of aliens) {
        if (alien.alive && checkCollision(m, alien)) {
          handleMissileExplosion(m.x + m.width / 2, m.y + m.height / 2)
          return false // Remove missile
        }
      }

      // Missiles pass through shields - no collision check needed

      return m.y > -m.height
    })

    // Move power-ups (falling)
    powerUps = powerUps.filter((p) => {
      p.y += 2

      // Check collision with player
      if (checkCollision(p, player)) {
        activatePowerUpEffect(p.type)
        if (soundEnabled) playPowerUpSound()
        return false
      }

      return p.y < CANVAS_HEIGHT
    })

    // Move UFO
    if (ufo) {
      ufo.x += 2
      if (ufo.x > CANVAS_WIDTH) {
        ufo = null
      }
    }

    // Move alien bullets
    alienBullets = alienBullets.filter((b) => {
      b.y += alienBulletSpeed
      return b.y < CANVAS_HEIGHT
    })

    // Update particles
    particles = particles.filter((p) => {
      p.x += p.vx
      p.y += p.vy
      p.life -= 0.02
      return p.life > 0
    })

    // Update score popups
    scorePopups = scorePopups.filter((sp) => {
      sp.y -= 1
      sp.life -= 0.02
      return sp.life > 0
    })

    // Check bullet-alien collisions
    bullets = bullets.filter((bullet) => {
      for (let alien of aliens) {
        if (alien.alive && checkCollision(bullet, alien)) {
          alien.health--

          if (alien.health <= 0) {
            alien.alive = false
            score += alien.points
            combo++
            maxCombo = Math.max(maxCombo, combo)

            // Combo bonus
            if (combo > 5) {
              const bonus = combo * 2
              score += bonus
              addScorePopup(alien.x + alien.width / 2, alien.y, alien.points + bonus, "#ffff00")
            } else {
              addScorePopup(alien.x + alien.width / 2, alien.y, alien.points, alien.color)
            }

            createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.color)
            dropPowerUp(alien.x, alien.y)
            if (soundEnabled) playExplosionSound()
          }

          return false
        }
      }

      // Check UFO collision
      if (ufo && checkCollision(bullet, ufo)) {
        const ufoPoints = 100
        score += ufoPoints
        addScorePopup(ufo.x + ufo.width / 2, ufo.y, ufoPoints, "#ff00ff")
        createExplosion(ufo.x + ufo.width / 2, ufo.y + ufo.height / 2, "#ff00ff")
        ufo = null
        if (soundEnabled) playExplosionSound()
        return false
      }

      // Check shield collisions - player bullets
      for (let i = shields.length - 1; i >= 0; i--) {
        const shield = shields[i]
        if (
          bullet.x < shield.x + 4 &&
          bullet.x + bullet.width > shield.x &&
          bullet.y < shield.y + 4 &&
          bullet.y + bullet.height > shield.y
        ) {
          shield.health -= 1 // Player bullets do 1 damage
          if (shield.health <= 0) {
            shields.splice(i, 1)
          }
          return false
        }
      }

      return true
    })

    // Check laser beam collisions (continuous damage while active)
    // PERFORMANCE: Throttle laser collision checks to every 3rd frame
    if (laserBeamActive && frameCount % 3 === 0) {
      const laserBeam = {
        x: player.x + player.width / 2 - 2,
        y: 0,
        width: 4,
        height: player.y,
      }

      // Check shield collisions - laser is blocked by shields
      let laserBlocked = false
      for (let i = shields.length - 1; i >= 0; i--) {
        const shield = shields[i]
        if (
          laserBeam.x < shield.x + 4 &&
          laserBeam.x + laserBeam.width > shield.x &&
          laserBeam.y < shield.y + 4 &&
          laserBeam.y + laserBeam.height > shield.y
        ) {
          laserBlocked = true
          shield.health -= 0.15 // Increased damage to compensate for throttling
          if (shield.health <= 0) {
            shields.splice(i, 1)
          }
          break // Early exit - only need to check if blocked
        }
      }

      // Only damage aliens if laser is not blocked
      if (!laserBlocked) {
        for (let alien of aliens) {
          // Skip dead aliens
          if (!alien.alive) continue

          if (checkCollision(laserBeam, alien)) {
            alien.health -= 3 // Increased damage to compensate for throttling

            if (alien.health <= 0) {
              alien.alive = false
              score += alien.points
              combo++
              maxCombo = Math.max(maxCombo, combo)

              // Combo bonus
              if (combo > 5) {
                const bonus = combo * 2
                score += bonus
                addScorePopup(alien.x + alien.width / 2, alien.y, alien.points + bonus, "#ffff00")
              } else {
                addScorePopup(alien.x + alien.width / 2, alien.y, alien.points, alien.color)
              }

              createExplosion(alien.x + alien.width / 2, alien.y + alien.height / 2, alien.color)
              dropPowerUp(alien.x, alien.y)
              if (soundEnabled) playExplosionSound()
            }
          }
        }

        // Check laser-UFO collision
        if (ufo && checkCollision(laserBeam, ufo)) {
          const ufoPoints = 100
          score += ufoPoints
          addScorePopup(ufo.x + ufo.width / 2, ufo.y, ufoPoints, "#ff00ff")
          createExplosion(ufo.x + ufo.width / 2, ufo.y + ufo.height / 2, "#ff00ff")
          ufo = null
          if (soundEnabled) playExplosionSound()
        }
      }
    }

    // Check if player missed
    if (bullets.length === 0 && lastShot > 0) {
      const timeSinceShot = Date.now() - lastShot
      if (timeSinceShot > 2000) {
        // No bullets on screen and haven't shot in 2 seconds
        if (combo > 0) {
          combo = 0 // Reset combo only if we had one
        }
      }
    }

    // Check alien bullet-player collisions
    // Debug: Log if there are too many alien bullets
    if (alienBullets.length > 50) {
      console.warn(`High alien bullet count: ${alienBullets.length}`)
    }

    alienBullets = alienBullets.filter((bullet) => {
      if (checkCollision(bullet, player)) {
        if (activePowerUp === "shield") {
          // Deflection Shield - reflect the bullet back
          createExplosion(bullet.x, bullet.y, "#00ffff")
          // Reverse the bullet direction (flip y velocity)
          bullet.y = player.y - 10
          // Convert alien bullet to player bullet
          bullets.push({
            x: bullet.x,
            y: bullet.y,
            width: bullet.width,
            height: bullet.height,
            fromPowerUp: "shield",
          })
          return false
        } else if (now < player.invincibleUntil) {
          // Protected by invincibility
          createExplosion(bullet.x, bullet.y, "#00ffff")
          return false
        }

        lives--
        combo = 0 // Reset combo on hit
        player.invincibleUntil = now + 2000 // 2 seconds invincibility
        createExplosion(player.x + player.width / 2, player.y + player.height / 2, "#ff0000")

        if (lives <= 0) {
          gameOver = true
          gameRunning = false

          // Clean up all intervals on game over
          if (powerUpInterval !== null) {
            clearInterval(powerUpInterval)
            powerUpInterval = null
          }
          if (laserInterval !== null) {
            clearInterval(laserInterval)
            laserInterval = null
          }
          if (levelTransitionTimeout !== null) {
            clearTimeout(levelTransitionTimeout)
            levelTransitionTimeout = null
          }

          if (score > highScore) {
            highScore = score
            if (typeof localStorage !== "undefined") {
              localStorage.setItem("spaceInvadersHighScore", highScore.toString())
            }
          }
        }
        if (soundEnabled) playHitSound()
        return false
      }

      // Check shield collisions - alien bullets
      for (let i = shields.length - 1; i >= 0; i--) {
        const shield = shields[i]
        if (
          bullet.x < shield.x + 4 &&
          bullet.x + bullet.width > shield.x &&
          bullet.y < shield.y + 4 &&
          bullet.y + bullet.height > shield.y
        ) {
          shield.health -= 1 // Alien bullets do 1 damage
          if (shield.health <= 0) {
            shields.splice(i, 1)
          }
          return false
        }
      }

      return true
    })

    // Move aliens
    const aliveAliens = aliens.filter((a) => a.alive)
    if (aliveAliens.length === 0 && !showLevelTransition && !levelTransitionTriggered) {
      console.log("Level complete detected, alive aliens:", aliveAliens.length)
      // Level complete - immediately stop game and start transition
      levelTransitionTriggered = true
      gameRunning = false
      showLevelTransition = true
      levelTransitionAlpha = 0

      level++
      score += 100 // Level complete bonus
      console.log("Starting level transition to level:", level)

      // Clear everything immediately
      aliens = []
      bullets = []
      missiles = []
      alienBullets = []
      powerUps = []
      particles = []
      scorePopups = []
      ufo = null

      // Reset power-ups between levels
      activePowerUp = null
      powerUpTimeLeft = 0
      powerUpTotalDuration = 0
      activePowerUpEmoji = ""
      powerUpCountdownSeconds = 0
      powerUpQueue = []
      laserBeamActive = false
      laserBeamTimeLeft = 0
      laserReadyToFire = false
      laserUsed = false
      missileAvailable = 0

      // PERFORMANCE: Clean up any lingering intervals
      if (powerUpInterval !== null) {
        clearInterval(powerUpInterval)
        powerUpInterval = null
      }
      if (laserInterval !== null) {
        clearInterval(laserInterval)
        laserInterval = null
      }
      if (levelTransitionTimeout !== null) {
        clearTimeout(levelTransitionTimeout)
        levelTransitionTimeout = null
      }

      // Reset power-up tracking for new level
      powerUpsDroppedThisLevel = 0
      powerUpDropIndices = []
      powerUpTypes = []

      // Reset shoot cooldown to base value
      shootCooldown = BASE_SHOOT_COOLDOWN

      // Gradually increase speed but cap it
      const diffMult = getDifficultyMultiplier()
      alienSpeed = Math.min(alienSpeed + 0.2 * diffMult.speed, 5 * diffMult.speed)

      // Reset direction for new wave
      alienDirection = 1

      // Start level transition with tracked timeout
      levelTransitionTimeout = setTimeout(() => {
        console.log("Level transition complete, starting new level")
        showLevelTransition = false
        levelTransitionTriggered = false
        levelTransitionTimeout = null

        // Create new aliens and shields
        createAliens()
        createShields()

        // Resume game
        gameRunning = true
      }, 2000) as unknown as number // 2 second transition

      return
    }

    let moveDown = false
    for (let alien of aliveAliens) {
      if (
        (alien.x <= 0 && alienDirection === -1) ||
        (alien.x >= CANVAS_WIDTH - alien.width && alienDirection === 1)
      ) {
        moveDown = true
        break
      }
    }

    if (moveDown) {
      alienDirection *= -1
      for (let alien of aliveAliens) {
        alien.y += 20
        // Check if aliens reached bottom
        if (alien.y + alien.height >= player.y) {
          gameOver = true
          gameRunning = false
          if (score > highScore) {
            highScore = score
            if (typeof localStorage !== "undefined") {
              localStorage.setItem("spaceInvadersHighScore", highScore.toString())
            }
          }
        }
      }
    }

    for (let alien of aliveAliens) {
      alien.x += alienDirection * alienSpeed
      alien.frame = alienFrame
    }

    // Alien shooting
    alienShoot()

    // Spawn UFO
    spawnUfo()
  }

  function draw() {
    if (!canvas || !ctx) {
      animationId = requestAnimationFrame(draw)
      return
    }

    // Clear canvas with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT)
    gradient.addColorStop(0, "#000428")
    gradient.addColorStop(1, "#004e92")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Draw starfield
    drawStarfield()

    if (!gameRunning && !gameOver && !showLevelTransition) {
      // Start screen
      ctx.fillStyle = "#00ff00"
      ctx.font = "48px monospace"
      ctx.textAlign = "center"
      ctx.fillText("👾 SPACE INVADERS 👾", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50)
      ctx.font = "24px monospace"
      ctx.fillText(
        "Click START to begin",
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2 + 20,
      )
      animationId = requestAnimationFrame(draw)
      return
    }

    // Draw shields
    for (let shield of shields) {
      const alpha = shield.health // Health is now 1, so alpha is 1
      ctx.fillStyle = `rgba(0, 255, 0, ${alpha})`
      ctx.fillRect(shield.x, shield.y, 4, 4)
    }

    // Draw player
    const now = Date.now()
    if (now < player.invincibleUntil) {
      // Blinking when invincible
      if (Math.floor(now / 100) % 2 === 0) {
        ctx.fillStyle = "#ffffff"
      } else {
        ctx.fillStyle = "#00ff00"
      }
    } else if (activePowerUp === "shield") {
      ctx.fillStyle = "#00ffff"
    } else {
      ctx.fillStyle = "#00ff00"
    }

    ctx.beginPath()
    ctx.moveTo(player.x + player.width / 2, player.y)
    ctx.lineTo(player.x, player.y + player.height)
    ctx.lineTo(player.x + player.width, player.y + player.height)
    ctx.closePath()
    ctx.fill()

    // Draw muzzle flash
    if (playerMuzzleFlash > 0) {
      ctx.fillStyle = "#ffff00"
      ctx.fillRect(player.x + player.width / 2 - 5, player.y - 10, 10, 10)
    }

    // Draw power-up indicator in bottom-left with circular countdown
    if (activePowerUpEmoji && powerUpTimeLeft > 0) {
      const powerUpX = 50
      const powerUpY = CANVAS_HEIGHT - 80
      const circleRadius = 25

      // Calculate progress for circular countdown
      const progress = powerUpTimeLeft / powerUpTotalDuration
      const startAngle = -Math.PI / 2 // Start at top
      const endAngle = startAngle + (2 * Math.PI * progress)

      // Draw circular progress ring
      ctx.strokeStyle = "#ffff00"
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(powerUpX, powerUpY, circleRadius, startAngle, endAngle)
      ctx.stroke()

      // Draw emoji in center
      ctx.font = "32px monospace"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = "#ffffff"
      ctx.fillText(activePowerUpEmoji, powerUpX, powerUpY)
      ctx.textBaseline = "alphabetic"
    }

    // Draw power-up queue in bottom-right
    if (powerUpQueue.length > 0) {
      const queueStartX = CANVAS_WIDTH - 100
      const queueStartY = CANVAS_HEIGHT - 80
      const boxSize = 40
      const spacing = 10

      for (let i = 0; i < powerUpQueue.length; i++) {
        const queueItem = powerUpQueue[i]
        const x = queueStartX - (i * (boxSize + spacing))
        const y = queueStartY

        // Draw semi-transparent box
        ctx.fillStyle = "rgba(100, 100, 100, 0.5)"
        ctx.fillRect(x - boxSize / 2, y - boxSize / 2, boxSize, boxSize)
        ctx.strokeStyle = "#aaaaaa"
        ctx.lineWidth = 2
        ctx.strokeRect(x - boxSize / 2, y - boxSize / 2, boxSize, boxSize)

        // Draw emoji
        ctx.font = "24px monospace"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)"
        ctx.fillText(queueItem.emoji, x, y)
      }
      ctx.textBaseline = "alphabetic"
    }

    // Draw bullets
    for (let bullet of bullets) {
      if (bullet.fromPowerUp === "spreadshot") {
        ctx.fillStyle = "#00ffff"
      } else {
        ctx.fillStyle = "#ffffff"
      }
      ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height)
    }

    // Draw missiles (pixelated rocket shape)
    for (let missile of missiles) {
      const mx = missile.x
      const my = missile.y

      // Missile tip (yellow/orange)
      ctx.fillStyle = "#ffaa00"
      ctx.fillRect(mx + 2, my, 4, 4)

      // Missile body (red)
      ctx.fillStyle = "#ff0000"
      ctx.fillRect(mx + 1, my + 4, 6, 12)

      // Missile fins (dark red)
      ctx.fillStyle = "#aa0000"
      ctx.fillRect(mx, my + 16, 2, 4) // Left fin
      ctx.fillRect(mx + 6, my + 16, 2, 4) // Right fin

      // Add glow effect
      ctx.shadowBlur = 10
      ctx.shadowColor = "#ff8800"
      ctx.fillStyle = "#ffaa00"
      ctx.fillRect(mx + 2, my, 4, 4)
      ctx.shadowBlur = 0
    }

    // Draw laser beam
    if (laserBeamActive) {
      ctx.fillStyle = "#ff0000"
      ctx.fillRect(player.x + player.width / 2 - 2, 0, 4, player.y)
      // Add glow effect
      ctx.shadowBlur = 20
      ctx.shadowColor = "#ff0000"
      ctx.fillRect(player.x + player.width / 2 - 2, 0, 4, player.y)
      ctx.shadowBlur = 0
    }

    // Draw alien bullets
    ctx.fillStyle = "#ff0000"
    for (let bullet of alienBullets) {
      ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height)
    }

    // Draw power-ups
    ctx.font = "20px monospace"
    ctx.textAlign = "center"
    for (let powerUp of powerUps) {
      ctx.fillText(powerUp.emoji, powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height)
    }

    // Draw UFO
    if (ufo) {
      ctx.fillStyle = "#ff00ff"
      ctx.fillRect(ufo.x, ufo.y, ufo.width, ufo.height)
      ctx.fillRect(ufo.x + 10, ufo.y - 10, ufo.width - 20, 10)
      ctx.font = "16px monospace"
      ctx.textAlign = "center"
      ctx.fillStyle = "#ffff00"
      ctx.fillText("UFO", ufo.x + ufo.width / 2, ufo.y + 20)
    }

    // Draw aliens
    for (let alien of aliens) {
      if (alien.alive) {
        ctx.fillStyle = alien.color

        if (alien.type === "boss") {
          // Boss alien - larger and more detailed
          ctx.fillRect(alien.x, alien.y, alien.width, alien.height)
          ctx.fillRect(alien.x + 20, alien.y - 15, alien.width - 40, 15)
          ctx.fillStyle = "#ff0000"
          ctx.font = "20px monospace"
          ctx.textAlign = "center"
          ctx.fillText("BOSS", alien.x + alien.width / 2, alien.y + alien.height / 2 + 7)

          // Health bar
          const healthPercent = alien.health / alien.maxHealth
          ctx.fillStyle = "#ff0000"
          ctx.fillRect(alien.x, alien.y - 20, alien.width, 5)
          ctx.fillStyle = "#00ff00"
          ctx.fillRect(alien.x, alien.y - 20, alien.width * healthPercent, 5)
        } else {
          // Regular aliens with animation
          const frame = Math.floor(alien.frame)

          if (frame === 0) {
            ctx.fillRect(alien.x + 5, alien.y, 10, 10)
            ctx.fillRect(alien.x + 25, alien.y, 10, 10)
            ctx.fillRect(alien.x, alien.y + 10, alien.width, 15)
            ctx.fillRect(alien.x + 5, alien.y + 25, 10, 5)
            ctx.fillRect(alien.x + 25, alien.y + 25, 10, 5)
          } else {
            ctx.fillRect(alien.x + 5, alien.y, 10, 10)
            ctx.fillRect(alien.x + 25, alien.y, 10, 10)
            ctx.fillRect(alien.x, alien.y + 10, alien.width, 15)
            ctx.fillRect(alien.x, alien.y + 25, 10, 5)
            ctx.fillRect(alien.x + 30, alien.y + 25, 10, 5)
          }

          // Health indicator for multi-health aliens
          if (alien.maxHealth > 1) {
            ctx.fillStyle = "#ffffff"
            ctx.font = "10px monospace"
            ctx.textAlign = "center"
            ctx.fillText(alien.health.toString(), alien.x + alien.width / 2, alien.y - 5)
          }
        }
      }
    }

    // Draw particles
    for (let particle of particles) {
      const alpha = particle.life / particle.maxLife
      ctx.fillStyle = particle.color.replace(")", `, ${alpha})`)
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size)
    }

    // Draw score popups
    ctx.font = "16px monospace"
    ctx.textAlign = "center"
    for (let popup of scorePopups) {
      const alpha = popup.life / popup.maxLife
      ctx.fillStyle = popup.color.replace(")", `, ${alpha})`)
      if (!popup.color.includes("rgb")) {
        // Handle hex colors
        ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`
      }
      ctx.fillText(popup.text, popup.x, popup.y)
    }

    // Draw score, lives, combo
    ctx.fillStyle = "#ffffff"
    ctx.font = "20px monospace"
    ctx.textAlign = "left"
    ctx.fillText(`Score: ${score}`, 20, 30)
    ctx.fillText(`Lives: ${lives}`, CANVAS_WIDTH - 150, 30)
    ctx.fillText(`Level: ${level}`, CANVAS_WIDTH / 2 - 50, 30)

    // Draw FPS counter (debug)
    if (fps > 0) {
      ctx.fillStyle = fps < 30 ? "#ff0000" : fps < 45 ? "#ffff00" : "#00ff00"
      ctx.font = "14px monospace"
      ctx.textAlign = "right"
      ctx.fillText(`FPS: ${fps}`, CANVAS_WIDTH - 20, CANVAS_HEIGHT - 10)
    }

    if (combo > 2) {
      ctx.fillStyle = "#ffff00"
      ctx.fillText(`Combo: ${combo}x`, 20, 55)
    }

    // Draw power-up indicator
    if (activePowerUp && powerUpTimeLeft > 0) {
      const powerUpNames = {
        rapidfire: "⚡ Rapid Fire",
        shield: "🛡️ Deflection Shield",
        spreadshot: "💥 Spread Shot",
        laser: "🔫 Laser",
        star: "⭐ Invincible",
        missile: "🚀 Missile",
      }
      ctx.fillStyle = "#00ffff"
      ctx.font = "16px monospace"
      ctx.textAlign = "right"
      ctx.fillText(`${powerUpNames[activePowerUp]}: ${powerUpTimeLeft.toFixed(1)}s`, CANVAS_WIDTH - 20, 55)
    }

    // Draw missile counter (more visible)
    if (missileAvailable > 0) {
      ctx.fillStyle = "#ff4444"
      ctx.font = "bold 20px monospace"
      ctx.textAlign = "left"
      ctx.fillText(`🚀 x${missileAvailable}`, 20, 80)
    }

    // Draw level transition
    if (showLevelTransition) {
      ctx.fillStyle = `rgba(0, 0, 0, ${levelTransitionAlpha * 0.7})`
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      ctx.fillStyle = `rgba(0, 255, 0, ${levelTransitionAlpha})`
      ctx.font = "48px monospace"
      ctx.textAlign = "center"
      ctx.fillText(`LEVEL ${level}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2)
      if (level % 5 === 0) {
        ctx.fillStyle = `rgba(255, 0, 0, ${levelTransitionAlpha})`
        ctx.font = "32px monospace"
        ctx.fillText("BOSS WAVE!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50)
      }
    }

    if (gameOver) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      ctx.fillStyle = "#ff0000"
      ctx.font = "48px monospace"
      ctx.textAlign = "center"
      ctx.fillText("GAME OVER", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50)
      ctx.fillStyle = "#ffffff"
      ctx.font = "24px monospace"
      ctx.fillText(
        `Final Score: ${score}`,
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2 + 20,
      )
      if (maxCombo > 2) {
        ctx.fillText(
          `Max Combo: ${maxCombo}x`,
          CANVAS_WIDTH / 2,
          CANVAS_HEIGHT / 2 + 50,
        )
      }
    }

    update()
    animationId = requestAnimationFrame(draw)
  }

  function resetGame() {
    gameRunning = false
    gameOver = false
    gameStarted = false
    showLevelTransition = false
    levelTransitionTriggered = false
    score = 0
    lives = 3
    level = 1
    combo = 0
    maxCombo = 0
    bullets = []
    missiles = []
    alienBullets = []
    powerUps = []
    activePowerUp = null
    powerUpTimeLeft = 0
    powerUpTotalDuration = 0
    activePowerUpEmoji = ""
    powerUpQueue = []
    laserBeamActive = false
    laserBeamTimeLeft = 0
    laserReadyToFire = false
    laserUsed = false
    missileAvailable = 0
    particles = []
    scorePopups = []
    player.x = 375
    player.invincibleUntil = 0
    ufo = null
    lastUfoSpawn = Date.now()
    lastShot = 0
    alienMuzzleFlashes.clear()

    // PERFORMANCE: Clean up any lingering intervals
    if (powerUpInterval !== null) {
      clearInterval(powerUpInterval)
      powerUpInterval = null
    }
    if (laserInterval !== null) {
      clearInterval(laserInterval)
      laserInterval = null
    }
    if (levelTransitionTimeout !== null) {
      clearTimeout(levelTransitionTimeout)
      levelTransitionTimeout = null
    }
  }

  // Shared AudioContext to prevent sound cutting out
  let audioContext: AudioContext | null = null

  function getAudioContext() {
    if (!audioContext) {
      try {
        audioContext = new AudioContext()
      } catch (e) {
        console.error("Failed to create AudioContext:", e)
        return null
      }
    }
    return audioContext
  }

  // Sound effects
  function playShootSound() {
    if (!soundEnabled) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return

      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      oscillator.frequency.value = 400
      oscillator.type = "square"
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1)
      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.1)
    } catch (e) {
      // Ignore audio errors
    }
  }

  function playExplosionSound() {
    if (!soundEnabled) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return

      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      oscillator.frequency.value = 100
      oscillator.type = "sawtooth"
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.3)
    } catch (e) {
      // Ignore audio errors
    }
  }

  function playHitSound() {
    if (!soundEnabled) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return

      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      oscillator.frequency.value = 200
      oscillator.type = "sawtooth"
      gainNode.gain.setValueAtTime(0.15, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.2)
    } catch (e) {
      // Ignore audio errors
    }
  }

  function playPowerUpSound() {
    if (!soundEnabled) return
    try {
      const ctx = getAudioContext()
      if (!ctx) return

      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)
      oscillator.frequency.value = 880
      oscillator.type = "sine"
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.2)
    } catch (e) {
      // Ignore audio errors
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<svelte:head>
  <title>👾 Space Invaders | Dougie's Game Hub</title>
</svelte:head>

<div class="container mx-auto p-8">
  <h1 class="text-4xl font-bold mb-6">👾 Space Invaders</h1>

  <div class="flex flex-col lg:flex-row gap-8 lg:h-[calc(100vh-200px)]">
    <!-- Game Canvas -->
    <div class="flex-shrink-0">
      <canvas
        bind:this={canvas}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        class="border-4 border-base-300 rounded-lg shadow-xl"
      ></canvas>
    </div>

    <!-- Settings Panel -->
    <div class="flex-1 flex flex-col gap-4">
      <div class="card bg-base-200 shadow-xl flex-1 lg:overflow-y-auto lg:max-h-full">
        <div class="card-body">
          <h2 class="card-title">Settings</h2>

          <div class="space-y-4">
            <!-- Stats -->
            <div class="stats shadow w-full">
              <div class="stat py-3">
                <div class="stat-title text-xs">Score</div>
                <div class="stat-value text-2xl text-primary">{score}</div>
              </div>
              <div class="stat py-3">
                <div class="stat-title text-xs">High Score</div>
                <div class="stat-value text-2xl text-secondary">{highScore}</div>
              </div>
            </div>

            <div class="stats shadow w-full">
              <div class="stat py-3">
                <div class="stat-title text-xs">Lives</div>
                <div class="stat-value text-2xl text-error">{lives}</div>
              </div>
              <div class="stat py-3">
                <div class="stat-title text-xs">Level</div>
                <div class="stat-value text-2xl text-accent">{level}</div>
              </div>
            </div>

            {#if combo > 2}
              <div class="alert alert-warning">
                <span class="font-bold">🔥 Combo: {combo}x</span>
              </div>
            {/if}

            {#if activePowerUp}
              <div class="alert alert-info">
                <span class="font-bold">
                  {activePowerUp === "rapidfire" ? "⚡ Rapid Fire" : ""}
                  {activePowerUp === "shield" ? "🛡️ Deflection Shield" : ""}
                  {activePowerUp === "spreadshot" ? "💥 Spread Shot" : ""}
                  {activePowerUp === "laser" ? "🔫 Laser" : ""}
                  {activePowerUp === "star" ? "⭐ Invincible" : ""}
                  - {powerUpTimeLeft.toFixed(1)}s
                </span>
              </div>
            {/if}

            {#if missileAvailable > 0}
              <div class="alert alert-error">
                <span class="font-bold text-lg">🚀 Missiles: {missileAvailable} (Press ↑)</span>
              </div>
            {/if}

            <!-- Difficulty Setting -->
            <div class="form-control">
              <div class="label">
                <span class="label-text font-semibold">Difficulty</span>
              </div>
              <div class="flex gap-2">
                <button
                  class="btn btn-xs flex-1 {difficulty === 'easy' ? 'btn-success' : 'btn-outline'}"
                  onclick={() => (difficulty = 'easy')}
                  disabled={gameRunning || gameOver}
                >
                  Easy
                </button>
                <button
                  class="btn btn-xs flex-1 {difficulty === 'normal' ? 'btn-warning' : 'btn-outline'}"
                  onclick={() => (difficulty = 'normal')}
                  disabled={gameRunning || gameOver}
                >
                  Normal
                </button>
                <button
                  class="btn btn-xs flex-1 {difficulty === 'hard' ? 'btn-error' : 'btn-outline'}"
                  onclick={() => (difficulty = 'hard')}
                  disabled={gameRunning || gameOver}
                >
                  Hard
                </button>
              </div>
            </div>

            <!-- Sound Toggle -->
            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text">Sound Effects</span>
                <input type="checkbox" class="checkbox" bind:checked={soundEnabled} />
              </label>
            </div>

            <!-- Queue Power-ups Toggle -->
            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text">Queue Power-ups</span>
                <input type="checkbox" class="checkbox" bind:checked={queuePowerUps} />
              </label>
            </div>

            <!-- Power-Up Count Slider -->
            <div class="form-control">
              <div class="label">
                <span class="label-text font-semibold">Power-ups per Level: {powerUpCount}</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                bind:value={powerUpCount}
                class="range range-xs"
                disabled={gameRunning || gameOver}
              />
              <div class="w-full flex justify-between text-xs px-2">
                <span>0</span>
                <span>15</span>
                <span>30</span>
              </div>
            </div>

            <!-- Lives Count Slider -->
            <div class="form-control">
              <div class="label">
                <span class="label-text font-semibold">Starting Lives: {startingLives}</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                bind:value={startingLives}
                class="range range-xs"
                disabled={gameRunning || gameOver}
              />
              <div class="w-full flex justify-between text-xs px-2">
                <span>1</span>
                <span>5</span>
                <span>10</span>
              </div>
            </div>

            <!-- Power-Up Duration Slider -->
            <div class="form-control">
              <div class="label">
                <span class="label-text font-semibold">Power-up Duration: {powerUpDuration}s</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                bind:value={powerUpDuration}
                class="range range-xs"
                disabled={gameRunning || gameOver}
              />
              <div class="w-full flex justify-between text-xs px-2">
                <span>1s</span>
                <span>10s</span>
                <span>20s</span>
              </div>
            </div>

            <!-- Instructions -->
            <div class="divider"></div>
            <div>
              <h3 class="font-semibold mb-2">How to Play:</h3>
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>
                  Use <kbd class="kbd kbd-sm">←</kbd> and
                  <kbd class="kbd kbd-sm">→</kbd> to move
                </li>
                <li>Press <kbd class="kbd kbd-sm">SPACE</kbd> to shoot</li>
                <li>Press <kbd class="kbd kbd-sm">↑</kbd> to fire missile</li>
                <li>Press <kbd class="kbd kbd-sm">↓</kbd> to deploy next queued power-up</li>
                <li>Destroy all aliens to advance levels</li>
                <li>Avoid alien bullets and use shields</li>
                <li>Collect power-ups for special abilities</li>
                <li>Shoot the UFO for bonus points</li>
                <li>Build combos for extra points</li>
                <li>Boss wave every 5th level!</li>
              </ul>
            </div>

            <div class="divider"></div>
            <div>
              <h3 class="font-semibold mb-2">Power-Ups:</h3>
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>⚡ Rapid Fire - Shoot 3x faster</li>
                <li>🛡️ Deflection Shield - Reflect bullets back</li>
                <li>💥 Spread Shot - Fire 3 bullets at once</li>
                <li>🔫 Laser - Continuous beam (Press SPACE to fire)</li>
                <li>⭐ Star - Invincible + 3x fire rate</li>
                <li>🚀 Missile - Area damage explosion (max 3, Press ↑)</li>
              </ul>
            </div>

            <div class="divider"></div>
            <div>
              <h3 class="font-semibold mb-2">Alien Types:</h3>
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li style="color: #00ff00">Grunt - 10 pts (1 hit)</li>
                <li style="color: #00ffff">Soldier - 20 pts (1 hit)</li>
                <li style="color: #ff00ff">Elite - 30 pts (2 hits)</li>
                <li style="color: #ff0000">Boss - 500 pts (many hits!)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Game Controls -->
      <div class="card bg-base-200 shadow-xl">
        <div class="card-body p-4">
          <div class="flex gap-2">
            {#if !gameStarted}
              <button class="btn btn-primary flex-1" onclick={initGame}>
                Start Game
              </button>
            {:else if !gameRunning && !showLevelTransition && !gameOver}
              <button class="btn btn-success flex-1" onclick={() => (gameRunning = true)}>
                Resume
              </button>
            {:else if gameOver}
              <button class="btn btn-primary flex-1" onclick={initGame}>
                Play Again
              </button>
            {:else if gameRunning && !gameOver}
              <button
                class="btn btn-warning flex-1"
                onclick={() => (gameRunning = false)}
                disabled={showLevelTransition}
              >
                Pause
              </button>
            {/if}
            <button class="btn btn-secondary" onclick={resetGame}>
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  canvas {
    display: block;
    background: #000000;
  }
</style>
