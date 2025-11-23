<script lang="ts">
  import { onMount, onDestroy } from "svelte"
  import * as THREE from "three"
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
  import { hideSidebar } from "$lib/stores/gameState"

  // Hide sidebar when actively playing, show on menu screens
  $: hideSidebar.set(hasStartedGame && !showMapSelector)

  onDestroy(() => {
    hideSidebar.set(false)
  })

  let container: HTMLDivElement
  let scene: THREE.Scene
  let camera: THREE.PerspectiveCamera
  let renderer: THREE.WebGLRenderer
  let animationId: number
  let clock: THREE.Clock

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

  const staticMapFiles = [
    'Basic_Town.json',
    'Burnt_Tree_Map.json',
    'Farm_City.json',
    'Spread_Out_Town.json',
    'Windmills___Such_.json'
  ]

  let availableMaps: MapData[] = []
  let customMaps: MapData[] = []  // User-created maps from localStorage
  let builtInMaps: MapData[] = []  // Static maps from /3d-maps/
  let selectedMap: MapData | null = null
  let showMapSelector = true
  let isLoadingMap = false
  let defaultMapThumbnail: string | null = null

  // Spaceship Selection
  interface SpaceshipOption {
    id: string
    name: string
    path: string
  }

  const spaceshipOptions: SpaceshipOption[] = [
    { id: 'default', name: 'Scout Fighter', path: '/3d-models/Ultimate Space Kit-glb/Spaceship.glb' },
    { id: 'variant1', name: 'Heavy Cruiser', path: '/3d-models/Ultimate Space Kit-glb/Spaceship-Jqfed124pQ.glb' },
    { id: 'variant2', name: 'Stealth Bomber', path: '/3d-models/Ultimate Space Kit-glb/Spaceship-VSxUAFhzbA.glb' },
    { id: 'variant3', name: 'Battle Carrier', path: '/3d-models/Ultimate Space Kit-glb/Spaceship-u105mYHLHU.glb' },
  ]
  let selectedSpaceship: SpaceshipOption = spaceshipOptions[0]

  // Model Catalog for auto-generation (same as FPS game)
  interface ModelCatalogItem {
    name: string
    path: string
    category: string
  }
  let modelCatalog: ModelCatalogItem[] = []

  // Game Configuration
  type AutoMoveSpeed = 'off' | 'slow' | 'medium' | 'hyper'
  type MouseInputType = 'auto' | 'trackpad' | 'external'
  type PowerUpFrequency = 'sparse' | 'normal' | 'carnage'
  interface GameConfig {
    difficulty: 'easy' | 'normal' | 'hard'
    startingHealth: number
    enemyCount: number
    enemyDamage: number
    playerDamage: number
    enemySpeed: number
    enemyFireRate: number
    mouseSensitivity: number
    autoMoveSpeed: AutoMoveSpeed
    mouseInput: MouseInputType
    powerUpFrequency: PowerUpFrequency
  }

  const autoMoveSpeeds: Record<AutoMoveSpeed, number> = {
    off: 0,
    slow: 8,
    medium: 15,
    hyper: 30
  }

  // Power-up drop rates: how many kills before guaranteed drop
  const powerUpDropRates: Record<PowerUpFrequency, number> = {
    sparse: 3,    // Every 3rd kill
    normal: 2,    // Every 2nd kill
    carnage: 1    // Every kill
  }
  let killsSinceLastDrop = 0

  // Trackpad detection state
  let detectedInputType: 'unknown' | 'trackpad' | 'external' = 'unknown'
  let movementSamples: { delta: number; time: number }[] = []
  let lastMovementTime = 0

  // Continuous motion for trackpad - view keeps moving while finger is on pad
  let continuousMotion = { x: 0, y: 0 }
  let isFingerOnTrackpad = false  // Detect if finger is still touching
  const trackpadLiftThreshold = 80  // ms - if no movement for this long, finger lifted

  function getEffectiveInputType(): 'trackpad' | 'external' {
    if (gameConfig.mouseInput === 'auto') {
      return detectedInputType === 'unknown' ? 'external' : detectedInputType
    }
    return gameConfig.mouseInput
  }

  let gameConfig: GameConfig = {
    difficulty: 'normal',
    startingHealth: 100,
    enemyCount: 5,
    enemyDamage: 10,
    playerDamage: 25,
    enemySpeed: 8.0,
    enemyFireRate: 2000,
    mouseSensitivity: 1.0,  // Default to 1.0 (comfortable), range 0.5-2.0
    autoMoveSpeed: 'medium',  // Default to medium auto-move
    mouseInput: 'auto',  // Auto-detect trackpad vs external mouse
    powerUpFrequency: 'normal'  // Every 2nd kill drops a power-up
  }

  const difficultyPresets: Record<GameConfig['difficulty'], Partial<GameConfig>> = {
    easy: { startingHealth: 150, enemyCount: 3, enemyDamage: 5, playerDamage: 35, enemySpeed: 6.0, enemyFireRate: 3000 },
    normal: { startingHealth: 100, enemyCount: 5, enemyDamage: 10, playerDamage: 25, enemySpeed: 8.0, enemyFireRate: 2000 },
    hard: { startingHealth: 75, enemyCount: 8, enemyDamage: 15, playerDamage: 20, enemySpeed: 12.0, enemyFireRate: 1500 }
  }

  function applyDifficultyPreset(difficulty: GameConfig['difficulty']) {
    gameConfig = { ...gameConfig, ...difficultyPresets[difficulty], difficulty }
  }

  // Game state
  let isPlaying = false
  let isGameOver = false
  let hasStartedGame = false
  let score = 0
  let level = 1
  let health = gameConfig.startingHealth
  let kills = 0
  let nextLevelScore = 1000
  let showLevelComplete = false
  let isLoadingLevel = false
  let isBossLevel = false
  let bossEnemy: Enemy | null = null
  let bossHealth = 0
  let bossMaxHealth = 0

  // Player ship
  let playerShip: THREE.Group | null = null
  const shipScale = 0.3  // Smaller ships
  let isSpawning = false  // Loading screen state

  // Flight controls
  let velocity = new THREE.Vector3()
  const maxSpeed = 30
  const acceleration = 20
  const baseTurnSpeed = 2.0
  const rollSpeed = 3.0
  let barrelRollAngle = 0
  let rollAngularVelocity = 0
  let bankAngle = 0  // For A/D strafing visual bank
  let shipSwayTime = 0 // For ship sway animation
  let smoothedSway = 0  // Dampens quick roll jitter from mouse x movement
  let isFiring = false  // For continuous fire with shift key

  // Quaternion-based rotation tracking (avoids gimbal lock)
  let shipYaw = 0    // Horizontal rotation (left/right)
  let shipPitch = 0  // Vertical rotation (up/down)

  // Input
  let keys: { [key: string]: boolean } = {}
  let mouseMovement = { x: 0, y: 0 }
  let isPointerLocked = false
  let isMouseDown = false  // For continuous fire with mouse button

  // Enemies
  type EnemyType = 'basic' | 'fast' | 'tank' | 'boss'
  interface Enemy {
    mesh: THREE.Group
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

  // Projectiles
  type WeaponType = 'laser' | 'missile' | 'plasma' | 'chain' | 'drone' | 'scatter'
  interface Projectile {
    mesh: THREE.Mesh | THREE.Group
    velocity: THREE.Vector3
    damage: number
    type: WeaponType
    lifetime: number
    isEnemy?: boolean
    target?: Enemy | null  // For heat-seeking missiles
    chainTargets?: Enemy[]  // For chain lightning - enemies already hit
    isDrone?: boolean  // For drone swarm
  }
  let projectiles: Projectile[] = []

  // Weapons
  interface Weapon { type: WeaponType; ammo: number; name: string }
  let weaponInventory: Weapon[] = [{ type: 'laser', ammo: -1, name: 'Laser Cannon' }]
  let currentWeaponIndex = 0
  let lastShot = 0

  // Power-ups
  type PowerUpType = 'health' | 'ammo' | 'boost' | 'weapon-missile' | 'weapon-plasma' | 'weapon-chain' | 'weapon-drone' | 'weapon-scatter'
  interface PowerUp { mesh: THREE.Group; type: PowerUpType }
  let powerUps: PowerUp[] = []
  const powerUpColors: Record<string, number> = {
    health: 0xff0000,
    ammo: 0x00ff00,
    boost: 0x00ffff,
    'weapon-missile': 0xffff00,
    'weapon-plasma': 0xff00ff,      // Magenta
    'weapon-chain': 0x00aaff,       // Electric blue
    'weapon-drone': 0x88ff00,       // Lime green
    'weapon-scatter': 0xff8800      // Orange
  }

  // Boost charges (activated by spacebar)
  let boostCharges = 0
  let boostActive = false
  let boostEndTime = 0
  const boostDuration = 2000  // 2 seconds of boost per charge

  // Power-up collection alert
  let powerUpAlert: { message: string; color: string; timestamp: number } | null = null
  const powerUpNames: Record<string, { name: string; color: string }> = {
    health: { name: 'HEALTH +30', color: '#ff4444' },
    ammo: { name: 'AMMO +10', color: '#44ff44' },
    boost: { name: 'BOOST +1', color: '#44ffff' },
    'weapon-missile': { name: 'MISSILES +10', color: '#ffff44' },
    'weapon-plasma': { name: 'PLASMA +5', color: '#ff44ff' },
    'weapon-chain': { name: 'CHAIN LIGHTNING +8', color: '#44aaff' },
    'weapon-drone': { name: 'DRONE SWARM +3', color: '#88ff44' },
    'weapon-scatter': { name: 'SCATTER SHOT +15', color: '#ff8844' }
  }
  const weaponFlashColors: Record<Weapon['type'], string> = {
    laser: '#44ffff',
    missile: '#ffcc66',
    plasma: '#ff66ff',
    chain: '#66ccff',
    drone: '#a6ff5c',
    scatter: '#ff9944'
  }

  // Particles
  interface Particle { mesh: THREE.Mesh; velocity: THREE.Vector3; lifetime: number; maxLifetime: number; scaleGrowth?: number }
  let particles: Particle[] = []

  let solidObjects: THREE.Object3D[] = []

  function mergeAvailableMaps(maps: MapData[]) {
    const existingIds = new Set(availableMaps.map(m => m.id))
    const merged = [...availableMaps]
    maps.forEach(map => {
      if (!existingIds.has(map.id)) {
        merged.push(map)
        existingIds.add(map.id)
      }
    })
    availableMaps = merged
  }

  function loadAvailableMaps() {
    // Use same localStorage key as Blocky Shooter
    const stored = localStorage.getItem('worldBuilder_maps')
    if (stored) {
      try {
        customMaps = JSON.parse(stored)
      } catch (e) {
        console.error('Failed to load maps:', e)
        customMaps = []
      }
    }
    updateAvailableMaps()
  }

  async function loadStaticMaps() {
    const maps: MapData[] = []
    for (const file of staticMapFiles) {
      try {
        const response = await fetch(`/3d-maps/${file}`)
        if (!response.ok) continue
        const data: MapData = await response.json()
        maps.push({
          ...data,
          id: data.id ?? file,
          name: data.name ?? file.replace('.json', '')
        })
      } catch (e) {
        console.error('Failed to load static map:', file, e)
      }
    }
    builtInMaps = maps
    updateAvailableMaps()
  }

  function updateAvailableMaps() {
    // Merge custom and built-in maps, avoiding duplicates
    const existingIds = new Set(customMaps.map(m => m.id))
    availableMaps = [...customMaps, ...builtInMaps.filter(m => !existingIds.has(m.id))]
  }

  // Load default map thumbnail for menu display
  async function loadDefaultMapThumbnail() {
    try {
      const response = await fetch('/3d-maps/default_map.json')
      const data: MapData = await response.json()
      defaultMapThumbnail = data.thumbnail
    } catch (e) {
      console.error('Failed to load default map thumbnail:', e)
    }
  }

  // Load model catalog for level auto-generation (same as FPS game)
  async function loadModelCatalog() {
    try {
      const response = await fetch('/modelCatalog.json')
      modelCatalog = await response.json()
    } catch (e) {
      console.error('Failed to load model catalog:', e)
    }
  }

  // Ship preview renderers
  let shipPreviews: Map<string, { renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, ship: THREE.Group | null, animId: number }> = new Map()

  function renderShipPreviews() {
    const loader = new GLTFLoader()

    spaceshipOptions.forEach(ship => {
      const canvas = document.querySelector(`.ship-preview-${ship.id}`) as HTMLCanvasElement
      if (!canvas) return

      const previewScene = new THREE.Scene()
      previewScene.background = new THREE.Color(0x1a1a2e)

      // Closer camera for 2x larger ships
      const previewCamera = new THREE.PerspectiveCamera(35, canvas.clientWidth / canvas.clientHeight, 0.1, 100)
      previewCamera.position.set(1.2, 0.8, 1.8)
      previewCamera.lookAt(0, 0, 0)

      const previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
      previewRenderer.setSize(canvas.clientWidth, canvas.clientHeight)
      previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

      // Full brightness lighting
      const ambient = new THREE.AmbientLight(0xffffff, 1.5)
      previewScene.add(ambient)
      const directional = new THREE.DirectionalLight(0xffffff, 2.0)
      directional.position.set(5, 5, 5)
      previewScene.add(directional)
      const fill = new THREE.DirectionalLight(0xffffff, 1.5)
      fill.position.set(-3, 2, -3)
      previewScene.add(fill)
      const backLight = new THREE.DirectionalLight(0xffffff, 1.0)
      backLight.position.set(0, -3, -5)
      previewScene.add(backLight)

      let shipModel: THREE.Group | null = null

      loader.load(ship.path, (gltf) => {
        shipModel = gltf.scene
        // Center and scale the model - sized to fit frame nicely
        const box = new THREE.Box3().setFromObject(shipModel)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z)
        // Battle Carrier (variant3) is larger, so use smaller scale (2/3 of others)
        const baseScale = ship.id === 'variant3' ? 1.33 : 2.0
        const scale = baseScale / maxDim
        shipModel.scale.setScalar(scale)
        shipModel.position.sub(center.multiplyScalar(scale))
        previewScene.add(shipModel)
      }, undefined, (error) => {
        // On error, add a placeholder cube
        const geo = new THREE.BoxGeometry(1, 0.5, 1.5)
        const mat = new THREE.MeshStandardMaterial({ color: 0x44aaff })
        const mesh = new THREE.Mesh(geo, mat)
        previewScene.add(mesh)
      })

      // Animate
      const animatePreview = () => {
        const animId = requestAnimationFrame(animatePreview)
        if (shipModel) shipModel.rotation.y += 0.01
        previewRenderer.render(previewScene, previewCamera)
        shipPreviews.set(ship.id, { renderer: previewRenderer, scene: previewScene, camera: previewCamera, ship: shipModel, animId })
      }
      animatePreview()
    })
  }

  function cleanupShipPreviews() {
    shipPreviews.forEach((preview) => {
      cancelAnimationFrame(preview.animId)
      preview.renderer.dispose()
    })
    shipPreviews.clear()
  }

  onMount(() => {
    loadAvailableMaps()
    loadStaticMaps()
    initThree()
    loadModelCatalog()
    loadDefaultMapThumbnail()

    // Render ship previews after a short delay to ensure DOM is ready
    setTimeout(renderShipPreviews, 100)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('resize', handleResize)
    document.addEventListener('pointerlockchange', handlePointerLockChange)

    animate()

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      window.addEventListener('resize', handleResize)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      cancelAnimationFrame(animationId)
      cleanupShipPreviews()
      renderer?.dispose()
    }
  })

  function createStarfield() {
    const starCount = 8500
    const starVertices: number[] = []
    for (let i = 0; i < starCount; i++) {
      const x = THREE.MathUtils.randFloatSpread(1500)
      const y = THREE.MathUtils.randFloatSpread(1500)
      const z = THREE.MathUtils.randFloatSpread(1500)
      if (new THREE.Vector3(x, y, z).length() < 100) continue
      starVertices.push(x, y, z)
    }

    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3))

    // Bright, slightly larger stars for readability
    const primaryStars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ color: 0xe8f3ff, size: 0.9, transparent: true, opacity: 0.9 })
    )
    scene.add(primaryStars)

    // Soft tinted layer for depth and extra sparkle
    const secondaryStars = new THREE.Points(
      starGeometry.clone(),
      new THREE.PointsMaterial({ color: 0x9fc7ff, size: 0.6, transparent: true, opacity: 0.6 })
    )
    secondaryStars.scale.setScalar(1.2)
    scene.add(secondaryStars)
  }

  function initThree() {
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a1326)

    createStarfield();

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 2000)
    camera.position.set(0, 5, 10)

    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.shadowMap.enabled = true
    container.appendChild(renderer.domElement)

    clock = new THREE.Clock()

    // Lighting
    scene.add(new THREE.AmbientLight(0xcccccc, 0.8)) // Brighter ambient for space
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5) // Brighter sun
    dirLight.position.set(50, 100, 50)
    dirLight.castShadow = true
    scene.add(dirLight)
  }

  async function loadPlayerShip() {
    const loader = new GLTFLoader()
    try {
      const gltf = await loader.loadAsync(selectedSpaceship.path)
      playerShip = new THREE.Group()
      const model = gltf.scene
      model.scale.setScalar(shipScale)
      model.rotation.y = Math.PI  // Face forward (model faces +Z, we want -Z)
      model.traverse(child => { if (child instanceof THREE.Mesh) { child.castShadow = true } })
      playerShip.add(model)
      playerShip.add(new THREE.PointLight(0x00ffff, 2, 10))
      scene.add(playerShip)
      playerShip.position.set(0, 15, 0)  // Start at reasonable height

      // Reset camera state for new game
      cameraInitialized = false
      smoothedCameraPos.set(0, 18, 8)  // Initial camera position behind ship
      camera.position.copy(smoothedCameraPos)
      camera.lookAt(playerShip.position)
    } catch (error) {
      console.error('Failed to load ship:', error)
      createFallbackShip()
    }
  }

  function createFallbackShip() {
    playerShip = new THREE.Group()
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 4), new THREE.MeshStandardMaterial({ color: 0x2266ff, metalness: 0.8, emissive: 0x1144aa, emissiveIntensity: 0.3 }))
    body.rotation.x = Math.PI / 2
    body.scale.setScalar(shipScale * 3)
    playerShip.add(body)
    scene.add(playerShip)
    playerShip.position.set(0, 15, 0)

    // Reset camera state for new game
    cameraInitialized = false
    smoothedCameraPos.set(0, 18, 8)
    camera.position.copy(smoothedCameraPos)
    camera.lookAt(playerShip.position)
  }

  async function loadMap(map: MapData) {
    isLoadingMap = true
    const loader = new GLTFLoader()
    solidObjects.forEach(obj => scene.remove(obj))
    solidObjects = []

    // We want a space background for all levels, so we don't apply the map's environment.
    // applyEnvironment(map.environment)

    // Also removing the ground plane.
    // const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0x2d5016, roughness: 0.8 }))
    // ground.rotation.x = -Math.PI / 2
    // ground.receiveShadow = true
    // scene.add(ground)

    for (const obj of map.objects) {
      try {
        const gltf = await loader.loadAsync(obj.modelPath)
        const mesh = gltf.scene
        mesh.position.set(obj.position.x, obj.position.y, obj.position.z)
        mesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z)
        mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z)
        mesh.traverse(child => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true } })
        scene.add(mesh)
        solidObjects.push(mesh)
      } catch (e) { console.error('Failed to load:', obj.modelPath) }
    }
    isLoadingMap = false
  }

  function applyEnvironment(env: MapData['environment']) {
    const colors: Record<string, { sky: number; fog: number }> = {
      dawn: { sky: 0xffd4a0, fog: 0x111111 }, // dark fog
      day: { sky: 0x87ceeb, fog: 0x111111 }, // dark fog
      sunset: { sky: 0xff6b4a, fog: 0x111111 }, // dark fog
      night: { sky: 0x0a0a2e, fog: 0x000000 } // black fog
    }
    const c = colors[env.timeOfDay]
    // scene.background = new THREE.Color(c.sky) // REMOVED
    // Fog density from map can be 0-200+, need very small multiplier for FogExp2
    // A density of 0.002-0.005 gives visible fog, 200 * 0.00002 = 0.004
    scene.fog = env.fogDensity > 0 ? new THREE.FogExp2(c.fog, env.fogDensity * 0.00002) : null
  }

  async function createDefaultMap() {
    // Try to load the same default map as Blocky Shooter
    try {
      const response = await fetch('/3d-maps/default_map.json')
      const defaultMapData: MapData = await response.json()
      // We still want space background, so don't apply environment from map directly.
      // Instead, we just load the objects.
      isLoadingMap = true
      const loader = new GLTFLoader()
      solidObjects.forEach(obj => scene.remove(obj))
      solidObjects = []

      // Don't apply environment, we want space!
      // applyEnvironment(defaultMapData.environment)

      for (const obj of defaultMapData.objects) {
        try {
          const gltf = await loader.loadAsync(obj.modelPath)
          const mesh = gltf.scene
          mesh.position.set(obj.position.x, obj.position.y, obj.position.z)
          mesh.rotation.set(obj.rotation.x, obj.rotation.y, obj.rotation.z)
          mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z)
          mesh.traverse(child => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true } })
          scene.add(mesh)
          solidObjects.push(mesh)
        } catch (e) { console.error('Failed to load:', obj.modelPath) }
      }
      isLoadingMap = false
      return
    } catch (error) {
      console.error('Failed to load default map, creating procedural space environment:', error)
    }

    // Fallback: create procedural asteroid field
    for (let i = 0; i < 50; i++) {
      const size = 2 + Math.random() * 8;
      const asteroid = new THREE.Mesh(
        new THREE.DodecahedronGeometry(size, 0),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(0, 0, 0.3 + Math.random() * 0.3),
          metalness: 0.6,
          roughness: 0.8
        })
      )
      asteroid.position.set(
        (Math.random() - 0.5) * 400,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 400
      )
      asteroid.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      asteroid.castShadow = true;
      asteroid.receiveShadow = true;
      scene.add(asteroid);
      solidObjects.push(asteroid);
    }
  }

  // Generate scenery for the level (same as FPS game - simplified version of World Builder auto-generate)
  async function generateLevelScenery() {
    if (modelCatalog.length === 0) return

    // Clear existing solid objects
    solidObjects.forEach(obj => scene.remove(obj))
    solidObjects = []

    // Categorize models (same as FPS game / World Builder)
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

    // Helper to place model (same as FPS game)
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
        if (maxDim > 0) {
          const scaleFactor = baseScale / maxDim
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
        solidObjects.push(mesh)
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

    console.log(`Level ${level} auto-generated: ${solidObjects.length} objects`)
  }

  function createEnemyModel(type: EnemyType): THREE.Group {
    const g = new THREE.Group()

    if (type === 'basic') {
      // Basic Enemy - Red Octahedron with Yellow Core and Orbiting Rings (matching Blocky Shooter)
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.7 })
      const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), bodyMat)
      body.castShadow = true
      g.add(body)

      // Glowing yellow core
      const coreMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00, emissiveIntensity: 1 })
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), coreMat))

      // Orbiting rings
      const ringMat = new THREE.MeshStandardMaterial({ color: 0xff3300, emissive: 0xff3300, emissiveIntensity: 0.3 })
      const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 8, 16), ringMat)
      ring1.rotation.x = Math.PI / 2
      g.add(ring1)
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.08, 8, 16), ringMat.clone())
      ring2.rotation.z = Math.PI / 2
      g.add(ring2)

    } else if (type === 'fast') {
      // Fast Enemy - Cyan Cone with Spikes (matching Blocky Shooter)
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x0088ff, emissiveIntensity: 0.7, metalness: 0.8, roughness: 0.2 })
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 8), bodyMat)
      body.rotation.x = Math.PI / 2  // Point forward for flight
      body.castShadow = true
      g.add(body)

      // Speed spikes
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0x0088ff, emissive: 0x0044ff, emissiveIntensity: 0.5 })
      for (let i = 0; i < 4; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 4), spikeMat)
        const angle = (i / 4) * Math.PI * 2
        spike.position.x = Math.cos(angle) * 0.4
        spike.position.y = Math.sin(angle) * 0.4
        spike.rotation.z = -angle + Math.PI / 2
        g.add(spike)
      }

    } else if (type === 'tank') {
      // Tank Enemy - Dark Orange Box with Armor and Turret (matching Blocky Shooter)
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x884400, emissive: 0x441100, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.9 })
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), bodyMat)
      body.castShadow = true
      g.add(body)

      // Armor plates
      const armorMat = new THREE.MeshStandardMaterial({ color: 0x553300, emissive: 0x221100, emissiveIntensity: 0.3 })
      const armorTop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 1.7), armorMat)
      armorTop.position.y = 0.9
      g.add(armorTop)
      const armorBottom = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 1.7), armorMat.clone())
      armorBottom.position.y = -0.9
      g.add(armorBottom)

      // Turret
      const turretMat = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 0.5 })
      const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.6, 8), turretMat)
      turret.position.z = -0.9
      turret.rotation.x = Math.PI / 2
      g.add(turret)

    } else {
      // Boss Enemy - Dark Purple Dodecahedron with Magenta Core and Spikes (matching Blocky Shooter)
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4400aa, emissive: 0x8800ff, emissiveIntensity: 0.8, metalness: 0.9, roughness: 0.3 })
      const body = new THREE.Mesh(new THREE.DodecahedronGeometry(3, 0), bodyMat)
      body.castShadow = true
      g.add(body)

      // Massive glowing magenta core
      const coreMat = new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 1.5 })
      g.add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 32), coreMat))

      // Multiple orbiting rings
      for (let i = 0; i < 3; i++) {
        const ringMat = new THREE.MeshStandardMaterial({ color: 0xff00aa, emissive: 0xff0088, emissiveIntensity: 0.6 })
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5 + i * 0.5, 0.2, 12, 24), ringMat)
        ring.rotation.x = (Math.PI / 4) * i
        ring.rotation.y = (Math.PI / 3) * i
        g.add(ring)
      }

      // Menacing spikes
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0x660099, emissive: 0x440066, emissiveIntensity: 0.5 })
      for (let i = 0; i < 8; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2, 8), spikeMat)
        const angle = (i / 8) * Math.PI * 2
        spike.position.x = Math.cos(angle) * 3.5
        spike.position.z = Math.sin(angle) * 3.5
        spike.rotation.z = Math.PI / 2
        spike.rotation.y = angle
        g.add(spike)
      }
    }

    // Scale appropriately - boss is already big, others need scaling
    if (type === 'boss') {
      g.scale.setScalar(0.4)
    } else {
      g.scale.setScalar(shipScale * 3)
    }
    return g
  }

  function getEnemyStats(type: EnemyType) {
    const base = { health: 50, speed: gameConfig.enemySpeed, fireRate: gameConfig.enemyFireRate, damage: gameConfig.enemyDamage }
    if (type === 'fast') return { ...base, health: 30, speed: base.speed * 2, damage: base.damage * 0.7 }
    if (type === 'tank') return { ...base, health: 100, speed: base.speed * 0.5, damage: base.damage * 1.5 }
    if (type === 'boss') return { health: 1000 + level * 200, speed: base.speed * 0.4, fireRate: base.fireRate * 0.25, damage: base.damage * 3 }
    return base
  }

  function spawnEnemy(type: EnemyType = 'basic') {
    const mesh = createEnemyModel(type), stats = getEnemyStats(type)
    const angle = Math.random() * Math.PI * 2, dist = 50 + Math.random() * 50
    mesh.position.set(Math.cos(angle) * dist, 10 + Math.random() * 30, Math.sin(angle) * dist)
    scene.add(mesh)
    const enemy: Enemy = { mesh, health: stats.health, maxHealth: stats.health, lastShot: Date.now(), velocity: new THREE.Vector3(), type, speed: stats.speed, fireRate: stats.fireRate, damage: stats.damage }
    enemies.push(enemy)
    if (type === 'boss') { bossEnemy = enemy; bossHealth = enemy.health; bossMaxHealth = enemy.maxHealth }
  }

  function spawnWave() {
    const types: EnemyType[] = ['basic', 'basic', 'fast']
    if (level >= 2) types.push('tank')
    if (level % 3 === 0) { isBossLevel = true; spawnEnemy('boss'); for (let i = 0; i < 3; i++) spawnEnemy('basic') }
    else { isBossLevel = false; for (let i = 0; i < Math.min(gameConfig.enemyCount + level, 15); i++) setTimeout(() => spawnEnemy(types[Math.floor(Math.random() * types.length)]), i * 300) }
  }

  // Check if we should drop a power-up based on frequency setting
  function trySpawnPowerUpOnKill(position: THREE.Vector3) {
    killsSinceLastDrop++
    const dropRate = powerUpDropRates[gameConfig.powerUpFrequency]
    if (killsSinceLastDrop >= dropRate) {
      killsSinceLastDrop = 0
      spawnPowerUpAt(position)
    }
  }

  function spawnPowerUpAt(position: THREE.Vector3) {
    const types: PowerUpType[] = ['health', 'ammo', 'boost', 'weapon-missile', 'weapon-plasma', 'weapon-chain', 'weapon-drone', 'weapon-scatter']
    const type = types[Math.floor(Math.random() * types.length)]
    const g = new THREE.Group()
    const color = powerUpColors[type]

    // Create type-specific power-up visuals
    if (type === 'health') {
      // Health - Red Cross/Plus Symbol
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.4 })
      const h = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.3), mat)
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), mat)
      g.add(h, v)
    } else if (type === 'ammo') {
      // Ammo - Green Box/Crate
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.3 })
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat))
    } else if (type === 'boost') {
      // Boost/Flying - Cyan Jetpack/Wings
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.0, metalness: 0.8, roughness: 0.2 })
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 8), mat)
      const leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.6), mat)
      const rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.6), mat)
      leftWing.position.x = -0.5
      rightWing.position.x = 0.5
      g.add(body, leftWing, rightWing)
    } else if (type === 'weapon-missile') {
      // Missile - Yellow Cone/Rocket
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, metalness: 0.7, roughness: 0.2 })
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 8), mat)
      cone.rotation.x = Math.PI / 2
      g.add(cone)
    } else if (type === 'weapon-plasma') {
      // Plasma - Magenta glowing orb with energy rings
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, metalness: 0.9, roughness: 0.1 })
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), mat)
      const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 16), mat)
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 16), mat)
      ring1.rotation.x = Math.PI / 2
      ring2.rotation.y = Math.PI / 2
      g.add(orb, ring1, ring2)
    } else if (type === 'weapon-chain') {
      // Chain Lightning - Electric blue zigzag bolt
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, metalness: 0.8, roughness: 0.2 })
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 6), mat)
      const spark1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), mat)
      const spark2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.15), mat)
      spark1.position.set(0.3, 0.3, 0)
      spark2.position.set(-0.3, -0.3, 0)
      bolt.rotation.z = Math.PI / 4
      g.add(bolt, spark1, spark2)
    } else if (type === 'weapon-drone') {
      // Drone Swarm - Lime green small ship cluster
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, metalness: 0.7, roughness: 0.3 })
      for (let i = 0; i < 3; i++) {
        const drone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 4), mat)
        drone.rotation.x = Math.PI / 2
        drone.position.set(Math.cos(i * Math.PI * 2 / 3) * 0.4, Math.sin(i * Math.PI * 2 / 3) * 0.4, 0)
        g.add(drone)
      }
    } else if (type === 'weapon-scatter') {
      // Scatter Shot - Orange burst pattern
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.3 })
      const center = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), mat)
      g.add(center)
      for (let i = 0; i < 6; i++) {
        const pellet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), mat)
        const angle = (i / 6) * Math.PI * 2
        pellet.position.set(Math.cos(angle) * 0.6, Math.sin(angle) * 0.6, 0)
        g.add(pellet)
      }
    }

    // Add glow ring around all power-ups
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 8, 32), ringMat)
    ring.rotation.x = Math.PI / 2
    g.add(ring)

    g.position.copy(position)
    scene.add(g)
    powerUps.push({ mesh: g, type })
  }

  function handleKeyDown(e: KeyboardEvent) {
    keys[e.key.toLowerCase()] = true
    if (e.key === 'Shift') { e.preventDefault(); isFiring = true }  // Shift for firing
    // Spacebar activates boost if charges available
    if (e.key === ' ' && boostCharges > 0 && !boostActive) {
      e.preventDefault()
      boostCharges--
      boostActive = true
      boostEndTime = Date.now() + boostDuration
      powerUpAlert = { message: 'BOOST ACTIVATED!', color: '#44ffff', timestamp: Date.now() }
    }
    if (e.key >= '1' && e.key <= '5') { const i = parseInt(e.key) - 1; if (i < weaponInventory.length) currentWeaponIndex = i }
    // Arrow up/down to cycle weapons
    if (e.key === 'ArrowUp' && weaponInventory.length > 1) {
      e.preventDefault()
      currentWeaponIndex = (currentWeaponIndex - 1 + weaponInventory.length) % weaponInventory.length
      flashSelectedWeapon()
    }
    if (e.key === 'ArrowDown' && weaponInventory.length > 1) {
      e.preventDefault()
      currentWeaponIndex = (currentWeaponIndex + 1) % weaponInventory.length
      flashSelectedWeapon()
    }
    if (e.key === 'Escape' && isPlaying) { isPlaying = false; document.exitPointerLock() }
  }

  function handleKeyUp(e: KeyboardEvent) {
    keys[e.key.toLowerCase()] = false
    if (e.key === 'Shift') isFiring = false
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isPlaying || !isPointerLocked) return

    const now = Date.now()
    const delta = Math.sqrt(e.movementX ** 2 + e.movementY ** 2)

    // Track movement for input type detection (auto mode)
    if (gameConfig.mouseInput === 'auto' && delta > 0) {
      movementSamples.push({ delta, time: now })
      // Keep only last 30 samples from last 500ms
      movementSamples = movementSamples.filter(s => now - s.time < 500).slice(-30)

      if (movementSamples.length >= 10) {
        const avgDelta = movementSamples.reduce((a, b) => a + b.delta, 0) / movementSamples.length
        const hasSmallMovements = avgDelta < 8  // Trackpads have smaller, more frequent movements
        const hasFrequentUpdates = movementSamples.length > 15  // More events in 500ms

        if (hasSmallMovements && hasFrequentUpdates) {
          detectedInputType = 'trackpad'
        } else if (avgDelta > 15) {
          detectedInputType = 'external'
        }
      }
    }

    lastMovementTime = now
    isFingerOnTrackpad = true  // Receiving events means finger is on trackpad

    // For trackpad mode: store last movement direction (view continues while finger down)
    if (getEffectiveInputType() === 'trackpad' && delta > 0.5) {
      // Store the movement direction - will continue until finger lifts
      continuousMotion.x = e.movementX
      continuousMotion.y = e.movementY
    }

    // Store raw mouse delta - sensitivity applied in updatePlayer only
    mouseMovement.x = e.movementX
    mouseMovement.y = e.movementY
  }

  function handleMouseDown() { if (isPlaying && isPointerLocked) isMouseDown = true }
  function handleMouseUp() { isMouseDown = false }

  function handlePointerLockChange() {
    isPointerLocked = document.pointerLockElement === renderer.domElement
    if (!isPointerLocked && isPlaying && hasStartedGame) isPlaying = false
  }

  function handleResize() {
    if (!camera || !renderer) return
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }

  function shoot() {
    const now = Date.now(), weapon = weaponInventory[currentWeaponIndex]
    const rates: Record<string, number> = { laser: 100, missile: 500, plasma: 600, chain: 400, drone: 1500, scatter: 300 }
    if (now - lastShot < (rates[weapon.type] || 200) || weapon.ammo === 0) return
    if (weapon.ammo > 0) {
      weapon.ammo--
      weaponInventory = weaponInventory  // Trigger reactive HUD update
      // Auto-switch to laser cannon when current weapon runs out
      if (weapon.ammo === 0 && weapon.type !== 'laser') {
        currentWeaponIndex = 0  // Switch to laser cannon (always index 0)
        powerUpAlert = { message: 'OUT OF AMMO - LASER', color: '#ff4444', timestamp: Date.now() }
      }
    }
    lastShot = now
    if (!playerShip) return

    // Calculate aim direction: find where camera center ray hits a target plane, then aim from ship to that point
    // This corrects the parallax between camera position and ship position
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)

    // Find a point along the camera ray at a reasonable target distance
    const targetDistance = 100  // Distance ahead where crosshair actually points
    const targetPoint = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(targetDistance))

    // Calculate direction from ship to that target point
    const dir = targetPoint.clone().sub(playerShip.position).normalize()

    let mesh: THREE.Mesh | THREE.Group
    let vel: THREE.Vector3, dmg: number, lt: number

    if (weapon.type === 'laser') {
      // Laser - Sleek elongated beam with bright core and energy trail
      const beamGroup = new THREE.Group()

      // Core beam - bright white center
      const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), coreMaterial)
      core.rotation.x = Math.PI / 2

      // Inner glow - cyan
      const innerGlowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8 })
      const innerGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 8), innerGlowMat)
      innerGlow.rotation.x = Math.PI / 2

      // Outer glow - larger, more transparent
      const outerGlowMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.3 })
      const outerGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.8, 8), outerGlowMat)
      outerGlow.rotation.x = Math.PI / 2

      // Tip point
      const tipMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 6), tipMat)
      tip.rotation.x = -Math.PI / 2
      tip.position.z = -0.7

      beamGroup.add(core, innerGlow, outerGlow, tip)
      beamGroup.lookAt(beamGroup.position.clone().add(dir))
      mesh = beamGroup as unknown as THREE.Mesh

      vel = dir.clone().multiplyScalar(150); dmg = gameConfig.playerDamage; lt = 1.5  // Much faster!
      mesh.position.copy(playerShip.position).add(dir.clone().multiplyScalar(1.5))
      scene.add(mesh)
      projectiles.push({ mesh, velocity: vel, damage: dmg, type: weapon.type, lifetime: lt })

    } else if (weapon.type === 'missile') {
      // Missile - Heat-seeking orange cone
      const missileMaterial = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff3300, emissiveIntensity: 0.8 })
      mesh = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.6, 8), missileMaterial)
      mesh.rotation.x = -Math.PI / 2
      const trailMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6 })
      const trail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 6), trailMaterial)
      trail.position.z = 0.4; trail.rotation.x = Math.PI
      mesh.add(trail)
      vel = dir.clone().multiplyScalar(50); dmg = gameConfig.playerDamage * 2; lt = 4
      // Find closest enemy for heat-seeking
      let closestEnemy: Enemy | null = null, closestDist = Infinity
      for (const e of enemies) {
        const d = playerShip.position.distanceTo(e.mesh.position)
        if (d < 100 && d < closestDist) { closestDist = d; closestEnemy = e }
      }
      mesh.position.copy(playerShip.position).add(dir.clone().multiplyScalar(1.5))
      scene.add(mesh)
      projectiles.push({ mesh, velocity: vel, damage: dmg, type: weapon.type, lifetime: lt, target: closestEnemy })

    } else if (weapon.type === 'plasma') {
      // Plasma Cannon - Forward-only with short-range homing toward enemies near crosshair
      // Ensure we're shooting forward - check if aim direction is in front of ship
      const shipFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.quaternion)
      const aimDot = dir.dot(shipFwd)
      if (aimDot < 0.3) {
        // Aiming too far backward - force forward direction
        dir.copy(shipFwd)
      }

      // Find closest enemy near the crosshair (short range, must be in front)
      let plasmaTarget: Enemy | null = null
      let closestAngle = Math.PI / 4  // Max 45 degrees from crosshair
      for (const e of enemies) {
        const toEnemy = e.mesh.position.clone().sub(playerShip.position)
        const dist = toEnemy.length()
        if (dist < 50) {  // Short range
          toEnemy.normalize()
          const angle = Math.acos(Math.max(-1, Math.min(1, toEnemy.dot(dir))))
          if (angle < closestAngle) {
            closestAngle = angle
            plasmaTarget = e
          }
        }
      }

      const plasmaMat = new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 1.5 })
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), plasmaMat)
      // Add energy rings
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xff88ff, transparent: true, opacity: 0.5 })
      const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 16), ringMat)
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 16), ringMat)
      ring1.rotation.x = Math.PI / 2; ring2.rotation.y = Math.PI / 2
      mesh.add(ring1, ring2)
      vel = dir.clone().multiplyScalar(60); dmg = gameConfig.playerDamage * 3; lt = 3
      mesh.position.copy(playerShip.position).add(dir.clone().multiplyScalar(1.5))
      scene.add(mesh)
      projectiles.push({ mesh, velocity: vel, damage: dmg, type: weapon.type, lifetime: lt, target: plasmaTarget })

    } else if (weapon.type === 'chain') {
      // Chain Lightning - Instant lightning bolt that hits closest enemy to crosshair and chains
      // Ensure forward-only firing
      const shipFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.quaternion)
      const aimDot = dir.dot(shipFwd)
      if (aimDot < 0.3) {
        dir.copy(shipFwd)  // Force forward if aiming backward
      }

      // Find the closest enemy near the crosshair (medium range)
      let primaryTarget: Enemy | null = null
      let closestAngle = Math.PI / 3  // Max 60 degrees from crosshair
      for (const e of enemies) {
        const toEnemy = e.mesh.position.clone().sub(playerShip.position)
        const dist = toEnemy.length()
        if (dist < 70) {  // Medium range
          toEnemy.normalize()
          const angle = Math.acos(Math.max(-1, Math.min(1, toEnemy.dot(dir))))
          if (angle < closestAngle) {
            closestAngle = angle
            primaryTarget = e
          }
        }
      }

      if (primaryTarget) {
        // Found a target - create instant lightning chain!
        const chainDamage = gameConfig.playerDamage * 1.5
        const hitEnemies: Enemy[] = [primaryTarget]

        // Create lightning from ship to first target
        createLightningArc(playerShip.position.clone().add(dir.clone().multiplyScalar(1.5)), primaryTarget.mesh.position)

        // Damage first target
        primaryTarget.health -= chainDamage
        if (primaryTarget.type === 'boss') bossHealth = primaryTarget.health

        // Chain to up to 2 more enemies (3 total)
        let lastTarget = primaryTarget
        for (let chainCount = 0; chainCount < 2; chainCount++) {
          let nextTarget: Enemy | null = null
          let shortestDist = 20  // Short chain range

          for (const e of enemies) {
            if (!hitEnemies.includes(e)) {
              const d = lastTarget.mesh.position.distanceTo(e.mesh.position)
              if (d < shortestDist) {
                shortestDist = d
                nextTarget = e
              }
            }
          }

          if (nextTarget) {
            // Create lightning arc to next target
            createLightningArc(lastTarget.mesh.position, nextTarget.mesh.position)
            // Damage chained enemy (reduced damage)
            const chainedDamage = chainDamage * (0.8 - chainCount * 0.15)
            nextTarget.health -= chainedDamage
            if (nextTarget.type === 'boss') bossHealth = nextTarget.health
            hitEnemies.push(nextTarget)
            lastTarget = nextTarget
          } else {
            break  // No more targets to chain to
          }
        }

        // Check for kills on all hit enemies
        for (const e of hitEnemies) {
          if (e.health <= 0 && enemies.includes(e)) {
            createExplosion(e.mesh.position, e.type === 'boss' ? 3 : 1)
            const deathPos = e.mesh.position.clone()
            scene.remove(e.mesh)
            const idx = enemies.indexOf(e)
            if (idx !== -1) enemies.splice(idx, 1)
            score += e.type === 'boss' ? 500 : e.type === 'tank' ? 100 : e.type === 'fast' ? 50 : 25
            kills++
            if (e.type === 'boss') { bossEnemy = null; bossHealth = 0; isBossLevel = false }
            trySpawnPowerUpOnKill(deathPos)
          }
        }
      } else {
        // No target found - fire a visual-only lightning bolt forward
        const endPoint = playerShip.position.clone().add(dir.clone().multiplyScalar(50))
        createLightningArc(playerShip.position.clone().add(dir.clone().multiplyScalar(1.5)), endPoint)
      }
      // Chain lightning is instant - no projectile needed
      return

    } else if (weapon.type === 'drone') {
      // Drone Swarm - Releases 3 autonomous attack drones
      for (let i = 0; i < 3; i++) {
        const droneMat = new THREE.MeshStandardMaterial({ color: 0x88ff00, emissive: 0x88ff00, emissiveIntensity: 0.8 })
        const droneGroup = new THREE.Group()
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), droneMat)
        body.rotation.x = -Math.PI / 2
        droneGroup.add(body)
        // Offset each drone slightly
        const offset = new THREE.Vector3((i - 1) * 0.8, 0, 0).applyQuaternion(playerShip.quaternion)
        droneGroup.position.copy(playerShip.position).add(dir.clone().multiplyScalar(1.5)).add(offset)
        scene.add(droneGroup)
        // Find a target for this drone
        let target: Enemy | null = null, closestDist = Infinity
        for (const e of enemies) {
          const d = playerShip.position.distanceTo(e.mesh.position)
          if (d < 80 && d < closestDist) { closestDist = d; target = e }
        }
        vel = dir.clone().multiplyScalar(40)
        projectiles.push({ mesh: droneGroup, velocity: vel, damage: gameConfig.playerDamage * 1.5, type: 'drone', lifetime: 5, target, isDrone: true })
      }

    } else if (weapon.type === 'scatter') {
      // Scatter Shot - Fires a denser, tighter cone of pellets
      const numPellets = 9
      const spreadAngle = 0.12 // radians (tighter for more hits)
      for (let i = 0; i < numPellets; i++) {
        const scatterMat = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff6600, emissiveIntensity: 0.9 })
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), scatterMat)
        // Calculate spread direction
        const angleOffset = (i - (numPellets - 1) / 2) * spreadAngle / (numPellets - 1) * 2
        const spreadDir = dir.clone()
        // Rotate around up vector for horizontal spread
        const upAxis = new THREE.Vector3(0, 1, 0)
        spreadDir.applyAxisAngle(upAxis, angleOffset)
        // Add slight vertical spread
        const rightAxis = new THREE.Vector3().crossVectors(dir, upAxis).normalize()
        spreadDir.applyAxisAngle(rightAxis, (Math.random() - 0.5) * spreadAngle * 0.5)

        vel = spreadDir.multiplyScalar(85)
        mesh.position.copy(playerShip.position).add(dir.clone().multiplyScalar(1.5))
        scene.add(mesh)
        projectiles.push({ mesh, velocity: vel, damage: gameConfig.playerDamage * 0.8, type: 'scatter', lifetime: 1.8 })
      }
    }
  }

  function createExplosion(pos: THREE.Vector3, size = 1) {
    for (let i = 0; i < 15; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.1 * size, 4, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(Math.random() * 0.1 + 0.05, 1, 0.5), transparent: true }))
      p.position.copy(pos)
      scene.add(p)
      particles.push({ mesh: p, velocity: new THREE.Vector3((Math.random() - 0.5) * 10 * size, (Math.random() - 0.5) * 10 * size, (Math.random() - 0.5) * 10 * size), lifetime: 1, maxLifetime: 1 })
    }
  }

  function createPlasmaBlastVisual(pos: THREE.Vector3) {
    // Expanding pink sphere (starts a bit larger; scales to match damage radius)
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff66ff, transparent: true, opacity: 0.8 })
    )
    core.position.copy(pos)
    scene.add(core)
    particles.push({ mesh: core, velocity: new THREE.Vector3(), lifetime: 0.4, maxLifetime: 0.4, scaleGrowth: 6 })

    // Shockwave ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, 0.16, 12, 24),
      new THREE.MeshBasicMaterial({ color: 0xff99ff, transparent: true, opacity: 0.7 })
    )
    ring.rotation.x = Math.PI / 2
    ring.position.copy(pos)
    scene.add(ring)
    particles.push({ mesh: ring, velocity: new THREE.Vector3(), lifetime: 0.6, maxLifetime: 0.6, scaleGrowth: 3.5 })
  }

  function handleEnemyDeath(enemy: Enemy) {
    const idx = enemies.indexOf(enemy)
    if (idx === -1) return
    createExplosion(enemy.mesh.position, enemy.type === 'boss' ? 3 : 1)
    const deathPos = enemy.mesh.position.clone()
    scene.remove(enemy.mesh); enemies.splice(idx, 1)
    score += enemy.type === 'boss' ? 500 : enemy.type === 'tank' ? 100 : enemy.type === 'fast' ? 50 : 25
    kills++
    if (enemy.type === 'boss') { bossEnemy = null; bossHealth = 0; isBossLevel = false }
    trySpawnPowerUpOnKill(deathPos)
  }

  function applyPlasmaBlastDamage(center: THREE.Vector3, baseDamage: number, primary?: Enemy) {
    const blastRadius = 13
    const blastDelayMs = 120  // Fire the damage slightly after visuals start expanding
    createPlasmaBlastVisual(center)

    setTimeout(() => {
      enemies.slice().forEach(enemy => {
        if (enemy === primary) return
        const dist = enemy.mesh.position.distanceTo(center)
        if (dist <= blastRadius) {
          const falloff = 1 - dist / blastRadius
          const damage = enemy.type === 'boss'
            ? baseDamage * 2 * falloff
            : enemy.health  // One-shot normal ships in range
          enemy.health -= damage
          if (enemy.type === 'boss') bossHealth = enemy.health
          if (enemy.health <= 0) handleEnemyDeath(enemy)
        }
      })
    }, blastDelayMs)
  }

  // Boost trail particles - cyan/blue energy trail behind ship
  function spawnBoostParticles() {
    if (!playerShip) return
    // Get backward direction of ship for trail
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(playerShip.quaternion)
    const spawnPos = playerShip.position.clone().add(back.clone().multiplyScalar(1.5))

    for (let i = 0; i < 3; i++) {
      const hue = 0.5 + Math.random() * 0.1  // Cyan to blue
      const p = new THREE.Mesh(
        new THREE.SphereGeometry(0.1 + Math.random() * 0.1, 4, 4),
        new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 1, 0.6), transparent: true })
      )
      p.position.copy(spawnPos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5
      ))
      scene.add(p)
      // Particles trail behind
      const vel = back.clone().multiplyScalar(20 + Math.random() * 15)
      vel.add(new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5))
      particles.push({ mesh: p, velocity: vel, lifetime: 0.5, maxLifetime: 0.5 })
    }
  }

  // Camera follow state
  let smoothedCameraPos = new THREE.Vector3()
  let cameraInitialized = false

  function updatePlayer(delta: number) {
    if (!playerShip) return

    // Check if boost has expired
    if (boostActive && Date.now() > boostEndTime) {
      boostActive = false
    }

    // Boost animation - spawn trail particles when boosting
    if (boostActive && Math.random() < 0.5) {
      spawnBoostParticles()
    }

    // Continuous fire when shift OR mouse button is held
    if (isFiring || isMouseDown) shoot()

    // Update sway time
    shipSwayTime += delta

    // Standard flight control approach:
    // - Sensitivity scales raw mouse input
    // - Base multiplier is very small (0.001) for fine control
    const baseSensitivity = 0.001
    const sensitivity = baseSensitivity * gameConfig.mouseSensitivity
    const isTrackpadMode = getEffectiveInputType() === 'trackpad'

    // Trackpad finger lift detection
    const now = Date.now()
    const timeSinceLastMove = now - lastMovementTime
    if (isTrackpadMode && timeSinceLastMove > trackpadLiftThreshold) {
      // No events for a while = finger lifted off trackpad
      isFingerOnTrackpad = false
      continuousMotion.x = 0
      continuousMotion.y = 0
    }

    // Update yaw and pitch from mouse input (tracking angles separately)
    if (isTrackpadMode) {
      // Trackpad mode: view keeps moving while finger is on pad
      if (isFingerOnTrackpad) {
        const trackpadSensitivity = sensitivity * 0.5  // Slightly slower for continuous
        shipYaw -= continuousMotion.x * trackpadSensitivity
        shipPitch -= continuousMotion.y * trackpadSensitivity
      }
      // When finger lifts, motion stops immediately (no drift)
    } else {
      // External mouse: direct 1:1 control
      shipYaw -= mouseMovement.x * sensitivity
      shipPitch -= mouseMovement.y * sensitivity
    }
    // Clamp pitch to prevent flipping
    shipPitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, shipPitch))

    // Calculate ship sway based on mouse movement (smoothed to avoid jitter)
    const targetSway = mouseMovement.x * sensitivity * 10
    smoothedSway = THREE.MathUtils.lerp(smoothedSway, targetSway, Math.min(1, delta * 12))
    const idleSway = Math.sin(shipSwayTime * 2) * 0.02

    // Reset mouse delta after use
    mouseMovement.x = 0; mouseMovement.y = 0

    // A/D strafe left/right (FPS-style controls)
    let strafeVelocity = new THREE.Vector3()
    const strafeSpeed = 20
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(playerShip.quaternion)
    if (keys['a']) {
      strafeVelocity.add(right.clone().multiplyScalar(-strafeSpeed))
      bankAngle = Math.min(bankAngle + 2.0 * delta, 0.3)  // Slight visual bank
    } else if (keys['d']) {
      strafeVelocity.add(right.clone().multiplyScalar(strafeSpeed))
      bankAngle = Math.max(bankAngle - 2.0 * delta, -0.3)  // Slight visual bank
    } else {
      bankAngle *= 0.9
    }

    // Q/E barrel roll with lateral movement (strafe in roll direction)
    let barrelRollStrafe = new THREE.Vector3()
    if (keys['q']) {
      rollAngularVelocity = rollSpeed * 6  // Continuous roll left while held
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(playerShip.quaternion)
      barrelRollStrafe.add(right.clone().multiplyScalar(-25))  // Strafe left while rolling left
    } else if (keys['e']) {
      rollAngularVelocity = -rollSpeed * 6  // Continuous roll right while held
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(playerShip.quaternion)
      barrelRollStrafe.add(right.clone().multiplyScalar(25))  // Strafe right while rolling right
    } else {
      rollAngularVelocity = 0  // Stop adding spin when key released
    }
    // Integrate roll
    barrelRollAngle += rollAngularVelocity * delta
    // Level out smoothly when keys are released without overshooting
    if (!keys['q'] && !keys['e']) {
      barrelRollAngle = THREE.MathUtils.lerp(barrelRollAngle, 0, Math.min(1, delta * 4))
      if (Math.abs(barrelRollAngle) < 0.0005) barrelRollAngle = 0
    }

    // Build quaternion from yaw/pitch/roll (YXZ order avoids gimbal lock for flight)
    // This keeps pitch and yaw independent - mouse up always pitches up
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), shipYaw)
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), shipPitch)
    const rollAmount = barrelRollAngle + bankAngle + smoothedSway + idleSway
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rollAmount)

    // Apply in order: yaw first, then pitch, then roll
    playerShip.quaternion.copy(yawQuat).multiply(pitchQuat).multiply(rollQuat)

    // Calculate movement direction from ship's orientation
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(playerShip.quaternion)
    const up = new THREE.Vector3(0, 1, 0)
    let target = new THREE.Vector3()

    // Auto-move forward based on setting
    const autoMoveForce = autoMoveSpeeds[gameConfig.autoMoveSpeed]
    if (autoMoveForce > 0) {
      target.add(fwd.clone().multiplyScalar(autoMoveForce))
    }

    // W/S control forward/back thrust (adds to auto-move)
    if (keys['w']) target.add(fwd.clone().multiplyScalar(acceleration))
    // S reverses the ship (full reverse, overrides auto-move)
    if (keys['s']) {
      // Cancel auto-move and apply reverse thrust
      target.set(0, 0, 0)
      target.add(fwd.clone().multiplyScalar(-acceleration))
    }
    // Control for up/down
    if (keys['control']) target.add(up.clone().multiplyScalar(-acceleration * 0.5))

    // Add strafe velocity (A/D)
    target.add(strafeVelocity)
    // Add barrel roll lateral strafe (Q/E)
    target.add(barrelRollStrafe)

    velocity.lerp(target, delta * 3)
    velocity.clampLength(0, maxSpeed * (boostActive ? 3 : 1))
    playerShip.position.add(velocity.clone().multiplyScalar(delta))

    if (playerShip.position.length() > 250) playerShip.position.multiplyScalar(0.99)

    // Third-person camera: fixed position behind and above the ship
    // Camera follows yaw but NOT pitch - this keeps ship visible on screen
    const camDistance = 10
    const camHeight = 5

    // Camera only follows yaw (horizontal rotation)
    const camX = playerShip.position.x + Math.sin(shipYaw) * camDistance
    const camY = playerShip.position.y + camHeight
    const camZ = playerShip.position.z + Math.cos(shipYaw) * camDistance

    const targetCamPos = new THREE.Vector3(camX, camY, camZ)

    if (!cameraInitialized) {
      smoothedCameraPos.copy(targetCamPos)
      cameraInitialized = true
    }

    smoothedCameraPos.lerp(targetCamPos, delta * 5)
    camera.position.copy(smoothedCameraPos)

    // Look at a point ahead of the ship in the direction it's facing
    // This keeps the ship in the lower portion of screen and crosshair aligned with aim
    const lookAheadDist = 30
    const lookTarget = playerShip.position.clone().add(fwd.clone().multiplyScalar(lookAheadDist))
    camera.lookAt(lookTarget)
  }

  function updateEnemies(delta: number) {
    if (!playerShip) return
    enemies.forEach(enemy => {
      const toPlayer = new THREE.Vector3().subVectors(playerShip!.position, enemy.mesh.position)
      const dist = toPlayer.length()
      if (dist > 30) enemy.velocity.lerp(toPlayer.normalize().multiplyScalar(enemy.speed), delta * 2)
      else if (dist > 15) enemy.velocity.lerp(new THREE.Vector3(-toPlayer.z, Math.sin(Date.now() * 0.001) * 5, toPlayer.x).normalize().multiplyScalar(enemy.speed), delta * 2)
      else enemy.velocity.lerp(toPlayer.normalize().multiplyScalar(-enemy.speed * 0.5), delta * 2)

      enemy.mesh.position.add(enemy.velocity.clone().multiplyScalar(delta))
      enemy.mesh.lookAt(playerShip!.position)
      if (enemy.mesh.position.y < 3) { enemy.mesh.position.y = 3; enemy.velocity.y = Math.abs(enemy.velocity.y) }

      const now = Date.now()
      if (now - enemy.lastShot > enemy.fireRate && dist < 60) { shootEnemyProjectile(enemy); enemy.lastShot = now }
    })
  }

  function shootEnemyProjectile(enemy: Enemy) {
    if (!playerShip) return

    // Type-specific bullet visuals (matching Blocky Shooter)
    let size: number, color: number, speed: number
    if (enemy.type === 'fast') {
      // Fast Enemy - Cyan bullets (smaller, faster)
      size = 0.1; color = 0x00ffff; speed = 55
    } else if (enemy.type === 'tank') {
      // Tank Enemy - Orange bullets (larger, slower)
      size = 0.25; color = 0xff8800; speed = 30
    } else if (enemy.type === 'boss') {
      // Boss - Red bullets (large)
      size = 0.2; color = 0xff0000; speed = 45
    } else {
      // Basic Enemy - Red bullets
      size = 0.15; color = 0xff0000; speed = 40
    }

    const bulletMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1 })
    const p = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), bulletMat)
    p.position.copy(enemy.mesh.position)
    scene.add(p)
    projectiles.push({ mesh: p, velocity: new THREE.Vector3().subVectors(playerShip.position, enemy.mesh.position).normalize().multiplyScalar(speed), damage: enemy.damage, type: 'laser', lifetime: 3, isEnemy: true })
  }

  function updateProjectiles(delta: number) {
    projectiles = projectiles.filter(p => {
      p.lifetime -= delta
      if (p.lifetime <= 0) { scene.remove(p.mesh); return false }

      // Heat-seeking missiles and drones
      if ((p.type === 'missile' || p.type === 'drone') && !p.isEnemy) {
        // Find target if we don't have one or current target is dead
        if (!p.target || !enemies.includes(p.target)) {
          let closestEnemy: Enemy | null = null, closestDist = Infinity
          for (const e of enemies) {
            const d = p.mesh.position.distanceTo(e.mesh.position)
            if (d < 100 && d < closestDist) { closestDist = d; closestEnemy = e }
          }
          p.target = closestEnemy
        }
        // Track target with strong homing
        if (p.target) {
          const toTarget = new THREE.Vector3().subVectors(p.target.mesh.position, p.mesh.position).normalize()
          const currentDir = p.velocity.clone().normalize()
          // Much stronger turn rate - 8.0 for missiles, 12.0 for drones
          const turnRate = (p.type === 'drone' ? 12.0 : 8.0) * delta
          const newDir = currentDir.lerp(toTarget, Math.min(turnRate, 1))
          const speed = p.velocity.length()
          p.velocity.copy(newDir.normalize().multiplyScalar(speed))
          p.mesh.lookAt(p.mesh.position.clone().add(p.velocity))
          if (p.type === 'missile') p.mesh.rotateX(Math.PI / 2)
        }
      }

      // Plasma has short-range homing to hit enemies near crosshair
      if (p.type === 'plasma' && !p.isEnemy) {
        // Use the target we set when firing, or find nearest if target died
        if (!p.target || !enemies.includes(p.target)) {
          let closestEnemy: Enemy | null = null, closestDist = Infinity
          for (const e of enemies) {
            const d = p.mesh.position.distanceTo(e.mesh.position)
            if (d < 25 && d < closestDist) { closestDist = d; closestEnemy = e }  // Short range
          }
          p.target = closestEnemy
        }
        if (p.target) {
          const toTarget = new THREE.Vector3().subVectors(p.target.mesh.position, p.mesh.position).normalize()
          const currentDir = p.velocity.clone().normalize()
          const turnRate = 5.0 * delta  // Strong homing for accuracy
          const newDir = currentDir.lerp(toTarget, Math.min(turnRate, 1))
          const speed = p.velocity.length()
          p.velocity.copy(newDir.normalize().multiplyScalar(speed))
        }
      }

      p.mesh.position.add(p.velocity.clone().multiplyScalar(delta))

      // Enemy projectile hitting player
      if (p.isEnemy && playerShip && p.mesh.position.distanceTo(playerShip.position) < 1) {
        health -= p.damage; createExplosion(p.mesh.position, 0.5); scene.remove(p.mesh)
        if (health <= 0) gameOver()
        return false
      }

      // Player projectile hitting enemies
      if (!p.isEnemy) {
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i], hr = e.type === 'boss' ? 3 : 1.5
          if (p.mesh.position.distanceTo(e.mesh.position) < hr) {
            e.health -= p.damage
            if (e.type === 'boss') bossHealth = e.health

            // Plasma Cannon - AoE damage on impact
            if (p.type === 'plasma') {
              applyPlasmaBlastDamage(p.mesh.position.clone(), p.damage, e)
            }

            // Note: Chain lightning is now instant and handled at fire time, not as a projectile

            if (e.health <= 0) {
              handleEnemyDeath(e)
            }
            scene.remove(p.mesh); return false
          }
        }
      }
      return true
    })
  }

  // Visual effect for chain lightning
  function createLightningArc(from: THREE.Vector3, to: THREE.Vector3) {
    const points: THREE.Vector3[] = []
    const segments = 8
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const point = from.clone().lerp(to, t)
      // Add random offset for zigzag effect (except endpoints)
      if (i > 0 && i < segments) {
        point.x += (Math.random() - 0.5) * 1.5
        point.y += (Math.random() - 0.5) * 1.5
        point.z += (Math.random() - 0.5) * 1.5
      }
      points.push(point)
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 1 })
    const line = new THREE.Line(geometry, material)
    scene.add(line)
    // Remove after short time
    setTimeout(() => { scene.remove(line); geometry.dispose(); material.dispose() }, 150)
  }

  function updateParticles(delta: number) {
    particles = particles.filter(p => {
      p.lifetime -= delta
      if (p.lifetime <= 0) { scene.remove(p.mesh); return false }
      p.mesh.position.add(p.velocity.clone().multiplyScalar(delta))
      p.velocity.multiplyScalar(0.95)
      if (p.scaleGrowth) {
        const growth = 1 + p.scaleGrowth * delta
        p.mesh.scale.multiplyScalar(growth)
      }
      ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = p.lifetime / p.maxLifetime
      return true
    })
  }

  function updatePowerUps(delta: number) {
    if (!playerShip) return

    // Clear expired alert (after 2 seconds)
    if (powerUpAlert && Date.now() - powerUpAlert.timestamp > 2000) {
      powerUpAlert = null
    }

    powerUps = powerUps.filter(p => {
      p.mesh.rotation.y += delta * 2; p.mesh.rotation.x += delta
      if (playerShip!.position.distanceTo(p.mesh.position) < 3) {  // 50% larger collision radius
        // Trigger flashing alert
        const alertInfo = powerUpNames[p.type]
        powerUpAlert = { message: alertInfo.name, color: alertInfo.color, timestamp: Date.now() }

        if (p.type === 'health') health = Math.min(health + 30, 100)
        else if (p.type === 'ammo') refillCurrentWeapon(10)
        else if (p.type === 'boost') { boostCharges++ }  // Add boost charge to inventory
        else if (p.type === 'weapon-missile') addWeapon('missile', 10, 'Missiles')
        else if (p.type === 'weapon-plasma') addWeapon('plasma', 5, 'Plasma Cannon')
        else if (p.type === 'weapon-chain') addWeapon('chain', 8, 'Chain Lightning')
        else if (p.type === 'weapon-drone') addWeapon('drone', 3, 'Drone Swarm')
        else if (p.type === 'weapon-scatter') addWeapon('scatter', 15, 'Scatter Shot')
        scene.remove(p.mesh); return false
      }
      return true
    })
  }

  function flashSelectedWeapon() {
    const weapon = weaponInventory[currentWeaponIndex]
    if (!weapon) return
    const color = weaponFlashColors[weapon.type] ?? '#ffffaa'
    const isOut = weapon.ammo === 0
    const message = isOut ? `${weapon.name.toUpperCase()} OUT OF AMMO` : `${weapon.name.toUpperCase()} READY`
    powerUpAlert = { message, color: isOut ? '#ff4444' : color, timestamp: Date.now() }
  }

  // Weapon inventory limits
  const weaponMaxAmmo: Record<Weapon['type'], number> = {
    laser: -1,      // Unlimited
    missile: 8,
    chain: 3,
    plasma: 5,
    drone: 5,
    scatter: 8
  }

  function refillCurrentWeapon(amount: number) {
    const weapon = weaponInventory[currentWeaponIndex]
    if (!weapon) return
    const maxAmmo = weaponMaxAmmo[weapon.type]
    if (maxAmmo === undefined || maxAmmo === -1) {
      // Unlimited or unknown weapons don't need refills
      weaponInventory = weaponInventory
      return
    }
    const updatedAmmo = Math.min(maxAmmo, weapon.ammo + amount)
    weaponInventory = weaponInventory.map((w, i) => i === currentWeaponIndex ? { ...w, ammo: updatedAmmo } : w)
  }

  function addWeapon(type: Weapon['type'], ammo: number, name: string) {
    const maxAmmo = weaponMaxAmmo[type]
    const ex = weaponInventory.find(w => w.type === type)
    if (ex) {
      // Add ammo but cap at max
      if (maxAmmo === -1) {
        ex.ammo = -1  // Keep unlimited
      } else {
        ex.ammo = Math.min(ex.ammo + ammo, maxAmmo)
      }
    } else {
      // New weapon - cap initial ammo at max
      const initialAmmo = maxAmmo === -1 ? -1 : Math.min(ammo, maxAmmo)
      weaponInventory.push({ type, ammo: initialAmmo, name })
    }
    weaponInventory = weaponInventory
  }

  $: if (score >= nextLevelScore && isPlaying && enemies.length === 0) levelUp()

  async function levelUp() {
    if (isLoadingLevel) return
    isLoadingLevel = true
    showLevelComplete = true
    await new Promise(r => setTimeout(r, 2000))
    showLevelComplete = false
    level++; nextLevelScore = level * 1000
    gameConfig.enemyCount = Math.min(gameConfig.enemyCount + 1, 15)
    gameConfig.enemySpeed *= 1.05
    gameConfig.enemyFireRate = Math.max(gameConfig.enemyFireRate * 0.95, 800)
    health = Math.min(health + 30, 100)

    // Reset weapons each level (player starts fresh with just laser)
    weaponInventory = [{ type: 'laser', ammo: -1, name: 'Laser Cannon' }]
    currentWeaponIndex = 0

    // Clear existing solid objects before loading new level
    solidObjects.forEach(obj => scene.remove(obj))
    solidObjects = []

    // Try to load next saved map, otherwise auto-generate
    const nextMapIndex = level - 1  // level 2 uses map index 1, etc.
    if (availableMaps.length > 0 && nextMapIndex < availableMaps.length) {
      // Use the next saved map
      await loadMap(availableMaps[nextMapIndex])
    } else {
      // No more saved maps, auto-generate
      await generateLevelScenery()
    }

    // Reposition player to safe location
    const spawnPos = findSafeSpawnPosition()
    if (playerShip) {
      playerShip.position.copy(spawnPos)
      velocity.set(0, 0, 0)
    }

    spawnWave()
    isLoadingLevel = false
  }

  // Find a safe spawn position away from objects
  function findSafeSpawnPosition(): THREE.Vector3 {
    const maxAttempts = 20
    const spawnHeight = 20
    const minDistFromObjects = 10

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const dist = 20 + Math.random() * 50
      const testPos = new THREE.Vector3(
        Math.cos(angle) * dist,
        spawnHeight,
        Math.sin(angle) * dist
      )

      // Check distance from all solid objects
      let isSafe = true
      for (const obj of solidObjects) {
        const objPos = new THREE.Vector3()
        obj.getWorldPosition(objPos)
        if (testPos.distanceTo(objPos) < minDistFromObjects) {
          isSafe = false
          break
        }
      }

      if (isSafe) return testPos
    }

    // Fallback to center if no safe spot found
    return new THREE.Vector3(0, spawnHeight, 0)
  }

  async function startGame() {
    showMapSelector = false
    isSpawning = true  // Show loading screen
    hasStartedGame = true
    isGameOver = false
    score = 0; level = 1; health = gameConfig.startingHealth; kills = 0; nextLevelScore = 1000
    isBossLevel = false; bossEnemy = null; bossHealth = 0; bossMaxHealth = 0
    weaponInventory = [{ type: 'laser', ammo: -1, name: 'Laser Cannon' }]; currentWeaponIndex = 0
    boostCharges = 0; boostActive = false; boostEndTime = 0
    continuousMotion = { x: 0, y: 0 }; movementSamples = []; lastMovementTime = 0; isFingerOnTrackpad = false
    gameConfig.mouseInput = 'auto'; detectedInputType = 'unknown'
    killsSinceLastDrop = 0
    velocity.set(0, 0, 0)
    bankAngle = 0
    barrelRollAngle = 0
    shipYaw = 0
    shipPitch = 0

    // Clean up old game objects
    enemies.forEach(e => scene.remove(e.mesh)); enemies = []
    projectiles.forEach(p => scene.remove(p.mesh)); projectiles = []
    powerUps.forEach(p => scene.remove(p.mesh)); powerUps = []
    particles.forEach(p => scene.remove(p.mesh)); particles = []
    if (playerShip) { scene.remove(playerShip); playerShip = null }
    solidObjects.forEach(o => scene.remove(o)); solidObjects = []

    // Load map
    if (selectedMap) await loadMap(selectedMap)
    else await createDefaultMap()

    // Find safe spawn position
    const spawnPos = findSafeSpawnPosition()

    // Load player ship at safe position
    await loadPlayerShipAtPosition(spawnPos)

    // Short delay for loading screen
    await new Promise(r => setTimeout(r, 500))

    isSpawning = false
    isPlaying = true
    spawnWave()
    // Power-ups only drop from enemies
    renderer.domElement.requestPointerLock()
  }

  async function loadPlayerShipAtPosition(position: THREE.Vector3) {
    const loader = new GLTFLoader()
    try {
      const gltf = await loader.loadAsync(selectedSpaceship.path)
      playerShip = new THREE.Group()
      const model = gltf.scene
      model.scale.setScalar(shipScale)
      model.rotation.y = Math.PI
      model.traverse(child => { if (child instanceof THREE.Mesh) { child.castShadow = true } })
      playerShip.add(model)
      playerShip.add(new THREE.PointLight(0x00ffff, 2, 10))
      scene.add(playerShip)
      playerShip.position.copy(position)

      // Reset camera state
      cameraInitialized = false
      const camOffset = new THREE.Vector3(0, 5, 10)
      smoothedCameraPos.copy(position).add(camOffset)
      camera.position.copy(smoothedCameraPos)
      camera.lookAt(position)
    } catch (error) {
      console.error('Failed to load ship:', error)
      createFallbackShipAtPosition(position)
    }
  }

  function createFallbackShipAtPosition(position: THREE.Vector3) {
    playerShip = new THREE.Group()
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.2, 4), new THREE.MeshStandardMaterial({ color: 0x2266ff, metalness: 0.8, emissive: 0x1144aa, emissiveIntensity: 0.3 }))
    body.rotation.x = Math.PI / 2
    body.scale.setScalar(shipScale * 3)
    playerShip.add(body)
    scene.add(playerShip)
    playerShip.position.copy(position)

    cameraInitialized = false
    const camOffset = new THREE.Vector3(0, 5, 10)
    smoothedCameraPos.copy(position).add(camOffset)
    camera.position.copy(smoothedCameraPos)
    camera.lookAt(position)
  }

  function gameOver() {
    isPlaying = false
    isGameOver = true
    document.exitPointerLock()
  }

  // Restart game (resets map and spawns at new location)
  async function restartGame() {
    await startGame()
  }

  function animate() {
    animationId = requestAnimationFrame(animate)
    const delta = Math.min(clock.getDelta(), 0.1)
    if (isPlaying) {
      updatePlayer(delta); updateEnemies(delta); updateProjectiles(delta); updateParticles(delta); updatePowerUps(delta)
      if (enemies.length === 0 && !isLoadingLevel && !showLevelComplete) { if (score >= nextLevelScore) levelUp(); else spawnWave() }
    }
    renderer?.render(scene, camera)
  }
</script>

<svelte:head><title>Starship Flyer | Dougie's Game Hub</title></svelte:head>

<div bind:this={container} class="relative w-full h-screen overflow-hidden">
  {#if showMapSelector}
    <!-- Background with thumbnail and 50% white overlay (matching Blocky Shooter) -->
    <div class="absolute inset-0 z-30">
      {#if selectedMap?.thumbnail}
        <div class="absolute inset-0" style="background-image: url({selectedMap.thumbnail}); background-size: cover; background-position: center;"></div>
      {/if}
      <div class="absolute inset-0 bg-white/50"></div>
    </div>
    <div class="absolute inset-0 flex items-center justify-center z-30 overflow-y-auto p-4">
      <div class="text-center max-w-5xl w-full">
        <h2 class="text-4xl font-bold text-gray-900 mb-6">Game Setup</h2>

        <!-- Ship Selection -->
        <div class="bg-yellow-50 rounded-lg p-6 mb-6 border-2 border-yellow-200">
          <h3 class="text-2xl font-bold text-gray-900 mb-4">Select Your Ship</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            {#each spaceshipOptions as ship}
              <button
                class="card bg-yellow-50 hover:bg-yellow-100 transition-all duration-200 cursor-pointer border-2 {selectedSpaceship.id === ship.id ? 'border-yellow-500 ring-2 ring-yellow-400' : 'border-yellow-300 hover:border-yellow-500'} shadow-lg hover:shadow-xl"
                on:click={() => selectedSpaceship = ship}
              >
                <div class="card-body p-3">
                  <div class="w-full h-24 rounded mb-2 overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center border border-yellow-300">
                    <canvas class="ship-preview-{ship.id} w-full h-full"></canvas>
                  </div>
                  <h4 class="font-bold text-sm text-gray-900 text-center">{ship.name}</h4>
                </div>
              </button>
            {/each}
          </div>
        </div>

        <!-- Select a Map -->
        <div class="bg-yellow-50 rounded-lg p-6 mb-6 border-2 border-yellow-200">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-2xl font-bold text-gray-900">Select a Map</h3>
            <a class="text-blue-600 font-semibold underline text-sm" href="/experiments/world-builder">
              Build a Map →
            </a>
          </div>

          <!-- Horizontal scrolling map carousel -->
          <div class="relative">
            <!-- Left Arrow -->
            <button
              class="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-yellow-400 hover:bg-yellow-500 text-gray-900 rounded-full w-10 h-10 flex items-center justify-center shadow-lg -ml-2 transition-all"
              on:click={() => {
                const container = document.getElementById('map-carousel')
                if (container) container.scrollBy({ left: -220, behavior: 'smooth' })
              }}
            >
              <span class="text-xl font-bold">‹</span>
            </button>

            <!-- Map Cards Container -->
            <div
              id="map-carousel"
              class="flex gap-4 overflow-x-auto scroll-smooth px-8 py-2"
              style="scrollbar-width: none; -ms-overflow-style: none;"
            >
              <!-- Default Map - Always First -->
              <button
                class="flex-shrink-0 w-52 card bg-green-50 hover:bg-green-100 transition-all duration-200 cursor-pointer border-2 {selectedMap === null ? 'border-green-500 ring-2 ring-green-400' : 'border-green-300 hover:border-green-500'} shadow-lg hover:shadow-xl"
                on:click={() => selectedMap = null}
              >
                <div class="card-body p-3">
                  <div class="w-full h-24 rounded mb-2 overflow-hidden bg-gradient-to-br from-green-700 to-blue-800 flex items-center justify-center border border-green-300">
                    {#if defaultMapThumbnail}
                      <img src={defaultMapThumbnail} alt="Default Map" class="w-full h-full object-cover" />
                    {:else}
                      <div class="text-3xl opacity-70">🌍</div>
                    {/if}
                  </div>
                  <h4 class="font-bold text-sm text-gray-900 truncate">Default Map</h4>
                  <div class="text-xs text-gray-500">Procedural</div>
                </div>
              </button>

              <!-- Custom Maps -->
              {#each customMaps as map}
                <button
                  class="flex-shrink-0 w-52 card bg-purple-50 hover:bg-purple-100 transition-all duration-200 cursor-pointer border-2 {selectedMap?.id === map.id ? 'border-purple-500 ring-2 ring-purple-400' : 'border-purple-300 hover:border-purple-500'} shadow-lg hover:shadow-xl"
                  on:click={() => selectedMap = map}
                >
                  <div class="card-body p-3">
                    <div class="absolute top-2 right-2 bg-purple-500 text-white text-xs px-2 py-0.5 rounded">Custom</div>
                    <div class="w-full h-24 rounded mb-2 overflow-hidden bg-purple-100 flex items-center justify-center border border-purple-300">
                      {#if map.thumbnail}
                        <img src={map.thumbnail} alt={map.name} class="w-full h-full object-cover" />
                      {:else}
                        <div class="text-3xl opacity-50">🗺️</div>
                      {/if}
                    </div>
                    <h4 class="font-bold text-sm text-gray-900 truncate">{map.name}</h4>
                    <div class="text-xs text-gray-500 truncate">{map.stats.objectCount} objects</div>
                  </div>
                </button>
              {/each}

              <!-- Built-in Maps -->
              {#each builtInMaps as map}
                <button
                  class="flex-shrink-0 w-52 card bg-yellow-50 hover:bg-yellow-100 transition-all duration-200 cursor-pointer border-2 {selectedMap?.id === map.id ? 'border-yellow-500 ring-2 ring-yellow-400' : 'border-yellow-300 hover:border-yellow-500'} shadow-lg hover:shadow-xl"
                  on:click={() => selectedMap = map}
                >
                  <div class="card-body p-3">
                    <div class="absolute top-2 right-2 bg-yellow-500 text-gray-900 text-xs px-2 py-0.5 rounded">Built-in</div>
                    <div class="w-full h-24 rounded mb-2 overflow-hidden bg-yellow-100 flex items-center justify-center border border-yellow-300">
                      {#if map.thumbnail}
                        <img src={map.thumbnail} alt={map.name} class="w-full h-full object-cover" />
                      {:else}
                        <div class="text-3xl opacity-50">🗺️</div>
                      {/if}
                    </div>
                    <h4 class="font-bold text-sm text-gray-900 truncate">{map.name}</h4>
                    <div class="text-xs text-gray-500 truncate">{map.stats.objectCount} objects</div>
                  </div>
                </button>
              {/each}
            </div>

            <!-- Right Arrow -->
            <button
              class="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-yellow-400 hover:bg-yellow-500 text-gray-900 rounded-full w-10 h-10 flex items-center justify-center shadow-lg -mr-2 transition-all"
              on:click={() => {
                const container = document.getElementById('map-carousel')
                if (container) container.scrollBy({ left: 220, behavior: 'smooth' })
              }}
            >
              <span class="text-xl font-bold">›</span>
            </button>
          </div>
        </div>

        <!-- Difficulty Settings (matching Blocky Shooter) -->
        <div class="bg-yellow-50 rounded-lg p-6 mb-6 border-2 border-yellow-200">
          <h3 class="text-2xl font-bold text-gray-900 mb-4">Difficulty & Settings</h3>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <button
              class="btn {gameConfig.difficulty === 'easy' ? 'btn-success' : 'btn-outline'}"
              on:click={() => applyDifficultyPreset('easy')}
            >
              Easy
              <div class="text-xs">More health, slower enemies</div>
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
              <div class="text-xs">Faster enemies, less health</div>
            </button>
          </div>

          <!-- Auto-Move Speed -->
          <div class="mb-4">
            <label class="label text-sm font-semibold">Auto-Move Speed</label>
            <div class="grid grid-cols-4 gap-2">
              <button
                class="btn btn-sm {gameConfig.autoMoveSpeed === 'off' ? 'btn-neutral' : 'btn-outline'}"
                on:click={() => gameConfig.autoMoveSpeed = 'off'}
              >Off</button>
              <button
                class="btn btn-sm {gameConfig.autoMoveSpeed === 'slow' ? 'btn-info' : 'btn-outline'}"
                on:click={() => gameConfig.autoMoveSpeed = 'slow'}
              >Slow</button>
              <button
                class="btn btn-sm {gameConfig.autoMoveSpeed === 'medium' ? 'btn-primary' : 'btn-outline'}"
                on:click={() => gameConfig.autoMoveSpeed = 'medium'}
              >Medium</button>
              <button
                class="btn btn-sm {gameConfig.autoMoveSpeed === 'hyper' ? 'btn-error' : 'btn-outline'}"
                on:click={() => gameConfig.autoMoveSpeed = 'hyper'}
              >Hyper</button>
            </div>
          </div>

          <!-- Power-up Frequency -->
          <div class="mb-4">
            <label class="label text-sm font-semibold">Power-up Drops</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                class="btn btn-sm {gameConfig.powerUpFrequency === 'sparse' ? 'btn-warning' : 'btn-outline'}"
                on:click={() => gameConfig.powerUpFrequency = 'sparse'}
              >
                Sparse
                <div class="text-xs opacity-70">Every 3 kills</div>
              </button>
              <button
                class="btn btn-sm {gameConfig.powerUpFrequency === 'normal' ? 'btn-primary' : 'btn-outline'}"
                on:click={() => gameConfig.powerUpFrequency = 'normal'}
              >
                Normal
                <div class="text-xs opacity-70">Every 2 kills</div>
              </button>
              <button
                class="btn btn-sm {gameConfig.powerUpFrequency === 'carnage' ? 'btn-error' : 'btn-outline'}"
                on:click={() => gameConfig.powerUpFrequency = 'carnage'}
              >
                Carnage
                <div class="text-xs opacity-70">Every kill</div>
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-5 gap-4 text-left">
            <div>
              <label class="label text-xs">Starting Health: {gameConfig.startingHealth}</label>
              <input type="range" min="50" max="200" bind:value={gameConfig.startingHealth} class="range range-xs range-accent" />
            </div>
            <div>
              <label class="label text-xs">Enemy Count: {gameConfig.enemyCount}</label>
              <input type="range" min="1" max="15" bind:value={gameConfig.enemyCount} class="range range-xs range-secondary" />
            </div>
            <div>
              <label class="label text-xs">Enemy Speed: {gameConfig.enemySpeed.toFixed(1)}</label>
              <input type="range" min="4" max="20" step="0.5" bind:value={gameConfig.enemySpeed} class="range range-xs range-primary" />
            </div>
            <div>
              <label class="label text-xs">Player Damage: {gameConfig.playerDamage}</label>
              <input type="range" min="10" max="50" bind:value={gameConfig.playerDamage} class="range range-xs range-info" />
            </div>
            <div>
              <label class="label text-xs">Mouse Sensitivity: {gameConfig.mouseSensitivity.toFixed(1)}</label>
              <input type="range" min="0.5" max="2.0" step="0.1" bind:value={gameConfig.mouseSensitivity} class="range range-xs range-warning" />
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-lg text-white" on:click={startGame}>
          Launch Mission
        </button>

        <p class="text-gray-900 mt-6 text-sm">
          Controls: W/S forward/back, A/D strafe left/right, Mouse to aim, Shift to fire, Space for BOOST, Q/E for barrel rolls, ↑/↓ or 1-5 switch weapons, ESC to pause
        </p>
      </div>
    </div>
  {/if}

  {#if isGameOver}
    <div class="absolute inset-0 z-20 flex items-center justify-center bg-black/80">
      <div class="text-center text-white space-y-6">
        <h1 class="text-8xl font-bold text-red-500">MISSION FAILED</h1>
        <div class="text-4xl">Score: <span class="text-yellow-400">{score}</span></div>
        <div class="text-3xl">Level: <span class="text-cyan-400">{level}</span></div>
        <div class="text-2xl">Kills: <span class="text-orange-400">{kills}</span></div>
        <div class="flex gap-4 justify-center mt-8">
          <button class="btn btn-error btn-lg text-xl px-8" on:click={startGame}>RETRY</button>
          <button class="btn btn-ghost btn-lg text-xl px-8" on:click={() => { showMapSelector = true; isGameOver = false }}>MENU</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showLevelComplete}
    <div class="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
      <div class="text-center text-white animate-bounce">
        <div class="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500">LEVEL {level}</div>
        <div class="text-6xl font-bold text-green-400 mt-4">COMPLETE!</div>
        <div class="text-3xl mt-4">Score: {score}</div>
      </div>
    </div>
  {/if}

  {#if isSpawning}
    <div class="absolute inset-0 z-30 flex items-center justify-center bg-black/90">
      <div class="text-center text-white space-y-4">
        <div class="text-4xl font-bold animate-pulse">LAUNCHING...</div>
        <div class="loading loading-spinner loading-lg text-cyan-400"></div>
        <div class="text-xl text-cyan-400">Preparing spawn location</div>
      </div>
    </div>
  {/if}

  {#if isPlaying && !isGameOver && !showLevelComplete && !isSpawning}
    <div class="absolute top-4 left-4 text-white font-bold z-10 bg-black/70 p-4 rounded-lg space-y-2 border-2 border-cyan-500">
      <div class="text-2xl text-yellow-400">Score: {score}</div>
      <div class="text-xl">Level: {level} {#if isBossLevel}<span class="text-red-400 animate-pulse">⚡ BOSS ⚡</span>{/if}</div>
      <div class="text-xl">Kills: {kills}</div>
      <div class="mt-2"><div class="text-sm text-red-400">HULL: {Math.floor(health)}%</div><div class="w-48 bg-gray-700 h-3 rounded-full overflow-hidden"><div class="bg-gradient-to-r from-red-600 to-red-400 h-full transition-all" style="width: {Math.max(0, health)}%"></div></div></div>
      {#if isBossLevel && bossEnemy && bossMaxHealth > 0}
        <div class="mt-2 pt-2 border-t border-red-500"><div class="text-sm text-purple-400">BOSS</div><div class="w-48 bg-gray-700 h-3 rounded-full overflow-hidden"><div class="bg-gradient-to-r from-purple-600 to-pink-500 h-full transition-all" style="width: {Math.max(0, (bossHealth / bossMaxHealth) * 100)}%"></div></div></div>
      {/if}
      <div class="mt-2 pt-2 border-t border-cyan-500"><div class="text-sm opacity-80">WEAPONS</div>{#each weaponInventory as w, i}<div class="text-sm {i === currentWeaponIndex ? 'text-yellow-400 font-bold' : 'opacity-60'}">{i + 1}. {w.name} {w.ammo === -1 ? '∞' : `(${w.ammo})`}</div>{/each}</div>
    </div>
    <!-- Fixed centered crosshair -->
    <div class="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
      <div class="relative w-8 h-8">
        <div class="absolute w-full h-0.5 bg-cyan-400 top-1/2 -translate-y-1/2 shadow-lg shadow-cyan-400/50"></div>
        <div class="absolute h-full w-0.5 bg-cyan-400 left-1/2 -translate-x-1/2 shadow-lg shadow-cyan-400/50"></div>
        <div class="absolute w-2 h-2 border-2 border-cyan-400 rounded-full top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>
      </div>
    </div>
    <!-- Flashing power-up alert -->
    {#if powerUpAlert}
      <div class="absolute top-1/3 left-1/2 -translate-x-1/2 pointer-events-none z-20">
        <div class="text-4xl font-bold power-up-flash px-8 py-4 rounded-lg"
             style="color: {powerUpAlert.color}; text-shadow: 0 0 20px {powerUpAlert.color}, 0 0 40px {powerUpAlert.color}; background: rgba(0,0,0,0.7);">
          {powerUpAlert.message}
        </div>
      </div>
    {/if}
    <div class="absolute top-4 right-4 text-white font-bold z-10 bg-black/70 p-4 rounded-lg border-2 border-red-500"><div class="text-xl text-red-400">HOSTILES</div><div class="text-4xl text-center">{enemies.length}</div></div>
    <div class="absolute bottom-4 left-4 text-white font-bold z-10 bg-black/70 p-4 rounded-lg border-2 border-cyan-500"><div class="text-sm">SPEED</div><div class="w-32 bg-gray-700 h-3 rounded-full overflow-hidden"><div class="h-full transition-all {boostActive ? 'bg-gradient-to-r from-yellow-400 to-red-500' : 'bg-gradient-to-r from-cyan-400 to-blue-500'}" style="width: {Math.min(100, (velocity.length() / maxSpeed) * 100)}%"></div></div>{#if boostActive}<div class="text-yellow-400 text-xs animate-pulse mt-1">BOOST ACTIVE!</div>{/if}</div>
    <!-- Power-up/Weapon Status -->
    <div class="absolute bottom-4 right-4 text-white font-bold z-10 bg-black/70 p-4 rounded-lg border-2 border-yellow-500">
      <div class="text-sm text-yellow-400 mb-2">POWER-UPS</div>
      <div class="flex gap-3">
        {#each weaponInventory as w, i}
          <div class="text-center {i === currentWeaponIndex ? 'ring-2 ring-yellow-400 rounded p-1' : 'p-1 opacity-70'}">
            {#if w.type === 'laser'}
              <div class="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-xs font-bold">L</div>
            {:else if w.type === 'missile'}
              <div class="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-xs text-black font-bold">M</div>
            {:else if w.type === 'plasma'}
              <div class="w-8 h-8 rounded-full bg-fuchsia-500 flex items-center justify-center text-xs font-bold">P</div>
            {:else if w.type === 'chain'}
              <div class="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-xs font-bold">C</div>
            {:else if w.type === 'drone'}
              <div class="w-8 h-8 rounded-full bg-lime-500 flex items-center justify-center text-xs text-black font-bold">D</div>
            {:else if w.type === 'scatter'}
              <div class="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-xs font-bold">S</div>
            {/if}
            <div class="text-xs mt-1">{w.ammo === -1 ? '∞' : w.ammo}</div>
          </div>
        {/each}
        <!-- Boost Charges -->
        <div class="text-center p-1 {boostActive ? 'ring-2 ring-cyan-400 rounded animate-pulse' : ''}">
          <div class="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-xs font-bold">B</div>
          <div class="text-xs mt-1">{boostCharges}</div>
        </div>
      </div>
      <div class="text-xs text-gray-400 mt-2">↑↓ weapons | Space boost</div>
    </div>
  {/if}

  {#if !isPlaying && hasStartedGame && !isGameOver && !showMapSelector}
    <div class="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
      <div class="text-center text-white space-y-6">
        <h1 class="text-6xl font-bold">PAUSED</h1>
        <button class="btn btn-primary btn-lg text-xl px-8" on:click={() => { isPlaying = true; renderer.domElement.requestPointerLock() }}>RESUME</button>
        <button class="btn btn-warning btn-lg text-xl px-8 block mx-auto" on:click={startGame}>RESTART</button>
        <button class="btn btn-ghost btn-lg text-xl px-8 block mx-auto" on:click={() => showMapSelector = true}>MENU</button>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(body) { margin: 0; overflow: hidden; }
  :global(html), :global(body) { width: 100%; height: 100%; }
  :global(canvas) { display: block; width: 100% !important; height: 100% !important; }

  .power-up-flash {
    animation: flashPulse 0.3s ease-in-out infinite alternate;
  }

  @keyframes flashPulse {
    0% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1.1); opacity: 0.8; }
  }
</style>
