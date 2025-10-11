<script lang="ts">
  import { onMount } from "svelte"

  type Cell = {
    isMine: boolean
    isRevealed: boolean
    isFlagged: boolean
    neighborMines: number
  }

  type Difficulty = "easy" | "medium" | "hard"

  const DIFFICULTIES = {
    easy: { rows: 9, cols: 9, mines: 10 },
    medium: { rows: 16, cols: 16, mines: 40 },
    hard: { rows: 16, cols: 30, mines: 99 },
  }

  // Game state
  let difficulty = $state<Difficulty>("easy")
  let grid = $state<Cell[][]>([])
  let gameStatus = $state<"playing" | "won" | "lost">("playing")
  let minesRemaining = $state(0)
  let timer = $state(0)
  let timerInterval: ReturnType<typeof setInterval> | null = null
  let firstClick = $state(true)

  onMount(() => {
    initGame()
    return () => {
      if (timerInterval) clearInterval(timerInterval)
    }
  })

  function initGame() {
    const config = DIFFICULTIES[difficulty]
    grid = Array(config.rows)
      .fill(null)
      .map(() =>
        Array(config.cols)
          .fill(null)
          .map(() => ({
            isMine: false,
            isRevealed: false,
            isFlagged: false,
            neighborMines: 0,
          })),
      )
    gameStatus = "playing"
    minesRemaining = config.mines
    timer = 0
    firstClick = true
    if (timerInterval) clearInterval(timerInterval)
  }

  function placeMines(excludeRow: number, excludeCol: number) {
    const config = DIFFICULTIES[difficulty]
    let minesToPlace = config.mines

    while (minesToPlace > 0) {
      const row = Math.floor(Math.random() * config.rows)
      const col = Math.floor(Math.random() * config.cols)

      // Don't place mine on first click or if already a mine
      if (
        !grid[row][col].isMine &&
        !(row === excludeRow && col === excludeCol)
      ) {
        grid[row][col].isMine = true
        minesToPlace--
      }
    }

    // Calculate neighbor mines for all cells
    for (let row = 0; row < config.rows; row++) {
      for (let col = 0; col < config.cols; col++) {
        if (!grid[row][col].isMine) {
          grid[row][col].neighborMines = countNeighborMines(row, col)
        }
      }
    }
  }

  function countNeighborMines(row: number, col: number): number {
    let count = 0
    const config = DIFFICULTIES[difficulty]

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const newRow = row + dr
        const newCol = col + dc

        if (
          newRow >= 0 &&
          newRow < config.rows &&
          newCol >= 0 &&
          newCol < config.cols &&
          grid[newRow][newCol].isMine
        ) {
          count++
        }
      }
    }

    return count
  }

  function revealCell(row: number, col: number) {
    if (gameStatus !== "playing") return
    if (grid[row][col].isRevealed || grid[row][col].isFlagged) return

    // First click - place mines and start timer
    if (firstClick) {
      placeMines(row, col)
      firstClick = false
      timerInterval = setInterval(() => {
        timer++
      }, 1000)
    }

    grid[row][col].isRevealed = true

    // Hit a mine - game over
    if (grid[row][col].isMine) {
      gameStatus = "lost"
      if (timerInterval) clearInterval(timerInterval)
      revealAllMines()
      return
    }

    // If no neighbor mines, reveal adjacent cells (flood fill)
    if (grid[row][col].neighborMines === 0) {
      floodFill(row, col)
    }

    checkWin()
  }

  function floodFill(row: number, col: number) {
    const config = DIFFICULTIES[difficulty]

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        const newRow = row + dr
        const newCol = col + dc

        if (
          newRow >= 0 &&
          newRow < config.rows &&
          newCol >= 0 &&
          newCol < config.cols &&
          !grid[newRow][newCol].isRevealed &&
          !grid[newRow][newCol].isFlagged &&
          !grid[newRow][newCol].isMine
        ) {
          grid[newRow][newCol].isRevealed = true
          if (grid[newRow][newCol].neighborMines === 0) {
            floodFill(newRow, newCol)
          }
        }
      }
    }
  }

  function toggleFlag(event: MouseEvent, row: number, col: number) {
    event.preventDefault()
    if (gameStatus !== "playing") return
    if (grid[row][col].isRevealed) return
    if (firstClick) return // Can't flag before first click

    grid[row][col].isFlagged = !grid[row][col].isFlagged
    minesRemaining += grid[row][col].isFlagged ? -1 : 1
  }

  function revealAllMines() {
    grid.forEach((row) => {
      row.forEach((cell) => {
        if (cell.isMine) {
          cell.isRevealed = true
        }
      })
    })
  }

  function checkWin() {
    const config = DIFFICULTIES[difficulty]
    let unrevealedCount = 0

    for (let row = 0; row < config.rows; row++) {
      for (let col = 0; col < config.cols; col++) {
        if (!grid[row][col].isRevealed && !grid[row][col].isMine) {
          unrevealedCount++
        }
      }
    }

    if (unrevealedCount === 0) {
      gameStatus = "won"
      if (timerInterval) clearInterval(timerInterval)
    }
  }

  function getCellClass(cell: Cell): string {
    if (cell.isFlagged) return "bg-yellow-500 hover:bg-yellow-600"
    if (!cell.isRevealed) return "bg-base-300 hover:bg-base-content/10"
    if (cell.isMine) return "bg-red-600"
    return "bg-base-100"
  }

  function getCellContent(cell: Cell): string {
    if (cell.isFlagged) return "🚩"
    if (!cell.isRevealed) return ""
    if (cell.isMine) return "💣"
    if (cell.neighborMines === 0) return ""
    return cell.neighborMines.toString()
  }

  function getNumberColor(num: number): string {
    const colors: Record<number, string> = {
      1: "text-blue-600",
      2: "text-green-600",
      3: "text-red-600",
      4: "text-purple-700",
      5: "text-orange-700",
      6: "text-cyan-600",
      7: "text-gray-900",
      8: "text-gray-500",
    }
    return colors[num] || ""
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
</script>

<div class="container mx-auto p-4 sm:p-8">
  <h1 class="text-4xl font-bold mb-6">Minesweeper</h1>

  <div class="flex flex-col lg:flex-row gap-8">
    <!-- Game Board -->
    <div class="flex-shrink-0 overflow-x-auto">
      <div
        class="inline-block border-4 border-base-300 rounded-lg shadow-xl p-2 bg-base-200"
      >
        <div class="grid gap-0.5" style="grid-template-columns: repeat({DIFFICULTIES[difficulty].cols}, minmax(0, 1fr));">
          {#each grid as row, rowIndex}
            {#each row as cell, colIndex}
              <button
                class="w-6 h-6 sm:w-8 sm:h-8 border border-base-content/20 rounded font-bold text-xs sm:text-sm flex items-center justify-center transition-colors {getCellClass(cell)} {cell.isRevealed && cell.neighborMines > 0 ? getNumberColor(cell.neighborMines) : ''}"
                onclick={() => revealCell(rowIndex, colIndex)}
                oncontextmenu={(e) => toggleFlag(e, rowIndex, colIndex)}
                disabled={gameStatus !== "playing"}
              >
                {getCellContent(cell)}
              </button>
            {/each}
          {/each}
        </div>
      </div>
    </div>

    <!-- Controls Panel -->
    <div class="card bg-base-200 shadow-xl flex-1">
      <div class="card-body">
        <h2 class="card-title">Controls</h2>

        <div class="space-y-4">
          <!-- Stats -->
          <div class="stats shadow w-full">
            <div class="stat py-3">
              <div class="stat-title text-xs">Mines</div>
              <div class="stat-value text-2xl">{minesRemaining}</div>
            </div>
            <div class="stat py-3">
              <div class="stat-title text-xs">Time</div>
              <div class="stat-value text-2xl">{formatTime(timer)}</div>
            </div>
          </div>

          <!-- Game Status -->
          {#if gameStatus === "won"}
            <div class="alert alert-success">
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
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>You Won! Time: {formatTime(timer)}</span>
            </div>
          {:else if gameStatus === "lost"}
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
              <span>Game Over! You hit a mine.</span>
            </div>
          {/if}

          <!-- Difficulty Selection -->
          <div class="form-control">
            <label class="label">
              <span class="label-text font-semibold">Difficulty</span>
            </label>
            <select
              class="select select-bordered"
              bind:value={difficulty}
              onchange={initGame}
            >
              <option value="easy">Easy (9×9, 10 mines)</option>
              <option value="medium">Medium (16×16, 40 mines)</option>
              <option value="hard">Hard (16×30, 99 mines)</option>
            </select>
          </div>

          <!-- New Game Button -->
          <button class="btn btn-primary w-full" onclick={initGame}>
            New Game
          </button>

          <!-- Instructions -->
          <div class="divider"></div>
          <div>
            <h3 class="font-semibold mb-2">How to Play:</h3>
            <ul class="list-disc list-inside space-y-1 text-sm">
              <li>Left click to reveal a cell</li>
              <li>Right click to place/remove a flag</li>
              <li>Numbers show how many mines are adjacent</li>
              <li>Flag all mines without revealing them</li>
              <li>First click is always safe</li>
              <li>Empty cells auto-reveal neighbors</li>
            </ul>
          </div>

          <!-- Legend -->
          <div class="divider"></div>
          <div>
            <h3 class="font-semibold mb-2">Legend:</h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="flex items-center gap-2">
                <span class="text-lg">🚩</span>
                <span>Flagged</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-lg">💣</span>
                <span>Mine</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 bg-base-300 rounded border"></div>
                <span>Hidden</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 bg-base-100 rounded border flex items-center justify-center text-xs font-bold text-blue-600">
                  1
                </div>
                <span>Number</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
