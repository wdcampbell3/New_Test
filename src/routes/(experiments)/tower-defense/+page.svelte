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
    type: "basic" | "sniper" | "splash" | "laser" | "freeze" | "missile"
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
    type: "basic" | "sniper" | "splash" | "laser" | "freeze" | "missile"
  }

  const GRID_SIZE = 40
  const GRID_WIDTH = 20
  const GRID_HEIGHT = 15
  const CANVAS_WIDTH = GRID_WIDTH * GRID_SIZE
  const CANVAS_HEIGHT = GRID_HEIGHT * GRID_SIZE

  // Game state
  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D
  let animationId: number
  let gameRunning = $state(false)
  let gameOver = $state(false)
  let health = $state(20)
  let money = $state(200)
  let wave = $state(0)
  let score = $state(0)
  let enemies = $state<Enemy[]>([])
  let towers = $state<Tower[]>([])
  let projectiles = $state<Projectile[]>([])
  let selectedTowerType = $state<"basic" | "sniper" | "splash" | "laser" | "freeze" | "missile" | null>(null)
  let hoveredCell = $state<{ x: number; y: number } | null>(null)
  let nextEnemyId = 0
  let nextTowerId = 0
  let nextProjectileId = 0
  let enemiesSpawned = $state(0)
  let lastSpawnTime = $state(0)
  let enemySpeedMultiplier = $state(1)
  let randomizePath = $state(false)
  let secondEntrance = $state(false)

  // Tower quantity limits
  let towerQuantities = $state({
    basic: 6,
    sniper: 5,
    splash: 4,
    laser: 3,
    freeze: 2,
    missile: 1
  })

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

  // Secondary entrance paths (start from top or bottom)
  const secondaryPathPatterns: Point[][] = [
    // Pattern 1 (From top)
    [
      { x: 10, y: 0 },
      { x: 10, y: 7 },
      { x: 20, y: 7 },
    ],
    // Pattern 2 (From bottom)
    [
      { x: 5, y: 15 },
      { x: 5, y: 7 },
      { x: 20, y: 7 },
    ],
    // Pattern 3 (From top, different path)
    [
      { x: 15, y: 0 },
      { x: 15, y: 10 },
      { x: 20, y: 10 },
    ],
  ]

  // Current active paths
  let path: Point[] = $state(pathPatterns[0])
  let secondaryPath: Point[] = $state(secondaryPathPatterns[0])
  let pathPixels: Point[] = $state([])
  let secondaryPathPixels: Point[] = $state([])

  // Sound effects using Web Audio API
  const playSound = (frequency: number, duration: number, type: OscillatorType = "sine") => {
    try {
      const audioContext = new AudioContext()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = frequency
      oscillator.type = type

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + duration)
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

  // Tower types
  const towerTypes = {
    basic: {
      name: "Basic Tower",
      cost: 50,
      damage: 10,
      range: 120,
      fireRate: 500,
      color: "#3b82f6",
      description: "Balanced tower",
    },
    sniper: {
      name: "Sniper Tower",
      cost: 100,
      damage: 50,
      range: 200,
      fireRate: 1000,
      color: "#8b5cf6",
      description: "Long range, slow fire",
    },
    splash: {
      name: "Splash Tower",
      cost: 75,
      damage: 15,
      range: 100,
      fireRate: 750,
      color: "#f59e0b",
      description: "Area damage",
    },
    laser: {
      name: "Laser Tower",
      cost: 120,
      damage: 3,
      range: 150,
      fireRate: 100,
      color: "#06b6d4",
      description: "15 burst shots, 1.5s reload",
    },
    freeze: {
      name: "Freeze Tower",
      cost: 90,
      damage: 0,
      range: 160,
      fireRate: 600,
      color: "#0ea5e9",
      description: "Slows 50%, 5s duration",
    },
    missile: {
      name: "Missile Tower",
      cost: 150,
      damage: 56,
      range: 180,
      fireRate: 1500,
      color: "#dc2626",
      description: "Massive damage (70%)",
    },
  }

  // Enemy types (doubled speed)
  const enemyTypes = {
    basic: { health: 50, speed: 2, reward: 10, color: "#ef4444" },
    fast: { health: 30, speed: 4, reward: 15, color: "#ec4899" },
    tank: { health: 150, speed: 1, reward: 30, color: "#78350f" },
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
    health = 20
    money = 200
    wave = 0
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
    towerQuantities = {
      basic: 6,
      sniper: 5,
      splash: 4,
      laser: 3,
      freeze: 2,
      missile: 1
    }
    selectRandomPath()
  }

  function startWave() {
    if (enemies.length > 0) return
    wave++
    enemiesSpawned = 0
    lastSpawnTime = Date.now()
  }

  function spawnEnemy() {
    const types: Array<"basic" | "fast" | "tank"> = ["basic", "fast", "tank"]
    const weights = [0.6, 0.3, 0.1]
    const rand = Math.random()
    let type: "basic" | "fast" | "tank" = "basic"

    if (rand < weights[0]) type = "basic"
    else if (rand < weights[0] + weights[1]) type = "fast"
    else type = "tank"

    const enemyConfig = enemyTypes[type]
    const healthMultiplier = 1 + (wave - 1) * 0.2

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
    // Spawn enemies for current wave
    if (gameRunning && wave > 0 && enemiesSpawned < 10 + wave * 5) {
      const now = Date.now()
      if (now - lastSpawnTime > 1000) {
        spawnEnemy()
        enemiesSpawned++
        lastSpawnTime = now
      }
    }

    // Move enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i]

      // Update slow effect
      const now = Date.now()
      if (now < enemy.slowedUntil) {
        enemy.speed = enemy.baseSpeed * 0.5
      } else {
        enemy.speed = enemy.baseSpeed
      }

      // Use appropriate path for this enemy
      const enemyPath = enemy.isSecondaryPath ? secondaryPathPixels : pathPixels

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
          if (now - tower.lastFired >= 1500) {
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
          // Freeze effect - slow enemy for 5 seconds
          if (projectile.target) {
            const now = Date.now()
            projectile.target.slowedUntil = now + 5000
            sounds.hit()
          }
        } else if (projectile.type === "splash" || projectile.type === "missile") {
          // Splash damage
          sounds.explosion()
          for (const enemy of enemies) {
            const edx = enemy.x - projectile.targetX
            const edy = enemy.y - projectile.targetY
            const edist = Math.sqrt(edx * edx + edy * edy)
            const radius = projectile.type === "missile" ? 120 : 60
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

  function update(deltaTime: number) {
    if (!gameRunning) return

    updateEnemies(deltaTime)
    updateTowers()
    updateProjectiles(deltaTime)
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
      const config = towerTypes[tower.type]
      ctx.fillStyle = config.color
      ctx.fillRect(
        tower.gridX * GRID_SIZE + 5,
        tower.gridY * GRID_SIZE + 5,
        GRID_SIZE - 10,
        GRID_SIZE - 10,
      )

      // Draw level
      if (tower.level > 1) {
        ctx.fillStyle = "#ffffff"
        ctx.font = "bold 12px monospace"
        ctx.textAlign = "center"
        ctx.fillText(
          `${tower.level}`,
          tower.x,
          tower.gridY * GRID_SIZE + GRID_SIZE - 5,
        )
      }
    }

    // Draw enemies
    for (const enemy of enemies) {
      const config = enemyTypes[enemy.type]
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
      if (projectile.type === "splash") {
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

    animationId = requestAnimationFrame(draw)
  }

  function canPlaceTower(gridX: number, gridY: number): boolean {
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
      damage: towerConfig.damage,
      range: towerConfig.range,
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

  function selectTowerType(type: "basic" | "sniper" | "splash" | "laser" | "freeze" | "missile") {
    selectedTowerType = selectedTowerType === type ? null : type
  }
</script>

<svelte:head>
  <title>🗼 Tower Assault | Dougie's Game Hub</title>
</svelte:head>

<div class="container mx-auto p-4 sm:p-8">
  <h1 class="text-4xl font-bold mb-6">🗼 Tower Assault</h1>

  <div class="flex flex-col xl:flex-row gap-8 xl:h-[calc(100vh-200px)]">
    <!-- Game Canvas -->
    <div class="flex-shrink-0">
      <canvas
        bind:this={canvas}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        class="border-4 border-base-300 rounded-lg shadow-xl"
        onclick={handleCanvasClick}
        onmousemove={handleCanvasMouseMove}
        onmouseleave={() => (hoveredCell = null)}
      ></canvas>
    </div>

    <!-- Controls Panel -->
    <div class="flex-1 flex flex-col gap-4">
      <div class="card bg-base-200 shadow-xl flex-1 xl:overflow-y-auto xl:max-h-full">
        <div class="card-body">
          <h2 class="card-title">Settings</h2>

        <div class="space-y-4">
          <!-- Stats -->
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
              <div class="stat-value text-2xl text-info">{wave}</div>
            </div>
            <div class="stat py-2">
              <div class="stat-title text-xs">Score</div>
              <div class="stat-value text-2xl">{score}</div>
            </div>
          </div>

          <!-- Enemy Speed Setting -->
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

          <!-- Options Section -->
          <div class="divider my-2"></div>
          <div class="mb-2">
            <span class="label-text font-semibold">Options</span>
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
          {:else if !gameRunning}
            <div class="alert alert-info">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                class="stroke-current shrink-0 w-6 h-6"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
              <span>Click "Start Game" to begin!</span>
            </div>
          {/if}

          <!-- Tower Selection -->
          {#if gameRunning}
            <div class="divider">Select Tower to Place</div>
            <div class="grid grid-cols-1 gap-2">
              {#each Object.entries(towerTypes).sort(([, a], [, b]) => a.cost - b.cost) as [key, tower]}
                {@const quantity = towerQuantities[key as keyof typeof towerQuantities]}
                {@const isOutOfStock = quantity !== 0 && quantity <= 0}
                <button
                  class="btn btn-block justify-start {selectedTowerType === key ? 'btn-active' : ''}"
                  style="background-color: {tower.color}; border-color: {tower.color};"
                  onclick={() => selectTowerType(key as "basic" | "sniper" | "splash" | "laser" | "freeze" | "missile")}
                  disabled={money < tower.cost || isOutOfStock}
                >
                  <div class="flex justify-between w-full text-white">
                    <span>{tower.name}</span>
                    <div class="flex gap-2 items-center">
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
              <div class="alert alert-warning">
                <span>Click on the grid to place tower</span>
              </div>
            {/if}
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
              <li>Each wave gets progressively harder</li>
            </ul>
          </div>

          <!-- Tower Info -->
          <div class="divider"></div>
          <div>
            <h3 class="font-semibold mb-2">Tower Types:</h3>
            <div class="space-y-1 text-sm">
              <div>
                <span class="font-bold text-blue-500">Basic:</span>
                Balanced tower
              </div>
              <div>
                <span class="font-bold text-purple-500">Sniper:</span>
                Long range, high damage
              </div>
              <div>
                <span class="font-bold text-orange-500">Splash:</span>
                Area damage
              </div>
              <div>
                <span class="font-bold text-cyan-400">Laser:</span>
                15 burst, 1.5s reload
              </div>
              <div>
                <span class="font-bold text-sky-500">Freeze:</span>
                5s slow, bigger range
              </div>
              <div>
                <span class="font-bold text-red-600">Missile:</span>
                Fast, massive blast
              </div>
            </div>
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
          {:else if wave === 0 || (enemies.length === 0 && enemiesSpawned >= 10 + (wave - 1) * 5)}
            <button class="btn btn-success flex-1" onclick={startWave}>
              Start Wave {wave + 1}
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
