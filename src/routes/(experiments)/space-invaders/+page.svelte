<script lang="ts">
  import { onMount } from "svelte"

  let canvas = $state<HTMLCanvasElement>()
  let ctx: CanvasRenderingContext2D
  let animationId: number

  // Game state
  let gameRunning = $state(false)
  let gameOver = $state(false)
  let score = $state(0)
  let lives = $state(3)

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
  })

  // Bullets
  let bullets = $state<
    Array<{ x: number; y: number; width: number; height: number }>
  >([])
  const BULLET_SPEED = 8

  // Aliens
  let aliens = $state<
    Array<{
      x: number
      y: number
      width: number
      height: number
      alive: boolean
    }>
  >([])
  let alienDirection = $state(1)
  let alienSpeed = $state(1)

  // Alien bullets
  let alienBullets = $state<
    Array<{ x: number; y: number; width: number; height: number }>
  >([])
  const ALIEN_BULLET_SPEED = 4

  // Controls
  let keys = {
    left: false,
    right: false,
    space: false,
  }

  let lastShot = 0
  const SHOOT_COOLDOWN = 300

  onMount(() => {
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    ctx = context

    draw()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  })

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

  function initGame() {
    score = 0
    lives = 3
    gameOver = false
    gameRunning = true
    player.x = 375
    bullets = []
    alienBullets = []
    alienSpeed = 1
    alienDirection = 1

    // Create aliens in rows
    aliens = []
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 10; col++) {
        aliens.push({
          x: 100 + col * 60,
          y: 50 + row * 50,
          width: 40,
          height: 30,
          alive: true,
        })
      }
    }
  }

  function shoot() {
    const now = Date.now()
    if (now - lastShot > SHOOT_COOLDOWN) {
      bullets.push({
        x: player.x + player.width / 2 - 2,
        y: player.y,
        width: 4,
        height: 10,
      })
      lastShot = now
    }
  }

  function alienShoot() {
    const aliveAliens = aliens.filter((a) => a.alive)
    if (aliveAliens.length > 0 && Math.random() < 0.02) {
      const alien = aliveAliens[Math.floor(Math.random() * aliveAliens.length)]
      alienBullets.push({
        x: alien.x + alien.width / 2 - 2,
        y: alien.y + alien.height,
        width: 4,
        height: 10,
      })
    }
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
    if (!gameRunning || gameOver) return

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
      b.y -= BULLET_SPEED
      return b.y > 0
    })

    // Move alien bullets
    alienBullets = alienBullets.filter((b) => {
      b.y += ALIEN_BULLET_SPEED
      return b.y < CANVAS_HEIGHT
    })

    // Check bullet-alien collisions
    bullets = bullets.filter((bullet) => {
      for (let alien of aliens) {
        if (alien.alive && checkCollision(bullet, alien)) {
          alien.alive = false
          score += 10
          return false
        }
      }
      return true
    })

    // Check alien bullet-player collisions
    alienBullets = alienBullets.filter((bullet) => {
      if (checkCollision(bullet, player)) {
        lives--
        if (lives <= 0) {
          gameOver = true
          gameRunning = false
        }
        return false
      }
      return true
    })

    // Move aliens
    const aliveAliens = aliens.filter((a) => a.alive)
    if (aliveAliens.length === 0) {
      // Level complete - make new aliens faster
      alienSpeed += 0.5
      initGame()
      score += 100 // Bonus for completing level
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
      for (let alien of aliens) {
        alien.y += 20
        // Check if aliens reached bottom
        if (alien.alive && alien.y + alien.height >= player.y) {
          gameOver = true
          gameRunning = false
        }
      }
    }

    for (let alien of aliens) {
      if (alien.alive) {
        alien.x += alienDirection * alienSpeed
      }
    }

    // Alien shooting
    alienShoot()

    // Increase difficulty over time
    if (score > 0 && score % 200 === 0) {
      alienSpeed += 0.1
    }
  }

  function draw() {
    if (!canvas || !ctx) {
      animationId = requestAnimationFrame(draw)
      return
    }

    // Clear canvas
    ctx.fillStyle = "#000000"
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    if (!gameRunning && !gameOver) {
      // Start screen
      ctx.fillStyle = "#00ff00"
      ctx.font = "48px monospace"
      ctx.textAlign = "center"
      ctx.fillText("SPACE INVADERS", CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 50)
      ctx.font = "24px monospace"
      ctx.fillText(
        "Click START to begin",
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2 + 20,
      )
      animationId = requestAnimationFrame(draw)
      return
    }

    // Draw player
    ctx.fillStyle = "#00ff00"
    ctx.fillRect(player.x, player.y, player.width, player.height)

    // Draw player triangle shape
    ctx.beginPath()
    ctx.moveTo(player.x + player.width / 2, player.y)
    ctx.lineTo(player.x, player.y + player.height)
    ctx.lineTo(player.x + player.width, player.y + player.height)
    ctx.closePath()
    ctx.fill()

    // Draw bullets
    ctx.fillStyle = "#ffffff"
    for (let bullet of bullets) {
      ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height)
    }

    // Draw alien bullets
    ctx.fillStyle = "#ff0000"
    for (let bullet of alienBullets) {
      ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height)
    }

    // Draw aliens
    for (let alien of aliens) {
      if (alien.alive) {
        ctx.fillStyle = "#ff00ff"
        ctx.fillRect(alien.x, alien.y, alien.width, alien.height)

        // Draw alien shape
        ctx.fillStyle = "#ff00ff"
        ctx.fillRect(alien.x + 5, alien.y, 10, 10)
        ctx.fillRect(alien.x + 25, alien.y, 10, 10)
        ctx.fillRect(alien.x, alien.y + 10, alien.width, 15)
        ctx.fillRect(alien.x + 5, alien.y + 25, 10, 5)
        ctx.fillRect(alien.x + 25, alien.y + 25, 10, 5)
      }
    }

    // Draw score and lives
    ctx.fillStyle = "#ffffff"
    ctx.font = "20px monospace"
    ctx.textAlign = "left"
    ctx.fillText(`Score: ${score}`, 20, 30)
    ctx.fillText(`Lives: ${lives}`, CANVAS_WIDTH - 120, 30)

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
    }

    update()
    animationId = requestAnimationFrame(draw)
  }

  function resetGame() {
    gameRunning = false
    gameOver = false
    score = 0
    lives = 3
    bullets = []
    alienBullets = []
    player.x = 375
  }
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<div class="container mx-auto p-8">
  <h1 class="text-4xl font-bold mb-6">👾 Space Invaders</h1>

  <div class="flex flex-col lg:flex-row gap-8">
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
    <div class="card bg-base-200 shadow-xl flex-1">
      <div class="card-body">
        <h2 class="card-title">Controls</h2>

        <div class="space-y-4">
          <!-- Game Controls -->
          <div class="flex gap-2">
            {#if !gameRunning}
              <button class="btn btn-primary" onclick={initGame}>
                Start Game
              </button>
            {:else if !gameOver}
              <button
                class="btn btn-warning"
                onclick={() => (gameRunning = false)}
              >
                Pause
              </button>
            {/if}
            {#if gameOver}
              <button class="btn btn-primary" onclick={initGame}>
                Play Again
              </button>
            {/if}
            <button class="btn btn-secondary" onclick={resetGame}>
              Reset
            </button>
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
              <li>Destroy all aliens to advance to the next level</li>
              <li>Don't let aliens reach the bottom!</li>
              <li>Avoid alien bullets</li>
              <li>You have 3 lives</li>
            </ul>
          </div>

          <!-- Score Display -->
          <div class="divider"></div>
          <div class="stats stats-vertical shadow">
            <div class="stat">
              <div class="stat-title">Score</div>
              <div class="stat-value text-primary">{score}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Lives</div>
              <div class="stat-value text-error">{lives}</div>
            </div>
          </div>

          {#if !gameRunning && !gameOver}
            <div class="alert alert-info">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                class="stroke-current shrink-0 w-6 h-6"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path></svg
              >
              <span>Click "Start Game" to begin!</span>
            </div>
          {/if}
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
