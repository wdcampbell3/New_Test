<script lang="ts">
  import { onMount } from "svelte"
  import * as THREE from "three"
  import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js"
  import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js"
  import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js"
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

  let container: HTMLDivElement
  let scene: THREE.Scene
  let camera: THREE.PerspectiveCamera
  let renderer: THREE.WebGLRenderer
  let controls: PointerLockControls
  let animationId: number

  // World Builder Map Integration
  interface MapData {
    id: string
    name: string
    description: string
    created: number
    modified: number
    thumbnail: string
    environment: {
      timeOfDay: 'dawn' | 'day' | 'sunset' | 'night'
      weather: 'clear' | 'rain' | 'snow' | 'fog'
      fogDensity: number
    }
    objects: Array<{
      modelPath: string
      position: { x: number, y: number, z: number }
      rotation: { x: number, y: number, z: number }
      scale: { x: number, y: number, z: number }
    }>
    stats: {
      objectCount: number
      polygonCount: number
    }
  }

  let availableMaps: MapData[] = []
  let selectedMap: MapData | null = null
  let showMapSelector = true
  let isLoadingMap = false

  // Model catalog (kept for potential future use)
  interface ModelCatalogItem {
    name: string
    path: string
    category: string
  }
  let modelCatalog: ModelCatalogItem[] = []

  // Game Configuration
  interface GameConfig {
    difficulty: 'easy' | 'normal' | 'hard'
    startingAmmo: number
    startingHealth: number
    enemyCount: number
    targetCount: number
    enemyDamage: number
    playerDamage: number
    enemySpeed: number
    enemyFireRate: number
  }

  let gameConfig: GameConfig = {
    difficulty: 'normal',
    startingAmmo: 30,
    startingHealth: 100,
    enemyCount: 5,
    targetCount: 10,
    enemyDamage: 10,
    playerDamage: 25,
    enemySpeed: 2.0,
    enemyFireRate: 2000
  }

  // Difficulty presets
  const difficultyPresets: Record<GameConfig['difficulty'], Partial<GameConfig>> = {
    easy: {
      startingAmmo: 50,
      startingHealth: 150,
      enemyCount: 3,
      enemyDamage: 5,
      playerDamage: 35,
      enemySpeed: 1.5,
      enemyFireRate: 3000
    },
    normal: {
      startingAmmo: 30,
      startingHealth: 100,
      enemyCount: 5,
      enemyDamage: 10,
      playerDamage: 25,
      enemySpeed: 2.0,
      enemyFireRate: 2000
    },
    hard: {
      startingAmmo: 20,
      startingHealth: 75,
      enemyCount: 8,
      enemyDamage: 15,
      playerDamage: 20,
      enemySpeed: 2.5,
      enemyFireRate: 1500
    }
  }

  function applyDifficultyPreset(difficulty: GameConfig['difficulty']) {
    gameConfig = { ...gameConfig, ...difficultyPresets[difficulty], difficulty }
  }

  // Game state using standard Svelte reactivity
  let isPlaying = false
  let hasStartedGame = false // Track if game has been started at least once
  let score = 0
  let level = 1
  let health = gameConfig.startingHealth
  let lastEscapeTime = 0 // Track ESC key presses
  let isBossLevel = false // Track if current level is a boss level
  let bossEnemy: Enemy | null = null // Reference to the boss enemy
  let bossHealth = 0 // Reactive boss health for HUD
  let bossMaxHealth = 0 // Reactive boss max health for HUD
  let sceneryObjects: THREE.Group[] = [] // Track generated scenery for cleanup
  let nextLevelScore = 1000 // Track when next level should trigger
  let showLevelComplete = false // Show level complete splash screen
  let isLoadingLevel = false // Track if we're loading a new level

  // Movement
  const moveSpeed = 2.0 // Doubled for faster movement
  const jumpSpeed = 16.0 // Increased to jump twice as high
  let velocity = new THREE.Vector3()
  let direction = new THREE.Vector3()
  let moveForward = false
  let moveBackward = false
  let moveLeft = false

  // Stuck detection
  let lastPosition = new THREE.Vector3()
  let stuckCheckTimer = 0
  let stuckCounter = 0
  const STUCK_CHECK_INTERVAL = 1000 // Check every second
  const STUCK_THRESHOLD = 0.1 // Min distance to consider movement
  const STUCK_COUNT_LIMIT = 2 // How many checks before unstuck
  let moveRight = false
  let canJump = false
  let isJumping = false

  // Power-ups
  interface PowerUp {
    mesh: THREE.Group
    type: 'health' | 'ammo' | 'flying' | 'weapon-missile' | 'weapon-grenade'
  }
  let powerUps: PowerUp[] = []

  // Power-up colors
  const powerUpColors = {
    health: 0xff0000,      // Red
    ammo: 0x00ff00,        // Green
    flying: 0x00ffff,      // Cyan
    'weapon-missile': 0xffff00,  // Yellow
    'weapon-grenade': 0xff6600   // Orange
  }

  // Active power-ups
  let activePowerUps: Set<string> = new Set()
  let flyingModeEndTime = 0
  let currentTime = Date.now() // For reactive countdown updates

  // Simplified power-up application - no inventory, instant effects
  function applyPowerUpEffect(type: PowerUp['type']) {
    switch (type) {
      case 'health':
        health = Math.min(health + 30, 100) // Cap at 100
        break
      case 'ammo':
        // Add ammo to current weapon (if it's not laser with infinite ammo)
        const currentWeapon = weaponInventory[currentWeaponIndex]
        if (currentWeapon.ammo !== -1) {
          // Current weapon uses ammo, add to it
          currentWeapon.ammo += 20
          weaponInventory = weaponInventory
        } else {
          // Current weapon has infinite ammo, add to a random weapon that uses ammo
          const weaponsWithAmmo = weaponInventory.filter(w => w.ammo !== -1)
          if (weaponsWithAmmo.length > 0) {
            const randomWeapon = weaponsWithAmmo[Math.floor(Math.random() * weaponsWithAmmo.length)]
            randomWeapon.ammo += 20
            weaponInventory = weaponInventory
          }
        }
        break
      case 'flying':
        activePowerUps.add('flying')
        flyingModeEndTime = Date.now() + 30000 // 30 seconds
        velocity.y = 10 // Launch 2/3 as high (was 15)
        break
      case 'weapon-missile':
        addWeaponToInventory('missile', 10, 'Missiles')
        break
      case 'weapon-grenade':
        addWeaponToInventory('grenade', 5, 'Grenades')
        break
    }
  }

  // Level progression - advance every 1000 points
  $: if (score >= nextLevelScore) {
    levelUp()
  }

  async function levelUp() {
    if (isLoadingLevel) return // Prevent multiple simultaneous level ups
    isLoadingLevel = true

    // Show level complete splash (before incrementing level so it shows correct number)
    showLevelComplete = true
    await new Promise(resolve => setTimeout(resolve, 2500)) // Show splash for 2.5 seconds
    showLevelComplete = false

    level++
    nextLevelScore = level * 1000 // Set next level threshold

    // Check if this is a boss level (every 3rd level)
    isBossLevel = (level % 3 === 0)

    // Clear EVERYTHING from the scene
    clearEnvironment()

    // Clear scenery objects array
    sceneryObjects.forEach(obj => scene.remove(obj))
    sceneryObjects = []
    bossEnemy = null
    bossHealth = 0
    bossMaxHealth = 0

    // Reset player position to ground level
    camera.position.y = 6.0 // Eye level height
    velocity.set(0, 0, 0)
    canJump = true

    // Increase difficulty
    gameConfig.enemyCount = Math.min(gameConfig.enemyCount + 2, 20)
    gameConfig.enemySpeed = gameConfig.enemySpeed * 1.05
    gameConfig.enemyFireRate = Math.max(gameConfig.enemyFireRate * 0.95, 800)
    gameConfig.targetCount = Math.min(gameConfig.targetCount + 2, 30)

    // Reward player with health
    health = Math.min(health + 50, 100) // Cap at 100

    // Add ground plane
    const groundGeometry = new THREE.PlaneGeometry(200, 200)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d5016,
      roughness: 0.8,
    })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // Generate new scenery for the level
    await generateLevelScenery()

    // Spawn enemies or boss
    if (isBossLevel) {
      // Boss level - spawn one boss
      spawnBoss()
    } else {
      // Normal level - spawn regular enemies
      const newEnemiesToSpawn = Math.min(gameConfig.enemyCount, 15)
      for (let i = 0; i < newEnemiesToSpawn; i++) {
        spawnNewEnemy()
      }
    }

    // Spawn more power-ups
    for (let i = 0; i < 3; i++) {
      spawnNewPowerUp()
    }

    isLoadingLevel = false
  }

  // Generate scenery for the level (simplified version of World Builder auto-generate)
  async function generateLevelScenery() {
    if (modelCatalog.length === 0) return

    // Categorize models (same as World Builder)
    const trees = modelCatalog.filter(m =>
      m.category === 'Nature' && (
        m.name.toLowerCase().includes('tree') ||
        m.name.toLowerCase().includes('pine') ||
        m.name.toLowerCase().includes('oak')
      )
    )
    const buildings = modelCatalog.filter(m =>
      m.category === 'Buildings' ||
      m.name.toLowerCase().includes('building') ||
      m.name.toLowerCase().includes('house') ||
      m.name.toLowerCase().includes('tower')
    )
    const vehicles = modelCatalog.filter(m =>
      m.category === 'Vehicles'
    )
    const other = modelCatalog.filter(m =>
      m.category === 'Decor' || m.category === 'Urban' || m.category === 'Props'
    )

    const loader = new GLTFLoader()

    // Helper to place model
    const placeModel = async (model: ModelCatalogItem, position: THREE.Vector3, baseScale: number) => {
      try {
        const gltf = await loader.loadAsync(model.path)
        const mesh = gltf.scene
        mesh.position.copy(position)
        mesh.rotation.y = Math.random() * Math.PI * 2

        // Calculate initial size
        const bbox = new THREE.Box3().setFromObject(mesh)
        const size = bbox.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)

        // Scale to reasonable size based on object type
        let targetSize = baseScale
        const category = categorizeModel(model.path)

        // Adjust scale based on model size to normalize proportions
        if (maxDim > 0) {
          const scaleFactor = targetSize / maxDim
          mesh.scale.setScalar(scaleFactor)
        } else {
          mesh.scale.setScalar(1)
        }

        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })

        scene.add(mesh)
        sceneryObjects.push(mesh)

        // Add to collision detection based on category
        if (category === 'solid') {
          solidObjects.push(mesh)
        } else {
          walkthroughObjects.push(mesh)
        }
      } catch (error) {
        console.error('Failed to load scenery model:', model.path, error)
      }
    }

    // Place trees (10-15) - target size 3-5 units tall
    const treeCount = 10 + Math.floor(Math.random() * 6)
    for (let i = 0; i < treeCount && trees.length > 0; i++) {
      const model = trees[Math.floor(Math.random() * trees.length)]
      const pos = new THREE.Vector3((Math.random() - 0.5) * 80, 0, (Math.random() - 0.5) * 80)
      await placeModel(model, pos, 3.5 + Math.random() * 1.5)
    }

    // Place buildings (3-5 in a loose circle) - target size 8-12 units
    const buildingCount = 3 + Math.floor(Math.random() * 3)
    for (let i = 0; i < buildingCount && buildings.length > 0; i++) {
      const model = buildings[Math.floor(Math.random() * buildings.length)]
      const angle = (i / buildingCount) * Math.PI * 2
      const radius = 30 + Math.random() * 20
      const pos = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
      await placeModel(model, pos, 10 + Math.random() * 2)
    }

    // Place vehicles (2-4) - target size 3-4 units
    const vehicleCount = 2 + Math.floor(Math.random() * 3)
    for (let i = 0; i < vehicleCount && vehicles.length > 0; i++) {
      const model = vehicles[Math.floor(Math.random() * vehicles.length)]
      const pos = new THREE.Vector3((Math.random() - 0.5) * 60, 0, (Math.random() - 0.5) * 60)
      await placeModel(model, pos, 3.5 + Math.random() * 0.5)
    }

    // Sprinkle other objects (5-10) - target size 1-3 units
    const otherCount = 5 + Math.floor(Math.random() * 6)
    for (let i = 0; i < otherCount && other.length > 0; i++) {
      const model = other[Math.floor(Math.random() * other.length)]
      const pos = new THREE.Vector3((Math.random() - 0.5) * 70, 0, (Math.random() - 0.5) * 70)
      await placeModel(model, pos, 2.0 + Math.random() * 1.0)
    }
  }

  // Spawn boss enemy
  function spawnBoss() {
    const mesh = createEnemyModel('boss')

    // Spawn boss in a dramatic location (center of map, elevated)
    mesh.position.set(0, 0, -40) // In front of player

    scene.add(mesh)

    const stats = getEnemyStats('boss')
    const boss: Enemy = {
      mesh,
      health: stats.health,
      maxHealth: stats.health,
      lastShot: Date.now(),
      velocity: new THREE.Vector3(),
      type: 'boss',
      speed: stats.speed,
      fireRate: stats.fireRate,
      damage: stats.damage
    }

    enemies.push(boss)
    bossEnemy = boss
    bossHealth = boss.health
    bossMaxHealth = boss.maxHealth
  }

  // Weapons and Projectiles
  type WeaponType = 'laser' | 'missile' | 'grenade'

  interface WeaponInventory {
    type: WeaponType
    ammo: number // -1 means infinite
    name: string
  }

  let weaponInventory: WeaponInventory[] = [
    { type: 'laser', ammo: -1, name: 'Laser Gun' } // Default weapon with infinite ammo
  ]
  let currentWeaponIndex = 0
  let currentWeapon: WeaponType = 'laser'
  let isGameOver = false

  interface Projectile {
    mesh: THREE.Mesh
    velocity: THREE.Vector3
    type: WeaponType
    target?: THREE.Object3D // For heat-seeking missiles
  }
  let projectiles: Projectile[] = []

  // Enemies
  type EnemyType = 'basic' | 'fast' | 'tank' | 'boss'

  interface Enemy {
    mesh: THREE.Object3D
    health: number
    maxHealth: number
    lastShot: number
    velocity: THREE.Vector3
    type: EnemyType
    speed: number
    fireRate: number
    damage: number
  }
  let enemies: Enemy[] = []
  let enemyBullets: Projectile[] = []

  // Collidable objects (trees, boxes, etc.)
  let collidableObjects: THREE.Mesh[] = []

  // Collision categories for better gameplay
  let solidObjects: THREE.Object3D[] = [] // Buildings, cars, walls - block player AND bullets
  let walkthroughObjects: THREE.Object3D[] = [] // Plants, trees, decorations - no collision

  // Raycaster for shooting
  let raycaster = new THREE.Raycaster()

  // Model categorization based on file path patterns
  function categorizeModel(modelPath: string): 'solid' | 'walkthrough' {
    const path = modelPath.toLowerCase()

    // Walkthrough objects (no collision) - plants, nature, small decorations
    const walkthroughPatterns = [
      'tree', 'plant', 'flower', 'bush', 'grass', 'foliage', 'leaf', 'leaves',
      'fern', 'vine', 'moss', 'mushroom', 'cactus', 'palm', 'pine', 'oak',
      'birch', 'willow', 'shrub', 'hedge', 'weed', 'bamboo', 'reed',
      'lantern', 'lamp', 'light', 'candle', 'torch', 'sign', 'flag',
      'debris', 'litter', 'particle', 'effect', 'decal', 'sticker',
      'roadlines', 'road-lines', 'road_lines', 'marking', 'stripe', 'painted', 'paint',
      'road-segment', 'road_segment', 'roadsegment', 'asphalt', 'pavement',
      'small-rock', 'pebble', 'stone-small', 'gravel'
    ]

    // Solid objects (full collision) - buildings, vehicles, large structures
    const solidPatterns = [
      'building', 'house', 'wall', 'fence', 'gate', 'door', 'barrier',
      'car', 'vehicle', 'truck', 'van', 'bus', 'trailer', 'tractor',
      'tank', 'jeep', 'wagon', 'cart', 'bike', 'motorcycle',
      'rock', 'boulder', 'stone', 'cliff', 'mountain',
      'crate', 'box', 'barrel', 'container', 'chest', 'bin',
      'bench', 'table', 'chair', 'furniture',
      'tower', 'bunker', 'shelter', 'shed', 'garage', 'barn',
      'post', 'pole', 'pillar', 'column', 'statue'
    ]

    // Check walkthrough patterns first
    for (const pattern of walkthroughPatterns) {
      if (path.includes(pattern)) {
        return 'walkthrough'
      }
    }

    // Check solid patterns
    for (const pattern of solidPatterns) {
      if (path.includes(pattern)) {
        return 'solid'
      }
    }

    // Default: small objects are walkthrough, large objects need volume check
    return 'solid' // Conservative default - will be filtered by volume
  }

  // Audio context for sound effects
  let audioContext: AudioContext | null = null

  onMount(() => {
    // Load available maps from World Builder
    loadAvailableMaps()

    initScene()
    animate()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
      if (renderer) {
        renderer.dispose()
      }
    }
  })

  async function loadAvailableMaps() {
    const stored = localStorage.getItem('worldBuilder_maps')
    if (stored) {
      try {
        availableMaps = JSON.parse(stored)
      } catch (e) {
        console.error('Failed to load maps:', e)
        availableMaps = []
      }
    }

    // Load model catalog for random map generation
    try {
      const response = await fetch('/modelCatalog.json')
      modelCatalog = await response.json()
    } catch (e) {
      console.error('Failed to load model catalog:', e)
    }
  }

  function resetGameState() {
    score = 0
    level = 1
    health = gameConfig.startingHealth
    nextLevelScore = 1000
    isBossLevel = false
    bossEnemy = null
    bossHealth = 0
    bossMaxHealth = 0
  }

  function findValidSpawnPosition(): THREE.Vector3 | null {
    // Test spawn positions in a grid pattern
    const testPositions = [
      new THREE.Vector3(0, 6, 0), // Center (default)
      new THREE.Vector3(10, 6, 10),
      new THREE.Vector3(-10, 6, 10),
      new THREE.Vector3(10, 6, -10),
      new THREE.Vector3(-10, 6, -10),
      new THREE.Vector3(15, 6, 0),
      new THREE.Vector3(-15, 6, 0),
      new THREE.Vector3(0, 6, 15),
      new THREE.Vector3(0, 6, -15),
      new THREE.Vector3(20, 6, 0),
      new THREE.Vector3(-20, 6, 0),
    ]

    const raycaster = new THREE.Raycaster()
    const downVector = new THREE.Vector3(0, -1, 0)

    for (const testPos of testPositions) {
      // Check if there's a clear space here by raycasting down and in all directions
      let isValid = true

      // Cast rays in multiple directions to check for obstacles
      const directions = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, -1),
      ]

      for (const dir of directions) {
        raycaster.set(testPos, dir)
        const intersects = raycaster.intersectObjects(scene.children, true)
        // If there's an obstacle within 2 units, position is invalid
        if (intersects.length > 0 && intersects[0].distance < 2) {
          isValid = false
          break
        }
      }

      if (isValid) {
        return testPos
      }
    }

    // If no valid position found, return null (will use default)
    return null
  }

  async function selectMapAndStart(map: MapData) {
    selectedMap = map
    showMapSelector = false
    isLoadingMap = true
    // isPlaying will be set by onLock event when controls.lock() succeeds

    // Reset game state
    resetGameState()

    // Clear existing environment if any
    clearEnvironment()

    // Load the selected map
    await loadMapEnvironment(map)

    // Load additional game elements
    spawnPowerUps()
    spawnEnemies()

    // Wait a bit for objects to settle in physics
    await new Promise(resolve => setTimeout(resolve, 500))

    // Find a valid spawn position
    const validSpawnPos = findValidSpawnPosition()
    if (validSpawnPos) {
      camera.position.copy(validSpawnPos)
    }

    isLoadingMap = false

    // Auto-start the game - onLock event will set isPlaying = true
    controls.lock()
  }

  async function startWithDefaultMap() {
    showMapSelector = false
    isLoadingMap = true
    // isPlaying will be set by onLock event when controls.lock() succeeds

    // Reset game state
    resetGameState()

    // Try to load the default map from JSON
    try {
      const response = await fetch('/3d-maps/default_map.json')
      const defaultMap: MapData = await response.json()
      selectedMap = defaultMap

      // Clear existing environment
      clearEnvironment()

      // Load the default map
      await loadMapEnvironment(defaultMap)
    } catch (error) {
      console.error('Failed to load default map, using basic environment:', error)
      selectedMap = null
      // Fall back to original environment
      createEnvironment()
    }

    spawnPowerUps()
    spawnEnemies()

    // Wait a bit for objects to settle in physics
    await new Promise(resolve => setTimeout(resolve, 500))

    // Find a valid spawn position
    const validSpawnPos = findValidSpawnPosition()
    if (validSpawnPos) {
      camera.position.copy(validSpawnPos)
    }

    isLoadingMap = false

    // Auto-start the game - onLock event will set isPlaying = true
    controls.lock()
  }

  // Random map generation removed - use World Builder instead

  async function generateRandomMap_REMOVED(): Promise<MapData> {
    mapGenerationProgress = 10

    // Select random environment settings
    const timeOfDayOptions: Array<'dawn' | 'day' | 'sunset' | 'night'> = ['dawn', 'day', 'sunset', 'night']
    const weatherOptions: Array<'clear' | 'rain' | 'snow' | 'fog'> = ['clear', 'clear', 'clear', 'rain', 'fog'] // More clear weather
    const timeOfDay = timeOfDayOptions[Math.floor(Math.random() * timeOfDayOptions.length)]
    const weather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)]

    mapGenerationProgress = 20

    // Filter models by category for strategic placement
    const buildings = modelCatalog.filter(m => m.category === 'Buildings')
    const vehicles = modelCatalog.filter(m => m.category === 'Vehicles')
    const nature = modelCatalog.filter(m => m.category === 'Nature')
    const urban = modelCatalog.filter(m => m.category === 'Urban')
    const decor = modelCatalog.filter(m => m.category === 'Decor')

    mapGenerationProgress = 30

    const objects: MapData['objects'] = []

    // Place buildings (5-10) - strategic cover points
    const buildingCount = Math.floor(Math.random() * 6) + 5
    for (let i = 0; i < buildingCount; i++) {
      const building = buildings[Math.floor(Math.random() * buildings.length)]
      if (building) {
        objects.push({
          modelPath: building.path,
          position: {
            x: (Math.random() - 0.5) * 80,
            y: 0,
            z: (Math.random() - 0.5) * 80
          },
          rotation: {
            x: 0,
            y: Math.random() * Math.PI * 2,
            z: 0
          },
          scale: {
            x: 0.8 + Math.random() * 0.4,
            y: 0.8 + Math.random() * 0.4,
            z: 0.8 + Math.random() * 0.4
          }
        })
      }
    }

    mapGenerationProgress = 40

    // Place vehicles (8-15) - solid obstacles
    const vehicleCount = Math.floor(Math.random() * 8) + 8
    for (let i = 0; i < vehicleCount; i++) {
      const vehicle = vehicles[Math.floor(Math.random() * vehicles.length)]
      if (vehicle) {
        objects.push({
          modelPath: vehicle.path,
          position: {
            x: (Math.random() - 0.5) * 90,
            y: 0,
            z: (Math.random() - 0.5) * 90
          },
          rotation: {
            x: 0,
            y: Math.random() * Math.PI * 2,
            z: 0
          },
          scale: { x: 1, y: 1, z: 1 }
        })
      }
    }

    mapGenerationProgress = 60

    // Place nature elements (30-50) - trees, rocks, plants for atmosphere
    const natureCount = Math.floor(Math.random() * 21) + 30
    for (let i = 0; i < natureCount; i++) {
      const item = nature[Math.floor(Math.random() * nature.length)]
      if (item) {
        objects.push({
          modelPath: item.path,
          position: {
            x: (Math.random() - 0.5) * 100,
            y: 0,
            z: (Math.random() - 0.5) * 100
          },
          rotation: {
            x: 0,
            y: Math.random() * Math.PI * 2,
            z: 0
          },
          scale: {
            x: 0.7 + Math.random() * 0.6,
            y: 0.7 + Math.random() * 0.6,
            z: 0.7 + Math.random() * 0.6
          }
        })
      }
    }

    mapGenerationProgress = 75

    // Place urban elements (5-10) - signs, lights, etc.
    const urbanCount = Math.floor(Math.random() * 6) + 5
    for (let i = 0; i < urbanCount; i++) {
      const item = urban[Math.floor(Math.random() * urban.length)]
      if (item) {
        objects.push({
          modelPath: item.path,
          position: {
            x: (Math.random() - 0.5) * 80,
            y: 0,
            z: (Math.random() - 0.5) * 80
          },
          rotation: {
            x: 0,
            y: Math.random() * Math.PI * 2,
            z: 0
          },
          scale: { x: 1, y: 1, z: 1 }
        })
      }
    }

    mapGenerationProgress = 85

    // Place decor elements (10-20) - small details
    const decorCount = Math.floor(Math.random() * 11) + 10
    for (let i = 0; i < decorCount; i++) {
      const item = decor[Math.floor(Math.random() * decor.length)]
      if (item) {
        objects.push({
          modelPath: item.path,
          position: {
            x: (Math.random() - 0.5) * 85,
            y: 0,
            z: (Math.random() - 0.5) * 85
          },
          rotation: {
            x: 0,
            y: Math.random() * Math.PI * 2,
            z: 0
          },
          scale: { x: 1, y: 1, z: 1 }
        })
      }
    }

    mapGenerationProgress = 95

    const randomMap: MapData = {
      id: 'random_' + Date.now(),
      name: `Random Map - ${timeOfDay.toUpperCase()}`,
      description: 'Procedurally generated battle arena',
      created: Date.now(),
      modified: Date.now(),
      thumbnail: '',
      environment: {
        timeOfDay,
        weather,
        fogDensity: weather === 'fog' ? 0.02 : 0.005
      },
      objects,
      stats: {
        objectCount: objects.length,
        polygonCount: objects.length * 500 // Estimate
      }
    }

    mapGenerationProgress = 100

    return randomMap
  }

  function findSafeSpawnPosition(): THREE.Vector3 {
    console.log('Finding safe spawn position. Solid objects:', solidObjects.length)

    // If no solid objects yet, spawn at center
    if (solidObjects.length === 0) {
      console.log('No solid objects, spawning at center')
      return new THREE.Vector3(0, 3.0, 0)
    }

    // Try to find a spawn position away from solid objects only
    const minDistance = 12 // Minimum horizontal distance from any solid object
    const maxAttempts = 100

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Generate a random position in a larger area
      const x = (Math.random() - 0.5) * 100
      const z = (Math.random() - 0.5) * 100
      const testPos = new THREE.Vector3(x, 3.0, z)

      // Check HORIZONTAL distance to solid objects only (ignore Y component)
      let isSafe = true
      for (const obj of solidObjects) {
        // Calculate horizontal distance only (x, z plane)
        const dx = testPos.x - obj.position.x
        const dz = testPos.z - obj.position.z
        const horizontalDistance = Math.sqrt(dx * dx + dz * dz)

        if (horizontalDistance < minDistance) {
          isSafe = false
          break
        }
      }

      if (isSafe) {
        console.log('Found safe spawn at:', x, z, 'after', attempt, 'attempts')
        return testPos
      }
    }

    // If no safe position found, try the corners with horizontal distance check
    const corners = [
      new THREE.Vector3(45, 3.0, 45),
      new THREE.Vector3(-45, 3.0, 45),
      new THREE.Vector3(45, 3.0, -45),
      new THREE.Vector3(-45, 3.0, -45),
    ]

    for (const corner of corners) {
      let isSafe = true
      for (const obj of solidObjects) {
        const dx = corner.x - obj.position.x
        const dz = corner.z - obj.position.z
        const horizontalDistance = Math.sqrt(dx * dx + dz * dz)

        if (horizontalDistance < minDistance) {
          isSafe = false
          break
        }
      }
      if (isSafe) {
        console.log('Spawning at safe corner')
        return corner
      }
    }

    console.warn('No safe spawn found, using default position')
    return new THREE.Vector3(0, 3.0, 0)
  }

  function clearEnvironment() {
    console.log('Clearing environment...')

    // Remove all existing collidable objects
    collidableObjects.forEach(obj => scene.remove(obj))
    collidableObjects = []

    // Clear categorized objects
    solidObjects.forEach(obj => scene.remove(obj))
    solidObjects = []
    walkthroughObjects.forEach(obj => scene.remove(obj))
    walkthroughObjects = []

    // Clear enemies
    enemies.forEach(enemy => scene.remove(enemy.mesh))
    enemies = []

    // Clear power-ups
    powerUps.forEach(powerUp => scene.remove(powerUp.mesh))
    powerUps = []

    // Clear projectiles
    projectiles.forEach(proj => scene.remove(proj.mesh))
    projectiles = []

    // Clear enemy bullets
    enemyBullets.forEach(bullet => scene.remove(bullet.mesh))
    enemyBullets = []

    // Remove ground if it exists
    const existingGround = scene.children.find(child =>
      child instanceof THREE.Mesh &&
      child.geometry instanceof THREE.PlaneGeometry
    )
    if (existingGround) {
      scene.remove(existingGround)
    }

    // Reset collision debug count
    collisionDebugCount = 0

    console.log('Environment cleared')
  }

  async function loadMapEnvironment(map: MapData) {
    // Apply environment settings
    updateEnvironmentFromMap(map.environment)

    // Reset velocity and movement state
    velocity.set(0, 0, 0)
    canJump = true
    isJumping = false
    moveForward = false
    moveBackward = false
    moveLeft = false
    moveRight = false

    // Add ground
    const groundGeometry = new THREE.PlaneGeometry(200, 200)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d5016,
      roughness: 0.8,
    })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // Load map objects
    const loader = new GLTFLoader()
    for (const objData of map.objects) {
      try {
        const gltf = await loader.loadAsync(objData.modelPath)
        const newObject = gltf.scene
        newObject.position.set(objData.position.x, objData.position.y, objData.position.z)
        newObject.rotation.set(objData.rotation.x, objData.rotation.y, objData.rotation.z)
        newObject.scale.set(objData.scale.x, objData.scale.y, objData.scale.z)

        newObject.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })

        scene.add(newObject)

        // Categorize object based on model path
        const category = categorizeModel(objData.modelPath)
        const size = new THREE.Box3().setFromObject(newObject).getSize(new THREE.Vector3())
        const volume = size.x * size.y * size.z

        if (category === 'walkthrough') {
          // Walkthrough objects - no collision
          walkthroughObjects.push(newObject)
        } else if (category === 'solid' && volume > 0.5) {
          // Solid objects - only add if reasonably sized (volume > 0.5)
          solidObjects.push(newObject)
          collidableObjects.push(newObject as any) // Keep for backward compatibility
        } else if (volume > 5) {
          // Unknown large objects default to solid
          solidObjects.push(newObject)
          collidableObjects.push(newObject as any)
        } else {
          // Small unknown objects are walkthrough
          walkthroughObjects.push(newObject)
        }
      } catch (error) {
        console.error("Failed to load map object:", error)
      }
    }

    console.log('Map loaded:', {
      totalObjects: map.objects.length,
      solidObjects: solidObjects.length,
      walkthroughObjects: walkthroughObjects.length
    })

    // After all objects are loaded, find a safe spawn position
    const safeSpawn = findSafeSpawnPosition()
    camera.position.copy(safeSpawn)
  }

  function updateEnvironmentFromMap(environment: MapData['environment']) {
    const skyGradients = {
      dawn: {
        colors: ['#1a1a3e', '#6B4E71', '#D4738F', '#FFB56A'],
        fogColor: 0xFFB56A,
        ambientIntensity: 0.5,
        directionalIntensity: 0.7
      },
      day: {
        colors: ['#87CEEB', '#87CEEB', '#B0E0E6', '#F0F8FF'],
        fogColor: 0xB0E0E6,
        ambientIntensity: 0.7,
        directionalIntensity: 1.0
      },
      sunset: {
        colors: ['#1a1a3e', '#6B4E71', '#D4738F', '#FF9A56'],
        fogColor: 0xff9a56,
        ambientIntensity: 0.6,
        directionalIntensity: 0.8
      },
      night: {
        colors: ['#000033', '#000033', '#1a1a3e', '#2d2d5e'],
        fogColor: 0x1a1a3e,
        ambientIntensity: 0.3,
        directionalIntensity: 0.4
      }
    }

    const gradient = skyGradients[environment.timeOfDay]

    // Create sky gradient
    const canvas = document.createElement("canvas")
    canvas.width = 512
    canvas.height = 512
    const context = canvas.getContext("2d")!
    const canvasGradient = context.createLinearGradient(0, 0, 0, canvas.height)
    canvasGradient.addColorStop(0, gradient.colors[0])
    canvasGradient.addColorStop(0.4, gradient.colors[1])
    canvasGradient.addColorStop(0.7, gradient.colors[2])
    canvasGradient.addColorStop(1, gradient.colors[3])
    context.fillStyle = canvasGradient
    context.fillRect(0, 0, canvas.width, canvas.height)

    const texture = new THREE.CanvasTexture(canvas)
    scene.background = texture

    // Update fog based on weather
    let fogDensity = environment.weather === 'fog' ? 100 : 200
    if (environment.weather === 'rain') fogDensity = 150
    if (environment.weather === 'snow') fogDensity = 120

    scene.fog = new THREE.Fog(gradient.fogColor, 20, fogDensity)

    // Update lighting
    const ambientLight = scene.children.find(child => child instanceof THREE.AmbientLight) as THREE.AmbientLight
    const directionalLight = scene.children.find(child => child instanceof THREE.DirectionalLight) as THREE.DirectionalLight

    if (ambientLight) {
      ambientLight.intensity = gradient.ambientIntensity
    }
    if (directionalLight) {
      directionalLight.intensity = gradient.directionalIntensity
    }
  }

  function initScene() {
    // Scene with sunset gradient sky
    scene = new THREE.Scene()

    // Create sunset gradient (orange to purple to dark blue)
    const canvas = document.createElement("canvas")
    canvas.width = 512
    canvas.height = 512
    const context = canvas.getContext("2d")!
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, "#1a1a3e") // Dark blue top
    gradient.addColorStop(0.4, "#6B4E71") // Purple
    gradient.addColorStop(0.7, "#D4738F") // Pink
    gradient.addColorStop(1, "#FF9A56") // Orange bottom
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)

    const texture = new THREE.CanvasTexture(canvas)
    scene.background = texture
    scene.fog = new THREE.Fog(0xff9a56, 20, 100)

    // Camera
    camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    )
    camera.position.set(0, 6.0, 0)

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)

    // Controls
    controls = new PointerLockControls(camera, renderer.domElement)

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(50, 50, 50)
    directionalLight.castShadow = true
    directionalLight.shadow.camera.left = -50
    directionalLight.shadow.camera.right = 50
    directionalLight.shadow.camera.top = 50
    directionalLight.shadow.camera.bottom = -50
    scene.add(directionalLight)

    // Handle window resize
    window.addEventListener("resize", onWindowResize)
  }

  function createEnvironment() {
    // Ground - darker green for sunset atmosphere
    const groundGeometry = new THREE.PlaneGeometry(100, 100)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a5c1a,
      roughness: 0.8,
    })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // Add trees (decorative only, no collision)
    for (let i = 0; i < 30; i++) {
      const tree = createTree()
      tree.position.x = (Math.random() - 0.5) * 80
      tree.position.z = (Math.random() - 0.5) * 80

      // Make sure trees don't spawn too close to player
      if (tree.position.distanceTo(new THREE.Vector3(0, 0, 0)) < 8) {
        continue
      }

      scene.add(tree)
      walkthroughObjects.push(tree) // Trees are walkthrough
    }

    // Add some obstacles/buildings (solid collision)
    const boxMaterial = new THREE.MeshStandardMaterial({ color: 0x8b4513 })

    for (let i = 0; i < 15; i++) {
      const width = Math.random() * 3 + 1
      const height = Math.random() * 5 + 2
      const depth = Math.random() * 3 + 1

      const boxGeometry = new THREE.BoxGeometry(width, height, depth)
      const box = new THREE.Mesh(boxGeometry, boxMaterial)

      box.position.x = (Math.random() - 0.5) * 80
      box.position.y = height / 2
      box.position.z = (Math.random() - 0.5) * 80

      // Make sure boxes don't spawn too close to player
      if (box.position.distanceTo(new THREE.Vector3(0, 0, 0)) < 8) {
        continue
      }

      box.castShadow = true
      box.receiveShadow = true
      scene.add(box)
      solidObjects.push(box) // Boxes are solid
      collidableObjects.push(box) // Keep for backward compatibility
    }

    // After all objects are created, find a safe spawn position
    const safeSpawn = findSafeSpawnPosition()
    camera.position.copy(safeSpawn)
  }

  function createTree() {
    const tree = new THREE.Group()

    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 4, 8)
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a2511 })
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial)
    trunk.position.y = 2
    trunk.castShadow = true
    trunk.receiveShadow = true
    tree.add(trunk)

    // Foliage (3 layers of cones)
    const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x1e5c1e })

    const foliage1 = new THREE.Mesh(
      new THREE.ConeGeometry(1.5, 2.5, 8),
      foliageMaterial,
    )
    foliage1.position.y = 4.5
    foliage1.castShadow = true
    tree.add(foliage1)

    const foliage2 = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 2, 8),
      foliageMaterial,
    )
    foliage2.position.y = 5.8
    foliage2.castShadow = true
    tree.add(foliage2)

    const foliage3 = new THREE.Mesh(
      new THREE.ConeGeometry(0.8, 1.5, 8),
      foliageMaterial,
    )
    foliage3.position.y = 6.8
    foliage3.castShadow = true
    tree.add(foliage3)

    return tree
  }

  function createPowerUpMesh(type: PowerUp['type']): THREE.Group {
    // Get color for this power-up type
    const orbColor = powerUpColors[type]
    const group = new THREE.Group()

    // Create different 3D shapes based on power-up type
    let mainMesh: THREE.Mesh

    switch (type) {
      case 'health': {
        // Red cross/plus symbol
        const horizontal = new THREE.BoxGeometry(1.2, 0.3, 0.3)
        const vertical = new THREE.BoxGeometry(0.3, 1.2, 0.3)
        const material = new THREE.MeshStandardMaterial({
          color: orbColor,
          emissive: orbColor,
          emissiveIntensity: 0.9,
          metalness: 0.3,
          roughness: 0.4
        })
        const h = new THREE.Mesh(horizontal, material)
        const v = new THREE.Mesh(vertical, material)
        group.add(h, v)
        mainMesh = h
        break
      }
      case 'ammo': {
        // Green box/crate
        const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8)
        const material = new THREE.MeshStandardMaterial({
          color: orbColor,
          emissive: orbColor,
          emissiveIntensity: 0.7,
          metalness: 0.5,
          roughness: 0.3
        })
        mainMesh = new THREE.Mesh(geometry, material)
        group.add(mainMesh)
        break
      }
      case 'flying': {
        // Cyan jetpack/wings
        const body = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8)
        const wing = new THREE.BoxGeometry(0.4, 0.15, 0.6)
        const material = new THREE.MeshStandardMaterial({
          color: orbColor,
          emissive: orbColor,
          emissiveIntensity: 1.0,
          metalness: 0.8,
          roughness: 0.2
        })
        mainMesh = new THREE.Mesh(body, material)
        const leftWing = new THREE.Mesh(wing, material)
        const rightWing = new THREE.Mesh(wing, material)
        leftWing.position.x = -0.5
        rightWing.position.x = 0.5
        group.add(mainMesh, leftWing, rightWing)
        break
      }
      case 'weapon-missile': {
        // Yellow missile/rocket
        const cone = new THREE.ConeGeometry(0.3, 1.2, 8)
        const material = new THREE.MeshStandardMaterial({
          color: orbColor,
          emissive: orbColor,
          emissiveIntensity: 0.8,
          metalness: 0.7,
          roughness: 0.2
        })
        mainMesh = new THREE.Mesh(cone, material)
        mainMesh.rotation.x = Math.PI / 2
        group.add(mainMesh)
        break
      }
      case 'weapon-grenade': {
        // Orange grenade
        const sphere = new THREE.SphereGeometry(0.5, 16, 16)
        const material = new THREE.MeshStandardMaterial({
          color: orbColor,
          emissive: orbColor,
          emissiveIntensity: 0.7,
          metalness: 0.6,
          roughness: 0.4
        })
        mainMesh = new THREE.Mesh(sphere, material)
        // Add pin/handle
        const pin = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8)
        const pinMesh = new THREE.Mesh(pin, material)
        pinMesh.position.y = 0.7
        group.add(mainMesh, pinMesh)
        break
      }
      default:
        mainMesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.8, 32, 32),
          new THREE.MeshStandardMaterial({ color: orbColor })
        )
        group.add(mainMesh)
    }

    // Add outer glow ring
    const ringGeometry = new THREE.TorusGeometry(1.0, 0.1, 8, 32)
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: orbColor,
      transparent: true,
      opacity: 0.4
    })
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.rotation.x = Math.PI / 2
    group.add(ring)

    // Make sure mesh is visible for raycasting
    group.userData.isPowerUp = true
    group.userData.powerUpType = type

    return group
  }

  function spawnPowerUps() {
    const types: PowerUp['type'][] = ['health', 'ammo', 'flying', 'weapon-missile', 'weapon-grenade']

    for (let i = 0; i < gameConfig.targetCount; i++) {
      const type = types[Math.floor(Math.random() * types.length)]
      const mesh = createPowerUpMesh(type)

      mesh.position.x = (Math.random() - 0.5) * 60
      mesh.position.y = 4.5 // Chest level for easy collection (player eye level is 6.0)
      mesh.position.z = (Math.random() - 0.5) * 60

      // Make sure power-ups don't spawn too close to player (minimum 10 units away)
      if (mesh.position.distanceTo(new THREE.Vector3(0, 3, 0)) < 10) {
        i--
        continue
      }

      scene.add(mesh)

      const powerUp: PowerUp = {
        mesh,
        type
      }

      powerUps.push(powerUp)
    }
  }

  function startGame() {
    controls.lock()
  }

  function onWindowResize() {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }

  function handleKeyUp(event: KeyboardEvent) {
    switch (event.code) {
      case "KeyW":
        moveForward = false
        break
      case "KeyA":
        moveLeft = false
        break
      case "KeyS":
        moveBackward = false
        break
      case "KeyD":
        moveRight = false
        break
    }
  }

  // Sound effect generators
  function playShootSound() {
    if (!audioContext) {
      audioContext = new AudioContext()
    }

    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(
      200,
      audioContext.currentTime + 0.1,
    )

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.1,
    )

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.1)
  }

  function playExplosionSound() {
    if (!audioContext) {
      audioContext = new AudioContext()
    }

    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    const noiseBuffer = audioContext.createBuffer(
      1,
      audioContext.sampleRate * 0.5,
      audioContext.sampleRate,
    )
    const noiseData = noiseBuffer.getChannelData(0)
    for (let i = 0; i < noiseBuffer.length; i++) {
      noiseData[i] = Math.random() * 2 - 1
    }
    const noiseSource = audioContext.createBufferSource()
    noiseSource.buffer = noiseBuffer

    oscillator.type = "sawtooth"
    oscillator.frequency.setValueAtTime(200, audioContext.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(
      50,
      audioContext.currentTime + 0.3,
    )

    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.3,
    )

    oscillator.connect(gainNode)
    noiseSource.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.start(audioContext.currentTime)
    noiseSource.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.3)
    noiseSource.stop(audioContext.currentTime + 0.3)
  }

  function handleMouseDown() {
    if (!controls.isLocked) return

    // Shoot - ammo is managed per-weapon in weaponInventory
    shoot()
  }

  function shoot() {
    // Check if weapon has ammo (laser has infinite ammo = -1)
    const currentWeaponData = weaponInventory[currentWeaponIndex]
    if (currentWeaponData.ammo === 0) {
      // Out of ammo, switch to laser
      currentWeaponIndex = 0
      currentWeapon = 'laser'
      return
    }

    // Deduct ammo (unless infinite)
    if (currentWeaponData.ammo > 0) {
      currentWeaponData.ammo--
      weaponInventory = weaponInventory // Trigger reactivity
    }

    // Play shoot sound
    playShootSound()

    let projectileMesh: THREE.Mesh
    let speed = 50
    let target: THREE.Object3D | undefined = undefined

    if (currentWeapon === 'laser') {
      // Create laser bolt projectile
      const boltGeometry = new THREE.SphereGeometry(0.1, 8, 8)
      const boltMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 1,
      })
      projectileMesh = new THREE.Mesh(boltGeometry, boltMaterial)

      // Add glow effect
      const glowGeometry = new THREE.SphereGeometry(0.15, 8, 8)
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.3,
      })
      const glow = new THREE.Mesh(glowGeometry, glowMaterial)
      projectileMesh.add(glow)
    } else if (currentWeapon === 'missile') {
      // Create heat-seeking missile
      const missileGeometry = new THREE.ConeGeometry(0.15, 0.6, 8)
      const missileMaterial = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff3300,
        emissiveIntensity: 0.8,
      })
      projectileMesh = new THREE.Mesh(missileGeometry, missileMaterial)
      projectileMesh.rotation.x = -Math.PI / 2 // Point forward

      // Find closest enemy as target
      let closestDist = Infinity
      enemies.forEach(enemy => {
        const dist = camera.position.distanceTo(enemy.mesh.position)
        if (dist < closestDist && dist < 60) {
          closestDist = dist
          target = enemy.mesh
        }
      })

      speed = 35
    } else if (currentWeapon === 'grenade') {
      // Create grenade
      const grenadeGeometry = new THREE.SphereGeometry(0.2, 8, 8)
      const grenadeMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        emissive: 0xff0000,
        emissiveIntensity: 0.3,
      })
      projectileMesh = new THREE.Mesh(grenadeGeometry, grenadeMaterial)
      speed = 30
    } else {
      return // Unknown weapon type
    }

    // Position at camera
    projectileMesh.position.copy(camera.position)

    // Calculate velocity direction from camera
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    const velocity = direction.multiplyScalar(speed)

    scene.add(projectileMesh)
    projectiles.push({ mesh: projectileMesh, velocity, type: currentWeapon, target })
  }

  function createExplosion(position: THREE.Vector3) {
    // Play explosion sound
    playExplosionSound()

    // Create explosion particles
    const particleCount = 20
    const particles: THREE.Mesh[] = []

    for (let i = 0; i < particleCount; i++) {
      const particleGeometry = new THREE.SphereGeometry(0.1, 4, 4)
      const particleMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(Math.random() * 0.2, 1, 0.5),
      })
      const particle = new THREE.Mesh(particleGeometry, particleMaterial)

      particle.position.copy(position)
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 5,
      )

      scene.add(particle)

      // Animate and remove particle
      const startTime = Date.now()
      const animateParticle = () => {
        const elapsed = Date.now() - startTime
        if (elapsed > 500) {
          scene.remove(particle)
          return
        }

        particle.position.add(velocity.clone().multiplyScalar(0.05))
        particle.scale.multiplyScalar(0.95)
        requestAnimationFrame(animateParticle)
      }
      animateParticle()
    }

    // Create expanding shockwave
    const shockwaveGeometry = new THREE.SphereGeometry(0.2, 16, 16)
    const shockwaveMaterial = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.8,
    })
    const shockwave = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial)
    shockwave.position.copy(position)
    scene.add(shockwave)

    // Animate shockwave
    const shockwaveStart = Date.now()
    const animateShockwave = () => {
      const elapsed = Date.now() - shockwaveStart
      if (elapsed > 300) {
        scene.remove(shockwave)
        return
      }

      const progress = elapsed / 300
      shockwave.scale.setScalar(1 + progress * 3)
      shockwaveMaterial.opacity = 0.8 * (1 - progress)
      requestAnimationFrame(animateShockwave)
    }
    animateShockwave()
  }

  function spawnNewPowerUp() {
    const types: PowerUp['type'][] = ['health', 'ammo', 'flying', 'weapon-missile', 'weapon-grenade']
    const type = types[Math.floor(Math.random() * types.length)]
    const mesh = createPowerUpMesh(type)

    mesh.position.x = (Math.random() - 0.5) * 60
    mesh.position.y = 4.5 // Chest level for easy collection (player eye level is 6.0)
    mesh.position.z = (Math.random() - 0.5) * 60

    scene.add(mesh)

    const powerUp: PowerUp = {
      mesh,
      type
    }

    powerUps.push(powerUp)
  }

  function createEnemyModel(type: EnemyType = 'basic') {
    const enemyGroup = new THREE.Group()

    if (type === 'basic') {
      // Body - octahedron (diamond shape) - RED
      const bodyGeometry = new THREE.OctahedronGeometry(0.8, 0)
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.5,
        metalness: 0.3,
        roughness: 0.7,
      })
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
      body.position.y = 1
      body.castShadow = true
      enemyGroup.add(body)

      // Core - glowing sphere in center
      const coreGeometry = new THREE.SphereGeometry(0.3, 16, 16)
      const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00,
        emissive: 0xffff00,
        emissiveIntensity: 1,
      })
      const core = new THREE.Mesh(coreGeometry, coreMaterial)
      core.position.y = 1
      enemyGroup.add(core)

      // Orbiting rings
      const ringGeometry = new THREE.TorusGeometry(0.6, 0.08, 8, 16)
      const ringMaterial = new THREE.MeshStandardMaterial({
        color: 0xff3300,
        emissive: 0xff3300,
        emissiveIntensity: 0.3,
      })

      const ring1 = new THREE.Mesh(ringGeometry, ringMaterial)
      ring1.position.y = 1
      ring1.rotation.x = Math.PI / 2
      ring1.castShadow = true
      enemyGroup.add(ring1)

      const ring2 = new THREE.Mesh(ringGeometry, ringMaterial.clone())
      ring2.position.y = 1
      ring2.rotation.z = Math.PI / 2
      ring2.castShadow = true
      enemyGroup.add(ring2)
    } else if (type === 'fast') {
      // Fast enemy - smaller, sleeker, CYAN/BLUE
      const bodyGeometry = new THREE.ConeGeometry(0.5, 1.2, 8)
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x0088ff,
        emissiveIntensity: 0.7,
        metalness: 0.8,
        roughness: 0.2,
      })
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
      body.position.y = 1
      body.rotation.y = Math.PI / 4
      body.castShadow = true
      enemyGroup.add(body)

      // Spikes for speed indication
      for (let i = 0; i < 4; i++) {
        const spikeGeometry = new THREE.ConeGeometry(0.1, 0.5, 4)
        const spikeMaterial = new THREE.MeshStandardMaterial({
          color: 0x0088ff,
          emissive: 0x0044ff,
          emissiveIntensity: 0.5,
        })
        const spike = new THREE.Mesh(spikeGeometry, spikeMaterial)
        const angle = (i / 4) * Math.PI * 2
        spike.position.x = Math.cos(angle) * 0.4
        spike.position.z = Math.sin(angle) * 0.4
        spike.position.y = 0.8
        spike.rotation.z = Math.PI / 2
        spike.rotation.y = angle
        enemyGroup.add(spike)
      }
    } else if (type === 'tank') {
      // Tank enemy - larger, bulkier, DARK ORANGE/BROWN
      const bodyGeometry = new THREE.BoxGeometry(1.5, 1.5, 1.5)
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x884400,
        emissive: 0x441100,
        emissiveIntensity: 0.4,
        metalness: 0.6,
        roughness: 0.9,
      })
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
      body.position.y = 1.2
      body.castShadow = true
      enemyGroup.add(body)

      // Armor plates
      const armorGeometry = new THREE.BoxGeometry(1.7, 0.3, 1.7)
      const armorMaterial = new THREE.MeshStandardMaterial({
        color: 0x553300,
        emissive: 0x221100,
        emissiveIntensity: 0.3,
      })
      const armorTop = new THREE.Mesh(armorGeometry, armorMaterial)
      armorTop.position.y = 2
      armorTop.castShadow = true
      enemyGroup.add(armorTop)

      const armorBottom = new THREE.Mesh(armorGeometry, armorMaterial.clone())
      armorBottom.position.y = 0.5
      armorBottom.castShadow = true
      enemyGroup.add(armorBottom)

      // Turret
      const turretGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.6, 8)
      const turretMaterial = new THREE.MeshStandardMaterial({
        color: 0xff4400,
        emissive: 0xff2200,
        emissiveIntensity: 0.5,
      })
      const turret = new THREE.Mesh(turretGeometry, turretMaterial)
      turret.position.y = 2.2
      turret.castShadow = true
      enemyGroup.add(turret)
    } else if (type === 'boss') {
      // BOSS enemy - HUGE, intimidating, DARK PURPLE/BLACK with glowing accents
      const bodyGeometry = new THREE.DodecahedronGeometry(3, 0)
      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0x4400aa,
        emissive: 0x8800ff,
        emissiveIntensity: 0.8,
        metalness: 0.9,
        roughness: 0.3,
      })
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
      body.position.y = 4
      body.castShadow = true
      enemyGroup.add(body)

      // Massive glowing core
      const coreGeometry = new THREE.SphereGeometry(1.5, 32, 32)
      const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0xff00ff,
        emissive: 0xff00ff,
        emissiveIntensity: 1.5,
      })
      const core = new THREE.Mesh(coreGeometry, coreMaterial)
      core.position.y = 4
      enemyGroup.add(core)

      // Multiple orbiting rings
      for (let i = 0; i < 3; i++) {
        const ringGeometry = new THREE.TorusGeometry(2.5 + i * 0.5, 0.2, 12, 24)
        const ringMaterial = new THREE.MeshStandardMaterial({
          color: 0xff00aa,
          emissive: 0xff0088,
          emissiveIntensity: 0.6,
        })
        const ring = new THREE.Mesh(ringGeometry, ringMaterial)
        ring.position.y = 4
        ring.rotation.x = (Math.PI / 4) * i
        ring.rotation.y = (Math.PI / 3) * i
        ring.castShadow = true
        enemyGroup.add(ring)
      }

      // Spiky protrusions for menacing look
      for (let i = 0; i < 8; i++) {
        const spikeGeometry = new THREE.ConeGeometry(0.4, 2, 8)
        const spikeMaterial = new THREE.MeshStandardMaterial({
          color: 0x660099,
          emissive: 0x440066,
          emissiveIntensity: 0.5,
        })
        const spike = new THREE.Mesh(spikeGeometry, spikeMaterial)
        const angle = (i / 8) * Math.PI * 2
        spike.position.x = Math.cos(angle) * 3.5
        spike.position.z = Math.sin(angle) * 3.5
        spike.position.y = 4
        spike.rotation.z = Math.PI / 2
        spike.rotation.y = angle
        spike.castShadow = true
        enemyGroup.add(spike)
      }
    }

    return enemyGroup
  }

  function getEnemyStats(type: EnemyType) {
    if (type === 'basic') {
      return {
        health: 50,
        speed: gameConfig.enemySpeed,
        fireRate: gameConfig.enemyFireRate,
        damage: gameConfig.enemyDamage
      }
    } else if (type === 'fast') {
      return {
        health: 30,
        speed: gameConfig.enemySpeed * 2,
        fireRate: gameConfig.enemyFireRate * 1.5,
        damage: gameConfig.enemyDamage * 0.7
      }
    } else if (type === 'tank') {
      return {
        health: 100,
        speed: gameConfig.enemySpeed * 0.5,
        fireRate: gameConfig.enemyFireRate * 0.7,
        damage: gameConfig.enemyDamage * 1.5
      }
    } else { // boss
      return {
        health: 1000 + (level * 200), // Scales with level - much more health
        speed: gameConfig.enemySpeed * 0.5, // Slower movement
        fireRate: gameConfig.enemyFireRate * 0.25, // Fires MUCH more frequently (lower = faster)
        damage: gameConfig.enemyDamage * 3 // Triple damage
      }
    }
  }

  function spawnEnemies() {
    const types: EnemyType[] = ['basic', 'fast', 'tank']

    for (let i = 0; i < gameConfig.enemyCount; i++) {
      // Higher chance for basic enemies, but include all types
      const rand = Math.random()
      const type: EnemyType = rand < 0.5 ? 'basic' : rand < 0.8 ? 'fast' : 'tank'

      const enemyMesh = createEnemyModel(type)
      const stats = getEnemyStats(type)

      enemyMesh.position.x = (Math.random() - 0.5) * 60
      enemyMesh.position.y = 3 + Math.random() * 3 // Hover 3-6 units above ground
      enemyMesh.position.z = (Math.random() - 0.5) * 60

      // Make sure enemies don't spawn too close to player (minimum 15 units away)
      if (enemyMesh.position.distanceTo(new THREE.Vector3(0, 3, 0)) < 15) {
        i--
        continue
      }

      scene.add(enemyMesh)

      const enemy: Enemy = {
        mesh: enemyMesh,
        health: stats.health,
        maxHealth: stats.health,
        lastShot: 0,
        velocity: new THREE.Vector3(),
        type,
        speed: stats.speed,
        fireRate: stats.fireRate,
        damage: stats.damage
      }

      enemies.push(enemy)
    }
  }

  function spawnNewEnemy() {
    // Higher chance for basic enemies, but include all types
    const rand = Math.random()
    const type: EnemyType = rand < 0.5 ? 'basic' : rand < 0.8 ? 'fast' : 'tank'

    const enemyMesh = createEnemyModel(type)
    const stats = getEnemyStats(type)

    enemyMesh.position.x = (Math.random() - 0.5) * 60
    enemyMesh.position.y = 3 + Math.random() * 3 // Hover 3-6 units above ground
    enemyMesh.position.z = (Math.random() - 0.5) * 60

    scene.add(enemyMesh)

    const enemy: Enemy = {
      mesh: enemyMesh,
      health: stats.health,
      maxHealth: stats.health,
      lastShot: 0,
      velocity: new THREE.Vector3(),
      type,
      speed: stats.speed,
      fireRate: stats.fireRate,
      damage: stats.damage
    }

    enemies.push(enemy)
  }

  let collisionDebugCount = 0
  function checkCollision(newPosition: THREE.Vector3): boolean {
    // Create a bounding cylinder for the player (radius in XZ plane)
    const playerRadius = 1.2 // Horizontal collision radius

    // Debug logging (limit to avoid spam)
    if (collisionDebugCount < 10) {
      console.log('Checking collision for position:', newPosition.toArray().map(v => v.toFixed(1)), 'against', solidObjects.length, 'solid objects')
      collisionDebugCount++
    }

    // Only check collision with solid objects (not walkthrough like plants/roads)
    for (const obj of solidObjects) {
      // Safety check: skip null or undefined objects
      if (!obj) continue

      // Calculate bounding box for the object
      const box = new THREE.Box3().setFromObject(obj)

      // Check HORIZONTAL distance only (x, z plane) - ignore vertical overlap
      // This prevents collision with objects that are above/below the player
      const playerX = newPosition.x
      const playerZ = newPosition.z

      // Find closest point on the box in XZ plane only
      const closestX = Math.max(box.min.x, Math.min(playerX, box.max.x))
      const closestZ = Math.max(box.min.z, Math.min(playerZ, box.max.z))

      // Calculate horizontal distance
      const dx = playerX - closestX
      const dz = playerZ - closestZ
      const horizontalDistance = Math.sqrt(dx * dx + dz * dz)

      if (horizontalDistance < playerRadius) {
        // Additional check: only collide if object extends to player's height
        // Player is at ~y=3.0, so objects must have some vertical presence at that height
        if (box.min.y < newPosition.y && box.max.y > newPosition.y - 2.0) {
          if (collisionDebugCount <= 10) {
            console.log('COLLISION! Horizontal distance:', horizontalDistance.toFixed(2),
              'Player:', [playerX.toFixed(1), newPosition.y.toFixed(1), playerZ.toFixed(1)],
              'Box Y:', [box.min.y.toFixed(1), box.max.y.toFixed(1)])
          }
          return true // Collision detected
        }
      }
    }

    if (collisionDebugCount <= 10) {
      console.log('No collision at:', newPosition.toArray().map(v => v.toFixed(1)))
    }

    return false // No collision
  }

  function showEnemyDamage(enemy: Enemy) {
    const healthPercent = enemy.health / enemy.maxHealth

    // Remove parts based on health percentage
    if (healthPercent < 0.75 && enemy.mesh.children.length > 3) {
      // Remove a part (but keep at least core pieces)
      const childToRemove = enemy.mesh.children[enemy.mesh.children.length - 1]
      enemy.mesh.remove(childToRemove)
    } else if (healthPercent < 0.5 && enemy.mesh.children.length > 2) {
      const childToRemove = enemy.mesh.children[enemy.mesh.children.length - 1]
      enemy.mesh.remove(childToRemove)
    }

    // Flash all remaining parts
    enemy.mesh.children.forEach((child: THREE.Object3D) => {
      if (
        child instanceof THREE.Mesh &&
        child.material instanceof THREE.MeshStandardMaterial
      ) {
        const originalIntensity = child.material.emissiveIntensity
        child.material.emissiveIntensity = 2.0
        setTimeout(() => {
          if (child.material instanceof THREE.MeshStandardMaterial) {
            child.material.emissiveIntensity = originalIntensity
          }
        }, 150)
      }
    })

    // Scale down slightly
    const scaleReduction = 1 - ((1 - healthPercent) * 0.3)
    enemy.mesh.scale.setScalar(scaleReduction)
  }

  function updateMovement(delta: number) {
    if (!controls.isLocked) return

    const isFlying = activePowerUps.has('flying')

    if (isFlying) {
      // FLYING MODE: Full 3D movement in the direction the camera is looking
      // Damping for smooth control
      velocity.x -= velocity.x * 5.0 * delta
      velocity.y -= velocity.y * 5.0 * delta
      velocity.z -= velocity.z * 5.0 * delta

      // Get camera direction (where the mouse is looking)
      const forward = new THREE.Vector3()
      camera.getWorldDirection(forward)

      // Get right vector (perpendicular to forward)
      const right = new THREE.Vector3()
      right.crossVectors(camera.up, forward).normalize()

      // Get up vector (perpendicular to forward and right)
      const up = new THREE.Vector3()
      up.crossVectors(forward, right).normalize()

      const flySpeed = moveSpeed * 1.5 // Slightly faster when flying

      // WASD moves in 3D relative to where you're looking
      if (moveForward) {
        velocity.add(forward.multiplyScalar(flySpeed * delta))
      }
      if (moveBackward) {
        velocity.add(forward.multiplyScalar(-flySpeed * delta))
      }
      if (moveLeft) {
        velocity.add(right.multiplyScalar(flySpeed * delta))
      }
      if (moveRight) {
        velocity.add(right.multiplyScalar(-flySpeed * delta))
      }

      // Apply velocity to camera position
      camera.position.add(velocity)

      // Clamp height to reasonable range
      if (camera.position.y < 4.0) {
        camera.position.y = 4.0
        velocity.y = 0
      } else if (camera.position.y > 100.0) {
        camera.position.y = 100.0
        velocity.y = 0
      }
    } else {
      // NORMAL MODE: Ground-based movement with gravity
      // Damping
      velocity.x -= velocity.x * 10.0 * delta
      velocity.z -= velocity.z * 10.0 * delta
      velocity.y -= 30.0 * delta // Gravity

      direction.z = Number(moveForward) - Number(moveBackward)
      direction.x = Number(moveRight) - Number(moveLeft)
      direction.normalize()

      if (moveForward || moveBackward)
        velocity.z -= direction.z * moveSpeed * delta
      if (moveLeft || moveRight) velocity.x -= direction.x * moveSpeed * delta

      // Save current position
      const oldPosition = camera.position.clone()

      // Apply horizontal movement
      controls.moveRight(-velocity.x)
      controls.moveForward(-velocity.z)

      // Check collision and revert if necessary
      const newPosition = camera.position.clone()

      if (checkCollision(newPosition)) {
        // Revert to old position
        camera.position.copy(oldPosition)
        velocity.x = 0
        velocity.z = 0
      }

      // Apply vertical movement (jumping/gravity)
      camera.position.y += velocity.y * delta

      // Ground collision
      if (camera.position.y <= 6.0) {
        velocity.y = 0
        camera.position.y = 6.0
        canJump = true
        isJumping = false
      }
    }
  }

  function updateProjectiles(delta: number) {
    projectiles = projectiles.filter((projectile) => {
      // Heat-seeking missile behavior
      if (projectile.type === 'missile' && projectile.target) {
        // Check if target still exists in enemies array
        const targetExists = enemies.some(e => e.mesh === projectile.target)

        if (!targetExists) {
          // Target was destroyed, remove missile with explosion
          createExplosion(projectile.mesh.position.clone())
          scene.remove(projectile.mesh)
          return false
        }

        // Steer towards target
        const directionToTarget = new THREE.Vector3()
        directionToTarget.subVectors(projectile.target.position, projectile.mesh.position)
        directionToTarget.normalize()

        // Blend current velocity with direction to target
        projectile.velocity.lerp(directionToTarget.multiplyScalar(35), 0.1)

        // Orient missile towards movement direction
        projectile.mesh.lookAt(projectile.mesh.position.clone().add(projectile.velocity))
        projectile.mesh.rotateX(Math.PI / 2) // Adjust for cone geometry
      }

      // Move projectile
      projectile.mesh.position.add(
        projectile.velocity.clone().multiplyScalar(delta),
      )

      // Grenade has gravity
      if (projectile.type === 'grenade') {
        projectile.velocity.y -= 20.0 * delta
        projectile.mesh.rotation.x += delta * 10
        projectile.mesh.rotation.y += delta * 5
      }

      // Check collision with power-ups - shooting them collects them!
      for (let i = powerUps.length - 1; i >= 0; i--) {
        const powerUp = powerUps[i]
        const powerUpBox = new THREE.Box3().setFromObject(powerUp.mesh)
        const projectileBox = new THREE.Box3().setFromObject(projectile.mesh)

        if (powerUpBox.intersectsBox(projectileBox)) {
          // Collect the power-up
          collectPowerUp(powerUp)
          scene.remove(powerUp.mesh)
          powerUps.splice(i, 1)

          // Remove projectile too
          scene.remove(projectile.mesh)
          return false
        }
      }

      // Check collision with enemies using raycasting on mesh geometry
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i]
        // Safety check: skip null or undefined enemies
        if (!enemy || !enemy.mesh) continue

        // Create a bounding box for quick rejection
        const enemyBox = new THREE.Box3().setFromObject(enemy.mesh)
        const projectileBox = new THREE.Box3().setFromObject(projectile.mesh)

        // Check if bounding boxes intersect
        if (enemyBox.intersectsBox(projectileBox)) {
          // Handle grenade area damage
          if (projectile.type === 'grenade') {
            createExplosion(projectile.mesh.position.clone())
            scene.remove(projectile.mesh)

            // Damage all enemies in radius
            const enemiesToRemove: number[] = []
            enemies.forEach((e, idx) => {
              const dist = e.mesh.position.distanceTo(projectile.mesh.position)
              if (dist < 5) {
                e.health -= gameConfig.playerDamage * 2 // Double damage for grenades

                // Update boss health display if this is the boss
                if (e.type === 'boss' && bossEnemy) {
                  bossHealth = e.health
                }

                if (e.health <= 0) {
                  createExplosion(e.mesh.position.clone())
                  scene.remove(e.mesh)
                  enemiesToRemove.push(idx)

                  const wasBoss = e.type === 'boss'
                  score += wasBoss ? 500 : 50

                  // If boss was killed, complete the level
                  if (wasBoss && bossEnemy) {
                    bossEnemy = null
                    bossHealth = 0
                    isBossLevel = false
                    setTimeout(() => levelUp(), 500) // Small delay for explosion
                  }
                } else {
                  // Show damage
                  showEnemyDamage(e)
                }
              }
            })

            // Remove dead enemies (in reverse to avoid index issues)
            enemiesToRemove.reverse().forEach(idx => enemies.splice(idx, 1))

            // Spawn new enemies if needed (but not on boss levels)
            if (!isBossLevel && enemies.length < gameConfig.enemyCount) {
              spawnNewEnemy()
            }

            return false // Remove grenade
          }

          // Regular projectile damage
          enemy.health -= gameConfig.playerDamage

          // Update boss health display if this is the boss
          if (enemy.type === 'boss' && bossEnemy) {
            bossHealth = enemy.health
          }

          if (enemy.health <= 0) {
            // Enemy destroyed
            createExplosion(enemy.mesh.position.clone())
            scene.remove(enemy.mesh)

            // Check if this was the boss
            const wasBoss = enemy.type === 'boss'

            enemies.splice(i, 1)
            score += wasBoss ? 500 : 50 // Big score bonus for boss

            // If boss was killed, complete the level
            if (wasBoss && bossEnemy) {
              bossEnemy = null
              bossHealth = 0
              isBossLevel = false
              levelUp()
            } else if (enemies.length < gameConfig.enemyCount) {
              // Spawn new enemy (only if not boss level)
              spawnNewEnemy()
            }
          } else {
            // Enemy damaged - show visual feedback
            showEnemyDamage(enemy)
          }

          scene.remove(projectile.mesh)
          return false // Remove projectile
        }
      }

      // Grenade ground collision
      if (projectile.type === 'grenade' && projectile.mesh.position.y <= 0.5) {
        createExplosion(projectile.mesh.position.clone())
        scene.remove(projectile.mesh)

        // Damage enemies in radius
        const enemiesToRemove: number[] = []
        enemies.forEach((e, idx) => {
          const dist = e.mesh.position.distanceTo(projectile.mesh.position)
          if (dist < 5) {
            e.health -= gameConfig.playerDamage * 2

            // Update boss health display if this is the boss
            if (e.type === 'boss' && bossEnemy) {
              bossHealth = e.health
            }

            if (e.health <= 0) {
              createExplosion(e.mesh.position.clone())
              scene.remove(e.mesh)
              enemiesToRemove.push(idx)

              const wasBoss = e.type === 'boss'
              score += wasBoss ? 500 : 50

              // If boss was killed, complete the level
              if (wasBoss && bossEnemy) {
                bossEnemy = null
                bossHealth = 0
                isBossLevel = false
                setTimeout(() => levelUp(), 500) // Small delay for explosion
              }
            }
          }
        })

        // Remove dead enemies (in reverse to avoid index issues)
        enemiesToRemove.reverse().forEach(idx => enemies.splice(idx, 1))

        // Spawn new enemies if needed (but not on boss levels)
        if (!isBossLevel && enemies.length < gameConfig.enemyCount) {
          spawnNewEnemy()
        }

        return false
      }

      // Remove if too far
      if (projectile.mesh.position.distanceTo(camera.position) > 100) {
        scene.remove(projectile.mesh)
        return false
      }

      return true
    })
  }

  function updateEnemies(delta: number) {
    const currentTime = Date.now()

    enemies.forEach((enemy) => {
      // Calculate direction to player
      const directionToPlayer = new THREE.Vector3()
      directionToPlayer.subVectors(camera.position, enemy.mesh.position)
      const distanceToPlayer = directionToPlayer.length()
      directionToPlayer.normalize()

      // Rotate enemy rings for cool effect
      if (enemy.mesh.children.length >= 4) {
        // Rotate first ring (horizontal)
        enemy.mesh.children[2].rotation.z += delta * 2
        // Rotate second ring (vertical) in opposite direction
        enemy.mesh.children[3].rotation.y += delta * 2
        // Rotate the body slowly
        enemy.mesh.children[0].rotation.y += delta * 0.5
      }

      // Look at player
      enemy.mesh.lookAt(camera.position)

      // Different behavior based on enemy type
      if (enemy.type === 'fast') {
        // Fast enemies: circle, strafe, and bob vertically
        const bobSpeed = Math.sin(Date.now() * 0.003) * 0.02
        enemy.mesh.position.y += bobSpeed

        if (distanceToPlayer > 12 && distanceToPlayer < 25) {
          // Circle player with vertical movement
          const tangent = new THREE.Vector3(-directionToPlayer.z, 0, directionToPlayer.x)
          enemy.mesh.position.add(tangent.multiplyScalar(delta * enemy.speed))
          // Add vertical evasion
          enemy.mesh.position.y += Math.sin(Date.now() * 0.005) * delta * 2
        } else if (distanceToPlayer >= 25) {
          // Rush towards player
          enemy.mesh.position.add(directionToPlayer.multiplyScalar(delta * enemy.speed))
        } else {
          // Back away if too close with upward dodge
          enemy.mesh.position.sub(directionToPlayer.multiplyScalar(delta * enemy.speed))
          enemy.mesh.position.y += delta * 3
        }

        // Clamp fast enemy height
        enemy.mesh.position.y = Math.max(2, Math.min(8, enemy.mesh.position.y))
      } else if (enemy.type === 'tank') {
        // Tank enemies: slow advance, stand ground, gentle hovering
        const hoverSpeed = Math.sin(Date.now() * 0.001) * 0.01
        enemy.mesh.position.y += hoverSpeed

        if (distanceToPlayer > 20) {
          enemy.mesh.position.add(directionToPlayer.multiplyScalar(delta * enemy.speed))
        }
        // Tanks don't retreat but maintain stable height
        enemy.mesh.position.y = Math.max(2.5, Math.min(4, enemy.mesh.position.y))
      } else {
        // Basic enemies: standard behavior with sine wave vertical movement
        const waveHeight = Math.sin(Date.now() * 0.002) * 0.015
        enemy.mesh.position.y += waveHeight

        if (distanceToPlayer > 15) {
          enemy.mesh.position.add(directionToPlayer.multiplyScalar(delta * enemy.speed))
          // Add slight vertical approach
          enemy.mesh.position.y += delta * 0.5
        } else if (distanceToPlayer < 10) {
          // Move away if too close
          enemy.mesh.position.sub(directionToPlayer.multiplyScalar(delta * (enemy.speed / 2)))
          enemy.mesh.position.y -= delta * 0.5
        }

        // Clamp basic enemy height
        enemy.mesh.position.y = Math.max(2, Math.min(6, enemy.mesh.position.y))
      }

      // Shoot at player based on individual fire rate if within range
      if (distanceToPlayer < 40 && currentTime - enemy.lastShot > enemy.fireRate) {
        shootEnemyBullet(enemy)
        enemy.lastShot = currentTime
      }
    })
  }

  function shootEnemyBullet(enemy: Enemy) {
    // Create enemy bullet with type-specific color
    const size = enemy.type === 'tank' ? 0.25 : enemy.type === 'fast' ? 0.1 : 0.15
    const color = enemy.type === 'tank' ? 0xff8800 : enemy.type === 'fast' ? 0x00ffff : 0xff0000

    const bulletGeometry = new THREE.SphereGeometry(size, 8, 8)
    const bulletMaterial = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1,
    })
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial)

    // Store damage in userData for later retrieval
    bullet.userData.damage = enemy.damage

    // Position at enemy
    bullet.position.copy(enemy.mesh.position)
    bullet.position.y += 1 // Center of enemy

    // Calculate velocity towards player
    const direction = new THREE.Vector3()
    direction.subVectors(camera.position, enemy.mesh.position)
    direction.normalize()
    const speed = enemy.type === 'fast' ? 40 : enemy.type === 'tank' ? 25 : 30
    const velocity = direction.multiplyScalar(speed)

    scene.add(bullet)
    enemyBullets.push({ mesh: bullet, velocity, type: 'laser' })
  }

  // Player hit effect
  let isPlayerHit = false
  
  function playHitSound() {
    if (!audioContext) {
      audioContext = new AudioContext()
    }

    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.type = "sawtooth"
    oscillator.frequency.setValueAtTime(100, audioContext.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(
      50,
      audioContext.currentTime + 0.2
    )

    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.2
    )

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.2)
  }

  function showPlayerHitEffect() {
    isPlayerHit = true
    playHitSound()
    setTimeout(() => {
      isPlayerHit = false
    }, 100)
  }

  function updateEnemyBullets(delta: number) {
    enemyBullets = enemyBullets.filter((bullet) => {
      // Move bullet
      bullet.mesh.position.add(bullet.velocity.clone().multiplyScalar(delta))

      // Check collision with solid objects (bullets can't pass through buildings)
      for (const obj of solidObjects) {
        const box = new THREE.Box3().setFromObject(obj)
        if (box.containsPoint(bullet.mesh.position)) {
          scene.remove(bullet.mesh)
          return false // Remove bullet
        }
      }

      // Check collision with player
      const distance = bullet.mesh.position.distanceTo(camera.position)

      if (distance < 1.0) {
        // Hit player!
        const damage = bullet.mesh.userData.damage || gameConfig.enemyDamage
        health -= damage
        if (health <= 0) {
          health = 0
          isGameOver = true
          controls.unlock()
        }
        showPlayerHitEffect()

        scene.remove(bullet.mesh)
        return false // Remove bullet
      }

      // Remove if too far
      if (bullet.mesh.position.distanceTo(camera.position) > 100) {
        scene.remove(bullet.mesh)
        return false
      }

      return true
    })
  }

  let lastCollectedPowerUp = ''
  let showCollectionMessage = false

  function collectPowerUp(powerUp: PowerUp) {
    // Immediately apply power-up effect
    applyPowerUpEffect(powerUp.type)

    // Show collection message
    const names = {
      health: 'Health Pack',
      ammo: 'Ammo Box',
      flying: 'Jetpack',
      'weapon-missile': 'Missiles',
      'weapon-grenade': 'Grenades'
    }
    lastCollectedPowerUp = names[powerUp.type] || powerUp.type
    showCollectionMessage = true

    // Hide message after animation completes
    setTimeout(() => {
      showCollectionMessage = false
    }, 1800)

    // Play collection sound effect visually
    score += 10
  }

  function addWeaponToInventory(type: WeaponType, ammoAmount: number, name: string) {
    const existingWeapon = weaponInventory.find(w => w.type === type)

    if (existingWeapon) {
      // Add ammo to existing weapon
      existingWeapon.ammo += ammoAmount
      weaponInventory = weaponInventory // Trigger reactivity
    } else {
      // Add new weapon to inventory (but don't auto-switch)
      weaponInventory.push({ type, ammo: ammoAmount, name })
      weaponInventory = weaponInventory // Trigger reactivity
    }
  }

  function switchWeapon(direction: 'next' | 'prev') {
    if (weaponInventory.length <= 1) return

    if (direction === 'next') {
      currentWeaponIndex = (currentWeaponIndex + 1) % weaponInventory.length
    } else {
      currentWeaponIndex = (currentWeaponIndex - 1 + weaponInventory.length) % weaponInventory.length
    }

    currentWeapon = weaponInventory[currentWeaponIndex].type
  }

  function handleKeyDown(event: KeyboardEvent) {
    switch (event.code) {
      case "KeyW":
        moveForward = true
        break
      case "KeyA":
        moveLeft = true
        break
      case "KeyS":
        moveBackward = true
        break
      case "KeyD":
        moveRight = true
        break
      case "Space":
        event.preventDefault()
        if (canJump && !isJumping) {
          velocity.y = jumpSpeed
          canJump = false
          isJumping = true
        }
        break
      case "Escape":
        // Handle ESC key - first press pauses, second press (within 2s) goes to main menu
        const now = Date.now()
        if (controls.isLocked) {
          // First press - pause game
          controls.unlock()
          lastEscapeTime = now
        } else if (!isPlaying) {
          // Already paused - check if second ESC within 2 seconds
          if (now - lastEscapeTime < 2000) {
            // Second ESC within 2s - go to main menu
            hasStartedGame = false
            showMapSelector = true
            clearEnvironment()
            resetGameState()
            weaponInventory = [{ type: 'laser', ammo: -1, name: 'Laser Gun' }]
            currentWeaponIndex = 0
            currentWeapon = 'laser'
            lastEscapeTime = 0 // Reset timer
          } else {
            // More than 2s passed - treat as first press, update timer
            lastEscapeTime = now
          }
        }
        break
      case "ArrowLeft":
        event.preventDefault()
        switchWeapon('prev')
        break
      case "ArrowRight":
        event.preventDefault()
        switchWeapon('next')
        break
      case "ArrowUp":
        event.preventDefault()
        switchWeapon('prev')
        break
      case "ArrowDown":
        event.preventDefault()
        switchWeapon('next')
        break
      case "Digit1":
      case "Digit2":
      case "Digit3":
      case "Digit4":
      case "Digit5":
        const index = parseInt(event.code.replace('Digit', '')) - 1
        if (index < weaponInventory.length) {
          currentWeaponIndex = index
          currentWeapon = weaponInventory[index].type
        }
        break
    }
  }

  function updatePowerUps(delta: number) {
    // Use reverse iteration to safely remove items
    for (let i = powerUps.length - 1; i >= 0; i--) {
      const powerUp = powerUps[i]

      // Rotate power-up for visual effect
      powerUp.mesh.rotation.y += delta * 2

      // Bob up and down
      powerUp.mesh.position.y += Math.sin(Date.now() * 0.003 + i) * 0.01

      // Check horizontal distance (XZ plane) only, ignore Y difference
      const dx = powerUp.mesh.position.x - camera.position.x
      const dz = powerUp.mesh.position.z - camera.position.z
      const horizontalDistance = Math.sqrt(dx * dx + dz * dz)

      // Also check if power-up is within reasonable vertical range (player height +/- 3 units)
      const dy = Math.abs(powerUp.mesh.position.y - camera.position.y)

      if (horizontalDistance < 2.5 && dy < 3) {
        // Collect power-up!
        collectPowerUp(powerUp)
        scene.remove(powerUp.mesh)
        powerUps.splice(i, 1)

        // Spawn new power-up
        if (powerUps.length < gameConfig.targetCount) {
          spawnNewPowerUp()
        }

        // Add score
        score += 5

        // Play collection sound
        playPowerUpSound()
      }
    }

    // Check if flying mode expired
    if (activePowerUps.has('flying') && Date.now() > flyingModeEndTime) {
      activePowerUps.delete('flying')
    }
  }

  const clock = new THREE.Clock()

  function checkAndFixStuckPlayer(delta: number) {
    // Only check if player is trying to move
    const isTryingToMove = moveForward || moveBackward || moveLeft || moveRight

    if (!isTryingToMove) {
      stuckCounter = 0
      return
    }

    // Update timer
    stuckCheckTimer += delta * 1000

    if (stuckCheckTimer >= STUCK_CHECK_INTERVAL) {
      stuckCheckTimer = 0

      // Check if player has moved
      const distance = camera.position.distanceTo(lastPosition)

      if (distance < STUCK_THRESHOLD && isTryingToMove) {
        stuckCounter++
        console.log(`Player may be stuck (${stuckCounter}/${STUCK_COUNT_LIMIT}). Distance moved: ${distance.toFixed(3)}`)

        if (stuckCounter >= STUCK_COUNT_LIMIT) {
          // Player is stuck, try to unstuck them
          console.log('Player stuck! Attempting to unstuck...')

          // Try shifting the player in different directions
          const shiftAmount = 2
          const directions = [
            new THREE.Vector3(shiftAmount, 0, 0),
            new THREE.Vector3(-shiftAmount, 0, 0),
            new THREE.Vector3(0, 0, shiftAmount),
            new THREE.Vector3(0, 0, -shiftAmount),
            new THREE.Vector3(shiftAmount, 0, shiftAmount),
            new THREE.Vector3(-shiftAmount, 0, -shiftAmount),
            new THREE.Vector3(0, shiftAmount, 0), // Try moving up
          ]

          // Try each direction until we find one that works
          for (const dir of directions) {
            const testPos = camera.position.clone().add(dir)
            camera.position.copy(testPos)

            // Test if this position is better by checking if we can move
            const raycaster = new THREE.Raycaster()
            raycaster.set(camera.position, new THREE.Vector3(0, -1, 0))
            const downIntersects = raycaster.intersectObjects(scene.children, true)

            if (downIntersects.length > 0 && downIntersects[0].distance > 1) {
              // Found a valid position
              console.log('Unstuck successful!')
              stuckCounter = 0
              lastPosition.copy(camera.position)
              return
            }
          }

          // If all else fails, reset counter and let player try again
          stuckCounter = 0
        }
      } else {
        // Player is moving, reset counter
        stuckCounter = 0
      }

      // Update last position
      lastPosition.copy(camera.position)
    }
  }

  function animate() {
    animationId = requestAnimationFrame(animate)

    // Update current time for reactive countdown displays
    currentTime = Date.now()

    // Clamp delta to prevent huge velocity spikes when tab regains focus
    const rawDelta = clock.getDelta()
    const delta = Math.min(rawDelta, 0.1) // Max 100ms per frame

    // Only update game logic when playing
    if (isPlaying) {
      updateMovement(delta)
      checkAndFixStuckPlayer(delta)
      updateProjectiles(delta)
      updateEnemies(delta)
      updateEnemyBullets(delta)
      updatePowerUps(delta)
    }

    renderer.render(scene, camera)
  }

  // Pointer lock events
  onMount(() => {
    if (!controls) return

    const onLock = () => {
      isPlaying = true
      hasStartedGame = true // Mark that game has started

      // Wait for DOM to update, then resize renderer to fullscreen
      setTimeout(() => {
        onWindowResize()
      }, 0)
    }

    const onUnlock = () => {
      isPlaying = false

      // Wait for DOM to update, then resize renderer back to normal
      setTimeout(() => {
        onWindowResize()
      }, 0)
    }

    controls.addEventListener("lock", onLock)
    controls.addEventListener("unlock", onUnlock)

    return () => {
      controls.removeEventListener("lock", onLock)
      controls.removeEventListener("unlock", onUnlock)
    }
  })
</script>

<svelte:window
  onkeydown={handleKeyDown}
  onkeyup={handleKeyUp}
  onmousedown={handleMouseDown}
/>

<svelte:head>
  <title>Blocky Shooter | Dougie's Game Hub</title>
</svelte:head>

<style>
  @keyframes flash {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }

  .animate-flash {
    animation: flash 0.1s linear;
  }
</style>

<div class="h-screen overflow-hidden"
     class:flex={!isPlaying || !hasStartedGame || isGameOver}
     class:flex-col={!isPlaying || !hasStartedGame || isGameOver}
     class:md:flex-row={!isPlaying || !hasStartedGame || isGameOver}
     class:fixed={isPlaying && hasStartedGame && !isGameOver}
     class:inset-0={isPlaying && hasStartedGame && !isGameOver}
     class:z-[9999]={isPlaying && hasStartedGame && !isGameOver}>
  <!-- Game Container -->
  <div class="relative"
       class:min-w-0={!isPlaying || !hasStartedGame || isGameOver}
       class:flex-1={!isPlaying || isGameOver}
       class:w-full={isPlaying && hasStartedGame && !isGameOver}
       class:h-full={isPlaying && hasStartedGame && !isGameOver}>
    <div
      bind:this={container}
      class="w-full h-full bg-black"
      class:md:border-r-4={!isPlaying || isGameOver}
      class:border-base-300={!isPlaying || isGameOver}
    >
      {#if isLoadingMap}
        <!-- Loading Screen -->
        <div class="absolute inset-0 z-40 flex items-center justify-center bg-black">
          <div class="text-center text-white">
            <div class="text-6xl mb-4">🎮</div>
            <h2 class="text-4xl font-bold mb-4">Loading Map...</h2>
            <div class="loading loading-spinner loading-lg"></div>
            <p class="mt-4 text-xl opacity-70">Spawning objects and enemies</p>
          </div>
        </div>
      {:else if showMapSelector}
        <!-- Background with thumbnail and 50% white overlay -->
        <div class="absolute inset-0 z-30">
          {#if selectedMap?.thumbnail}
            <div class="absolute inset-0" style="background-image: url({selectedMap.thumbnail}); background-size: cover; background-position: center;"></div>
          {/if}
          <div class="absolute inset-0 bg-white/50"></div>
        </div>
        <div class="absolute inset-0 flex items-center justify-center z-30 overflow-y-auto p-4">
          <div class="text-center max-w-5xl w-full">
            <h2 class="text-4xl font-bold text-gray-900 mb-6">Game Setup</h2>

            <!-- Difficulty Settings -->
            <div class="bg-yellow-50 rounded-lg p-6 mb-6 border-2 border-yellow-200">
              <h3 class="text-2xl font-bold text-gray-900 mb-4">Difficulty & Settings</h3>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <button
                  class="btn {gameConfig.difficulty === 'easy' ? 'btn-success' : 'btn-outline'}"
                  on:click={() => applyDifficultyPreset('easy')}
                >
                  Easy
                  <div class="text-xs">More ammo, less enemies</div>
                </button>
                <button
                  class="btn {gameConfig.difficulty === 'normal' ? 'btn-primary' : 'btn-outline'}"
                  on:click={() => applyDifficultyPreset('normal')}
                >
                  Normal
                  <div class="text-xs">Balanced gameplay</div>
                </button>
                <button
                  class="btn {gameConfig.difficulty === 'hard' ? 'btn-error' : 'btn-outline'}"
                  on:click={() => applyDifficultyPreset('hard')}
                >
                  Hard
                  <div class="text-xs">More enemies, less health</div>
                </button>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
                <div>
                  <label class="label text-xs">Starting Ammo: {gameConfig.startingAmmo}</label>
                  <input type="range" min="10" max="100" bind:value={gameConfig.startingAmmo} class="range range-xs range-primary" />
                </div>
                <div>
                  <label class="label text-xs">Starting Health: {gameConfig.startingHealth}</label>
                  <input type="range" min="25" max="200" bind:value={gameConfig.startingHealth} class="range range-xs range-accent" />
                </div>
                <div>
                  <label class="label text-xs">Enemy Count: {gameConfig.enemyCount}</label>
                  <input type="range" min="1" max="15" bind:value={gameConfig.enemyCount} class="range range-xs range-secondary" />
                </div>
                <div>
                  <label class="label text-xs">Target Count: {gameConfig.targetCount}</label>
                  <input type="range" min="5" max="20" bind:value={gameConfig.targetCount} class="range range-xs range-info" />
                </div>
              </div>
            </div>

            <h3 class="text-2xl font-bold text-gray-900 mb-4">Select a Map</h3>

            <!-- Random map generation removed - use World Builder instead -->

            {#if availableMaps.length === 0}
              <div class="bg-yellow-50 p-8 rounded-lg mb-4 border-2 border-yellow-200">
                <p class="text-lg mb-4 text-gray-900">No World Builder maps found.</p>
                <p class="text-sm text-gray-600 mb-4">
                  Create maps in World Builder first, then play them here!
                </p>
                <button class="btn btn-primary btn-lg text-white" on:click={startWithDefaultMap}>
                  Play Default Map
                </button>
              </div>
            {:else}
              <div class="flex justify-center mb-6">
                <div class="inline-grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto p-2">
                  {#each availableMaps as map}
                    <button
                      class="card bg-yellow-50 hover:bg-yellow-100 transition-all duration-200 cursor-pointer border-2 border-yellow-300 hover:border-yellow-500 shadow-lg hover:shadow-xl"
                      on:click={() => selectMapAndStart(map)}
                    >
                      <div class="card-body p-4">
                        <div class="w-full h-32 rounded mb-2 overflow-hidden bg-yellow-100 flex items-center justify-center border border-yellow-300">
                          {#if map.thumbnail}
                            <img
                              src={map.thumbnail}
                              alt={map.name}
                              class="w-full h-full object-cover"
                            />
                          {:else}
                            <div class="text-4xl opacity-50">🗺️</div>
                          {/if}
                        </div>
                        <h3 class="font-bold text-lg text-gray-900">{map.name}</h3>
                        <div class="text-xs text-gray-600">
                          {map.stats.objectCount} objects • {map.environment.timeOfDay} • {map.environment.weather}
                        </div>
                      </div>
                    </button>
                  {/each}
                </div>
              </div>

              <button class="btn btn-primary btn-lg text-white" on:click={startWithDefaultMap}>
                Play Default Map
              </button>
            {/if}

            <p class="text-gray-900 mt-6 text-sm">
              Controls: WASD to move, Mouse to look, Click to shoot, Space to jump, ESC to pause
            </p>
          </div>
        </div>
      {:else if !isPlaying && hasStartedGame}
        <!-- Pause menu (only shown if game was started then paused) -->
        <div class="absolute inset-0 z-10">
          {#if selectedMap?.thumbnail}
            <div class="absolute inset-0" style="background-image: url({selectedMap.thumbnail}); background-size: cover; background-position: center;"></div>
          {/if}
          <div class="absolute inset-0 bg-white/50"></div>
        </div>
        <div
          class="absolute inset-0 flex items-center justify-center z-10"
        >
          <div class="text-center space-y-4">
            <h2 class="text-3xl font-bold text-gray-900 mb-6">Paused</h2>
            <button class="btn btn-primary btn-lg text-white" on:click={startGame}>
              Resume Game
            </button>
            <button
              class="btn btn-warning btn-lg text-white block mx-auto"
              on:click={() => {
                isGameOver = false
                clearEnvironment()
                resetGameState()
                weaponInventory = [{ type: 'laser', ammo: -1, name: 'Laser Gun' }]
                currentWeaponIndex = 0
                currentWeapon = 'laser'
                // Restart with same map
                if (selectedMap) {
                  selectMapAndStart(selectedMap)
                }
              }}
            >
              Restart Level
            </button>
            <button
              class="btn btn-error btn-lg text-white block mx-auto"
              on:click={() => {
                isPlaying = false
                hasStartedGame = false // Reset so pause screen doesn't show
                showMapSelector = true
                clearEnvironment()
                resetGameState()
                weaponInventory = [{ type: 'laser', ammo: -1, name: 'Laser Gun' }]
                currentWeaponIndex = 0
                currentWeapon = 'laser'
              }}
            >
              Main Menu
            </button>
            <p class="text-gray-900 mt-6 text-sm">
              Press ESC again to return to Main Menu
            </p>
          </div>
        </div>
      {/if}
      
      {#if isPlayerHit}
        <div
          class="absolute inset-0 bg-red-500/30 animate-flash pointer-events-none z-20"
        />
      {/if}

        <!-- Game Over Screen -->
        {#if isGameOver}
          <div class="absolute inset-0 z-20 flex items-center justify-center bg-black/80">
            <div class="text-center text-white">
              <h1 class="text-6xl font-bold mb-4 text-red-500">GAME OVER</h1>
              <div class="text-3xl mb-6">Final Score: {score}</div>
              <div class="text-xl mb-8">Level Reached: {level}</div>
              <button
                class="btn btn-primary btn-lg"
                on:click={() => {
                  isGameOver = false
                  hasStartedGame = false // Reset so pause screen doesn't show
                  showMapSelector = true
                  clearEnvironment()
                  resetGameState()
                  weaponInventory = [{ type: 'laser', ammo: -1, name: 'Laser Gun' }]
                  currentWeaponIndex = 0
                  currentWeapon = 'laser'
                }}
              >
                Play Again
              </button>
            </div>
          </div>
        {/if}

        <!-- HUD -->
        {#if isPlaying && !isGameOver}
          <div
            class="absolute top-4 left-4 text-white font-bold z-10 bg-black/70 p-4 rounded-lg space-y-2"
          >
            <div class="text-3xl text-white">Score: {score}</div>
            <div class="text-xl">Level: {level} {#if isBossLevel}<span class="text-error animate-pulse">⚡ BOSS LEVEL ⚡</span>{/if}</div>
            <div class="text-xl text-accent">Health: {health}</div>

            {#if isBossLevel && bossEnemy && bossMaxHealth > 0}
              <div class="mt-3 pt-3 border-t border-red-500">
                <div class="text-sm text-red-400 mb-1">BOSS HEALTH</div>
                <div class="w-full bg-gray-700 h-3 rounded-full overflow-hidden">
                  <div
                    class="bg-gradient-to-r from-red-500 to-purple-500 h-full transition-all duration-300"
                    style="width: {Math.max(0, (bossHealth / bossMaxHealth) * 100)}%"
                  ></div>
                </div>
                <div class="text-xs text-center mt-1">{Math.max(0, Math.floor(bossHealth))} / {bossMaxHealth}</div>
              </div>
            {/if}

            <!-- Weapon Inventory -->
            <div class="mt-3 pt-3 border-t border-white/30">
              <div class="text-sm opacity-80 mb-2">Weapons (← → ↑ ↓ or 1-5)</div>
              {#each weaponInventory as weapon, index}
                <div class="text-sm {index === currentWeaponIndex ? 'text-warning font-bold' : 'opacity-60'}">
                  {index + 1}. {weapon.name} {weapon.ammo === -1 ? '∞' : `(${weapon.ammo})`}
                </div>
              {/each}
            </div>
          </div>

          <!-- Jetpack HUD (Below main HUD on left side) -->
          {#if activePowerUps.has('flying') && currentTime < flyingModeEndTime}
            <div class="absolute left-4 top-[280px] z-10 bg-black/90 p-4 rounded-lg border-2 border-cyan-500 w-64">
              <div class="text-xl font-bold text-cyan-400 animate-pulse mb-2 text-center">
                🚀 JETPACK ACTIVE
              </div>
              <div class="text-4xl font-bold text-yellow-300 mb-3 text-center">
                {Math.max(0, Math.ceil((flyingModeEndTime - currentTime) / 1000))}s
              </div>
              <!-- Visual countdown bar -->
              <div class="w-full bg-gray-700 h-4 rounded-full overflow-hidden mb-1">
                <div
                  class="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 h-full transition-all duration-100"
                  style="width: {Math.max(0, Math.min(100, ((flyingModeEndTime - currentTime) / 30000) * 100))}%"
                ></div>
              </div>
              <div class="text-xs text-center text-cyan-300 font-bold">FUEL REMAINING</div>
            </div>
          {/if}

          <!-- Level Complete Splash -->
          {#if showLevelComplete}
            <div class="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm">
              <div class="text-center text-white animate-bounce">
                <div class="text-8xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500">
                  LEVEL {level}
                </div>
                <div class="text-6xl font-bold mb-4 text-green-400">
                  COMPLETE!
                </div>
                <div class="text-3xl mb-2">Score: {score}</div>
                <div class="text-2xl text-cyan-400 animate-pulse">
                  {isBossLevel ? '⚡ BOSS LEVEL NEXT ⚡' : 'Loading Next Level...'}
                </div>
              </div>
            </div>
          {/if}

          <!-- Crosshair -->
          <div
            class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10"
          >
            <div class="w-8 h-8">
              <div
                class="absolute top-1/2 left-0 w-full h-0.5 bg-white -translate-y-1/2"
              ></div>
              <div
                class="absolute top-0 left-1/2 w-0.5 h-full bg-white -translate-x-1/2"
              ></div>
            </div>
          </div>

          <!-- Collection Notification - centered screen with flashing animation -->
          {#if showCollectionMessage}
            <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none" style="margin-top: 100px;">
              <div
                class="bg-green-500/95 text-white px-8 py-4 rounded-xl shadow-2xl text-2xl font-bold border-4 border-green-300"
                style="animation: flash 0.3s ease-in-out 6;"
              >
                + {lastCollectedPowerUp}
              </div>
            </div>
          {/if}
        {/if}
      </div>
    </div>

  <!-- Info Panel (hidden during active gameplay, shown when paused or in menu) -->
  {#if !isPlaying || isGameOver}
  <div class="w-full md:w-80 h-auto md:h-screen p-4 bg-base-200 overflow-y-auto">
    <h1 class="text-2xl md:text-4xl font-bold mb-4 md:mb-6">🎯 Blocky Shooter</h1>

    {#if selectedMap}
      <div class="alert alert-info mb-4 text-xs md:text-sm">
        <div>
          <div class="font-bold">Playing: {selectedMap.name}</div>
          <div class="text-xs opacity-70">
            {selectedMap.environment.timeOfDay} • {selectedMap.environment.weather}
          </div>
        </div>
      </div>
    {/if}

    {#if hasStartedGame}
    <div class="stats stats-horizontal md:stats-vertical w-full mb-4 md:mb-6">
      <div class="stat bg-base-100">
        <div class="stat-title">Score</div>
        <div class="stat-value text-primary text-2xl md:text-4xl">{score}</div>
      </div>
      <div class="stat bg-base-100">
        <div class="stat-title">Health</div>
        <div class="stat-value text-accent text-2xl md:text-4xl">{health}</div>
      </div>
      <div class="stat bg-base-100">
        <div class="stat-title">Level</div>
        <div class="stat-value text-secondary text-2xl md:text-4xl">{level}</div>
      </div>
    </div>
    {/if}

    <div class="space-y-4 md:space-y-6">
      <div>
        <h3 class="font-semibold mb-2 text-sm md:text-base">Controls:</h3>
        <ul class="space-y-1 text-xs md:text-sm">
          <li><kbd class="kbd kbd-sm">W/A/S/D</kbd> - Move</li>
          <li><kbd class="kbd kbd-sm">Mouse</kbd> - Look around</li>
          <li><kbd class="kbd kbd-sm">Click</kbd> - Shoot</li>
          <li><kbd class="kbd kbd-sm">←/→ or ↑/↓</kbd> - Switch weapons</li>
          <li><kbd class="kbd kbd-sm">1-5</kbd> - Select weapon</li>
          <li><kbd class="kbd kbd-sm">Space</kbd> - Jump</li>
          <li><kbd class="kbd kbd-sm">ESC</kbd> - Pause</li>
        </ul>
      </div>

      <div>
        <h3 class="font-semibold mb-2 text-sm md:text-base">Power-Ups (auto-apply):</h3>
        <ul class="space-y-1 text-xs md:text-sm">
          <li><span class="inline-block w-3 h-3 rounded-full bg-red-500 mr-1"></span> Health - +30 HP</li>
          <li><span class="inline-block w-3 h-3 rounded-full bg-green-500 mr-1"></span> Ammo - +20 rounds to weapon</li>
          <li><span class="inline-block w-3 h-3 rounded-full bg-cyan-500 mr-1"></span> Jetpack - Fly for 60s</li>
          <li><span class="inline-block w-3 h-3 rounded-full bg-yellow-500 mr-1"></span> Missiles - +10 heat-seeking rockets</li>
          <li><span class="inline-block w-3 h-3 rounded-full bg-orange-500 mr-1"></span> Grenades - +5 area damage</li>
        </ul>
      </div>

      <div>
        <h3 class="font-semibold mb-2 text-sm md:text-base">Enemies:</h3>
        <ul class="space-y-1 text-xs md:text-sm">
          <li><span class="text-red-500">Red</span> - Basic (50 HP)</li>
          <li><span class="text-cyan-500">Cyan</span> - Fast (30 HP, circles you)</li>
          <li><span class="text-orange-600">Brown</span> - Tank (100 HP, heavy damage)</li>
        </ul>
      </div>

      <div>
        <h3 class="font-semibold mb-2 text-sm md:text-base">Tips:</h3>
        <p class="text-xs md:text-sm">
          Collect power-ups to gain advantages! Level up every 500 points.
          Different weapons have different ammo. Navigate through obstacles
          to find the best vantage points.
        </p>
      </div>
    </div>
  </div>
  {/if}
</div>
