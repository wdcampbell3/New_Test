<script lang="ts">
  import { onMount } from "svelte"

  type Point = { x: number; y: number }
  type Direction = "up" | "down" | "left" | "right"

  type Cycle = {
    x: number
    y: number
    direction: Direction
    trail: Point[]
    color: string
    alive: boolean
    shieldUntil: number
    trailDasherUntil: number
    speedMultiplier: number
    timeWarpUntil: number
  }

  type PowerUpType = "dasher" | "shield" | "timewarp" | "teleport" | "flash"
  type PowerUp = {
    x: number
    y: number
    type: PowerUpType
    icon: string
  }

  // Game settings
  let vsMode = $state<"computer" | "human">("computer")
  let computerSkill = $state<"amateur" | "normal" | "expert">("normal")
  let gameSpeed = $state<"practice" | "cruising" | "hyper">("hyper")
  let soundEnabled = $state(true)
  let powerUpsEnabled = $state(true)
  let enabledPowerUps = $state({
    dasher: true,
    shield: true,
    timewarp: true,
    teleport: true,
    flash: true
  })

  // Game state
  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D
  let animationId: number
  let gameRunning = $state(false)
  let roundOver = $state(false)
  let gameOver = $state(false)
  let winner = $state<"player1" | "player2" | null>(null)
  let score = $state({ player1: 0, player2: 0 })
  let flashActive = $state(false)
  let flashCount = $state(0)
  let flashTimeoutId: number | null = null

  // Teleport indicator
  let teleportIndicator = $state<{ x: number; y: number; direction: Direction; endTime: number } | null>(null)

  // Power-ups
  let activePowerUps = $state<PowerUp[]>([])
  let lastPowerUpSpawn = $state(0)

  // AI throttling
  let lastAIDecision = $state(0)

  // Canvas settings
  const CANVAS_WIDTH = 800
  const CANVAS_HEIGHT = 600
  const CYCLE_SIZE = 3

  // Get cycle speed based on game speed setting
  function getCycleSpeed(): number {
    switch (gameSpeed) {
      case "practice": return 1
      case "cruising": return 1.5
      case "hyper": return 2
    }
  }

  // Players
  let player1 = $state<Cycle>({
    x: CANVAS_WIDTH - 100,
    y: CANVAS_HEIGHT / 2,
    direction: "left",
    trail: [],
    color: "#00ffff", // Cyan
    alive: true,
    shieldUntil: 0,
    trailDasherUntil: 0,
    speedMultiplier: 1,
    timeWarpUntil: 0
  })

  let player2 = $state<Cycle>({
    x: 100,
    y: CANVAS_HEIGHT / 2,
    direction: "right",
    trail: [],
    color: "#ff6600", // Orange
    alive: true,
    shieldUntil: 0,
    trailDasherUntil: 0,
    speedMultiplier: 1,
    timeWarpUntil: 0
  })

  // Controls
  let keys = {
    // Player 1 (arrows)
    up: false,
    down: false,
    left: false,
    right: false,
    // Player 2 (WASD)
    w: false,
    a: false,
    s: false,
    d: false,
  }

  // Sound effects
  const playSound = (frequency: number, duration: number, type: OscillatorType = "sine") => {
    if (!soundEnabled) return
    try {
      const audioContext = new AudioContext()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      oscillator.frequency.value = frequency
      oscillator.type = type
      gainNode.gain.setValueAtTime(0.15, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + duration)
    } catch (e) {}
  }

  const sounds = {
    move: () => playSound(100, 0.05, "square"),
    crash: () => playSound(80, 0.5, "sawtooth"),
    powerup: () => playSound(880, 0.15, "sine"),
    shield: () => playSound(440, 0.2, "triangle"),
    teleport: () => playSound(660, 0.15, "sine"),
    flash: () => playSound(1200, 0.1, "square"),
    win: () => {
      playSound(523, 0.2, "sine")
      setTimeout(() => playSound(659, 0.2, "sine"), 150)
      setTimeout(() => playSound(784, 0.4, "sine"), 300)
    }
  }

  onMount(() => {
    ctx = canvas.getContext("2d")!
    draw()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  })

  function handleKeyDown(e: KeyboardEvent) {
    // Player 1 (arrows)
    if (e.key === "ArrowUp") {
      keys.up = true
      e.preventDefault()
    }
    if (e.key === "ArrowDown") {
      keys.down = true
      e.preventDefault()
    }
    if (e.key === "ArrowLeft") {
      keys.left = true
      e.preventDefault()
    }
    if (e.key === "ArrowRight") {
      keys.right = true
      e.preventDefault()
    }

    // Player 2 (WASD)
    if (e.key === "w" || e.key === "W") keys.w = true
    if (e.key === "a" || e.key === "A") keys.a = true
    if (e.key === "s" || e.key === "S") keys.s = true
    if (e.key === "d" || e.key === "D") keys.d = true

    // Spacebar to pause
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault()
      if (gameRunning && !roundOver && !gameOver) {
        pauseGame()
      } else if (!gameRunning && !roundOver && !gameOver) {
        if (score.player1 > 0 || score.player2 > 0) {
          gameRunning = true
        }
      }
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    // Player 1 (arrows)
    if (e.key === "ArrowUp") keys.up = false
    if (e.key === "ArrowDown") keys.down = false
    if (e.key === "ArrowLeft") keys.left = false
    if (e.key === "ArrowRight") keys.right = false

    // Player 2 (WASD)
    if (e.key === "w" || e.key === "W") keys.w = false
    if (e.key === "a" || e.key === "A") keys.a = false
    if (e.key === "s" || e.key === "S") keys.s = false
    if (e.key === "d" || e.key === "D") keys.d = false
  }

  function updateDirection(cycle: Cycle, newDirection: Direction) {
    // Prevent 180-degree turns
    if (cycle.direction === "up" && newDirection === "down") return
    if (cycle.direction === "down" && newDirection === "up") return
    if (cycle.direction === "left" && newDirection === "right") return
    if (cycle.direction === "right" && newDirection === "left") return

    if (cycle.direction !== newDirection) {
      sounds.move()
      cycle.direction = newDirection
    }
  }

  function computerAI() {
    if (vsMode !== "computer") return

    const now = Date.now()

    // Throttle AI decisions based on skill level
    // Amateur makes slower decisions, Expert makes faster decisions
    let decisionInterval: number
    if (computerSkill === "amateur") {
      decisionInterval = 200 // 5 decisions per second
    } else if (computerSkill === "normal") {
      decisionInterval = 120 // ~8.3 decisions per second
    } else {
      decisionInterval = 80 // 12.5 decisions per second
    }

    // Only make a new decision if enough time has passed
    if (now - lastAIDecision < decisionInterval) {
      return
    }

    lastAIDecision = now

    const isDasherActive = player1.trailDasherUntil > now || player2.trailDasherUntil > now
    const hasShield = player2.shieldUntil > now

    // Skill settings
    let lookaheadDistances: number[]
    let randomTurnChance: number
    let maxDistance: number
    let turnThreshold: number // How close danger needs to be before turning

    if (computerSkill === "amateur") {
      // Amateur: shorter lookahead, turns more randomly, less planning
      lookaheadDistances = isDasherActive ? [20, 40] : [20, 40, 60]
      randomTurnChance = isDasherActive ? 0.015 : 0.02
      maxDistance = isDasherActive ? 80 : 100
      turnThreshold = 50 // Only turn if danger is fairly close
    } else if (computerSkill === "normal") {
      // Normal: good lookahead, balanced planning
      lookaheadDistances = isDasherActive ? [20, 40, 60] : [20, 40, 60, 80, 100]
      randomTurnChance = isDasherActive ? 0.005 : 0.01
      maxDistance = isDasherActive ? 120 : 140
      turnThreshold = 70 // Turns when danger is moderate distance
    } else {
      // Expert: longest lookahead, excellent planning, very few random turns
      lookaheadDistances = isDasherActive ? [20, 40, 60, 80] : [20, 40, 60, 80, 100, 120]
      randomTurnChance = isDasherActive ? 0.002 : 0.005
      maxDistance = isDasherActive ? 140 : 180
      turnThreshold = 90 // Plans far ahead
    }

    // Evaluate current direction safety (skip if shielded - AI can pass through trails)
    let dangerAhead = false
    let closestDanger = Infinity

    if (!hasShield) {
      // Only check for danger if not shielded
      for (const distance of lookaheadDistances) {
        let nextX = player2.x
        let nextY = player2.y

        switch (player2.direction) {
          case "up":
            nextY -= distance
            break
          case "down":
            nextY += distance
            break
          case "left":
            nextX -= distance
            break
          case "right":
            nextX += distance
            break
        }

        // Wrap coordinates for checking
        nextX = (nextX + CANVAS_WIDTH) % CANVAS_WIDTH
        nextY = (nextY + CANVAS_HEIGHT) % CANVAS_HEIGHT

        if (checkCollisionAtPoint(nextX, nextY, player2)) {
          dangerAhead = true
          closestDanger = Math.min(closestDanger, distance)
          break
        }
      }
    }

    // Check for nearby power-ups
    let nearestPowerUp: PowerUp | null = null
    let nearestPowerUpDistance = Infinity

    activePowerUps.forEach(powerUp => {
      const dx = powerUp.x - player2.x
      const dy = powerUp.y - player2.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      // Consider power-ups within a certain range based on skill
      const powerUpRange = computerSkill === "amateur" ? 150 : computerSkill === "normal" ? 200 : 250

      if (distance < powerUpRange && distance < nearestPowerUpDistance) {
        nearestPowerUpDistance = distance
        nearestPowerUp = powerUp
      }
    })

    // Only consider turning if danger is within threshold, random chance, or pursuing power-up
    // When shielded, slightly increase random turn chance for more strategic play
    const shieldTurnChance = hasShield ? 0.02 : 0 // 2% extra chance to turn when shielded
    const shouldConsiderTurning =
      (dangerAhead && closestDanger <= turnThreshold) ||
      Math.random() < (randomTurnChance + shieldTurnChance) ||
      nearestPowerUp !== null

    // If danger ahead, occasional random turn, power-up nearby, or shielded, consider turning
    if (shouldConsiderTurning) {
      const possibleDirections: Direction[] = ["up", "down", "left", "right"]

      // Score each direction based on how safe it is
      const directionScores = possibleDirections.map(dir => {
        // Don't reverse
        if (player2.direction === "up" && dir === "down") return { dir, score: -1000 }
        if (player2.direction === "down" && dir === "up") return { dir, score: -1000 }
        if (player2.direction === "left" && dir === "right") return { dir, score: -1000 }
        if (player2.direction === "right" && dir === "left") return { dir, score: -1000 }

        // Check how far we can go in this direction before hitting something
        let score = 0
        for (let distance = 10; distance <= maxDistance; distance += 10) {
          let testX = player2.x
          let testY = player2.y

          switch (dir) {
            case "up":
              testY -= distance
              break
            case "down":
              testY += distance
              break
            case "left":
              testX -= distance
              break
            case "right":
              testX += distance
              break
          }

          testX = (testX + CANVAS_WIDTH) % CANVAS_WIDTH
          testY = (testY + CANVAS_HEIGHT) % CANVAS_HEIGHT

          // If shielded, ignore collisions - all directions are safe
          if (!hasShield && checkCollisionAtPoint(testX, testY, player2)) {
            break
          }
          score += 1 // Each safe distance increment adds to score
        }

        // When shielded, add small bonus for directions that will box in opponent or create strategic position
        if (hasShield) {
          // Slight preference for perpendicular turns to create more trail coverage
          if (
            (player2.direction === "up" || player2.direction === "down") &&
            (dir === "left" || dir === "right")
          ) {
            score += 1 // Small bonus for turning perpendicular
          } else if (
            (player2.direction === "left" || player2.direction === "right") &&
            (dir === "up" || dir === "down")
          ) {
            score += 1 // Small bonus for turning perpendicular
          }
        }

        // Bonus for moving toward power-up (only if direction is reasonably safe)
        if (nearestPowerUp && !dangerAhead && score > 3) {
          // Only consider power-up if this direction has decent safety (score > 3)
          const currentDx = nearestPowerUp.x - player2.x
          const currentDy = nearestPowerUp.y - player2.y

          let futureX = player2.x
          let futureY = player2.y

          switch (dir) {
            case "up":
              futureY -= 20
              break
            case "down":
              futureY += 20
              break
            case "left":
              futureX -= 20
              break
            case "right":
              futureX += 20
              break
          }

          const futureDx = nearestPowerUp.x - futureX
          const futureDy = nearestPowerUp.y - futureY
          const currentDistance = Math.sqrt(currentDx * currentDx + currentDy * currentDy)
          const futureDistance = Math.sqrt(futureDx * futureDx + futureDy * futureDy)

          // If this direction gets us closer to the power-up, add modest bonus
          // Reduced from 20 to 5 so safety is prioritized over power-up pursuit
          if (futureDistance < currentDistance) {
            score += 5 // Power-up pursuit bonus (modest, not overwhelming)
          }
        }

        return { dir, score }
      })

      // Sort by score and pick the best direction
      directionScores.sort((a, b) => b.score - a.score)

      if (directionScores[0].score > 0) {
        updateDirection(player2, directionScores[0].dir)
      } else if (directionScores.length > 1 && directionScores[1].score > 0) {
        // If best option is blocked, try second best
        updateDirection(player2, directionScores[1].dir)
      }
    }
  }

  function spawnPowerUp() {
    if (!powerUpsEnabled) return

    const now = Date.now()
    if (now - lastPowerUpSpawn < 5000) return // Spawn every 5 seconds

    // Get list of enabled power-up types
    const availableTypes: PowerUpType[] = []
    if (enabledPowerUps.dasher) availableTypes.push("dasher")
    if (enabledPowerUps.shield) availableTypes.push("shield")
    if (enabledPowerUps.timewarp) availableTypes.push("timewarp")
    if (enabledPowerUps.teleport) availableTypes.push("teleport")
    if (enabledPowerUps.flash) availableTypes.push("flash")

    if (availableTypes.length === 0) return

    const type = availableTypes[Math.floor(Math.random() * availableTypes.length)]
    const icons = { dasher: "🌀", shield: "🛡️", timewarp: "⏱️", teleport: "🌟", flash: "💫" }

    // Find a safe spawn location
    let x, y
    let attempts = 0
    do {
      x = 100 + Math.random() * (CANVAS_WIDTH - 200)
      y = 100 + Math.random() * (CANVAS_HEIGHT - 200)
      attempts++
    } while (checkCollisionAtPoint(x, y, player1) && attempts < 20)

    activePowerUps.push({ x, y, type, icon: icons[type] })
    lastPowerUpSpawn = now
  }

  function checkPowerUpCollection() {
    const now = Date.now()

    for (let i = activePowerUps.length - 1; i >= 0; i--) {
      const powerUp = activePowerUps[i]
      const collectRadius = 15

      // Check if player1 collected it
      if (Math.abs(player1.x - powerUp.x) < collectRadius && Math.abs(player1.y - powerUp.y) < collectRadius) {
        applyPowerUp(player1, player2, powerUp.type)
        activePowerUps.splice(i, 1)
        continue
      }

      // Check if player2 collected it
      if (Math.abs(player2.x - powerUp.x) < collectRadius && Math.abs(player2.y - powerUp.y) < collectRadius) {
        applyPowerUp(player2, player1, powerUp.type)
        activePowerUps.splice(i, 1)
      }
    }
  }

  function applyPowerUp(collector: Cycle, opponent: Cycle, type: PowerUpType) {
    sounds.powerup()
    const now = Date.now()

    switch (type) {
      case "dasher":
        collector.trailDasherUntil = now + 5000 // 5 seconds
        opponent.trailDasherUntil = now + 5000 // Both players' trails become dashed
        setTimeout(() => {
          collector.trailDasherUntil = 0
          opponent.trailDasherUntil = 0
        }, 5000)
        break
      case "shield":
        collector.shieldUntil = now + 5000 // 5 seconds of invincibility
        sounds.shield()
        break
      case "timewarp":
        // Slow collector by 50%, speed up opponent by 25%
        collector.speedMultiplier = 0.5
        opponent.speedMultiplier = 1.25
        collector.timeWarpUntil = now + 3000
        opponent.timeWarpUntil = now + 3000
        setTimeout(() => {
          collector.speedMultiplier = 1
          opponent.speedMultiplier = 1
          collector.timeWarpUntil = 0
          opponent.timeWarpUntil = 0
        }, 3000)
        break
      case "teleport":
        // Find location furthest from all trail points
        let bestX = CANVAS_WIDTH / 2
        let bestY = CANVAS_HEIGHT / 2
        let maxMinDistance = 0

        // Sample grid of potential locations
        for (let testX = 50; testX < CANVAS_WIDTH - 50; testX += 30) {
          for (let testY = 50; testY < CANVAS_HEIGHT - 50; testY += 30) {
            // Find minimum distance to any trail point
            let minDistance = Infinity

            for (const point of player1.trail) {
              if (isNaN(point.x) || isNaN(point.y)) continue
              const dist = Math.sqrt((point.x - testX) ** 2 + (point.y - testY) ** 2)
              minDistance = Math.min(minDistance, dist)
            }

            for (const point of player2.trail) {
              if (isNaN(point.x) || isNaN(point.y)) continue
              const dist = Math.sqrt((point.x - testX) ** 2 + (point.y - testY) ** 2)
              minDistance = Math.min(minDistance, dist)
            }

            // Keep track of location with maximum minimum distance
            if (minDistance > maxMinDistance) {
              maxMinDistance = minDistance
              bestX = testX
              bestY = testY
            }
          }
        }

        // Show teleport indicator for 1 second
        teleportIndicator = {
          x: bestX,
          y: bestY,
          direction: collector.direction,
          endTime: now + 1000
        }

        // Add break in trail and teleport
        collector.trail.push({ x: NaN, y: NaN })
        collector.x = bestX
        collector.y = bestY
        sounds.teleport()
        break
      case "flash":
        // Clear any existing flash timeout
        if (flashTimeoutId !== null) {
          clearTimeout(flashTimeoutId)
        }

        // Flash 3 times at 1-second intervals
        flashCount = 0
        flashActive = true
        sounds.flash()

        const doFlash = () => {
          flashCount++
          if (flashCount < 3) {
            flashTimeoutId = setTimeout(() => {
              flashActive = !flashActive
              sounds.flash()
              flashTimeoutId = setTimeout(() => {
                flashActive = !flashActive
                doFlash()
              }, 500)
            }, 500) as unknown as number
          } else {
            flashTimeoutId = setTimeout(() => {
              flashActive = false
              flashTimeoutId = null
            }, 500) as unknown as number
          }
        }

        flashTimeoutId = setTimeout(() => {
          flashActive = false
          doFlash()
        }, 500) as unknown as number
        break
    }
  }

  function checkCollisionAtPoint(x: number, y: number, cycle: Cycle): boolean {
    const now = Date.now()

    // Skip trail collision check if shield is active
    if (cycle.shieldUntil > now) {
      return false
    }

    // Check collision with other cycle's head (body-to-body collision)
    const otherCycle = cycle === player1 ? player2 : player1
    const distToOtherCycle = Math.sqrt((x - otherCycle.x) ** 2 + (y - otherCycle.y) ** 2)

    // If cycles are touching (within 2x cycle size), it's a collision
    if (distToOtherCycle < CYCLE_SIZE * 3) {
      return true
    }

    const isDasherActive = player1.trailDasherUntil > now || player2.trailDasherUntil > now

    // Helper function to check if a point is on a solid part of a dashed line
    const isOnSolidPartOfDash = (trailPoints: Point[], testX: number, testY: number): boolean => {
      const dashLength = 15
      const gapLength = 30
      const patternLength = dashLength + gapLength

      let pathDistance = 0

      for (let i = 1; i < trailPoints.length; i++) {
        const prev = trailPoints[i - 1]
        const curr = trailPoints[i]

        // Skip break markers
        if (isNaN(prev.x) || isNaN(prev.y) || isNaN(curr.x) || isNaN(curr.y)) {
          pathDistance = 0 // Reset distance after break
          continue
        }

        // Check if test point is near this line segment
        const dx = curr.x - prev.x
        const dy = curr.y - prev.y
        const segmentLength = Math.sqrt(dx * dx + dy * dy)

        if (segmentLength === 0) continue

        // Find closest point on line segment to test point
        const t = Math.max(0, Math.min(1, ((testX - prev.x) * dx + (testY - prev.y) * dy) / (segmentLength * segmentLength)))
        const closestX = prev.x + t * dx
        const closestY = prev.y + t * dy

        // Check if test point is close enough to this segment
        const distToSegment = Math.sqrt((testX - closestX) ** 2 + (testY - closestY) ** 2)

        if (distToSegment < CYCLE_SIZE * 2) {
          // Point is near this segment - check if it's on solid part of dash pattern
          const distanceAlongSegment = t * segmentLength
          const totalDistance = pathDistance + distanceAlongSegment
          const positionInPattern = totalDistance % patternLength

          // If position is within dash length, it's solid; otherwise it's a gap
          if (positionInPattern < dashLength) {
            return true
          }
        }

        pathDistance += segmentLength
      }

      return false
    }

    // Check collision with player1's trail
    // Skip very recent trail points to avoid self-collision (more points when slowed by time warp)
    const skipPoints = cycle === player1 ? Math.max(5, Math.ceil(20 / player1.speedMultiplier)) : 5
    const skipPoints2 = cycle === player2 ? Math.max(5, Math.ceil(20 / player2.speedMultiplier)) : 5

    const player1TrailToCheck = player1.trail.slice(0, -skipPoints)
    const player2TrailToCheck = player2.trail.slice(0, -skipPoints2)

    if (isDasherActive) {
      // When dasher is active, only collide with solid parts of dashes
      if (isOnSolidPartOfDash(player1TrailToCheck, x, y)) {
        return true
      }
      if (isOnSolidPartOfDash(player2TrailToCheck, x, y)) {
        return true
      }
    } else {
      // Normal collision detection for solid trails
      for (const point of player1TrailToCheck) {
        if (isNaN(point.x) || isNaN(point.y)) continue
        if (Math.abs(point.x - x) < CYCLE_SIZE * 2 && Math.abs(point.y - y) < CYCLE_SIZE * 2) {
          return true
        }
      }

      for (const point of player2TrailToCheck) {
        if (isNaN(point.x) || isNaN(point.y)) continue
        if (Math.abs(point.x - x) < CYCLE_SIZE * 2 && Math.abs(point.y - y) < CYCLE_SIZE * 2) {
          return true
        }
      }
    }

    return false
  }

  function update() {
    if (!gameRunning || roundOver || gameOver) return

    // Update player 1 direction
    if (keys.up) updateDirection(player1, "up")
    if (keys.down) updateDirection(player1, "down")
    if (keys.left) updateDirection(player1, "left")
    if (keys.right) updateDirection(player1, "right")

    // Update player 2 direction (human or AI)
    if (vsMode === "human") {
      if (keys.w) updateDirection(player2, "up")
      if (keys.s) updateDirection(player2, "down")
      if (keys.a) updateDirection(player2, "left")
      if (keys.d) updateDirection(player2, "right")
    } else {
      computerAI()
    }

    // Spawn and check power-ups
    if (powerUpsEnabled) {
      spawnPowerUp()
      checkPowerUpCollection()
    }

    // Move cycles
    if (player1.alive) {
      // Store old position
      const oldX = player1.x
      const oldY = player1.y

      // Move with speed multiplier
      const speed = getCycleSpeed() * player1.speedMultiplier
      switch (player1.direction) {
        case "up":
          player1.y -= speed
          break
        case "down":
          player1.y += speed
          break
        case "left":
          player1.x -= speed
          break
        case "right":
          player1.x += speed
          break
      }

      // Check if wrapping around edges
      let wrapped = false
      if (player1.x < 0) {
        player1.x = CANVAS_WIDTH
        wrapped = true
      }
      if (player1.x > CANVAS_WIDTH) {
        player1.x = 0
        wrapped = true
      }
      if (player1.y < 0) {
        player1.y = CANVAS_HEIGHT
        wrapped = true
      }
      if (player1.y > CANVAS_HEIGHT) {
        player1.y = 0
        wrapped = true
      }

      // Add old position to trail (before wrap)
      player1.trail.push({ x: oldX, y: oldY })

      // If wrapped, start a new trail segment by adding a break marker
      if (wrapped) {
        player1.trail.push({ x: NaN, y: NaN })
      }

      // Limit trail length to prevent lag - thin out old points
      // Keep recent trail dense, but reduce older trail to every 3rd point
      if (player1.trail.length > 2000) {
        const recentTrail = player1.trail.slice(-500) // Keep last 500 points
        const oldTrail = player1.trail.slice(0, -500)

        // Thin old trail while preserving break markers (NaN points)
        const thinnedOldTrail: Point[] = []
        for (let i = 0; i < oldTrail.length; i++) {
          const point = oldTrail[i]
          // Always keep break markers
          if (isNaN(point.x) || isNaN(point.y)) {
            thinnedOldTrail.push(point)
          } else if (i % 3 === 0) {
            // Keep every 3rd regular point
            thinnedOldTrail.push(point)
          }
        }

        player1.trail = [...thinnedOldTrail, ...recentTrail]
      }

      // Check collision (shield makes you invincible)
      if (checkCollisionAtPoint(player1.x, player1.y, player1)) {
        player1.alive = false
        sounds.crash()
        endRound()
      }
    }

    if (player2.alive) {
      // Store old position
      const oldX = player2.x
      const oldY = player2.y

      // Move with speed multiplier
      const speed = getCycleSpeed() * player2.speedMultiplier
      switch (player2.direction) {
        case "up":
          player2.y -= speed
          break
        case "down":
          player2.y += speed
          break
        case "left":
          player2.x -= speed
          break
        case "right":
          player2.x += speed
          break
      }

      // Check if wrapping around edges
      let wrapped = false
      if (player2.x < 0) {
        player2.x = CANVAS_WIDTH
        wrapped = true
      }
      if (player2.x > CANVAS_WIDTH) {
        player2.x = 0
        wrapped = true
      }
      if (player2.y < 0) {
        player2.y = CANVAS_HEIGHT
        wrapped = true
      }
      if (player2.y > CANVAS_HEIGHT) {
        player2.y = 0
        wrapped = true
      }

      // Add old position to trail (before wrap)
      player2.trail.push({ x: oldX, y: oldY })

      // If wrapped, start a new trail segment by adding a break marker
      if (wrapped) {
        player2.trail.push({ x: NaN, y: NaN })
      }

      // Limit trail length to prevent lag - thin out old points
      // Keep recent trail dense, but reduce older trail to every 3rd point
      if (player2.trail.length > 2000) {
        const recentTrail = player2.trail.slice(-500) // Keep last 500 points
        const oldTrail = player2.trail.slice(0, -500)

        // Thin old trail while preserving break markers (NaN points)
        const thinnedOldTrail: Point[] = []
        for (let i = 0; i < oldTrail.length; i++) {
          const point = oldTrail[i]
          // Always keep break markers
          if (isNaN(point.x) || isNaN(point.y)) {
            thinnedOldTrail.push(point)
          } else if (i % 3 === 0) {
            // Keep every 3rd regular point
            thinnedOldTrail.push(point)
          }
        }

        player2.trail = [...thinnedOldTrail, ...recentTrail]
      }

      // Check collision (shield makes you invincible)
      if (checkCollisionAtPoint(player2.x, player2.y, player2)) {
        player2.alive = false
        sounds.crash()
        endRound()
      }
    }
  }

  function endRound() {
    roundOver = true
    gameRunning = false

    // Determine winner of round
    if (!player1.alive && player2.alive) {
      score.player2++
    } else if (!player2.alive && player1.alive) {
      score.player1++
    }
    // If both died at the same time, no points awarded

    // Check if someone won the game
    if (score.player1 >= 5) {
      winner = "player1"
      gameOver = true
      sounds.win()
    } else if (score.player2 >= 5) {
      winner = "player2"
      gameOver = true
      sounds.win()
    }
  }

  function draw() {
    // Clear canvas with dark background
    ctx.fillStyle = "#000814"
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Draw grid
    ctx.strokeStyle = "#1a1a2e"
    ctx.lineWidth = 1
    for (let x = 0; x < CANVAS_WIDTH; x += 20) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, CANVAS_HEIGHT)
      ctx.stroke()
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += 20) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(CANVAS_WIDTH, y)
      ctx.stroke()
    }

    // Draw player 1 trail (unless flash is active)
    if (!flashActive) {
      const now = Date.now()
      ctx.strokeStyle = player1.color
      ctx.lineWidth = CYCLE_SIZE
      ctx.lineCap = "round"
      ctx.lineJoin = "round"

      // Set dash pattern if dasher is active
      if (player1.trailDasherUntil > now || player2.trailDasherUntil > now) {
        ctx.setLineDash([15, 30]) // 15px solid, 30px gap
      } else {
        ctx.setLineDash([]) // Solid line
      }

      if (player1.trail.length > 1) {
        ctx.beginPath()
        let pathStarted = false
        for (let i = 0; i < player1.trail.length; i++) {
          const point = player1.trail[i]
          // Skip NaN break markers
          if (isNaN(point.x) || isNaN(point.y)) {
            if (pathStarted) {
              ctx.stroke()
              pathStarted = false
            }
            continue
          }
          if (!pathStarted) {
            ctx.beginPath()
            ctx.moveTo(point.x, point.y)
            pathStarted = true
          } else {
            ctx.lineTo(point.x, point.y)
          }
        }
        if (pathStarted) {
          ctx.stroke()
        }
      }

      // Draw player 2 trail
      ctx.strokeStyle = player2.color
      if (player2.trail.length > 1) {
        ctx.beginPath()
        let pathStarted = false
        for (let i = 0; i < player2.trail.length; i++) {
          const point = player2.trail[i]
          // Skip NaN break markers
          if (isNaN(point.x) || isNaN(point.y)) {
            if (pathStarted) {
              ctx.stroke()
              pathStarted = false
            }
            continue
          }
          if (!pathStarted) {
            ctx.beginPath()
            ctx.moveTo(point.x, point.y)
            pathStarted = true
          } else {
            ctx.lineTo(point.x, point.y)
          }
        }
        if (pathStarted) {
          ctx.stroke()
        }
      }

      // Reset line dash
      ctx.setLineDash([])
    }

    // Draw teleport indicator
    if (teleportIndicator) {
      const now = Date.now()
      if (now < teleportIndicator.endTime) {
        // Pulsing effect
        const progress = (teleportIndicator.endTime - now) / 1000
        const pulse = Math.sin(now / 100) * 0.3 + 0.7

        // Draw circle at destination
        ctx.save()
        ctx.globalAlpha = pulse * progress
        ctx.strokeStyle = "#ffff00"
        ctx.fillStyle = "rgba(255, 255, 0, 0.2)"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(teleportIndicator.x, teleportIndicator.y, 30, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()

        // Draw direction arrow
        ctx.fillStyle = "#ffff00"
        ctx.strokeStyle = "#ffff00"
        ctx.lineWidth = 2

        const arrowSize = 20
        const arrowX = teleportIndicator.x
        const arrowY = teleportIndicator.y

        ctx.beginPath()
        switch (teleportIndicator.direction) {
          case "up":
            ctx.moveTo(arrowX, arrowY - arrowSize)
            ctx.lineTo(arrowX - arrowSize / 2, arrowY)
            ctx.lineTo(arrowX + arrowSize / 2, arrowY)
            break
          case "down":
            ctx.moveTo(arrowX, arrowY + arrowSize)
            ctx.lineTo(arrowX - arrowSize / 2, arrowY)
            ctx.lineTo(arrowX + arrowSize / 2, arrowY)
            break
          case "left":
            ctx.moveTo(arrowX - arrowSize, arrowY)
            ctx.lineTo(arrowX, arrowY - arrowSize / 2)
            ctx.lineTo(arrowX, arrowY + arrowSize / 2)
            break
          case "right":
            ctx.moveTo(arrowX + arrowSize, arrowY)
            ctx.lineTo(arrowX, arrowY - arrowSize / 2)
            ctx.lineTo(arrowX, arrowY + arrowSize / 2)
            break
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        ctx.restore()
      } else {
        // Clear indicator after time expires
        teleportIndicator = null
      }
    }

    // Draw player 1 cycle with glow
    if (player1.alive) {
      ctx.shadowBlur = 20
      ctx.shadowColor = player1.color
      ctx.fillStyle = player1.color
      ctx.fillRect(player1.x - CYCLE_SIZE, player1.y - CYCLE_SIZE, CYCLE_SIZE * 2, CYCLE_SIZE * 2)
      ctx.shadowBlur = 0
    }

    // Draw player 2 cycle with glow
    if (player2.alive) {
      ctx.shadowBlur = 20
      ctx.shadowColor = player2.color
      ctx.fillStyle = player2.color
      ctx.fillRect(player2.x - CYCLE_SIZE, player2.y - CYCLE_SIZE, CYCLE_SIZE * 2, CYCLE_SIZE * 2)
      ctx.shadowBlur = 0
    }

    // Draw power-ups with pulsing effect
    if (!flashActive && powerUpsEnabled) {
      const now = Date.now()
      const pulse = Math.sin(now / 150) * 0.3 + 0.7 // Pulsing between 0.4 and 1.0

      activePowerUps.forEach(powerUp => {
        ctx.save()
        ctx.globalAlpha = pulse
        ctx.font = "32px sans-serif"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(powerUp.icon, powerUp.x, powerUp.y)

        // Draw glow circle
        ctx.globalAlpha = pulse * 0.3
        ctx.fillStyle = "#ffff00"
        ctx.beginPath()
        ctx.arc(powerUp.x, powerUp.y, 20, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })
    }

    // Draw active power-up indicators with countdown timers
    const now = Date.now()
    const indicatorY = 100
    const indicatorSize = 50
    let indicatorX = 20

    // Player 1 indicators (right side now)
    indicatorX = CANVAS_WIDTH - 60
    ctx.textAlign = "right"

    if (player1.shieldUntil > now) {
      const timeLeft = Math.ceil((player1.shieldUntil - now) / 1000)
      ctx.font = "28px sans-serif"
      ctx.fillStyle = "#ffffff"
      ctx.fillText("🛡️", indicatorX, indicatorY)

      // Draw countdown circle
      const radius = 15
      const progress = (player1.shieldUntil - now) / 5000
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(indicatorX - 15, indicatorY - 5, radius, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * progress))
      ctx.stroke()

      ctx.font = "12px sans-serif"
      ctx.fillStyle = "#ffffff"
      ctx.fillText(timeLeft + "s", indicatorX, indicatorY + 20)
      indicatorX -= indicatorSize
    }
    if (player1.trailDasherUntil > now) {
      const timeLeft = Math.ceil((player1.trailDasherUntil - now) / 1000)
      ctx.font = "28px sans-serif"
      ctx.fillStyle = "#00ffff"
      ctx.fillText("🌀", indicatorX, indicatorY)

      // Draw countdown circle
      const radius = 15
      const progress = (player1.trailDasherUntil - now) / 5000
      ctx.strokeStyle = "#00ffff"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(indicatorX - 15, indicatorY - 5, radius, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * progress))
      ctx.stroke()

      ctx.font = "12px sans-serif"
      ctx.fillStyle = "#ffffff"
      ctx.fillText(timeLeft + "s", indicatorX, indicatorY + 20)
      indicatorX -= indicatorSize
    }
    if (player1.timeWarpUntil > now) {
      const timeLeft = Math.ceil((player1.timeWarpUntil - now) / 1000)
      const icon = player1.speedMultiplier < 1 ? "🐢" : "⚡"
      ctx.font = "28px sans-serif"
      ctx.fillStyle = player1.speedMultiplier < 1 ? "#ffaa00" : "#ffff00"
      ctx.fillText(icon, indicatorX, indicatorY)

      // Draw countdown circle
      const radius = 15
      const progress = (player1.timeWarpUntil - now) / 3000
      ctx.strokeStyle = player1.speedMultiplier < 1 ? "#ffaa00" : "#ffff00"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(indicatorX - 15, indicatorY - 5, radius, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * progress))
      ctx.stroke()

      ctx.font = "12px sans-serif"
      ctx.fillStyle = "#ffffff"
      ctx.fillText(timeLeft + "s", indicatorX, indicatorY + 20)
    }

    // Player 2 indicators (left side)
    indicatorX = 60
    ctx.textAlign = "left"

    if (player2.shieldUntil > now) {
      const timeLeft = Math.ceil((player2.shieldUntil - now) / 1000)
      ctx.font = "28px sans-serif"
      ctx.fillStyle = "#ffffff"
      ctx.fillText("🛡️", indicatorX, indicatorY)

      // Draw countdown circle
      const radius = 15
      const progress = (player2.shieldUntil - now) / 5000
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(indicatorX + 15, indicatorY - 5, radius, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * progress))
      ctx.stroke()

      ctx.font = "12px sans-serif"
      ctx.fillStyle = "#ffffff"
      ctx.fillText(timeLeft + "s", indicatorX, indicatorY + 20)
      indicatorX += indicatorSize
    }
    if (player2.trailDasherUntil > now) {
      const timeLeft = Math.ceil((player2.trailDasherUntil - now) / 1000)
      ctx.font = "28px sans-serif"
      ctx.fillStyle = "#ff6600"
      ctx.fillText("🌀", indicatorX, indicatorY)

      // Draw countdown circle
      const radius = 15
      const progress = (player2.trailDasherUntil - now) / 5000
      ctx.strokeStyle = "#ff6600"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(indicatorX + 15, indicatorY - 5, radius, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * progress))
      ctx.stroke()

      ctx.font = "12px sans-serif"
      ctx.fillStyle = "#ffffff"
      ctx.fillText(timeLeft + "s", indicatorX, indicatorY + 20)
      indicatorX += indicatorSize
    }
    if (player2.timeWarpUntil > now) {
      const timeLeft = Math.ceil((player2.timeWarpUntil - now) / 1000)
      const icon = player2.speedMultiplier < 1 ? "🐢" : "⚡"
      ctx.font = "28px sans-serif"
      ctx.fillStyle = player2.speedMultiplier < 1 ? "#ffaa00" : "#ffff00"
      ctx.fillText(icon, indicatorX, indicatorY)

      // Draw countdown circle
      const radius = 15
      const progress = (player2.timeWarpUntil - now) / 3000
      ctx.strokeStyle = player2.speedMultiplier < 1 ? "#ffaa00" : "#ffff00"
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(indicatorX + 15, indicatorY - 5, radius, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * progress))
      ctx.stroke()

      ctx.font = "12px sans-serif"
      ctx.fillStyle = "#ffffff"
      ctx.fillText(timeLeft + "s", indicatorX, indicatorY + 20)
    }

    ctx.textAlign = "center" // Reset to center

    // Draw scores
    ctx.fillStyle = player1.color
    ctx.font = "bold 48px monospace"
    ctx.textAlign = "center"
    ctx.fillText(score.player1.toString(), CANVAS_WIDTH / 4, 60)

    ctx.fillStyle = player2.color
    ctx.fillText(score.player2.toString(), (CANVAS_WIDTH * 3) / 4, 60)

    // Draw round over message
    if (roundOver && !gameOver) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      ctx.fillStyle = "#ffffff"
      ctx.font = "bold 36px sans-serif"
      ctx.textAlign = "center"

      if (!player1.alive && player2.alive) {
        ctx.fillStyle = player2.color
        ctx.fillText(vsMode === "computer" ? "Computer Wins Round!" : "Player 2 Wins Round!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20)
      } else if (!player2.alive && player1.alive) {
        ctx.fillStyle = player1.color
        ctx.fillText("Player 1 Wins Round!", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20)
      } else {
        ctx.fillStyle = "#ffff00"
        ctx.fillText("Double Crash! No Points", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20)
      }

      ctx.fillStyle = "#ffffff"
      ctx.font = "24px sans-serif"
      ctx.fillText("Click 'Next Round' to continue", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30)
    }

    // Draw game over screen
    if (gameOver && winner) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)"
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

      const winnerColor = winner === "player1" ? player1.color : player2.color
      const winnerName = winner === "player1" ? "Player 1" : vsMode === "computer" ? "Computer" : "Player 2"

      ctx.fillStyle = winnerColor
      ctx.font = "bold 64px sans-serif"
      ctx.textAlign = "center"
      ctx.fillText(`${winnerName} Wins!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40)

      ctx.fillStyle = "#ffffff"
      ctx.font = "32px sans-serif"
      ctx.fillText(`Final Score: ${score.player1} - ${score.player2}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20)

      ctx.font = "24px sans-serif"
      ctx.fillText("Click 'New Game' to play again", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 70)
    }

    update()
    animationId = requestAnimationFrame(draw)
  }

  function startGame() {
    gameRunning = true
    roundOver = false
    gameOver = false
    winner = null
    score = { player1: 0, player2: 0 }
    resetRound()
  }

  function nextRound() {
    roundOver = false
    gameRunning = true
    resetRound()
  }

  function resetRound() {
    player1 = {
      x: CANVAS_WIDTH - 100,
      y: CANVAS_HEIGHT / 2,
      direction: "left",
      trail: [],
      color: "#00ffff",
      alive: true,
      shieldUntil: 0,
      trailDasherUntil: 0,
      speedMultiplier: 1,
      timeWarpUntil: 0
    }

    player2 = {
      x: 100,
      y: CANVAS_HEIGHT / 2,
      direction: "right",
      trail: [],
      color: "#ff6600",
      alive: true,
      shieldUntil: 0,
      trailDasherUntil: 0,
      speedMultiplier: 1,
      timeWarpUntil: 0
    }

    // Clear active power-ups and flash state
    activePowerUps = []
    lastPowerUpSpawn = 0
    lastAIDecision = 0 // Reset AI decision timer
    flashActive = false
    flashCount = 0
    if (flashTimeoutId !== null) {
      clearTimeout(flashTimeoutId)
      flashTimeoutId = null
    }
    teleportIndicator = null
  }

  function pauseGame() {
    gameRunning = false
  }

  function resetGame() {
    gameRunning = false
    roundOver = false
    gameOver = false
    winner = null
    score = { player1: 0, player2: 0 }
    resetRound()
  }
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<svelte:head>
  <title>💡 Light Particles | Dougie's Game Hub</title>
</svelte:head>

<div class="container mx-auto p-8">
  <h1 class="text-4xl font-bold mb-6">💡 Light Particles</h1>

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

    <!-- Controls Panel -->
    <div class="flex-1 flex flex-col gap-4">
      <div class="card bg-base-200 shadow-xl flex-1 lg:overflow-y-auto lg:max-h-full">
        <div class="card-body">
          <h2 class="card-title">Settings</h2>

          <div class="space-y-4">
          <!-- Game Mode Toggle -->
          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Game Mode</span>
            </label>
            <div class="flex gap-2">
              <button
                class="btn btn-sm flex-1 {vsMode === 'computer' ? 'btn-primary' : 'btn-outline'}"
                onclick={() => (vsMode = 'computer')}
                disabled={gameRunning || roundOver}
              >
                vs Computer
              </button>
              <button
                class="btn btn-sm flex-1 {vsMode === 'human' ? 'btn-primary' : 'btn-outline'}"
                onclick={() => (vsMode = 'human')}
                disabled={gameRunning || roundOver}
              >
                vs Human
              </button>
            </div>
          </div>

          <!-- Computer Skill (only show when playing vs computer) -->
          {#if vsMode === "computer"}
            <div class="form-control">
              <label class="label">
                <span class="label-text font-semibold">Computer Skill</span>
              </label>
              <div class="flex gap-2">
                <button
                  class="btn btn-xs flex-1 {computerSkill === 'amateur' ? 'btn-success' : 'btn-outline'}"
                  onclick={() => (computerSkill = 'amateur')}
                  disabled={gameRunning || roundOver}
                >
                  Amateur
                </button>
                <button
                  class="btn btn-xs flex-1 {computerSkill === 'normal' ? 'btn-warning' : 'btn-outline'}"
                  onclick={() => (computerSkill = 'normal')}
                  disabled={gameRunning || roundOver}
                >
                  Normal
                </button>
                <button
                  class="btn btn-xs flex-1 {computerSkill === 'expert' ? 'btn-error' : 'btn-outline'}"
                  onclick={() => (computerSkill = 'expert')}
                  disabled={gameRunning || roundOver}
                >
                  Expert
                </button>
              </div>
            </div>
          {/if}

          <!-- Speed Setting -->
          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Speed</span>
            </label>
            <div class="flex gap-2">
              <button
                class="btn btn-xs flex-1 {gameSpeed === 'practice' ? 'btn-success' : 'btn-outline'}"
                onclick={() => (gameSpeed = 'practice')}
                disabled={gameRunning || roundOver}
              >
                Practice
              </button>
              <button
                class="btn btn-xs flex-1 {gameSpeed === 'cruising' ? 'btn-warning' : 'btn-outline'}"
                onclick={() => (gameSpeed = 'cruising')}
                disabled={gameRunning || roundOver}
              >
                Cruising
              </button>
              <button
                class="btn btn-xs flex-1 {gameSpeed === 'hyper' ? 'btn-error' : 'btn-outline'}"
                onclick={() => (gameSpeed = 'hyper')}
                disabled={gameRunning || roundOver}
              >
                Hyper
              </button>
            </div>
          </div>

          <!-- Options Section -->
          <div class="divider my-2"></div>
          <div class="mb-2">
            <span class="label-text font-semibold">Options</span>
          </div>

          <!-- Sound Toggle -->
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">Sound Effects</span>
              <input type="checkbox" class="checkbox" bind:checked={soundEnabled} />
            </label>
          </div>

          <!-- Power-Ups Toggle -->
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text font-semibold">Power-Ups</span>
              <input type="checkbox" class="checkbox checkbox-primary" bind:checked={powerUpsEnabled} disabled={gameRunning || roundOver} />
            </label>
          </div>

          <!-- Individual Power-Up Checkboxes -->
          {#if powerUpsEnabled}
            <div class="divider my-2"></div>
            <div class="form-control ml-6">
              <label class="label">
                <span class="label-text text-sm font-semibold">Enabled Power-Ups</span>
              </label>
              <div class="flex flex-col gap-2">
                <label class="label cursor-pointer justify-start gap-2 py-1">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-xs"
                    bind:checked={enabledPowerUps.dasher}
                    disabled={gameRunning || roundOver}
                  />
                  <div class="flex flex-col">
                    <span class="label-text text-sm font-medium">🌀 Trail Dasher</span>
                    <span class="label-text text-xs opacity-70">Turn all trails to dashes for 5s</span>
                  </div>
                </label>
                <label class="label cursor-pointer justify-start gap-2 py-1">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-xs"
                    bind:checked={enabledPowerUps.shield}
                    disabled={gameRunning || roundOver}
                  />
                  <div class="flex flex-col">
                    <span class="label-text text-sm font-medium">🛡️ Shield</span>
                    <span class="label-text text-xs opacity-70">Invincibility for 5s</span>
                  </div>
                </label>
                <label class="label cursor-pointer justify-start gap-2 py-1">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-xs"
                    bind:checked={enabledPowerUps.timewarp}
                    disabled={gameRunning || roundOver}
                  />
                  <div class="flex flex-col">
                    <span class="label-text text-sm font-medium">⏱️ Time Warp</span>
                    <span class="label-text text-xs opacity-70">Slow yourself, speed opponent</span>
                  </div>
                </label>
                <label class="label cursor-pointer justify-start gap-2 py-1">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-xs"
                    bind:checked={enabledPowerUps.teleport}
                    disabled={gameRunning || roundOver}
                  />
                  <div class="flex flex-col">
                    <span class="label-text text-sm font-medium">🌟 Teleport</span>
                    <span class="label-text text-xs opacity-70">Jump to safest location</span>
                  </div>
                </label>
                <label class="label cursor-pointer justify-start gap-2 py-1">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-xs"
                    bind:checked={enabledPowerUps.flash}
                    disabled={gameRunning || roundOver}
                  />
                  <div class="flex flex-col">
                    <span class="label-text text-sm font-medium">💫 Flash</span>
                    <span class="label-text text-xs opacity-70">Hide trails 3x for 0.5s each</span>
                  </div>
                </label>
              </div>
            </div>
          {/if}

          <!-- Instructions -->
          <div class="divider"></div>
          <div>
            <h3 class="font-semibold mb-2">How to Play:</h3>
            {#if vsMode === "computer"}
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>Player 1: Use <kbd class="kbd kbd-sm">↑</kbd> <kbd class="kbd kbd-sm">↓</kbd> <kbd class="kbd kbd-sm">←</kbd> <kbd class="kbd kbd-sm">→</kbd> arrow keys</li>
                <li>Leave a light trail behind you</li>
                <li>Don't hit any trail (yours or opponent's)</li>
                <li>Wrap around edges to escape</li>
                <li>First to 5 rounds wins!</li>
              </ul>
            {:else}
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>Player 1 (Cyan): <kbd class="kbd kbd-sm">↑</kbd> <kbd class="kbd kbd-sm">↓</kbd> <kbd class="kbd kbd-sm">←</kbd> <kbd class="kbd kbd-sm">→</kbd></li>
                <li>Player 2 (Orange): <kbd class="kbd kbd-sm">W</kbd> <kbd class="kbd kbd-sm">A</kbd> <kbd class="kbd kbd-sm">S</kbd> <kbd class="kbd kbd-sm">D</kbd></li>
                <li>Leave a light trail behind you</li>
                <li>Don't hit any trail!</li>
                <li>First to 5 rounds wins!</li>
              </ul>
            {/if}
          </div>

          </div>
        </div>
      </div>

      <!-- Game Controls - Always Visible -->
      <div class="card bg-base-200 shadow-xl">
        <div class="card-body p-4">
          <div class="flex gap-2">
            {#if !gameRunning && !roundOver && !gameOver}
              <button class="btn btn-primary flex-1" onclick={startGame}>
                Start Game
              </button>
            {:else if roundOver && !gameOver}
              <button class="btn btn-primary flex-1" onclick={nextRound}>
                Next Round
              </button>
            {:else if gameOver}
              <button class="btn btn-primary flex-1" onclick={startGame}>
                New Game
              </button>
            {:else}
              <button class="btn btn-warning flex-1" onclick={pauseGame}>
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
    background: #000814;
  }
</style>
