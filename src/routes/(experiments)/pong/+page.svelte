<script lang="ts">
  import { onMount } from "svelte"

  let canvas: HTMLCanvasElement
  let ctx: CanvasRenderingContext2D
  let animationId: number

  // Game state
  let gameRunning = $state(false)
  let score = $state({ player: 0, computer: 0 })

  // Ball properties
  let ball = $state({
    x: 400,
    y: 300,
    radius: 8,
    speedX: 5,
    speedY: 5,
  })

  // Paddle properties
  const paddleWidth = 10
  const paddleHeight = 80

  let playerPaddle = $state({
    x: 20,
    y: 260,
    speed: 0,
  })

  let computerPaddle = $state({
    x: 770,
    y: 260,
  })

  // Controls
  let keys = {
    up: false,
    down: false,
  }

  onMount(() => {
    ctx = canvas.getContext("2d")!
    resetBall()
    draw()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
    }
  })

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowUp") keys.up = true
    if (e.key === "ArrowDown") keys.down = true
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.key === "ArrowUp") keys.up = false
    if (e.key === "ArrowDown") keys.down = false
  }

  function resetBall() {
    ball.x = 400
    ball.y = 300
    ball.speedX = (Math.random() > 0.5 ? 1 : -1) * 5
    ball.speedY = (Math.random() - 0.5) * 8
  }

  function update() {
    if (!gameRunning) return

    // Move player paddle
    if (keys.up && playerPaddle.y > 0) {
      playerPaddle.y -= 6
    }
    if (keys.down && playerPaddle.y < 600 - paddleHeight) {
      playerPaddle.y += 6
    }

    // Move ball
    ball.x += ball.speedX
    ball.y += ball.speedY

    // Ball collision with top/bottom
    if (ball.y - ball.radius < 0 || ball.y + ball.radius > 600) {
      ball.speedY = -ball.speedY
    }

    // Ball collision with player paddle
    if (
      ball.x - ball.radius < playerPaddle.x + paddleWidth &&
      ball.y > playerPaddle.y &&
      ball.y < playerPaddle.y + paddleHeight
    ) {
      ball.speedX = Math.abs(ball.speedX)
      ball.speedY += (ball.y - (playerPaddle.y + paddleHeight / 2)) * 0.1
    }

    // Ball collision with computer paddle
    if (
      ball.x + ball.radius > computerPaddle.x &&
      ball.y > computerPaddle.y &&
      ball.y < computerPaddle.y + paddleHeight
    ) {
      ball.speedX = -Math.abs(ball.speedX)
      ball.speedY += (ball.y - (computerPaddle.y + paddleHeight / 2)) * 0.1
    }

    // Computer AI
    const computerCenter = computerPaddle.y + paddleHeight / 2
    if (computerCenter < ball.y - 35) {
      computerPaddle.y += 4
    } else if (computerCenter > ball.y + 35) {
      computerPaddle.y -= 4
    }

    // Keep computer paddle in bounds
    if (computerPaddle.y < 0) computerPaddle.y = 0
    if (computerPaddle.y > 600 - paddleHeight)
      computerPaddle.y = 600 - paddleHeight

    // Score points
    if (ball.x < 0) {
      score.computer++
      resetBall()
    }
    if (ball.x > 800) {
      score.player++
      resetBall()
    }
  }

  function draw() {
    // Clear canvas
    ctx.fillStyle = "#1f2937"
    ctx.fillRect(0, 0, 800, 600)

    // Draw center line
    ctx.setLineDash([10, 10])
    ctx.strokeStyle = "#4b5563"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(400, 0)
    ctx.lineTo(400, 600)
    ctx.stroke()
    ctx.setLineDash([])

    // Draw paddles
    ctx.fillStyle = "#3b82f6"
    ctx.fillRect(playerPaddle.x, playerPaddle.y, paddleWidth, paddleHeight)

    ctx.fillStyle = "#ef4444"
    ctx.fillRect(computerPaddle.x, computerPaddle.y, paddleWidth, paddleHeight)

    // Draw ball
    ctx.fillStyle = "#ffffff"
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2)
    ctx.fill()

    // Draw scores
    ctx.fillStyle = "#9ca3af"
    ctx.font = "48px monospace"
    ctx.fillText(score.player.toString(), 300, 80)
    ctx.fillText(score.computer.toString(), 480, 80)

    update()
    animationId = requestAnimationFrame(draw)
  }

  function startGame() {
    gameRunning = true
    score = { player: 0, computer: 0 }
    resetBall()
  }

  function pauseGame() {
    gameRunning = false
  }

  function resetGame() {
    gameRunning = false
    score = { player: 0, computer: 0 }
    resetBall()
    playerPaddle.y = 260
    computerPaddle.y = 260
  }

  // Touch/Mobile controls
  function handleTouchMove(e: TouchEvent) {
    if (!gameRunning) return
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches[0]
    const touchY = touch.clientY - rect.top
    const scaleY = 600 / rect.height
    const scaledY = touchY * scaleY

    // Move paddle to touch position (centered on touch)
    playerPaddle.y = Math.max(
      0,
      Math.min(600 - paddleHeight, scaledY - paddleHeight / 2)
    )
  }
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<div class="container mx-auto p-8">
  <h1 class="text-4xl font-bold mb-6">Pong</h1>

  <div class="flex flex-col lg:flex-row gap-8">
    <!-- Game Canvas -->
    <div class="flex-shrink-0">
      <canvas
        bind:this={canvas}
        width="800"
        height="600"
        class="border-4 border-base-300 rounded-lg shadow-xl touch-none"
        ontouchmove={handleTouchMove}
        ontouchstart={handleTouchMove}
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
              <button class="btn btn-primary" onclick={startGame}>
                Start Game
              </button>
            {:else}
              <button class="btn btn-warning" onclick={pauseGame}>
                Pause
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
                Desktop: Use <kbd class="kbd kbd-sm">↑</kbd> and
                <kbd class="kbd kbd-sm">↓</kbd> arrow keys
              </li>
              <li>Mobile: Touch and drag on the canvas to move your paddle</li>
              <li>Blue paddle (left) is you</li>
              <li>Red paddle (right) is the computer</li>
              <li>First to miss the ball gives the opponent a point</li>
              <li>Try to beat the AI!</li>
            </ul>
          </div>

          <!-- Score Display -->
          <div class="divider"></div>
          <div class="stats shadow">
            <div class="stat">
              <div class="stat-title">Your Score</div>
              <div class="stat-value text-blue-500">{score.player}</div>
            </div>
            <div class="stat">
              <div class="stat-title">Computer Score</div>
              <div class="stat-value text-red-500">{score.computer}</div>
            </div>
          </div>

          {#if !gameRunning}
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
    background: #1f2937;
  }
</style>
