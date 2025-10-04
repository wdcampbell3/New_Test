<script lang="ts">
  import { onMount } from "svelte"

  const GRID_SIZE = 20
  const CELL_SIZE = 20
  const INITIAL_SPEED = 150

  type Position = { x: number; y: number }
  type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT"

  let gameStarted = $state(false)
  let gameOver = $state(false)
  let score = $state(0)
  let highScore = $state(0)
  let speed = $state(INITIAL_SPEED)

  let worm = $state<Position[]>([{ x: 10, y: 10 }])
  let direction = $state<Direction>("RIGHT")
  let nextDirection = $state<Direction>("RIGHT")
  let food = $state<Position>({ x: 15, y: 10 })

  let gameInterval: number

  function generateFood() {
    let newFood: Position
    do {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      }
    } while (
      worm.some((segment) => segment.x === newFood.x && segment.y === newFood.y)
    )
    food = newFood
  }

  function moveWorm() {
    direction = nextDirection

    const head = worm[0]
    let newHead: Position

    switch (direction) {
      case "UP":
        newHead = { x: head.x, y: head.y - 1 }
        break
      case "DOWN":
        newHead = { x: head.x, y: head.y + 1 }
        break
      case "LEFT":
        newHead = { x: head.x - 1, y: head.y }
        break
      case "RIGHT":
        newHead = { x: head.x + 1, y: head.y }
        break
    }

    // Check wall collision
    if (
      newHead.x < 0 ||
      newHead.x >= GRID_SIZE ||
      newHead.y < 0 ||
      newHead.y >= GRID_SIZE
    ) {
      endGame()
      return
    }

    // Check self collision
    if (
      worm.some((segment) => segment.x === newHead.x && segment.y === newHead.y)
    ) {
      endGame()
      return
    }

    worm = [newHead, ...worm]

    // Check food collision
    if (newHead.x === food.x && newHead.y === food.y) {
      score += 10
      generateFood()
      // Increase speed slightly
      if (speed > 50) {
        speed -= 5
        clearInterval(gameInterval)
        gameInterval = setInterval(moveWorm, speed)
      }
    } else {
      worm.pop()
    }
  }

  function startGame() {
    gameStarted = true
    gameOver = false
    score = 0
    speed = INITIAL_SPEED
    worm = [{ x: 10, y: 10 }]
    direction = "RIGHT"
    nextDirection = "RIGHT"
    generateFood()
    gameInterval = setInterval(moveWorm, speed)
  }

  function endGame() {
    gameOver = true
    gameStarted = false
    clearInterval(gameInterval)
    if (score > highScore) {
      highScore = score
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("wormHighScore", highScore.toString())
      }
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!gameStarted) return

    switch (event.key) {
      case "ArrowUp":
      case "w":
      case "W":
        if (direction !== "DOWN") nextDirection = "UP"
        event.preventDefault()
        break
      case "ArrowDown":
      case "s":
      case "S":
        if (direction !== "UP") nextDirection = "DOWN"
        event.preventDefault()
        break
      case "ArrowLeft":
      case "a":
      case "A":
        if (direction !== "RIGHT") nextDirection = "LEFT"
        event.preventDefault()
        break
      case "ArrowRight":
      case "d":
      case "D":
        if (direction !== "LEFT") nextDirection = "RIGHT"
        event.preventDefault()
        break
    }
  }

  onMount(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("wormHighScore")
      if (saved) highScore = parseInt(saved)
    }

    return () => {
      clearInterval(gameInterval)
    }
  })
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>Worm Game</title>
</svelte:head>

<div class="min-h-screen bg-gray-200 py-8">
  <div class="container mx-auto max-w-4xl px-6">
    <h1 class="mb-8 text-center text-4xl font-bold">Worm Game</h1>

    <div class="flex flex-col items-center gap-6">
      <!-- Score Display -->
      <div class="flex gap-8 text-center">
        <div>
          <div class="text-sm text-base-content/70">Score</div>
          <div class="text-3xl font-bold text-primary">{score}</div>
        </div>
        <div>
          <div class="text-sm text-base-content/70">High Score</div>
          <div class="text-3xl font-bold text-secondary">{highScore}</div>
        </div>
      </div>

      <!-- Game Board -->
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body p-4">
          <div
            class="game-board"
            style="
						width: {GRID_SIZE * CELL_SIZE}px;
						height: {GRID_SIZE * CELL_SIZE}px;
						display: grid;
						grid-template-columns: repeat({GRID_SIZE}, {CELL_SIZE}px);
						grid-template-rows: repeat({GRID_SIZE}, {CELL_SIZE}px);
						background: #e5e7eb;
						border: 2px solid #9ca3af;
					"
          >
            {#each Array(GRID_SIZE * GRID_SIZE) as _cell, i}
              {@const x = i % GRID_SIZE}
              {@const y = Math.floor(i / GRID_SIZE)}
              {@const isWorm = worm.some(
                (segment) => segment.x === x && segment.y === y,
              )}
              {@const isHead = worm[0]?.x === x && worm[0]?.y === y}
              {@const isFood = food.x === x && food.y === y}
              <div
                class="cell"
                style="
								background: {isHead
                  ? '#9333ea'
                  : isWorm
                    ? '#a855f7'
                    : isFood
                      ? '#22c55e'
                      : '#f3f4f6'};
								border-radius: {isFood ? '50%' : '2px'};
							"
              ></div>
            {/each}
          </div>

          <!-- Game Over Overlay -->
          {#if gameOver}
            <div
              class="absolute inset-0 flex items-center justify-center bg-base-100/90"
            >
              <div class="text-center">
                <h2 class="text-3xl font-bold text-error mb-4">Game Over!</h2>
                <p class="text-xl mb-6">Final Score: {score}</p>
                <button onclick={startGame} class="btn btn-primary"
                  >Play Again</button
                >
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- Controls -->
      <div class="text-center">
        {#if !gameStarted && !gameOver}
          <button onclick={startGame} class="btn btn-primary btn-lg"
            >Start Game</button
          >
        {/if}

        <div class="mt-4 text-sm text-base-content/70">
          <p class="font-semibold mb-2">Controls:</p>
          <p>Arrow Keys or WASD to move</p>
          <p class="mt-2">Eat the green food to grow and score points!</p>
        </div>
      </div>

      <!-- Mobile Controls -->
      {#if gameStarted}
        <div class="grid grid-cols-3 gap-2 mt-4 md:hidden">
          <div></div>
          <button
            onclick={() => {
              if (direction !== "DOWN") nextDirection = "UP"
            }}
            class="btn btn-outline"
          >
            ↑
          </button>
          <div></div>
          <button
            onclick={() => {
              if (direction !== "RIGHT") nextDirection = "LEFT"
            }}
            class="btn btn-outline"
          >
            ←
          </button>
          <div></div>
          <button
            onclick={() => {
              if (direction !== "LEFT") nextDirection = "RIGHT"
            }}
            class="btn btn-outline"
          >
            →
          </button>
          <div></div>
          <button
            onclick={() => {
              if (direction !== "UP") nextDirection = "DOWN"
            }}
            class="btn btn-outline"
          >
            ↓
          </button>
          <div></div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .game-board {
    position: relative;
  }
  .cell {
    transition: background-color 0.1s ease;
  }
</style>
