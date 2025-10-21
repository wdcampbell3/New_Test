<script lang="ts">
  import { onMount } from "svelte"

  type Position = { x: number; y: number }
  type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT"
  type PowerUpType = "invincible" | "diet" | "binge" | "turtle" | "ruler" | "lightning" | "cow"
  type PowerUp = { x: number; y: number; type: PowerUpType; emoji: string }

  // Game settings
  let gameSpeed = $state<"slow" | "normal" | "fast" | "insane">("normal")
  let wallMode = $state<"solid" | "wraparound">("wraparound")
  let gridSize = $state<"small" | "medium" | "large">("medium")
  let backgroundTheme = $state<"trippy" | "radial" | "deepspace">("trippy")
  let showGridDots = $state(false)
  let soundEnabled = $state(true)
  let powerUpsEnabled = $state(true)
  let enabledPowerUps = $state({
    invincible: true,
    diet: true,
    binge: true,
    turtle: true
  })
  let enabledObstacles = $state({
    ruler: true,
    lightning: true,
    cow: true
  })

  // Game state
  let gameStarted = $state(false)
  let gameOver = $state(false)
  let score = $state(0)
  let highScore = $state(0)
  let speed = $state(150)

  let worm = $state<Position[]>([{ x: 10, y: 10 }])
  let direction = $state<Direction>("RIGHT")
  let nextDirection = $state<Direction>("RIGHT")
  let food = $state<Position[]>([{ x: 15, y: 10 }])
  let powerUps = $state<PowerUp[]>([])
  let lastPowerUpSpawn = $state(0)

  // Power-up effects
  let invincibleUntil = $state(0)
  let blinkState = $state(false)
  let blinkInterval: ReturnType<typeof setInterval> | undefined
  let speedModifier = $state(1.0) // 1.0 = normal, 0.8 = slowed by turtle, 1.2 = sped up by lightning

  let gameInterval: ReturnType<typeof setInterval> | undefined

  // Background animation
  let rainbowHue = $state(0)
  let rainbowZoom = $state(0) // 0 to 100, controls the zoom in/out
  let zoomDirection = $state(1) // 1 for zooming out, -1 for zooming in
  let animationInterval: ReturnType<typeof setInterval> | undefined

  // Fixed board dimensions
  const BOARD_WIDTH = 800
  const BOARD_HEIGHT = 608

  // Grid dimensions based on size setting (more cells = smaller cell size)
  function getGridWidth(): number {
    switch (gridSize) {
      case "small": return 25  // Fewer cells (larger cells: 32px)
      case "medium": return 40 // Medium cells (20px)
      case "large": return 50  // More cells (smaller cells: 16px)
    }
  }

  function getGridHeight(): number {
    switch (gridSize) {
      case "small": return 19  // Fewer cells (larger cells: 32px)
      case "medium": return 30 // Medium cells (~20px)
      case "large": return 38  // More cells (smaller cells: 16px)
    }
  }

  function getCellSize(): number {
    switch (gridSize) {
      case "small": return 32   // Larger cells, fewer of them
      case "medium": return 20  // Medium cells
      case "large": return 16   // Smaller cells, more of them
    }
  }

  // Speed settings
  function getInitialSpeed(): number {
    switch (gameSpeed) {
      case "slow": return 250
      case "normal": return 150
      case "fast": return 100
      case "insane": return 50
    }
  }

  function getSpeedIncrement(): number {
    switch (gameSpeed) {
      case "slow": return 8
      case "normal": return 5
      case "fast": return 3
      case "insane": return 1
    }
  }

  // ROYGBIV rainbow colors
  const ROYGBIV = [
    "#FF0000", // Red
    "#FF7F00", // Orange
    "#FFFF00", // Yellow
    "#00FF00", // Green
    "#0000FF", // Blue
    "#4B0082", // Indigo
    "#9400D3"  // Violet
  ]

  // Get rainbow color for segment based on position
  function getRainbowColor(segmentIndex: number, wormLength: number): string {
    if (wormLength < 7) {
      // Less than 7: use ROYGBIV up to worm length
      return ROYGBIV[segmentIndex] || ROYGBIV[0]
    } else {
      // 7 or more: head is red, tail is violet, middle interpolates
      if (segmentIndex === 0) return ROYGBIV[0] // Red head
      if (segmentIndex === wormLength - 1) return ROYGBIV[6] // Violet tail

      // Middle segments: interpolate across ROYGBIV
      const position = segmentIndex / (wormLength - 1)
      const colorIndex = position * 6
      const baseIndex = Math.floor(colorIndex)
      const nextIndex = Math.min(baseIndex + 1, 6)

      return ROYGBIV[Math.round(colorIndex)]
    }
  }

  // Get worm segment color with invincible gradient
  function getSegmentColor(segmentIndex: number, wormLength: number): string {
    const now = Date.now()
    const isInvincible = invincibleUntil > now

    if (isInvincible) {
      // Never completely invisible - minimum 30% opacity when blinking off
      if (!blinkState) {
        const alpha = 0.3 - (segmentIndex / wormLength) * 0.1 // 30% to 20%
        return `rgba(255, 255, 255, ${alpha})`
      }
      // White gradient when blinking on - 100% to 50%
      const alpha = 1 - (segmentIndex / wormLength) * 0.5
      return `rgba(255, 255, 255, ${alpha})`
    }

    // Always use rainbow theme
    return getRainbowColor(segmentIndex, wormLength)
  }

  function getFoodColor(): string {
    return "transparent" // We'll use emoji instead
  }

  // Get background style based on theme
  function getBackgroundStyle(): string {
    switch (backgroundTheme) {
      case "trippy":
        // Rainbow gradient from center to edges with zoom animation
        // Red (0°) at center, cycling through rainbow to violet (270°) at edges
        // Zoom controls the position of colors
        const centerHue = (rainbowZoom * 2.7) % 360 // 0-360, shifts with zoom
        const edgeHue = (centerHue + 270) % 360 // 270° offset for violet

        // Create stops for smooth rainbow transition
        const stops = []
        for (let i = 0; i <= 6; i++) {
          const position = i * (100 / 6)
          const hue = (centerHue + (i * 270 / 6)) % 360
          // Brighter colors (60% lightness instead of 25%)
          stops.push(`hsl(${hue}, 85%, 45%) ${position}%`)
        }

        return `radial-gradient(circle at center, ${stops.join(', ')})`
      case "radial":
        // Gray gradient with morphing effect - dramatic shifts between dark/light
        const radialMorph = Math.sin(rainbowZoom * Math.PI / 50) * 0.5 + 0.5 // 0 to 1
        const centerBrightness = Math.floor(5 + radialMorph * 55) // 5-60 (wider range)
        const edgeBrightness = Math.floor(30 + radialMorph * 70) // 30-100 (wider range)
        // Ellipse size variation ±40% and center position ±20% for more dramatic movement
        return `radial-gradient(ellipse ${Math.floor(100 + Math.sin(rainbowZoom * Math.PI / 33) * 40)}% ${Math.floor(100 + Math.cos(rainbowZoom * Math.PI / 33) * 40)}% at ${50 + Math.sin(rainbowZoom * Math.PI / 40) * 20}% ${50 + Math.cos(rainbowZoom * Math.PI / 40) * 20}%, rgb(${centerBrightness}, ${centerBrightness}, ${centerBrightness}) 0%, rgb(${edgeBrightness}, ${edgeBrightness}, ${edgeBrightness}) 100%)`
      case "deepspace":
        // Deep space gradient with continuous slow rotation and morphing colors
        const spaceMorph = Math.sin(rainbowZoom * Math.PI / 50) * 0.5 + 0.5 // 0 to 1
        const angle = (rainbowZoom * 1.8) % 360 // Continuous 360° rotation, slower speed
        const blue1 = Math.floor(0 + spaceMorph * 20) // 0-20
        const blue2 = Math.floor(51 + spaceMorph * 30) // 51-81
        const midBlue = Math.floor(26 + spaceMorph * 51) // 26-77
        return `linear-gradient(${angle}deg, rgb(0, 0, ${blue1}) 0%, rgb(0, ${midBlue}, ${blue2}) 50%, rgb(0, 0, ${blue1}) 100%)`
    }
  }

  // Get cell background based on grid dots setting
  function getCellBackground(isWorm: boolean, isFood: boolean): string {
    if (isWorm || isFood) return "transparent"
    if (showGridDots) return "#ffffff15" // Subtle white dots
    return "transparent"
  }

  // Random animal emojis for food
  const animalEmojis = ["🐭", "🐹", "🐰", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤"]

  function getRandomAnimal(): string {
    return animalEmojis[Math.floor(Math.random() * animalEmojis.length)]
  }

  function generateFood() {
    const width = getGridWidth()
    const height = getGridHeight()
    let newFood: Position
    do {
      newFood = {
        x: Math.floor(Math.random() * width),
        y: Math.floor(Math.random() * height),
      }
    } while (
      worm.some((segment) => segment.x === newFood.x && segment.y === newFood.y) ||
      powerUps.some((pu) => pu.x === newFood.x && pu.y === newFood.y)
    )
    food = [newFood]
  }

  function spawnPowerUp() {
    if (!powerUpsEnabled) return

    const now = Date.now()
    if (now - lastPowerUpSpawn < 10000) return // Spawn every 10 seconds

    // Build weighted list (binge most common, invincible least common)
    const weightedTypes: PowerUpType[] = []

    // Power-ups
    if (enabledPowerUps.binge) {
      for (let i = 0; i < 10; i++) weightedTypes.push("binge") // Most common
    }
    if (enabledPowerUps.diet) {
      for (let i = 0; i < 4; i++) weightedTypes.push("diet") // Middle frequency
    }
    if (enabledPowerUps.turtle) {
      for (let i = 0; i < 6; i++) weightedTypes.push("turtle") // Middle-high frequency
    }
    if (enabledPowerUps.invincible) {
      for (let i = 0; i < 2; i++) weightedTypes.push("invincible") // Least common
    }

    // Obstacles
    if (enabledObstacles.ruler) {
      for (let i = 0; i < 4; i++) weightedTypes.push("ruler") // Middle frequency
    }
    if (enabledObstacles.lightning) {
      for (let i = 0; i < 6; i++) weightedTypes.push("lightning") // Middle-high frequency
    }
    if (enabledObstacles.cow) {
      for (let i = 0; i < 6; i++) weightedTypes.push("cow") // Middle-high frequency
    }

    if (weightedTypes.length === 0) return

    const type = weightedTypes[Math.floor(Math.random() * weightedTypes.length)]
    const emojis = {
      invincible: "⭐",
      diet: "💊",
      binge: "🍪",
      turtle: "🐢",
      ruler: "📏",
      lightning: "⚡",
      cow: "🐮"
    }

    const width = getGridWidth()
    const height = getGridHeight()
    let pos: Position
    let attempts = 0
    do {
      pos = {
        x: Math.floor(Math.random() * width),
        y: Math.floor(Math.random() * height),
      }
      attempts++
    } while (
      attempts < 50 &&
      (worm.some((segment) => segment.x === pos.x && segment.y === pos.y) ||
       food.some((f) => f.x === pos.x && f.y === pos.y) ||
       powerUps.some((pu) => pu.x === pos.x && pu.y === pos.y))
    )

    if (attempts < 50) {
      powerUps.push({ x: pos.x, y: pos.y, type, emoji: emojis[type] })
      lastPowerUpSpawn = now
    }
  }

  function applyPowerUp(type: PowerUpType) {
    const now = Date.now()

    switch (type) {
      case "invincible":
        invincibleUntil = now + 5000
        if (soundEnabled) playPowerUpSound()
        // Start blinking
        if (blinkInterval) clearInterval(blinkInterval)
        blinkState = true
        blinkInterval = setInterval(() => {
          blinkState = !blinkState
        }, 500)
        setTimeout(() => {
          if (blinkInterval) clearInterval(blinkInterval)
          blinkState = false
          invincibleUntil = 0
        }, 5000)
        break
      case "diet":
        // Never reduce to less than 1 square
        const newLength = Math.max(1, Math.floor(worm.length / 2))
        if (worm.length > 1) {
          worm = worm.slice(0, newLength)
        }
        if (soundEnabled) playPowerUpSound()
        break
      case "binge":
        // Add 3 more food items
        const width = getGridWidth()
        const height = getGridHeight()
        for (let i = 0; i < 3; i++) {
          let newFood: Position
          let attempts = 0
          do {
            newFood = {
              x: Math.floor(Math.random() * width),
              y: Math.floor(Math.random() * height),
            }
            attempts++
          } while (
            attempts < 50 &&
            (worm.some((segment) => segment.x === newFood.x && segment.y === newFood.y) ||
             food.some((f) => f.x === newFood.x && f.y === newFood.y))
          )
          if (attempts < 50) {
            food.push(newFood)
          }
        }
        if (soundEnabled) playPowerUpSound()
        break
      case "turtle":
        // Slow down by 20% for 5 seconds
        speedModifier = 0.8
        if (soundEnabled) playPowerUpSound()
        clearInterval(gameInterval)
        gameInterval = setInterval(moveWorm, Math.floor(speed / speedModifier))
        setTimeout(() => {
          speedModifier = 1.0
          clearInterval(gameInterval)
          gameInterval = setInterval(moveWorm, speed)
        }, 5000)
        break
      case "ruler":
        const growAmount = Math.max(1, Math.floor(worm.length / 3))
        const tail = worm[worm.length - 1]
        for (let i = 0; i < growAmount; i++) {
          worm.push({ ...tail })
        }
        if (soundEnabled) playPowerUpSound()
        break
      case "lightning":
        // Speed up by 20% for 5 seconds
        speedModifier = 1.2
        if (soundEnabled) playPowerUpSound()
        clearInterval(gameInterval)
        gameInterval = setInterval(moveWorm, Math.floor(speed / speedModifier))
        setTimeout(() => {
          speedModifier = 1.0
          clearInterval(gameInterval)
          gameInterval = setInterval(moveWorm, speed)
        }, 5000)
        break
      case "cow":
        // Grow by exactly 3 squares
        const cowTail = worm[worm.length - 1]
        for (let i = 0; i < 3; i++) {
          worm.push({ ...cowTail })
        }
        if (soundEnabled) playPowerUpSound()
        break
    }
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

    const width = getGridWidth()
    const height = getGridHeight()

    // Handle walls based on mode
    if (wallMode === "solid") {
      if (
        newHead.x < 0 ||
        newHead.x >= width ||
        newHead.y < 0 ||
        newHead.y >= height
      ) {
        endGame()
        return
      }
    } else {
      newHead.x = (newHead.x + width) % width
      newHead.y = (newHead.y + height) % height
    }

    // Check self collision (unless invincible)
    const now = Date.now()
    if (invincibleUntil < now) {
      if (
        worm.some((segment) => segment.x === newHead.x && segment.y === newHead.y)
      ) {
        endGame()
        return
      }
    }

    worm = [newHead, ...worm]

    // Check food collision
    let ateFood = false
    for (let i = food.length - 1; i >= 0; i--) {
      if (newHead.x === food[i].x && newHead.y === food[i].y) {
        score += 10
        if (soundEnabled) playEatSound()
        food.splice(i, 1)
        ateFood = true
        // Increase speed slightly
        const minSpeed = gameSpeed === "insane" ? 20 : 50
        if (speed > minSpeed) {
          speed -= getSpeedIncrement()
          clearInterval(gameInterval)
          // Apply speed modifier to maintain turtle/lightning effects
          gameInterval = setInterval(moveWorm, Math.floor(speed / speedModifier))
        }
      }
    }

    // Check power-up collision
    for (let i = powerUps.length - 1; i >= 0; i--) {
      if (newHead.x === powerUps[i].x && newHead.y === powerUps[i].y) {
        applyPowerUp(powerUps[i].type)
        powerUps.splice(i, 1)
      }
    }

    // Spawn new food if needed
    if (food.length === 0) {
      generateFood()
    }

    // Spawn power-ups
    if (powerUpsEnabled) {
      spawnPowerUp()
    }

    if (!ateFood) {
      worm.pop()
    }
  }

  function startGame() {
    gameStarted = true
    gameOver = false
    score = 0
    speed = getInitialSpeed()
    speedModifier = 1.0
    const width = getGridWidth()
    const height = getGridHeight()
    worm = [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }]
    direction = "RIGHT"
    nextDirection = "RIGHT"
    food = []
    powerUps = []
    invincibleUntil = 0
    lastPowerUpSpawn = 0
    blinkState = false
    if (blinkInterval) clearInterval(blinkInterval)
    generateFood()
    gameInterval = setInterval(moveWorm, speed)
  }

  function endGame() {
    gameOver = true
    gameStarted = false
    clearInterval(gameInterval)
    if (blinkInterval) clearInterval(blinkInterval)
    if (score > highScore) {
      highScore = score
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("snakeadelicHighScore", highScore.toString())
      }
    }
  }

  function resetGame() {
    gameStarted = false
    gameOver = false
    score = 0
    speedModifier = 1.0
    const width = getGridWidth()
    const height = getGridHeight()
    worm = [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }]
    direction = "RIGHT"
    nextDirection = "RIGHT"
    food = []
    powerUps = []
    invincibleUntil = 0
    blinkState = false
    clearInterval(gameInterval)
    if (blinkInterval) clearInterval(blinkInterval)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!gameStarted) return

    // Check nextDirection instead of direction to prevent rapid turns creating diagonals
    switch (event.key) {
      case "ArrowUp":
      case "w":
      case "W":
        if (nextDirection !== "DOWN" && nextDirection !== "UP") nextDirection = "UP"
        event.preventDefault()
        break
      case "ArrowDown":
      case "s":
      case "S":
        if (nextDirection !== "UP" && nextDirection !== "DOWN") nextDirection = "DOWN"
        event.preventDefault()
        break
      case "ArrowLeft":
      case "a":
      case "A":
        if (nextDirection !== "RIGHT" && nextDirection !== "LEFT") nextDirection = "LEFT"
        event.preventDefault()
        break
      case "ArrowRight":
      case "d":
      case "D":
        if (nextDirection !== "LEFT" && nextDirection !== "RIGHT") nextDirection = "RIGHT"
        event.preventDefault()
        break
    }
  }

  function playEatSound() {
    if (!soundEnabled) return
    try {
      const audioContext = new AudioContext()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      oscillator.frequency.value = 440
      oscillator.type = "sine"
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.1)
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
      oscillator.type = "square"
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.2)
    } catch (e) {}
  }

  onMount(() => {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem("snakeadelicHighScore")
      if (saved) highScore = parseInt(saved)
    }

    // Start rainbow animation for trippy background with zoom
    animationInterval = setInterval(() => {
      // Update zoom (creates pulsing/breathing effect)
      rainbowZoom += zoomDirection
      if (rainbowZoom >= 100) {
        zoomDirection = -1 // Start zooming back in
      } else if (rainbowZoom <= 0) {
        zoomDirection = 1 // Start zooming back out
      }
    }, 150) // Slower zoom animation (1/3 speed)

    return () => {
      clearInterval(gameInterval)
      if (blinkInterval) clearInterval(blinkInterval)
      if (animationInterval) clearInterval(animationInterval)
    }
  })
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>🐍 Snake-adelic | Dougie's Game Hub</title>
</svelte:head>

<div class="container mx-auto p-8">
  <h1 class="text-4xl font-bold mb-6">🐍 Snake-adelic</h1>

  <div class="flex flex-col lg:flex-row gap-8 lg:h-[calc(100vh-200px)]">
    <!-- Game Canvas -->
    <div class="flex-shrink-0">
      <div class="mb-4 flex gap-8 text-center">
        <div>
          <div class="text-sm text-base-content/70">Score</div>
          <div class="text-3xl font-bold text-primary">{score}</div>
        </div>
        <div>
          <div class="text-sm text-base-content/70">High Score</div>
          <div class="text-3xl font-bold text-secondary">{highScore}</div>
        </div>
      </div>

      <div class="card bg-base-100 shadow-xl relative">
        <div class="card-body p-4">
          <div
            class="game-board"
            style="
              width: {BOARD_WIDTH}px;
              height: {BOARD_HEIGHT}px;
              display: grid;
              grid-template-columns: repeat({getGridWidth()}, {getCellSize()}px);
              grid-template-rows: repeat({getGridHeight()}, {getCellSize()}px);
              gap: 1px;
              background: {getBackgroundStyle()};
              border: 3px solid #374151;
              border-radius: 8px;
            "
          >
            {#each Array(getGridWidth() * getGridHeight())
              .fill(0)
              .map((_, i) => i) as i (i)}
              {@const x = i % getGridWidth()}
              {@const y = Math.floor(i / getGridWidth())}
              {@const wormSegmentIndex = worm.findIndex(
                (segment) => segment.x === x && segment.y === y,
              )}
              {@const isWorm = wormSegmentIndex >= 0}
              {@const foodIndex = food.findIndex((f) => f.x === x && f.y === y)}
              {@const isFood = foodIndex >= 0}
              {@const powerUp = powerUps.find((pu) => pu.x === x && pu.y === y)}
              <div
                class="cell"
                style="
                  background: {isWorm
                    ? getSegmentColor(wormSegmentIndex, worm.length)
                    : isFood
                      ? getFoodColor()
                      : getCellBackground(isWorm, isFood)};
                  border-radius: {showGridDots && !isWorm && !isFood ? '50%' : '2px'};
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: {getCellSize() * 0.75}px;
                "
              >
                {#if isFood}
                  {getRandomAnimal()}
                {/if}
                {#if powerUp}
                  {powerUp.emoji}
                {/if}
              </div>
            {/each}
          </div>

          <!-- Game Over Overlay -->
          {#if gameOver}
            <div
              class="absolute inset-0 flex items-center justify-center bg-base-100/90 rounded-lg"
            >
              <div class="text-center">
                <h2 class="text-3xl font-bold text-error mb-4">Game Over!</h2>
                <p class="text-xl mb-6">Final Score: {score}</p>
                <button onclick={startGame} class="btn btn-primary">Play Again</button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Settings Panel -->
    <div class="flex-1 flex flex-col gap-4">
      <div class="card bg-base-200 shadow-xl flex-1 lg:overflow-y-auto lg:max-h-full">
        <div class="card-body">
          <h2 class="card-title">Settings</h2>

          <div class="space-y-4">
            <!-- Speed Setting -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-semibold">Speed</span>
              </label>
              <div class="flex gap-2">
                <button
                  class="btn btn-xs flex-1 {gameSpeed === 'slow' ? 'btn-success' : 'btn-outline'}"
                  onclick={() => (gameSpeed = 'slow')}
                  disabled={gameStarted}
                >
                  Slow
                </button>
                <button
                  class="btn btn-xs flex-1 {gameSpeed === 'normal' ? 'btn-warning' : 'btn-outline'}"
                  onclick={() => (gameSpeed = 'normal')}
                  disabled={gameStarted}
                >
                  Normal
                </button>
                <button
                  class="btn btn-xs flex-1 {gameSpeed === 'fast' ? 'btn-error' : 'btn-outline'}"
                  onclick={() => (gameSpeed = 'fast')}
                  disabled={gameStarted}
                >
                  Fast
                </button>
                <button
                  class="btn btn-xs flex-1 {gameSpeed === 'insane' ? 'btn-error' : 'btn-outline'}"
                  onclick={() => (gameSpeed = 'insane')}
                  disabled={gameStarted}
                >
                  Insane
                </button>
              </div>
            </div>

            <!-- Grid Size Setting -->
            <div class="form-control">
              <label class="label">
                <span class="label-text font-semibold">Grid Size</span>
              </label>
              <div class="flex gap-2">
                <button
                  class="btn btn-xs flex-1 {gridSize === 'small' ? 'btn-success' : 'btn-outline'}"
                  onclick={() => (gridSize = 'small')}
                  disabled={gameStarted}
                >
                  Small
                </button>
                <button
                  class="btn btn-xs flex-1 {gridSize === 'medium' ? 'btn-warning' : 'btn-outline'}"
                  onclick={() => (gridSize = 'medium')}
                  disabled={gameStarted}
                >
                  Medium
                </button>
                <button
                  class="btn btn-xs flex-1 {gridSize === 'large' ? 'btn-error' : 'btn-outline'}"
                  onclick={() => (gridSize = 'large')}
                  disabled={gameStarted}
                >
                  Large
                </button>
              </div>
            </div>

            <!-- Options Section -->
            <div class="divider my-2"></div>
            <div class="mb-2">
              <span class="label-text font-semibold">Options</span>
            </div>

            <!-- Wall Mode -->
            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text">Wraparound Walls</span>
                <input
                  type="checkbox"
                  class="checkbox"
                  checked={wallMode === "wraparound"}
                  onchange={(e) => (wallMode = e.currentTarget.checked ? "wraparound" : "solid")}
                  disabled={gameStarted}
                />
              </label>
            </div>

            <!-- Background Theme -->
            <div class="form-control">
              <label class="label">
                <span class="label-text">Background</span>
              </label>
              <select
                class="select select-bordered select-sm"
                bind:value={backgroundTheme}
              >
                <option value="trippy">Trippy (Rainbow Shift)</option>
                <option value="radial">Radial (Gray Gradient)</option>
                <option value="deepspace">Deep Space (Blue)</option>
              </select>
            </div>

            <!-- Grid Dots Toggle -->
            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text">Show Grid Dots</span>
                <input
                  type="checkbox"
                  class="checkbox"
                  bind:checked={showGridDots}
                />
              </label>
            </div>

            <!-- Power-Ups Toggle -->
            <div class="form-control">
              <label class="label cursor-pointer">
                <span class="label-text font-semibold">Power-Ups</span>
                <input
                  type="checkbox"
                  class="checkbox checkbox-primary"
                  bind:checked={powerUpsEnabled}
                  disabled={gameStarted}
                />
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
                      bind:checked={enabledPowerUps.invincible}
                      disabled={gameStarted}
                    />
                    <div class="flex flex-col">
                      <span class="label-text text-sm font-medium">⭐ Invincible</span>
                      <span class="label-text text-xs opacity-70">No self-collision for 5s</span>
                    </div>
                  </label>
                  <label class="label cursor-pointer justify-start gap-2 py-1">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-xs"
                      bind:checked={enabledPowerUps.diet}
                      disabled={gameStarted}
                    />
                    <div class="flex flex-col">
                      <span class="label-text text-sm font-medium">💊 Diet</span>
                      <span class="label-text text-xs opacity-70">Cut length in half</span>
                    </div>
                  </label>
                  <label class="label cursor-pointer justify-start gap-2 py-1">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-xs"
                      bind:checked={enabledPowerUps.binge}
                      disabled={gameStarted}
                    />
                    <div class="flex flex-col">
                      <span class="label-text text-sm font-medium">🍪 Binge</span>
                      <span class="label-text text-xs opacity-70">Add 3 extra food items</span>
                    </div>
                  </label>
                  <label class="label cursor-pointer justify-start gap-2 py-1">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-xs"
                      bind:checked={enabledPowerUps.turtle}
                      disabled={gameStarted}
                    />
                    <div class="flex flex-col">
                      <span class="label-text text-sm font-medium">🐢 Turtle</span>
                      <span class="label-text text-xs opacity-70">Slow down by 20% for 5s</span>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Obstacles Section -->
              <div class="divider my-2"></div>
              <div class="form-control ml-6">
                <label class="label">
                  <span class="label-text text-sm font-semibold">Obstacles</span>
                </label>
                <div class="flex flex-col gap-2">
                  <label class="label cursor-pointer justify-start gap-2 py-1">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-xs"
                      bind:checked={enabledObstacles.ruler}
                      disabled={gameStarted}
                    />
                    <div class="flex flex-col">
                      <span class="label-text text-sm font-medium">📏 Ruler</span>
                      <span class="label-text text-xs opacity-70">Grow by 1/3 length</span>
                    </div>
                  </label>
                  <label class="label cursor-pointer justify-start gap-2 py-1">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-xs"
                      bind:checked={enabledObstacles.lightning}
                      disabled={gameStarted}
                    />
                    <div class="flex flex-col">
                      <span class="label-text text-sm font-medium">⚡ Lightning</span>
                      <span class="label-text text-xs opacity-70">Speed up by 20% for 5s</span>
                    </div>
                  </label>
                  <label class="label cursor-pointer justify-start gap-2 py-1">
                    <input
                      type="checkbox"
                      class="checkbox checkbox-xs"
                      bind:checked={enabledObstacles.cow}
                      disabled={gameStarted}
                    />
                    <div class="flex flex-col">
                      <span class="label-text text-sm font-medium">🐮 Cow</span>
                      <span class="label-text text-xs opacity-70">Grow by exactly 3 squares</span>
                    </div>
                  </label>
                </div>
              </div>
            {/if}

            <!-- Sound Toggle -->
            <div class="divider my-2"></div>
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
                <li>Use <kbd class="kbd kbd-sm">↑</kbd> <kbd class="kbd kbd-sm">↓</kbd> <kbd class="kbd kbd-sm">←</kbd> <kbd class="kbd kbd-sm">→</kbd> or <kbd class="kbd kbd-sm">WASD</kbd></li>
                <li>Eat the animal emoji to grow and score points</li>
                <li>Collect power-ups for special effects!</li>
                <li>Don't run into yourself!</li>
                <li>Speed increases as you grow</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Game Controls - Always Visible -->
      <div class="card bg-base-200 shadow-xl">
        <div class="card-body p-4">
          <div class="flex gap-2">
            {#if !gameStarted}
              <button class="btn btn-primary flex-1" onclick={startGame}>
                {gameOver ? "Play Again" : "Start Game"}
              </button>
            {:else}
              <button class="btn btn-warning flex-1" onclick={endGame}>
                End Game
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
  .game-board {
    position: relative;
  }
  .cell {
    transition: background-color 0.1s ease;
  }
</style>
