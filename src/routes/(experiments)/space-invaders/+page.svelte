<script lang="ts">
  import { onMount } from "svelte"

  let canvas = $state<HTMLCanvasElement>()
  let ctx: CanvasRenderingContext2D
  let animationId: number

  // Game state
  let gameRunning = $state(false)
  let gameOver = $state(false)
  let score = $state(0)
  let highScore = $state(0)
  let lives = $state(3)
  let level = $state(1)
  let difficulty = $state<"easy" | "normal" | "hard">("normal")
  let combo = $state(0)
  let maxCombo = $state(0)
  let missedShots = $state(0)
  let soundEnabled = $state(true)

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
  const BASE_BULLET_SPEED = 8

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
  type PowerUpType = "rapidfire" | "shield" | "spreadshot" | "laser"
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

  // Controls
  let keys = {
    left: false,
    right: false,
    space: false,
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
    for (let i = 0; i < 100; i++) {
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
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") keys.left = false
    if (e.key === "ArrowRight") keys.right = false
    if (e.key === " ") keys.space = false
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
    lives = 3
    level = 1
    combo = 0
    maxCombo = 0
    missedShots = 0
    gameOver = false
    gameRunning = true
    player.x = 375
    player.invincibleUntil = 0
    bullets = []
    alienBullets = []
    powerUps = []
    activePowerUp = null
    powerUpTimeLeft = 0
    ufo = null
    lastUfoSpawn = Date.now()
    particles = []
    scorePopups = []
    playerMuzzleFlash = 0
    alienMuzzleFlashes = new Set()

    const diffMult = getDifficultyMultiplier()
    alienSpeed = 1 * diffMult.speed
    alienBulletSpeed = 4 * diffMult.speed
    shootCooldown = BASE_SHOOT_COOLDOWN

    createAliens()
    createShields()
  }

  function createAliens() {
    // Clear existing aliens completely
    aliens.length = 0
    aliens = []
    const diffMult = getDifficultyMultiplier()

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
              health: 3,
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
        // Wide laser beam
        bullets.push({
          x: player.x + player.width / 2 - 10,
          y: player.y,
          width: 20,
          height: 15,
          fromPowerUp: "laser",
        })
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

  function alienShoot() {
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

  function dropPowerUp(x: number, y: number) {
    if (Math.random() < 0.15) { // 15% chance
      const types: PowerUpType[] = ["rapidfire", "shield", "spreadshot", "laser"]
      const emojis = { rapidfire: "⚡", shield: "🛡️", spreadshot: "💥", laser: "🔫" }
      const type = types[Math.floor(Math.random() * types.length)]

      powerUps.push({
        x,
        y,
        width: 20,
        height: 20,
        type,
        emoji: emojis[type],
      })
    }
  }

  function activatePowerUpEffect(type: PowerUpType) {
    activePowerUp = type
    powerUpTimeLeft = 10 // 10 seconds

    if (type === "rapidfire") {
      shootCooldown = BASE_SHOOT_COOLDOWN / 3
    }

    const interval = setInterval(() => {
      powerUpTimeLeft -= 0.1
      if (powerUpTimeLeft <= 0) {
        activePowerUp = null
        powerUpTimeLeft = 0
        shootCooldown = BASE_SHOOT_COOLDOWN
        clearInterval(interval)
      }
    }, 100)
  }

  function createExplosion(x: number, y: number, color: string) {
    for (let i = 0; i < 20; i++) {
      const angle = (Math.PI * 2 * i) / 20
      const speed = Math.random() * 3 + 1
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: 1,
        maxLife: 1,
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
    if (!gameRunning || gameOver || showLevelTransition) return

    updateStarfield()
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

    // Move bullets
    bullets = bullets.filter((b) => {
      b.y -= bulletSpeed
      return b.y > 0
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

      // Check shield collisions
      for (let i = shields.length - 1; i >= 0; i--) {
        const shield = shields[i]
        if (
          bullet.x < shield.x + 4 &&
          bullet.x + bullet.width > shield.x &&
          bullet.y < shield.y + 4 &&
          bullet.y + bullet.height > shield.y
        ) {
          shield.health--
          if (shield.health <= 0) {
            shields.splice(i, 1)
          }
          return false
        }
      }

      return true
    })

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
    const now = Date.now()
    alienBullets = alienBullets.filter((bullet) => {
      if (checkCollision(bullet, player)) {
        if (activePowerUp === "shield" || now < player.invincibleUntil) {
          // Protected by shield or invincibility
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

      // Check shield collisions
      for (let i = shields.length - 1; i >= 0; i--) {
        const shield = shields[i]
        if (
          bullet.x < shield.x + 4 &&
          bullet.x + bullet.width > shield.x &&
          bullet.y < shield.y + 4 &&
          bullet.y + bullet.height > shield.y
        ) {
          shield.health--
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
    if (aliveAliens.length === 0) {
      // Level complete - immediately stop game and start transition
      gameRunning = false
      showLevelTransition = true
      levelTransitionAlpha = 0

      level++
      score += 100 // Level complete bonus

      // Clear everything immediately
      aliens = []
      bullets = []
      alienBullets = []
      powerUps = []
      particles = []
      scorePopups = []
      ufo = null

      // Gradually increase speed but cap it
      const diffMult = getDifficultyMultiplier()
      alienSpeed = Math.min(alienSpeed + 0.2 * diffMult.speed, 5 * diffMult.speed)

      // Reset direction for new wave
      alienDirection = 1

      // Animate the transition
      const transitionInterval = setInterval(() => {
        levelTransitionAlpha += 0.05
        if (levelTransitionAlpha >= 1) {
          setTimeout(() => {
            levelTransitionAlpha = 1
            setTimeout(() => {
              const fadeInterval = setInterval(() => {
                levelTransitionAlpha -= 0.05
                if (levelTransitionAlpha <= 0) {
                  clearInterval(fadeInterval)
                  showLevelTransition = false

                  // Create new aliens and shields AFTER transition completes
                  createAliens()
                  createShields()

                  gameRunning = true
                }
              }, 50)
            }, 1500)
          }, 50)
          clearInterval(transitionInterval)
        }
      }, 50)
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
      const alpha = shield.health / 3
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

    // Draw bullets
    for (let bullet of bullets) {
      if (bullet.fromPowerUp === "laser") {
        ctx.fillStyle = "#ff0000"
      } else if (bullet.fromPowerUp === "spreadshot") {
        ctx.fillStyle = "#00ffff"
      } else {
        ctx.fillStyle = "#ffffff"
      }
      ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height)
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

    if (combo > 2) {
      ctx.fillStyle = "#ffff00"
      ctx.fillText(`Combo: ${combo}x`, 20, 55)
    }

    // Draw power-up indicator
    if (activePowerUp && powerUpTimeLeft > 0) {
      const powerUpNames = {
        rapidfire: "⚡ Rapid Fire",
        shield: "🛡️ Shield",
        spreadshot: "💥 Spread Shot",
        laser: "🔫 Laser",
      }
      ctx.fillStyle = "#00ffff"
      ctx.font = "16px monospace"
      ctx.textAlign = "right"
      ctx.fillText(`${powerUpNames[activePowerUp]}: ${powerUpTimeLeft.toFixed(1)}s`, CANVAS_WIDTH - 20, 55)
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
    showLevelTransition = false
    score = 0
    lives = 3
    level = 1
    combo = 0
    maxCombo = 0
    bullets = []
    alienBullets = []
    powerUps = []
    activePowerUp = null
    powerUpTimeLeft = 0
    particles = []
    scorePopups = []
    player.x = 375
    player.invincibleUntil = 0
    ufo = null
  }

  // Sound effects
  function playShootSound() {
    if (!soundEnabled) return
    try {
      const audioContext = new AudioContext()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      oscillator.frequency.value = 400
      oscillator.type = "square"
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.1)
    } catch (e) {}
  }

  function playExplosionSound() {
    if (!soundEnabled) return
    try {
      const audioContext = new AudioContext()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      oscillator.frequency.value = 100
      oscillator.type = "sawtooth"
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    } catch (e) {}
  }

  function playHitSound() {
    if (!soundEnabled) return
    try {
      const audioContext = new AudioContext()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      oscillator.frequency.value = 200
      oscillator.type = "sawtooth"
      gainNode.gain.setValueAtTime(0.15, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.2)
    } catch (e) {}
  }

  function playPowerUpSound() {
    if (!soundEnabled) return
    try {
      const audioContext = new AudioContext()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      oscillator.frequency.value = 880
      oscillator.type = "sine"
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.2)
    } catch (e) {}
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
                  {activePowerUp === "shield" ? "🛡️ Shield" : ""}
                  {activePowerUp === "spreadshot" ? "💥 Spread Shot" : ""}
                  {activePowerUp === "laser" ? "🔫 Laser" : ""}
                  - {powerUpTimeLeft.toFixed(1)}s
                </span>
              </div>
            {/if}

            <!-- Difficulty Setting -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-semibold">Difficulty</span>
              </label>
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
                <li>🛡️ Shield - Invincible for 10s</li>
                <li>💥 Spread Shot - Fire 3 bullets</li>
                <li>🔫 Laser - Wide powerful beam</li>
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
            {#if !gameRunning && !showLevelTransition}
              <button class="btn btn-primary flex-1" onclick={initGame}>
                {gameOver ? "Play Again" : "Start Game"}
              </button>
            {:else if !gameOver}
              <button
                class="btn btn-warning flex-1"
                onclick={() => (gameRunning = false)}
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
