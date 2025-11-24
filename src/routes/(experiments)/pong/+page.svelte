<script lang="ts">
  import { onMount } from "svelte"

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D
  let animationId: number

  // Game settings
  let vsMode = $state<"computer" | "human">("computer")
  let difficulty = $state<"easy" | "medium" | "hard">("medium")
  let speedIncrease = $state(true)
  let englishSpin = $state(false)
  let powerUpsEnabled = $state(true)
  let powerUpMode = $state<"bySide" | "byHit">("bySide")
  let enabledPowerUps = $state({
    freeze: true,
    lightning: true,
    shrinker: true
  })
  let soundEnabled = $state(true)

  // Game state
  let gameRunning = $state(false)
  let gameOver = $state(false)
  let winner = $state<"player" | "computer" | null>(null)
  let score = $state({ player: 0, computer: 0 })

  // Ball trail for comet effect
  type TrailPoint = { x: number; y: number; alpha: number }
  let ballTrail = $state<TrailPoint[]>([])

  // Fireworks
  type Firework = { x: number; y: number; particles: Particle[] }
  type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number }
  let fireworks = $state<Firework[]>([])

  // Stars for space background
  type Star = { x: number; y: number; size: number; opacity: number }
  let stars = $state<Star[]>([])

  // Power-ups
  type PowerUpType = "freeze" | "lightning" | "shrinker"
  type PowerUp = { x: number; y: number; type: PowerUpType; icon: string }
  let activePowerUps = $state<PowerUp[]>([])
  let powerUpSpawnTime = $state(0)
  let hitCounter = $state(0)

  // Power-up effects
  let slowedUntil = $state({ player: 0, computer: 0 })
  let paddleSizes = $state({ player: 80, computer: 80 })
  let multiBalls = $state<typeof ball[]>([])

  // Ball properties
  const baseBallSpeed = { easy: 2.5, medium: 3.5, hard: 5 }
  let currentBallSpeed = $state(3.5)
  let ball = $state({
    x: 400,
    y: 300,
    radius: 8,
    speedX: 5,
    speedY: 5,
    spin: 0, // For english effect
  })

  // Paddle properties
  const paddleWidth = 10
  const basePaddleHeight = 80

  let playerPaddle = $state({
    x: 20,
    y: 260,
  })

  let computerPaddle = $state({
    x: 770,
    y: 260,
  })

  // AI speed based on difficulty
  const aiSpeed = { easy: 2, medium: 2.67, hard: 3.67 }

  // Controls
  let keys = {
    w: false,
    s: false,
    up: false,
    down: false,
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
    paddleHit: () => playSound(220, 0.1, "square"),
    wallHit: () => playSound(180, 0.1, "square"),
    score: () => playSound(150, 0.3, "sawtooth"),
    powerUp: () => playSound(440, 0.2, "sine"),
    win: () => {
      playSound(523, 0.2, "sine")
      setTimeout(() => playSound(659, 0.2, "sine"), 150)
      setTimeout(() => playSound(784, 0.4, "sine"), 300)
    }
  }

  onMount(() => {
    ctx = canvas.getContext("2d")!
    initStars()
    resetBall()
    draw()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  })

  function initStars() {
    stars = []
    for (let i = 0; i < 150; i++) {
      stars.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.5 + 0.3
      })
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "w" || e.key === "W") keys.w = true
    if (e.key === "s" || e.key === "S") keys.s = true
    if (e.key === "ArrowUp") keys.up = true
    if (e.key === "ArrowDown") keys.down = true

    // Spacebar to pause/unpause
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault() // Prevent page scroll
      if (gameRunning && !gameOver) {
        pauseGame()
      } else if (!gameRunning && !gameOver) {
        if (score.player > 0 || score.computer > 0) {
          // Resume if game was paused
          gameRunning = true
        }
      }
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.key === "w" || e.key === "W") keys.w = false
    if (e.key === "s" || e.key === "S") keys.s = false
    if (e.key === "ArrowUp") keys.up = false
    if (e.key === "ArrowDown") keys.down = false
  }

  function resetBall() {
    currentBallSpeed = baseBallSpeed[difficulty]
    const angle = (Math.random() - 0.5) * (Math.PI / 3)
    const direction = Math.random() > 0.5 ? 1 : -1
    ball.x = 400
    ball.y = 300
    ball.speedX = direction * currentBallSpeed * Math.cos(angle)
    ball.speedY = currentBallSpeed * Math.sin(angle)
    ball.spin = 0
    ballTrail = []
  }

  function spawnPowerUp() {
    if (!powerUpsEnabled) return

    // Spawn every 5 hits
    if (hitCounter >= 5) {
      hitCounter = 0 // Reset counter

      // Only include enabled power-ups
      const types: PowerUpType[] = []
      if (enabledPowerUps.freeze) types.push("freeze")
      if (enabledPowerUps.lightning) types.push("lightning")
      if (enabledPowerUps.shrinker) types.push("shrinker")

      // If no power-ups are enabled, don't spawn anything
      if (types.length === 0) return

      const type = types[Math.floor(Math.random() * types.length)]
      const icons = { freeze: "❄️", lightning: "⚡", shrinker: "🔻" }

      let x: number
      let y: number

      if (powerUpMode === "byHit") {
        // Spawn 1/3 into the side of the player with higher score
        if (score.player > score.computer) {
          // Player is winning, spawn on player's side (left)
          x = 50 + Math.random() * 200 // 50-250 (1/3 from left edge at x=0 to center at x=400)
        } else if (score.computer > score.player) {
          // Computer is winning, spawn on computer's side (right)
          x = 550 + Math.random() * 200 // 550-750 (1/3 from right edge at x=800 to center at x=400)
        } else {
          // Tied, spawn in center
          x = 300 + Math.random() * 200
        }
        y = 100 + Math.random() * 400
      } else {
        // "bySide" mode - spawn on losing player's side to help them
        if (score.player < score.computer) {
          // Player is losing, spawn on player's side (left) to help them
          x = 50 + Math.random() * 300 // 50-350 (left side)
        } else if (score.computer < score.player) {
          // Computer is losing, spawn on computer's side (right) to help them
          x = 450 + Math.random() * 300 // 450-750 (right side)
        } else {
          // Tied, spawn randomly on either side
          x = Math.random() < 0.5 ? 50 + Math.random() * 300 : 450 + Math.random() * 300
        }
        y = 100 + Math.random() * 400
      }

      activePowerUps.push({
        x,
        y,
        type,
        icon: icons[type]
      })
    }
  }

  function checkPowerUpCollision(ballObj: typeof ball) {
    for (let i = activePowerUps.length - 1; i >= 0; i--) {
      const powerUp = activePowerUps[i]
      const dist = Math.sqrt(
        Math.pow(ballObj.x - powerUp.x, 2) + Math.pow(ballObj.y - powerUp.y, 2)
      )

      if (dist < 35) {
        sounds.powerUp()

        let benefitsPlayer: boolean

        if (powerUpMode === "byHit") {
          // In "byHit" mode, whoever's ball touches it gets the benefit
          // Player is on LEFT, computer is on RIGHT
          // Ball moving RIGHT (speedX > 0) = player just hit it, so player benefits
          // Ball moving LEFT (speedX < 0) = computer just hit it, so computer benefits
          benefitsPlayer = ballObj.speedX > 0
        } else {
          // In "bySide" mode, whoever's side it spawned on gets the benefit (regardless of who hit it)
          // Left side (< 400) = spawned on player's side, so player benefits (hurts computer)
          // Right side (> 400) = spawned on computer's side, so computer benefits (hurts player)
          benefitsPlayer = powerUp.x < 400
        }

        if (powerUp.type === "freeze") {
          // Slow down the opponent of whoever benefits
          const target = benefitsPlayer ? "computer" : "player"
          slowedUntil[target] = Date.now() + 3000
        } else if (powerUp.type === "lightning") {
          // Split into two balls - one continues same direction, other goes completely opposite
          const newBall = { ...ballObj }

          // New ball goes in the completely opposite direction
          newBall.speedX = -ballObj.speedX
          newBall.speedY = -ballObj.speedY

          // Original ball continues in the same direction (no change needed)
          multiBalls.push(newBall)
        } else if (powerUp.type === "shrinker") {
          // Shrink the opponent of whoever benefits
          const target = benefitsPlayer ? "computer" : "player"
          paddleSizes[target] = basePaddleHeight * 0.5
          setTimeout(() => {
            paddleSizes[target] = basePaddleHeight
          }, 5000)
        }

        activePowerUps.splice(i, 1)
      }
    }
  }

  function updateBall(ballObj: typeof ball, isMainBall = true) {
    // Add to trail for comet effect
    if (isMainBall) {
      ballTrail.push({ x: ballObj.x, y: ballObj.y, alpha: 1 })
      if (ballTrail.length > 15) ballTrail.shift()

      // Fade trail
      ballTrail.forEach((point, i) => {
        point.alpha = (i / ballTrail.length) * 0.7
      })
    }

    // Apply spin if english is enabled
    if (englishSpin && ballObj.spin !== 0) {
      ballObj.speedY += ballObj.spin * 0.05
    }

    // Move ball
    ballObj.x += ballObj.speedX
    ballObj.y += ballObj.speedY

    // Check power-up collision every frame
    checkPowerUpCollision(ballObj)

    // Ball collision with top/bottom
    if (ballObj.y - ballObj.radius < 0 || ballObj.y + ballObj.radius > 600) {
      ballObj.speedY = -ballObj.speedY
      sounds.wallHit()
    }

    const playerHeight = paddleSizes.player
    const computerHeight = paddleSizes.computer
    const now = Date.now()

    // Ball collision with player paddle
    if (
      ballObj.x - ballObj.radius < playerPaddle.x + paddleWidth &&
      ballObj.y > playerPaddle.y &&
      ballObj.y < playerPaddle.y + playerHeight &&
      ballObj.speedX < 0 // Only if moving toward paddle
    ) {
      sounds.paddleHit()
      const hitPos = (ballObj.y - (playerPaddle.y + playerHeight / 2)) / (playerHeight / 2)
      const angle = hitPos * (Math.PI / 3)

      // Increment hit counter for power-up spawning
      if (isMainBall) {
        hitCounter++
        spawnPowerUp()
      }

      // Increase speed if enabled
      if (speedIncrease) {
        currentBallSpeed *= 1.05
      }

      ballObj.speedX = currentBallSpeed * Math.cos(angle)
      ballObj.speedY = currentBallSpeed * Math.sin(angle)

      // Add spin based on paddle movement
      if (englishSpin) {
        if (keys.w || (vsMode === "computer" && keys.up)) ballObj.spin = -0.3
        if (keys.s || (vsMode === "computer" && keys.down)) ballObj.spin = 0.3
      }
    }

    // Ball collision with computer paddle
    if (
      ballObj.x + ballObj.radius > computerPaddle.x &&
      ballObj.y > computerPaddle.y &&
      ballObj.y < computerPaddle.y + computerHeight &&
      ballObj.speedX > 0 // Only if moving toward paddle
    ) {
      sounds.paddleHit()
      const hitPos = (ballObj.y - (computerPaddle.y + computerHeight / 2)) / (computerHeight / 2)
      const angle = hitPos * (Math.PI / 3)

      // Increment hit counter for power-up spawning
      if (isMainBall) {
        hitCounter++
        spawnPowerUp()
      }

      if (speedIncrease) {
        currentBallSpeed *= 1.05
      }

      ballObj.speedX = -currentBallSpeed * Math.cos(angle)
      ballObj.speedY = currentBallSpeed * Math.sin(angle)

      if (englishSpin) {
        if (vsMode === "human") {
          if (keys.up) ballObj.spin = -0.3
          if (keys.down) ballObj.spin = 0.3
        }
      }
    }

    // Score points
    if (ballObj.x < 0) {
      score.computer++
      sounds.score()
      if (isMainBall) {
        multiBalls = []
        resetBall()
        checkWinCondition()
      }
      return false
    }
    if (ballObj.x > 800) {
      score.player++
      sounds.score()
      if (isMainBall) {
        multiBalls = []
        resetBall()
        checkWinCondition()
      }
      return false
    }

    return true
  }

  function checkWinCondition() {
    if (score.player >= 10) {
      winner = "player"
      gameOver = true
      gameRunning = false
      sounds.win()
      createFireworks()
    } else if (score.computer >= 10) {
      winner = "computer"
      gameOver = true
      gameRunning = false
      sounds.win()
      createFireworks()
    }
  }

  function createFireworks() {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const x = 200 + Math.random() * 400
        const y = 150 + Math.random() * 200
        const particles: Particle[] = []

        for (let j = 0; j < 30; j++) {
          const angle = (Math.PI * 2 * j) / 30
          const speed = 2 + Math.random() * 3
          const colors = ["#ff0", "#f0f", "#0ff", "#f00", "#0f0", "#00f", "#fff"]
          particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 1
          })
        }

        fireworks.push({ x, y, particles })
      }, i * 400)
    }
  }

  function updateFireworks() {
    fireworks.forEach(fw => {
      fw.particles.forEach(p => {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.1 // gravity
        p.life -= 0.02
      })
      fw.particles = fw.particles.filter(p => p.life > 0)
    })
    fireworks = fireworks.filter(fw => fw.particles.length > 0)
  }

  function update() {
    if (!gameRunning || gameOver) return

    const now = Date.now()
    const playerHeight = paddleSizes.player
    const computerHeight = paddleSizes.computer

    // Move player 1 paddle (left - blue)
    const isSlowed = now < slowedUntil.player
    const playerSpeed = isSlowed ? 3 : 6
    if (vsMode === "human") {
      if (keys.w && playerPaddle.y > 0) playerPaddle.y -= playerSpeed
      if (keys.s && playerPaddle.y < 600 - playerHeight) playerPaddle.y += playerSpeed
    } else {
      if (keys.up && playerPaddle.y > 0) playerPaddle.y -= playerSpeed
      if (keys.down && playerPaddle.y < 600 - playerHeight) playerPaddle.y += playerSpeed
    }

    // Move player 2 paddle (right - red)
    const isComputerSlowed = now < slowedUntil.computer
    const computerSpeed = isComputerSlowed ? 3 : 6
    if (vsMode === "human") {
      if (keys.up && computerPaddle.y > 0) computerPaddle.y -= computerSpeed
      if (keys.down && computerPaddle.y < 600 - computerHeight) computerPaddle.y += computerSpeed
    } else {
      // Computer AI
      const baseSpeed = aiSpeed[difficulty]
      const speed = isComputerSlowed ? baseSpeed * 0.5 : baseSpeed
      const computerCenter = computerPaddle.y + computerHeight / 2
      const deadzone = difficulty === "easy" ? 50 : difficulty === "medium" ? 35 : 20

      if (computerCenter < ball.y - deadzone) {
        computerPaddle.y += speed
      } else if (computerCenter > ball.y + deadzone) {
        computerPaddle.y -= speed
      }

      if (computerPaddle.y < 0) computerPaddle.y = 0
      if (computerPaddle.y > 600 - computerHeight) computerPaddle.y = 600 - computerHeight
    }

    // Update main ball
    updateBall(ball, true)

    // Update multi-balls
    multiBalls = multiBalls.filter(b => updateBall(b, false))
  }

  function draw() {
    // Draw space background
    ctx.fillStyle = "#000814"
    ctx.fillRect(0, 0, 800, 600)

    // Draw stars
    stars.forEach(star => {
      ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`
      ctx.beginPath()
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
      ctx.fill()
    })

    // Draw center line
    ctx.setLineDash([10, 10])
    ctx.strokeStyle = "#334155"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(400, 0)
    ctx.lineTo(400, 600)
    ctx.stroke()
    ctx.setLineDash([])

    const now = Date.now()

    // Draw player paddle (left - blue spaceship)
    const playerSlowed = now < slowedUntil.player
    const playerHeight = paddleSizes.player

    // Main body
    ctx.fillStyle = playerSlowed ? "#60a5fa" : "#3b82f6"
    ctx.fillRect(playerPaddle.x, playerPaddle.y, paddleWidth, playerHeight)

    // Cockpit window
    ctx.fillStyle = "#1e40af"
    ctx.fillRect(playerPaddle.x + 2, playerPaddle.y + playerHeight / 2 - 8, paddleWidth - 4, 16)

    // Engine glow (right side)
    const engineGlow = ctx.createLinearGradient(playerPaddle.x + paddleWidth, playerPaddle.y, playerPaddle.x + paddleWidth + 8, playerPaddle.y)
    engineGlow.addColorStop(0, playerSlowed ? "rgba(96, 165, 250, 0.6)" : "rgba(59, 130, 246, 0.8)")
    engineGlow.addColorStop(1, "rgba(59, 130, 246, 0)")
    ctx.fillStyle = engineGlow
    ctx.fillRect(playerPaddle.x + paddleWidth, playerPaddle.y + 5, 8, playerHeight - 10)

    // Wing tips
    ctx.fillStyle = playerSlowed ? "#93c5fd" : "#60a5fa"
    ctx.beginPath()
    ctx.moveTo(playerPaddle.x, playerPaddle.y)
    ctx.lineTo(playerPaddle.x - 4, playerPaddle.y + 5)
    ctx.lineTo(playerPaddle.x, playerPaddle.y + 10)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(playerPaddle.x, playerPaddle.y + playerHeight)
    ctx.lineTo(playerPaddle.x - 4, playerPaddle.y + playerHeight - 5)
    ctx.lineTo(playerPaddle.x, playerPaddle.y + playerHeight - 10)
    ctx.fill()

    if (playerSlowed) {
      ctx.font = "20px sans-serif"
      ctx.fillStyle = "rgba(96, 165, 250, 0.8)"
      ctx.fillText("❄️", playerPaddle.x - 15, playerPaddle.y + playerHeight / 2 + 7)
    }

    // Draw computer paddle (right - red spaceship)
    const computerSlowed = now < slowedUntil.computer
    const computerHeight = paddleSizes.computer

    // Main body
    ctx.fillStyle = computerSlowed ? "#f87171" : "#ef4444"
    ctx.fillRect(computerPaddle.x, computerPaddle.y, paddleWidth, computerHeight)

    // Cockpit window
    ctx.fillStyle = "#7f1d1d"
    ctx.fillRect(computerPaddle.x + 2, computerPaddle.y + computerHeight / 2 - 8, paddleWidth - 4, 16)

    // Engine glow (left side)
    const computerEngineGlow = ctx.createLinearGradient(computerPaddle.x, computerPaddle.y, computerPaddle.x - 8, computerPaddle.y)
    computerEngineGlow.addColorStop(0, computerSlowed ? "rgba(248, 113, 113, 0.6)" : "rgba(239, 68, 68, 0.8)")
    computerEngineGlow.addColorStop(1, "rgba(239, 68, 68, 0)")
    ctx.fillStyle = computerEngineGlow
    ctx.fillRect(computerPaddle.x - 8, computerPaddle.y + 5, 8, computerHeight - 10)

    // Wing tips
    ctx.fillStyle = computerSlowed ? "#fca5a5" : "#f87171"
    ctx.beginPath()
    ctx.moveTo(computerPaddle.x + paddleWidth, computerPaddle.y)
    ctx.lineTo(computerPaddle.x + paddleWidth + 4, computerPaddle.y + 5)
    ctx.lineTo(computerPaddle.x + paddleWidth, computerPaddle.y + 10)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(computerPaddle.x + paddleWidth, computerPaddle.y + computerHeight)
    ctx.lineTo(computerPaddle.x + paddleWidth + 4, computerPaddle.y + computerHeight - 5)
    ctx.lineTo(computerPaddle.x + paddleWidth, computerPaddle.y + computerHeight - 10)
    ctx.fill()

    if (computerSlowed) {
      ctx.font = "20px sans-serif"
      ctx.fillStyle = "rgba(248, 113, 113, 0.8)"
      ctx.fillText("❄️", computerPaddle.x + paddleWidth + 5, computerPaddle.y + computerHeight / 2 + 7)
    }

    // Draw ball trail (comet effect)
    ballTrail.forEach((point, i) => {
      const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 8)
      gradient.addColorStop(0, `rgba(255, 200, 100, ${point.alpha})`)
      gradient.addColorStop(0.5, `rgba(255, 150, 50, ${point.alpha * 0.5})`)
      gradient.addColorStop(1, `rgba(255, 100, 0, 0)`)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(point.x, point.y, 8, 0, Math.PI * 2)
      ctx.fill()
    })

    // Draw main ball (comet head)
    const ballGradient = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 0, ball.x, ball.y, ball.radius)
    ballGradient.addColorStop(0, "#ffffff")
    ballGradient.addColorStop(0.5, "#ffcc00")
    ballGradient.addColorStop(1, "#ff6600")
    ctx.fillStyle = ballGradient
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2)
    ctx.fill()

    // Draw glow around ball
    ctx.strokeStyle = "rgba(255, 200, 100, 0.3)"
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, ball.radius + 3, 0, Math.PI * 2)
    ctx.stroke()

    // Draw multi-balls
    multiBalls.forEach(b => {
      ctx.fillStyle = "#00ffff"
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2)
      ctx.fill()
    })

    // Draw power-ups
    activePowerUps.forEach(powerUp => {
      // Pulsing glow
      const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7
      ctx.shadowBlur = 20 * pulse
      ctx.shadowColor = "#ffff00"
      ctx.font = "32px sans-serif"
      ctx.fillText(powerUp.icon, powerUp.x - 16, powerUp.y + 10)
      ctx.shadowBlur = 0
    })

    // Draw scores
    ctx.fillStyle = "#e2e8f0"
    ctx.font = "48px monospace"
    ctx.fillText(score.player.toString(), 300, 80)
    ctx.fillText(score.computer.toString(), 480, 80)

    // Draw fireworks
    fireworks.forEach(fw => {
      fw.particles.forEach(p => {
        ctx.fillStyle = p.color.replace(')', `, ${p.life})`)
        ctx.beginPath()
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
        ctx.fill()
      })
    })
    updateFireworks()

    // Draw win screen
    if (gameOver && winner) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
      ctx.fillRect(0, 0, 800, 600)

      ctx.fillStyle = winner === "player" ? "#3b82f6" : "#ef4444"
      ctx.font = "bold 72px sans-serif"
      ctx.textAlign = "center"
      const winText = vsMode === "human"
        ? `${winner === "player" ? "Player 1" : "Player 2"} Wins!`
        : winner === "player" ? "You Win!" : "Computer Wins!"
      ctx.fillText(winText, 400, 280)

      ctx.fillStyle = "#ffffff"
      ctx.font = "32px sans-serif"
      ctx.fillText(`Final Score: ${score.player} - ${score.computer}`, 400, 340)
      ctx.textAlign = "left"
    }

    update()
    animationId = requestAnimationFrame(draw)
  }

  function startGame() {
    gameRunning = true
    gameOver = false
    winner = null
    score = { player: 0, computer: 0 }
    fireworks = []
    multiBalls = []
    activePowerUps = []
    paddleSizes = { player: 80, computer: 80 }
    slowedUntil = { player: 0, computer: 0 }
    powerUpSpawnTime = 0
    hitCounter = 0
    resetBall()
  }

  function pauseGame() {
    gameRunning = false
  }

  function resetGame() {
    gameRunning = false
    gameOver = false
    winner = null
    score = { player: 0, computer: 0 }
    fireworks = []
    multiBalls = []
    activePowerUps = []
    paddleSizes = { player: 80, computer: 80 }
    slowedUntil = { player: 0, computer: 0 }
    powerUpSpawnTime = 0
    hitCounter = 0
    resetBall()
    playerPaddle.y = 260
    computerPaddle.y = 260
  }

  function handleTouchMove(e: TouchEvent) {
    if (!gameRunning) return
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches[0]
    const touchY = touch.clientY - rect.top
    const scaleY = 600 / rect.height
    const scaledY = touchY * scaleY

    playerPaddle.y = Math.max(
      0,
      Math.min(600 - paddleSizes.player, scaledY - paddleSizes.player / 2),
    )
  }

  function handleCanvasClick() {
    if (gameRunning && !gameOver) {
      pauseGame()
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<svelte:head>
  <title>🏓 Cosmic Pong | Dougie's Game Hub</title>
</svelte:head>

<div class="h-[calc(100vh-2rem)] p-4 flex flex-col">
  <!-- Header with title and game controls -->
  <div class="flex justify-between items-center mb-4">
    <h1 class="text-4xl font-bold" style="color: #660460;">🏓 Cosmic Pong</h1>
    <div class="flex gap-2">
      {#if !gameRunning || gameOver}
        <button class="btn text-white border-0 hover:opacity-90" style="background-color: #660460;" onclick={startGame}>
          {gameOver ? "New Game" : "Start Game"}
        </button>
      {:else}
        <button class="btn btn-warning" onclick={pauseGame}>
          Pause
        </button>
      {/if}
      <button class="btn btn-outline" onclick={resetGame}>
        Reset
      </button>
    </div>
  </div>

  <div class="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
    <!-- Game Canvas - scales to fill available space -->
    <div class="flex-1 flex items-center justify-center min-w-0">
      <div class="card bg-white shadow-xl">
        <div class="card-body p-4">
          <canvas
            bind:this={canvas}
            width="800"
            height="600"
            class="rounded-lg touch-none cursor-pointer max-w-full max-h-full"
            style="aspect-ratio: 4/3;"
            ontouchmove={handleTouchMove}
            ontouchstart={handleTouchMove}
            onclick={handleCanvasClick}
          ></canvas>
        </div>
      </div>
    </div>

    <!-- Controls Panel - fixed 1/4 width -->
    <div class="w-full lg:w-1/4 flex flex-col gap-4 lg:min-w-[280px]">
      <div class="card bg-white shadow-xl flex-1 lg:overflow-y-auto lg:max-h-full">
        <div class="card-body">
          <h2 class="card-title" style="color: #660460;">Settings</h2>

          <div class="space-y-4">
          <!-- Versus Mode Toggle -->
          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Game Mode</span>
            </label>
            <div class="flex gap-2">
              <button
                class="btn btn-sm flex-1 {vsMode === 'computer' ? 'btn-primary' : 'btn-outline'}"
                onclick={() => (vsMode = 'computer')}
                disabled={gameRunning}
              >
                vs Computer
              </button>
              <button
                class="btn btn-sm flex-1 {vsMode === 'human' ? 'btn-primary' : 'btn-outline'}"
                onclick={() => (vsMode = 'human')}
                disabled={gameRunning}
              >
                vs Human
              </button>
            </div>
          </div>

          <!-- Difficulty -->
          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Difficulty</span>
            </label>
            <div class="flex gap-2">
              <button
                class="btn btn-xs flex-1 {difficulty === 'easy' ? 'btn-success' : 'btn-outline'}"
                onclick={() => (difficulty = 'easy')}
                disabled={gameRunning}
              >
                Easy
              </button>
              <button
                class="btn btn-xs flex-1 {difficulty === 'medium' ? 'btn-warning' : 'btn-outline'}"
                onclick={() => (difficulty = 'medium')}
                disabled={gameRunning}
              >
                Medium
              </button>
              <button
                class="btn btn-xs flex-1 {difficulty === 'hard' ? 'btn-error' : 'btn-outline'}"
                onclick={() => (difficulty = 'hard')}
                disabled={gameRunning}
              >
                Hard
              </button>
            </div>
          </div>

          <!-- Options Section -->
          <div class="divider my-2"></div>
          <div class="mb-2">
            <span class="label-text font-semibold">Options</span>
          </div>

          <!-- Game Options -->
          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">Speed Increase (5% per hit)</span>
              <input type="checkbox" class="checkbox" bind:checked={speedIncrease} disabled={gameRunning} />
            </label>
          </div>

          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">English Spin</span>
              <input type="checkbox" class="checkbox" bind:checked={englishSpin} disabled={gameRunning} />
            </label>
          </div>

          <div class="form-control">
            <label class="label cursor-pointer">
              <span class="label-text">Power-Ups</span>
              <input type="checkbox" class="checkbox" bind:checked={powerUpsEnabled} disabled={gameRunning} />
            </label>
          </div>

          {#if powerUpsEnabled}
            <div class="form-control ml-6">
              <label class="label">
                <span class="label-text text-sm">Power-Up Mode</span>
              </label>
              <div class="flex flex-col gap-2">
                <label class="label cursor-pointer justify-start gap-2">
                  <input
                    type="radio"
                    name="powerUpMode"
                    class="radio radio-sm"
                    value="bySide"
                    bind:group={powerUpMode}
                    disabled={gameRunning}
                  />
                  <span class="label-text text-sm">By Side (helps loser)</span>
                </label>
                <label class="label cursor-pointer justify-start gap-2">
                  <input
                    type="radio"
                    name="powerUpMode"
                    class="radio radio-sm"
                    value="byHit"
                    bind:group={powerUpMode}
                    disabled={gameRunning}
                  />
                  <span class="label-text text-sm">By Hit (skill-based)</span>
                </label>
              </div>
            </div>

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
                    bind:checked={enabledPowerUps.freeze}
                    disabled={gameRunning}
                  />
                  <div class="flex flex-col">
                    <span class="label-text text-sm font-medium">❄️ Freeze</span>
                    <span class="label-text text-xs opacity-70">Slows opponent's paddle</span>
                  </div>
                </label>
                <label class="label cursor-pointer justify-start gap-2 py-1">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-xs"
                    bind:checked={enabledPowerUps.lightning}
                    disabled={gameRunning}
                  />
                  <div class="flex flex-col">
                    <span class="label-text text-sm font-medium">⚡ Lightning</span>
                    <span class="label-text text-xs opacity-70">Splits ball into two</span>
                  </div>
                </label>
                <label class="label cursor-pointer justify-start gap-2 py-1">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-xs"
                    bind:checked={enabledPowerUps.shrinker}
                    disabled={gameRunning}
                  />
                  <div class="flex flex-col">
                    <span class="label-text text-sm font-medium">🔻 Shrinker</span>
                    <span class="label-text text-xs opacity-70">Shrinks opponent's paddle</span>
                  </div>
                </label>
              </div>
            </div>
          {/if}

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
            {#if vsMode === "computer"}
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>Use <kbd class="kbd kbd-sm">↑</kbd> <kbd class="kbd kbd-sm">↓</kbd> arrow keys</li>
                <li>Press <kbd class="kbd kbd-sm">Space</kbd> or click canvas to pause</li>
                <li>First to 10 points wins!</li>
                <li>Collect power-ups: ❄️ Freeze, ⚡ Split, 🔻 Shrink</li>
              </ul>
            {:else}
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>P1 (Blue): <kbd class="kbd kbd-sm">W</kbd> <kbd class="kbd kbd-sm">S</kbd></li>
                <li>P2 (Red): <kbd class="kbd kbd-sm">↑</kbd> <kbd class="kbd kbd-sm">↓</kbd></li>
                <li>Press <kbd class="kbd kbd-sm">Space</kbd> or click canvas to pause</li>
                <li>First to 10 points wins!</li>
              </ul>
            {/if}
          </div>

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
