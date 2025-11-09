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

  // Game state using standard Svelte reactivity
  let isPlaying = false
  let score = 0
  let ammo = 30
  let health = 100

  // Movement
  const moveSpeed = 1.0 // Increased from 0.2 to 1.0
  const jumpSpeed = 16.0 // Increased to jump twice as high
  let velocity = new THREE.Vector3()
  let direction = new THREE.Vector3()
  let moveForward = false
  let moveBackward = false
  let moveLeft = false
  let moveRight = false
  let canJump = false
  let isJumping = false

  // Targets
  let targets: THREE.Mesh[] = []
  const maxTargets = 10

  // Projectiles (laser bolts)
  interface Projectile {
    mesh: THREE.Mesh
    velocity: THREE.Vector3
  }
  let projectiles: Projectile[] = []

  // Enemies
  interface Enemy {
    mesh: THREE.Object3D
    health: number
    lastShot: number
    velocity: THREE.Vector3
  }
  let enemies: Enemy[] = []
  let enemyBullets: Projectile[] = []
  const maxEnemies = 5

  // Collidable objects (trees, boxes, etc.)
  let collidableObjects: THREE.Mesh[] = []

  // Raycaster for shooting
  let raycaster = new THREE.Raycaster()

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

  function loadAvailableMaps() {
    const stored = localStorage.getItem('worldBuilder_maps')
    if (stored) {
      try {
        availableMaps = JSON.parse(stored)
      } catch (e) {
        console.error('Failed to load maps:', e)
        availableMaps = []
      }
    }
  }

  async function selectMapAndStart(map: MapData) {
    selectedMap = map
    showMapSelector = false

    // Clear existing environment if any
    clearEnvironment()

    // Load the selected map
    await loadMapEnvironment(map)

    // Load additional game elements
    loadCampfire()
    spawnTargets()
    spawnEnemies()
  }

  function startWithDefaultMap() {
    selectedMap = null
    showMapSelector = false

    // Use original environment
    createEnvironment()
    loadCampfire()
    spawnTargets()
    spawnEnemies()
  }

  function clearEnvironment() {
    // Remove all existing collidable objects
    collidableObjects.forEach(obj => scene.remove(obj))
    collidableObjects = []

    // Remove ground if it exists
    const existingGround = scene.children.find(child =>
      child instanceof THREE.Mesh &&
      child.geometry instanceof THREE.PlaneGeometry
    )
    if (existingGround) {
      scene.remove(existingGround)
    }
  }

  async function loadMapEnvironment(map: MapData) {
    // Apply environment settings
    updateEnvironmentFromMap(map.environment)

    // Reset camera position
    camera.position.set(0, 3.0, 0)

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

        // Add solid objects to collision detection (skip trees and small decorations)
        const size = new THREE.Box3().setFromObject(newObject).getSize(new THREE.Vector3())
        const volume = size.x * size.y * size.z

        // Only add objects larger than a certain size as collidable
        if (volume > 1) {
          collidableObjects.push(newObject as any)
        }
      } catch (error) {
        console.error("Failed to load map object:", error)
      }
    }
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
    camera.position.set(0, 3.0, 0)

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
      // Trees are walkthrough - not added to collidableObjects
    }

    // Add some obstacles/buildings
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
      collidableObjects.push(box)
    }
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

  function loadCampfire() {
    const mtlLoader = new MTLLoader()
    mtlLoader.setPath("/3d-models/")

    mtlLoader.load("Campfire.mtl", (materials: any) => {
      materials.preload()

      const objLoader = new OBJLoader()
      objLoader.setMaterials(materials)
      objLoader.setPath("/3d-models/")

      objLoader.load("Campfire.obj", (campfire: THREE.Group) => {
        // Position campfire in front of player spawn
        campfire.position.set(0, 0, -5)
        campfire.scale.set(2, 2, 2)

        // Enable shadows
        campfire.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })

        scene.add(campfire)

        // Add point light for fire glow
        const fireLight = new THREE.PointLight(0xff6600, 2, 10)
        fireLight.position.set(0, 1, -5)
        fireLight.castShadow = true
        scene.add(fireLight)

        // Animate fire light flicker
        const animateFireLight = () => {
          if (fireLight) {
            fireLight.intensity =
              2 + Math.sin(Date.now() * 0.005) * 0.5 + Math.random() * 0.3
          }
          requestAnimationFrame(animateFireLight)
        }
        animateFireLight()
      })
    })
  }

  function spawnTargets() {
    const targetGeometry = new THREE.SphereGeometry(0.5, 16, 16)

    for (let i = 0; i < maxTargets; i++) {
      const targetMaterial = new THREE.MeshStandardMaterial({
        color: Math.random() * 0xffffff,
        emissive: 0xff0000,
        emissiveIntensity: 0.2,
      })

      const target = new THREE.Mesh(targetGeometry, targetMaterial)
      target.position.x = (Math.random() - 0.5) * 60
      target.position.y = Math.random() * 3 + 1
      target.position.z = (Math.random() - 0.5) * 60

      // Make sure targets don't spawn too close to player
      if (target.position.distanceTo(new THREE.Vector3(0, 0, 0)) < 5) {
        i--
        continue
      }

      target.castShadow = true
      scene.add(target)
      targets.push(target)
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
        // Toggle pointer lock
        if (controls.isLocked) {
          controls.unlock()
        } else {
          controls.lock()
        }
        break
    }
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

    if (ammo > 0) {
      shoot()
      ammo--
    }
  }

  function shoot() {
    // Play shoot sound
    playShootSound()

    // Create laser bolt projectile
    const boltGeometry = new THREE.SphereGeometry(0.1, 8, 8)
    const boltMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 1,
    })
    const bolt = new THREE.Mesh(boltGeometry, boltMaterial)

    // Add glow effect
    const glowGeometry = new THREE.SphereGeometry(0.15, 8, 8)
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.3,
    })
    const glow = new THREE.Mesh(glowGeometry, glowMaterial)
    bolt.add(glow)

    // Position at camera
    bolt.position.copy(camera.position)

    // Calculate velocity direction from camera
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    const velocity = direction.multiplyScalar(50) // Projectile speed

    scene.add(bolt)
    projectiles.push({ mesh: bolt, velocity })
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

  function spawnNewTarget() {
    const targetGeometry = new THREE.SphereGeometry(0.5, 16, 16)
    const targetMaterial = new THREE.MeshStandardMaterial({
      color: Math.random() * 0xffffff,
      emissive: 0xff0000,
      emissiveIntensity: 0.2,
    })

    const target = new THREE.Mesh(targetGeometry, targetMaterial)
    target.position.x = (Math.random() - 0.5) * 60
    target.position.y = Math.random() * 3 + 1
    target.position.z = (Math.random() - 0.5) * 60

    target.castShadow = true
    scene.add(target)
    targets.push(target)
  }

  function createEnemyModel() {
    const enemyGroup = new THREE.Group()

    // Body - octahedron (diamond shape)
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

    return enemyGroup
  }

  function spawnEnemies() {
    for (let i = 0; i < maxEnemies; i++) {
      const enemyMesh = createEnemyModel()

      enemyMesh.position.x = (Math.random() - 0.5) * 60
      enemyMesh.position.y = 3 + Math.random() * 3 // Hover 3-6 units above ground
      enemyMesh.position.z = (Math.random() - 0.5) * 60

      // Make sure enemies don't spawn too close to player
      if (enemyMesh.position.distanceTo(new THREE.Vector3(0, 0, 0)) < 10) {
        i--
        continue
      }

      scene.add(enemyMesh)

      const enemy: Enemy = {
        mesh: enemyMesh,
        health: 50,
        lastShot: 0,
        velocity: new THREE.Vector3(),
      }

      enemies.push(enemy)
    }
  }

  function spawnNewEnemy() {
    const enemyMesh = createEnemyModel()

    enemyMesh.position.x = (Math.random() - 0.5) * 60
    enemyMesh.position.y = 3 + Math.random() * 3 // Hover 3-6 units above ground
    enemyMesh.position.z = (Math.random() - 0.5) * 60

    scene.add(enemyMesh)

    const enemy: Enemy = {
      mesh: enemyMesh,
      health: 50,
      lastShot: 0,
      velocity: new THREE.Vector3(),
    }

    enemies.push(enemy)
  }

  function checkCollision(newPosition: THREE.Vector3): boolean {
    // Create a bounding sphere for the player
    const playerRadius = 0.5

    for (const obj of collidableObjects) {
      // Calculate bounding box for the object
      const box = new THREE.Box3().setFromObject(obj)

      // Check if player sphere intersects with object bounding box
      const closestPoint = box.clampPoint(newPosition, new THREE.Vector3())
      const distance = closestPoint.distanceTo(newPosition)

      if (distance < playerRadius) {
        return true // Collision detected
      }
    }

    return false // No collision
  }

  function updateMovement(delta: number) {
    if (!controls.isLocked) return

    // Damping
    velocity.x -= velocity.x * 10.0 * delta
    velocity.z -= velocity.z * 10.0 * delta
    velocity.y -= 30.0 * delta // Gravity (increased for better jump feel)

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
    newPosition.y = 3.0 // Use ground level for collision check

    if (checkCollision(newPosition)) {
      // Revert to old position
      camera.position.copy(oldPosition)
      velocity.x = 0
      velocity.z = 0
    }

    // Apply vertical movement (jumping/gravity)
    camera.position.y += velocity.y * delta

    if (camera.position.y <= 3.0) {
      velocity.y = 0
      camera.position.y = 3.0
      canJump = true
      isJumping = false
    }
  }

  function updateProjectiles(delta: number) {
    projectiles = projectiles.filter((projectile) => {
      // Move projectile
      projectile.mesh.position.add(
        projectile.velocity.clone().multiplyScalar(delta),
      )

      // Check collision with targets
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i]
        const distance = projectile.mesh.position.distanceTo(target.position)

        if (distance < 0.6) {
          // Hit!
          createExplosion(target.position.clone())
          scene.remove(target)
          targets.splice(i, 1)
          scene.remove(projectile.mesh)

          // Increase score
          score += 10

          // Spawn new target
          if (targets.length < maxTargets) {
            spawnNewTarget()
          }

          return false // Remove projectile
        }
      }

      // Check collision with enemies using raycasting on mesh geometry
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i]

        // Create a bounding box for quick rejection
        const enemyBox = new THREE.Box3().setFromObject(enemy.mesh)
        const projectileBox = new THREE.Box3().setFromObject(projectile.mesh)

        // Check if bounding boxes intersect
        if (enemyBox.intersectsBox(projectileBox)) {
          // Hit enemy!
          enemy.health -= 25

          if (enemy.health <= 0) {
            // Enemy destroyed
            createExplosion(enemy.mesh.position.clone())
            scene.remove(enemy.mesh)
            enemies.splice(i, 1)
            score += 50

            // Give player extra ammo
            ammo += 5

            // Spawn new enemy
            if (enemies.length < maxEnemies) {
              spawnNewEnemy()
            }
          } else {
            // Enemy damaged - flash all parts
            enemy.mesh.children.forEach((child: THREE.Object3D) => {
              if (
                child instanceof THREE.Mesh &&
                child.material instanceof THREE.MeshStandardMaterial
              ) {
                const originalIntensity = child.material.emissiveIntensity
                child.material.emissiveIntensity = 1.5
                setTimeout(() => {
                  child.material.emissiveIntensity = originalIntensity
                }, 100)
              }
            })
          }

          scene.remove(projectile.mesh)
          return false // Remove projectile
        }
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

      // Move towards player if far away
      if (distanceToPlayer > 15) {
        enemy.mesh.position.add(directionToPlayer.multiplyScalar(delta * 2))
      } else if (distanceToPlayer < 10) {
        // Move away if too close
        enemy.mesh.position.sub(directionToPlayer.multiplyScalar(delta * 1))
      }

      // Shoot at player every 2 seconds if within range
      if (distanceToPlayer < 40 && currentTime - enemy.lastShot > 2000) {
        shootEnemyBullet(enemy)
        enemy.lastShot = currentTime
      }
    })
  }

  function shootEnemyBullet(enemy: Enemy) {
    // Create enemy bullet
    const bulletGeometry = new THREE.SphereGeometry(0.15, 8, 8)
    const bulletMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 1,
    })
    const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial)

    // Position at enemy
    bullet.position.copy(enemy.mesh.position)
    bullet.position.y += 1 // Center of enemy

    // Calculate velocity towards player
    const direction = new THREE.Vector3()
    direction.subVectors(camera.position, enemy.mesh.position)
    direction.normalize()
    const velocity = direction.multiplyScalar(30) // Enemy bullet speed

    scene.add(bullet)
    enemyBullets.push({ mesh: bullet, velocity })
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

      // Check collision with player
      const distance = bullet.mesh.position.distanceTo(camera.position)

      if (distance < 1.0) {
        // Hit player!
        health -= 10
        if (health < 0) health = 0
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

  const clock = new THREE.Clock()

  function animate() {
    animationId = requestAnimationFrame(animate)

    const delta = clock.getDelta()

    // Only update game logic when playing
    if (isPlaying) {
      updateMovement(delta)
      updateProjectiles(delta)
      updateEnemies(delta)
      updateEnemyBullets(delta)

      // Animate targets (make them hover)
      targets.forEach((target, index) => {
        target.position.y += Math.sin(Date.now() * 0.001 + index) * 0.01
        target.rotation.y += delta * 0.5
      })
    }

    renderer.render(scene, camera)
  }

  // Pointer lock events
  onMount(() => {
    if (!controls) return

    const onLock = () => {
      isPlaying = true
    }

    const onUnlock = () => {
      isPlaying = false
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

<div class="flex flex-col md:flex-row h-screen overflow-hidden">
  <!-- Game Container -->
  <div class="flex-1 relative min-w-0">
    <div
      bind:this={container}
      class="w-full h-full md:border-r-4 border-base-300 bg-black"
    >
      {#if showMapSelector}
        <div class="absolute inset-0 flex items-center justify-center bg-black/90 z-30 overflow-y-auto p-4">
          <div class="text-center max-w-4xl w-full">
            <h2 class="text-4xl font-bold text-white mb-6">Select a Map</h2>

            {#if availableMaps.length === 0}
              <div class="bg-base-200 p-8 rounded-lg mb-4">
                <p class="text-lg mb-4">No World Builder maps found.</p>
                <p class="text-sm text-gray-400 mb-4">
                  Create maps in World Builder first, then play them here!
                </p>
                <button class="btn btn-primary btn-lg" on:click={startWithDefaultMap}>
                  Play Default Map
                </button>
              </div>
            {:else}
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 max-h-96 overflow-y-auto">
                {#each availableMaps as map}
                  <button
                    class="card bg-base-200 hover:bg-base-300 transition-colors cursor-pointer"
                    on:click={() => selectMapAndStart(map)}
                  >
                    <div class="card-body p-4">
                      {#if map.thumbnail}
                        <img
                          src={map.thumbnail}
                          alt={map.name}
                          class="w-full h-32 object-cover rounded mb-2"
                        />
                      {/if}
                      <h3 class="font-bold text-lg">{map.name}</h3>
                      <div class="text-xs text-gray-400">
                        {map.stats.objectCount} objects • {map.environment.timeOfDay} • {map.environment.weather}
                      </div>
                    </div>
                  </button>
                {/each}
              </div>

              <button class="btn btn-outline btn-lg" on:click={startWithDefaultMap}>
                Play Default Map Instead
              </button>
            {/if}

            <p class="text-white mt-6 text-sm">
              Controls: WASD to move, Mouse to look, Click to shoot, Space to jump, ESC to pause
            </p>
          </div>
        </div>
      {:else if !isPlaying}
        <div
          class="absolute inset-0 flex items-center justify-center bg-black/70 z-10"
        >
          <div class="text-center">
            <h2 class="text-3xl font-bold text-white mb-4">Click to Start</h2>
            <button class="btn btn-primary btn-lg" on:click={startGame}>
              Start Game
            </button>
            <p class="text-white mt-4">
              Controls: WASD to move, Mouse to look, Click to shoot, Space to
              jump, ESC to pause
            </p>
          </div>
        </div>
      {/if}
      
      {#if isPlayerHit}
        <div
          class="absolute inset-0 bg-red-500/30 animate-flash pointer-events-none z-20"
        />
      {/if}

        <!-- HUD -->
        {#if isPlaying}
          <div
            class="absolute top-4 left-4 text-white text-2xl font-bold z-10 bg-black/50 p-4 rounded"
          >
            <div>Score: {score}</div>
            <div>Ammo: {ammo}</div>
            <div>Health: {health}</div>
          </div>

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
        {/if}
      </div>
    </div>

  <!-- Info Panel -->
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

    <div class="stats stats-horizontal md:stats-vertical w-full mb-4 md:mb-6">
      <div class="stat bg-base-100">
        <div class="stat-title">Score</div>
        <div class="stat-value text-primary text-2xl md:text-4xl">{score}</div>
      </div>
      <div class="stat bg-base-100">
        <div class="stat-title">Ammo</div>
        <div class="stat-value text-secondary text-2xl md:text-4xl">{ammo}</div>
      </div>
      <div class="stat bg-base-100">
        <div class="stat-title">Health</div>
        <div class="stat-value text-accent text-2xl md:text-4xl">{health}</div>
      </div>
    </div>

    <div class="space-y-4 md:space-y-6">
      <div>
        <h3 class="font-semibold mb-2 text-sm md:text-base">Controls:</h3>
        <ul class="space-y-1 text-xs md:text-sm">
          <li><kbd class="kbd kbd-sm">W/A/S/D</kbd> - Move</li>
          <li><kbd class="kbd kbd-sm">Mouse</kbd> - Look around</li>
          <li><kbd class="kbd kbd-sm">Click</kbd> - Shoot laser bolt</li>
          <li><kbd class="kbd kbd-sm">Space</kbd> - Jump</li>
          <li><kbd class="kbd kbd-sm">ESC</kbd> - Pause</li>
        </ul>
      </div>

      <div>
        <h3 class="font-semibold mb-2 text-sm md:text-base">Objective:</h3>
        <p class="text-xs md:text-sm">
          Shoot the colorful spheres (10 points) and destroy red enemy cubes
          (50 points each, 2 hits to kill)! Enemies will shoot red bullets
          back at you, dealing 10 damage. Watch your health and ammo!
          Navigate through trees and obstacles to find the best vantage
          points.
        </p>
      </div>
    </div>
  </div>
</div>
