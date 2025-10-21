<script lang="ts">
  import { onMount } from "svelte"

  type PowerUpType = "xray" | "detector" | "laser"
  type TrapType = "subterfuge" | "sabotage"

  type Cell = {
    isMine: boolean
    isRevealed: boolean
    isFlagged: boolean
    neighborMines: number
    powerUp: PowerUpType | null
    trap: TrapType | null
    isSabotaged: boolean
  }

  type Difficulty = "easy" | "medium" | "hard"

  const DIFFICULTIES = {
    easy: { rows: 15, cols: 15, mines: 30 },
    medium: { rows: 20, cols: 20, mines: 70 },
    hard: { rows: 25, cols: 25, mines: 120 },
  }

  const BOARD_SIZE = 700 // Fixed board size in pixels

  // Game state
  let difficulty = $state<Difficulty>("easy")
  let grid = $state<Cell[][]>([])
  let gameStatus = $state<"playing" | "won" | "lost">("playing")
  let minesRemaining = $state(0)
  let timer = $state(0)
  let timerInterval: ReturnType<typeof setInterval> | null = null
  let firstClick = $state(true)

  // Power-up state
  let xrayActive = $state(false)
  let xrayTimeLeft = $state(0)
  let xrayActivatedCell: { row: number; col: number } | null = $state(null)
  let laserActive = $state(false)
  let laserTimeLeft = $state(0)
  let laserActivatedCell: { row: number; col: number } | null = $state(null)
  let laserChargedCell: { row: number; col: number } | null = $state(null)
  let laserChargedTimeLeft = $state(0)
  let activeXrayCell: { row: number; col: number } | null = $state(null)

  // Power-up/trap settings
  let powerUpsEnabled = $state({
    xray: true,
    detector: true,
    laser: true,
  })

  let trapsEnabled = $state({
    subterfuge: true,
    sabotage: true,
  })

  // Track spawned power-ups/traps by cell position
  let spawnedPowerUps = $state<Set<string>>(new Set())
  let spawnedTraps = $state<Set<string>>(new Set())

  // Track blinking power-ups/traps (for animation when revealed)
  let blinkingCells = $state<Set<string>>(new Set())

  // Click handling for double-tap
  let lastClickTime = 0
  let lastClickCell: { row: number; col: number } | null = null
  let singleClickTimer: ReturnType<typeof setTimeout> | null = null

  onMount(() => {
    initGame()
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      if (timerInterval) clearInterval(timerInterval)
      window.removeEventListener("keydown", handleKeyDown)
    }
  })

  function getCellSize(): number {
    const config = DIFFICULTIES[difficulty]
    return Math.floor(BOARD_SIZE / config.rows) - 1
  }

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
            powerUp: null,
            trap: null,
            isSabotaged: false,
          })),
      )
    gameStatus = "playing"
    minesRemaining = config.mines
    timer = 0
    firstClick = true
    spawnedPowerUps = new Set()
    spawnedTraps = new Set()
    xrayActive = false
    laserActive = false
    laserChargedCell = null
    activeXrayCell = null
    lastClickTime = 0
    lastClickCell = null
    if (timerInterval) clearInterval(timerInterval)
    if (singleClickTimer) clearTimeout(singleClickTimer)
  }

  function placeMines(excludeRow: number, excludeCol: number) {
    const config = DIFFICULTIES[difficulty]
    let minesToPlace = config.mines

    while (minesToPlace > 0) {
      const row = Math.floor(Math.random() * config.rows)
      const col = Math.floor(Math.random() * config.cols)

      if (
        !grid[row][col].isMine &&
        !(row === excludeRow && col === excludeCol)
      ) {
        grid[row][col].isMine = true
        minesToPlace--
      }
    }

    calculateNeighborMines()
    placePowerUpsAndTraps()
  }

  function calculateNeighborMines() {
    const config = DIFFICULTIES[difficulty]
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

  function placePowerUpsAndTraps() {
    const config = DIFFICULTIES[difficulty]
    const zeroCells: { row: number; col: number }[] = []

    // Find all cells with 0 neighbor mines
    for (let row = 0; row < config.rows; row++) {
      for (let col = 0; col < config.cols; col++) {
        if (!grid[row][col].isMine && grid[row][col].neighborMines === 0) {
          zeroCells.push({ row, col })
        }
      }
    }

    // Shuffle zero cells
    for (let i = zeroCells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[zeroCells[i], zeroCells[j]] = [zeroCells[j], zeroCells[i]]
    }

    // Determine quantity based on difficulty: Easy=2, Medium=3, Hard=4
    const quantity = difficulty === "easy" ? 2 : difficulty === "medium" ? 3 : 4

    let index = 0

    // Place power-ups (quantity of each enabled)
    if (powerUpsEnabled.xray) {
      for (let i = 0; i < quantity && index < zeroCells.length; i++) {
        const { row, col } = zeroCells[index++]
        grid[row][col].powerUp = "xray"
      }
    }
    if (powerUpsEnabled.detector) {
      for (let i = 0; i < quantity && index < zeroCells.length; i++) {
        const { row, col } = zeroCells[index++]
        grid[row][col].powerUp = "detector"
      }
    }
    if (powerUpsEnabled.laser) {
      for (let i = 0; i < quantity && index < zeroCells.length; i++) {
        const { row, col } = zeroCells[index++]
        grid[row][col].powerUp = "laser"
      }
    }

    // Place traps (quantity of each enabled)
    if (trapsEnabled.subterfuge) {
      for (let i = 0; i < quantity && index < zeroCells.length; i++) {
        const { row, col } = zeroCells[index++]
        grid[row][col].trap = "subterfuge"
      }
    }
    if (trapsEnabled.sabotage) {
      for (let i = 0; i < quantity && index < zeroCells.length; i++) {
        const { row, col } = zeroCells[index++]
        grid[row][col].trap = "sabotage"
      }
    }
  }

  function handleCellClick(row: number, col: number) {
    if (gameStatus !== "playing") return

    const cell = grid[row][col]
    const now = Date.now()
    const isDoubleClick =
      lastClickCell?.row === row &&
      lastClickCell?.col === col &&
      now - lastClickTime < 300

    // Check if laser is active and user is clicking an unrevealed cell to charge it
    if (laserActive && !cell.isRevealed && !cell.isFlagged) {
      // Clear any pending single-click timer
      if (singleClickTimer) {
        clearTimeout(singleClickTimer)
        singleClickTimer = null
      }

      // Charge this cell with laser
      laserChargedCell = { row, col }
      laserChargedTimeLeft = 2
      laserActive = false
      laserTimeLeft = 0

      const chargedInterval = setInterval(() => {
        laserChargedTimeLeft -= 0.1
        if (laserChargedTimeLeft <= 0) {
          laserChargedCell = null
          laserChargedTimeLeft = 0
          clearInterval(chargedInterval)
        }
      }, 100)

      lastClickTime = 0
      lastClickCell = null
      return
    }

    // Check if this is a revealed power-up or trap that can be activated
    const cellKey = `${row},${col}`
    if (cell.isRevealed && ((cell.powerUp && !spawnedPowerUps.has(cellKey)) || (cell.trap && !spawnedTraps.has(cellKey)))) {
      // Clear any pending single-click timer
      if (singleClickTimer) {
        clearTimeout(singleClickTimer)
        singleClickTimer = null
      }

      if (cell.powerUp && !spawnedPowerUps.has(cellKey)) {
        const powerUpType = cell.powerUp
        activatePowerUp(powerUpType, row, col)
        spawnedPowerUps.add(cellKey)

        // Start blinking animation
        blinkingCells.add(cellKey)

        // For timed power-ups (xray, laser), remove icon after timer completes
        // For instant power-ups (detector), remove after blinking
        if (powerUpType === "detector") {
          setTimeout(() => {
            blinkingCells.delete(cellKey)
            cell.powerUp = null
          }, 1500)
        }
        // X-ray and Laser icons removed by their timer intervals

      } else if (cell.trap && !spawnedTraps.has(cellKey)) {
        activateTrap(cell.trap, row, col)
        spawnedTraps.add(cellKey)

        // Start blinking animation for traps
        blinkingCells.add(cellKey)

        // Remove trap after blinking
        setTimeout(() => {
          blinkingCells.delete(cellKey)
          cell.trap = null
        }, 1500)
      }
      lastClickTime = 0
      lastClickCell = null
      return
    }

    if (isDoubleClick) {
      // Clear any pending single-click timer
      if (singleClickTimer) {
        clearTimeout(singleClickTimer)
        singleClickTimer = null
      }

      // Double click - reveal
      revealCell(row, col)
      lastClickTime = 0
      lastClickCell = null
    } else {
      // Single click - delay flag toggle to allow double-click detection
      lastClickTime = now
      lastClickCell = { row, col }

      // Clear any existing timer
      if (singleClickTimer) {
        clearTimeout(singleClickTimer)
      }

      // Set a timer to toggle flag after double-click window
      if (!cell.isRevealed) {
        singleClickTimer = setTimeout(() => {
          toggleFlag(row, col)
          singleClickTimer = null
        }, 300)
      }
    }
  }

  function toggleFlag(row: number, col: number) {
    if (gameStatus !== "playing") return
    if (grid[row][col].isRevealed) return
    if (grid[row][col].isSabotaged) return

    grid[row][col].isFlagged = !grid[row][col].isFlagged
    minesRemaining += grid[row][col].isFlagged ? -1 : 1
  }

  function revealCell(row: number, col: number) {
    if (gameStatus !== "playing") return
    if (grid[row][col].isRevealed || grid[row][col].isFlagged) return
    if (grid[row][col].isSabotaged) return

    // First click - place mines and start timer
    if (firstClick) {
      placeMines(row, col)
      firstClick = false
      timerInterval = setInterval(() => {
        timer++
      }, 1000)
    }

    // Check for power-up or trap - activate on direct double-click reveal
    const cell = grid[row][col]
    const cellKey = `${row},${col}`

    if (cell.powerUp && !spawnedPowerUps.has(cellKey)) {
      const powerUpType = cell.powerUp
      activatePowerUp(powerUpType, row, col)
      spawnedPowerUps.add(cellKey)

      // Start blinking animation
      blinkingCells.add(cellKey)

      // For timed power-ups (xray, laser), remove icon after timer completes
      // For instant power-ups (detector), remove after blinking
      if (powerUpType === "detector") {
        setTimeout(() => {
          blinkingCells.delete(cellKey)
          cell.powerUp = null
        }, 1500)
      }
      // X-ray and Laser icons removed by their timer intervals

      return
    }

    if (cell.trap && !spawnedTraps.has(cellKey)) {
      activateTrap(cell.trap, row, col)
      spawnedTraps.add(cellKey)

      // Start blinking animation for traps
      blinkingCells.add(cellKey)

      // Remove trap after blinking
      setTimeout(() => {
        blinkingCells.delete(cellKey)
        cell.trap = null
      }, 1500)

      // Don't return - continue revealing
    }

    grid[row][col].isRevealed = true

    // Hit a mine - game over
    if (grid[row][col].isMine) {
      gameStatus = "lost"
      if (timerInterval) clearInterval(timerInterval)
      revealAllMines()
      return
    }

    // If no neighbor mines, reveal adjacent cells
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
          !grid[newRow][newCol].isMine &&
          !grid[newRow][newCol].isSabotaged
        ) {
          // Reveal power-ups/traps without activating, but add blinking
          const cell = grid[newRow][newCol]
          const cellKey = `${newRow},${newCol}`

          if ((cell.powerUp || cell.trap) && !spawnedPowerUps.has(cellKey) && !spawnedTraps.has(cellKey)) {
            // Start blinking animation
            blinkingCells.add(cellKey)

            // Stop blinking after animation completes, but keep the power-up/trap
            setTimeout(() => {
              blinkingCells.delete(cellKey)
            }, 1500) // 1.5 seconds for blinking (3 blinks at 0.5s each)
          }

          grid[newRow][newCol].isRevealed = true
          if (grid[newRow][newCol].neighborMines === 0) {
            floodFill(newRow, newCol)
          }
        }
      }
    }
  }

  function activatePowerUp(type: PowerUpType, row: number, col: number) {
    if (!grid[row][col].isRevealed) {
      grid[row][col].isRevealed = true
    }

    if (type === "xray") {
      xrayActive = true
      xrayTimeLeft = 2.5
      xrayActivatedCell = { row, col }
      const interval = setInterval(() => {
        xrayTimeLeft -= 0.1
        if (xrayTimeLeft <= 0) {
          xrayActive = false
          xrayTimeLeft = 0
          xrayActivatedCell = null
          clearInterval(interval)
          // Remove the power-up icon after timer completes
          const cellKey = `${row},${col}`
          blinkingCells.delete(cellKey)
          grid[row][col].powerUp = null
        }
      }, 100)
    } else if (type === "detector") {
      // Flag one random unflagged mine
      const config = DIFFICULTIES[difficulty]
      const unflaggedMines: { row: number; col: number }[] = []

      for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
          if (grid[r][c].isMine && !grid[r][c].isFlagged && !grid[r][c].isRevealed) {
            unflaggedMines.push({ row: r, col: c })
          }
        }
      }

      if (unflaggedMines.length > 0) {
        const random = unflaggedMines[Math.floor(Math.random() * unflaggedMines.length)]
        grid[random.row][random.col].isFlagged = true
        minesRemaining--
      }
    } else if (type === "laser") {
      laserActive = true
      laserTimeLeft = 2.5
      laserActivatedCell = { row, col }
      const interval = setInterval(() => {
        laserTimeLeft -= 0.1
        if (laserTimeLeft <= 0) {
          laserActive = false
          laserTimeLeft = 0
          laserActivatedCell = null
          clearInterval(interval)
          // Remove the power-up icon after timer completes
          const cellKey = `${row},${col}`
          blinkingCells.delete(cellKey)
          grid[row][col].powerUp = null
        }
      }, 100)
    }
  }

  function activateTrap(type: TrapType, row: number, col: number) {
    if (!grid[row][col].isRevealed) {
      grid[row][col].isRevealed = true
    }
    const config = DIFFICULTIES[difficulty]

    if (type === "subterfuge") {
      // Add one mine in unknown area on blank square
      const unknownZeroCells: { row: number; col: number }[] = []

      for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
          if (
            !grid[r][c].isRevealed &&
            !grid[r][c].isMine &&
            !grid[r][c].isFlagged &&
            grid[r][c].neighborMines === 0
          ) {
            // Check if far from revealed cells
            let nearRevealed = false
            for (let dr = -2; dr <= 2; dr++) {
              for (let dc = -2; dc <= 2; dc++) {
                const nr = r + dr
                const nc = c + dc
                if (
                  nr >= 0 && nr < config.rows &&
                  nc >= 0 && nc < config.cols &&
                  grid[nr][nc].isRevealed
                ) {
                  nearRevealed = true
                  break
                }
              }
              if (nearRevealed) break
            }
            if (!nearRevealed) {
              unknownZeroCells.push({ row: r, col: c })
            }
          }
        }
      }

      if (unknownZeroCells.length > 0) {
        const random = unknownZeroCells[Math.floor(Math.random() * unknownZeroCells.length)]
        grid[random.row][random.col].isMine = true
        minesRemaining++
        // Don't recalculate neighbors - mine is hidden and won't affect visible numbers
      }
    } else if (type === "sabotage") {
      // Find largest contiguous area of revealed squares and re-hide them
      const visited = new Set<string>()
      let largestArea: { row: number; col: number }[] = []

      // Helper function to find contiguous revealed area using flood fill
      function findRevealedArea(startRow: number, startCol: number): { row: number; col: number }[] {
        const area: { row: number; col: number }[] = []
        const queue: { row: number; col: number }[] = [{ row: startRow, col: startCol }]
        const key = `${startRow},${startCol}`
        visited.add(key)

        while (queue.length > 0) {
          const { row: r, col: c } = queue.shift()!
          area.push({ row: r, col: c })

          // Check all 8 neighbors
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue
              const nr = r + dr
              const nc = c + dc
              const nKey = `${nr},${nc}`

              if (
                nr >= 0 && nr < config.rows &&
                nc >= 0 && nc < config.cols &&
                !visited.has(nKey) &&
                grid[nr][nc].isRevealed &&
                !grid[nr][nc].isMine &&
                !grid[nr][nc].isFlagged
              ) {
                visited.add(nKey)
                queue.push({ row: nr, col: nc })
              }
            }
          }
        }

        return area
      }

      // Find all contiguous revealed areas
      for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.cols; c++) {
          const key = `${r},${c}`
          if (!visited.has(key) && grid[r][c].isRevealed && !grid[r][c].isMine && !grid[r][c].isFlagged) {
            const area = findRevealedArea(r, c)
            if (area.length > largestArea.length) {
              largestArea = area
            }
          }
        }
      }

      // Re-hide the largest area (just make them regular unrevealed cells again)
      if (largestArea.length > 0) {
        largestArea.forEach(({ row: r, col: c }) => {
          grid[r][c].isRevealed = false
          // Don't mark as sabotaged - just return to normal unrevealed state
        })

        // Add one mine in the re-hidden area (choose a cell that doesn't already have a mine)
        const safeForMine = largestArea.filter(({ row: r, col: c }) => !grid[r][c].isMine)
        if (safeForMine.length > 0) {
          const random = safeForMine[Math.floor(Math.random() * safeForMine.length)]
          grid[random.row][random.col].isMine = true
          minesRemaining++
          // Recalculate neighbor counts for surrounding cells
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue
              const nr = random.row + dr
              const nc = random.col + dc
              if (
                nr >= 0 && nr < config.rows &&
                nc >= 0 && nc < config.cols &&
                !grid[nr][nc].isMine
              ) {
                grid[nr][nc].neighborMines++
              }
            }
          }
        }
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!laserChargedCell) return
    if (gameStatus !== "playing") return

    const { row, col } = laserChargedCell
    let dr = 0, dc = 0

    if (e.key === "ArrowUp") dr = -1
    else if (e.key === "ArrowDown") dr = 1
    else if (e.key === "ArrowLeft") dc = -1
    else if (e.key === "ArrowRight") dc = 1
    else return

    e.preventDefault()
    fireLaser(row, col, dr, dc)
    laserChargedCell = null
    laserChargedTimeLeft = 0
  }

  function fireLaser(startRow: number, startCol: number, dr: number, dc: number) {
    const config = DIFFICULTIES[difficulty]
    let r = startRow + dr
    let c = startCol + dc

    for (let i = 0; i < 4; i++) {
      if (r < 0 || r >= config.rows || c < 0 || c >= config.cols) break

      if (grid[r][c].isMine) {
        grid[r][c].isFlagged = true
        minesRemaining--
        break
      } else {
        if (!grid[r][c].isRevealed) {
          grid[r][c].isRevealed = true
          if (grid[r][c].neighborMines === 0) {
            floodFill(r, c)
          }
        }
      }

      r += dr
      c += dc
    }

    checkWin()
  }

  function handleCellMouseOver(row: number, col: number) {
    activeXrayCell = { row, col }
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

  function getCellClass(cell: Cell, row: number, col: number): string {
    if (cell.isSabotaged) return "bg-gray-800 cursor-not-allowed"
    if (cell.isFlagged) return "bg-yellow-500 hover:bg-yellow-600"
    if (!cell.isRevealed) return "bg-base-300 hover:bg-base-content/10 cursor-pointer"
    if (cell.isMine) return "bg-red-600"
    // Make revealed power-ups/traps clickable
    const cellKey = `${row},${col}`
    if (cell.isRevealed && ((cell.powerUp && !spawnedPowerUps.has(cellKey)) || (cell.trap && !spawnedTraps.has(cellKey)))) {
      return "bg-base-100 cursor-pointer hover:bg-base-content/10"
    }
    return "bg-base-100"
  }

  function getCellContent(cell: Cell, row: number, col: number): string {
    if (cell.isSabotaged) return "❌"
    if (cell.isFlagged) return "🚩"
    if (!cell.isRevealed) {
      // Show during X-Ray if active - reveals 3x3 area around hovered cell
      if (xrayActive && activeXrayCell) {
        const rowDiff = Math.abs(row - activeXrayCell.row)
        const colDiff = Math.abs(col - activeXrayCell.col)
        // Check if this cell is within the 3x3 grid (distance of 1 in both directions)
        if (rowDiff <= 1 && colDiff <= 1) {
          if (cell.isMine) return "💣"
          // For all other squares, show white box (empty string, styled with white bg)
          return "⬜"
        }
      }
      return ""
    }
    if (cell.isMine) return "💣"
    const cellKey = `${row},${col}`
    if (cell.powerUp && !spawnedPowerUps.has(cellKey)) {
      if (cell.powerUp === "xray") return "🔍"
      if (cell.powerUp === "detector") return "📡"
      if (cell.powerUp === "laser") return "🔫"
    }
    if (cell.trap && !spawnedTraps.has(cellKey)) {
      if (cell.trap === "subterfuge") return "🎭"
      if (cell.trap === "sabotage") return "💀"
    }
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

<svelte:head>
  <title>💣 Mine Buster | Dougie's Game Hub</title>
</svelte:head>

<div class="container mx-auto p-8">
  <h1 class="text-4xl font-bold mb-6">💣 Mine Buster</h1>

  <div class="flex flex-col lg:flex-row gap-8 lg:h-[calc(100vh-200px)]">
    <!-- Game Board -->
    <div class="flex-shrink-0">
      <div
        class="inline-block border-4 border-base-300 rounded-lg shadow-xl p-2 bg-base-200 relative"
        style="width: {BOARD_SIZE}px; height: {BOARD_SIZE}px;"
      >
        <div class="grid gap-0.5" style="grid-template-columns: repeat({DIFFICULTIES[difficulty].cols}, minmax(0, 1fr)); height: 100%;">
          {#each grid as row, rowIndex}
            {#each row as cell, colIndex}
              <button
                class="border border-base-content/20 rounded font-bold flex items-center justify-center transition-colors relative {getCellClass(cell, rowIndex, colIndex)} {cell.isRevealed && cell.neighborMines > 0 ? getNumberColor(cell.neighborMines) : ''} {blinkingCells.has(`${rowIndex},${colIndex}`) ? 'animate-blink' : ''}"
                style="width: {getCellSize()}px; height: {getCellSize()}px; font-size: {getCellSize() * 0.6}px;"
                onclick={() => handleCellClick(rowIndex, colIndex)}
                onmouseover={() => handleCellMouseOver(rowIndex, colIndex)}
                disabled={gameStatus !== "playing"}
              >
                {getCellContent(cell, rowIndex, colIndex)}

                <!-- X-Ray Circular Countdown -->
                {#if xrayActivatedCell && xrayActivatedCell.row === rowIndex && xrayActivatedCell.col === colIndex && xrayTimeLeft > 0}
                  <svg class="absolute inset-0" viewBox="0 0 100 100" style="transform: rotate(-90deg)">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#60a5fa" stroke-width="10" opacity="0.3" />
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="#3b82f6"
                      stroke-width="10"
                      stroke-dasharray="282.74"
                      stroke-dashoffset="{282.74 * (1 - xrayTimeLeft / 2.5)}"
                      stroke-linecap="round"
                    />
                  </svg>
                {/if}

                <!-- Laser Circular Countdown -->
                {#if laserActivatedCell && laserActivatedCell.row === rowIndex && laserActivatedCell.col === colIndex && laserTimeLeft > 0}
                  <svg class="absolute inset-0" viewBox="0 0 100 100" style="transform: rotate(-90deg)">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#f87171" stroke-width="10" opacity="0.3" />
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="#ef4444"
                      stroke-width="10"
                      stroke-dasharray="282.74"
                      stroke-dashoffset="{282.74 * (1 - laserTimeLeft / 2.5)}"
                      stroke-linecap="round"
                    />
                  </svg>
                {/if}

                <!-- Laser Charged Circular Countdown -->
                {#if laserChargedCell && laserChargedCell.row === rowIndex && laserChargedCell.col === colIndex}
                  <svg class="absolute inset-0" viewBox="0 0 100 100" style="transform: rotate(-90deg)">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#fbbf24" stroke-width="10" opacity="0.3" />
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="#f59e0b"
                      stroke-width="10"
                      stroke-dasharray="282.74"
                      stroke-dashoffset="{282.74 * (1 - laserChargedTimeLeft / 2)}"
                      stroke-linecap="round"
                    />
                  </svg>
                {/if}

                <!-- Directional arrows for adjacent cells when laser is charged -->
                {#if laserChargedCell}
                  <!-- Up arrow -->
                  {#if laserChargedCell.row === rowIndex + 1 && laserChargedCell.col === colIndex}
                    <div class="absolute inset-0 flex items-center justify-center text-yellow-500 text-2xl font-bold pointer-events-none">
                      ⬆
                    </div>
                  {/if}
                  <!-- Down arrow -->
                  {#if laserChargedCell.row === rowIndex - 1 && laserChargedCell.col === colIndex}
                    <div class="absolute inset-0 flex items-center justify-center text-yellow-500 text-2xl font-bold pointer-events-none">
                      ⬇
                    </div>
                  {/if}
                  <!-- Left arrow -->
                  {#if laserChargedCell.row === rowIndex && laserChargedCell.col === colIndex + 1}
                    <div class="absolute inset-0 flex items-center justify-center text-yellow-500 text-2xl font-bold pointer-events-none">
                      ⬅
                    </div>
                  {/if}
                  <!-- Right arrow -->
                  {#if laserChargedCell.row === rowIndex && laserChargedCell.col === colIndex - 1}
                    <div class="absolute inset-0 flex items-center justify-center text-yellow-500 text-2xl font-bold pointer-events-none">
                      ➡
                    </div>
                  {/if}
                {/if}
              </button>
            {/each}
          {/each}
        </div>
      </div>
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
                <option value="easy">Easy (15×15, 30 mines)</option>
                <option value="medium">Medium (20×20, 70 mines)</option>
                <option value="hard">Hard (25×25, 120 mines)</option>
              </select>
            </div>

            <!-- Power-Ups Section -->
            <div class="divider my-2"></div>
            <div class="mb-2">
              <span class="label-text font-semibold">Power-Ups</span>
            </div>

            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text">🔍 X-Ray (2.5s reveal 3x3 on hover)</span>
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  bind:checked={powerUpsEnabled.xray}
                  disabled={gameStatus === "playing"}
                />
              </label>
            </div>

            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text">📡 Detector (auto-flag one mine)</span>
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  bind:checked={powerUpsEnabled.detector}
                  disabled={gameStatus === "playing"}
                />
              </label>
            </div>

            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text">🔫 Laser (2.5s to pick, 2s to shoot)</span>
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  bind:checked={powerUpsEnabled.laser}
                  disabled={gameStatus === "playing"}
                />
              </label>
            </div>

            <!-- Traps Section -->
            <div class="divider my-2"></div>
            <div class="mb-2">
              <span class="label-text font-semibold">Traps</span>
            </div>

            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text">🎭 Subterfuge (adds hidden mine)</span>
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  bind:checked={trapsEnabled.subterfuge}
                  disabled={gameStatus === "playing"}
                />
              </label>
            </div>

            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text">💀 Sabotage (re-covers largest area + mine)</span>
                <input
                  type="checkbox"
                  class="checkbox checkbox-sm"
                  bind:checked={trapsEnabled.sabotage}
                  disabled={gameStatus === "playing"}
                />
              </label>
            </div>

            <!-- Instructions -->
            <div class="divider"></div>
            <div>
              <h3 class="font-semibold mb-2">How to Play:</h3>
              <ul class="list-disc list-inside space-y-1 text-sm">
                <li>Single click to flag/unflag</li>
                <li>Double click to reveal a cell</li>
                <li>Numbers show adjacent mines</li>
                <li>First click is always safe</li>
                <li>Power-ups appear on blank squares</li>
                <li>Watch out for traps!</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- New Game Button -->
      <div class="card bg-base-200 shadow-xl">
        <div class="card-body p-4">
          <button class="btn btn-primary w-full" onclick={initGame}>
            New Game
          </button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  .animate-blink {
    animation: blink 0.5s ease-in-out 3;
  }
</style>
