<script lang="ts">
  import { onMount } from "svelte"
  import * as THREE from "three"
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
  import modelCatalogData from "./modelCatalog.json"

  let container: HTMLDivElement
  let scene: THREE.Scene
  let camera: THREE.PerspectiveCamera
  let renderer: THREE.WebGLRenderer
  let controls: OrbitControls
  let animationId: number
  let raycaster = new THREE.Raycaster()
  let mouse = new THREE.Vector2()
  let ground: THREE.Mesh

  // Model catalog
  interface ModelInfo {
    name: string
    path: string
    category: string
  }

  let modelCatalog: ModelInfo[] = modelCatalogData
  let selectedModel = $state<ModelInfo | null>(null)
  let previewMesh: THREE.Group | null = null
  let placedObjects = $state<Array<{ mesh: THREE.Group, modelPath: string }>>([])
  let currentRotation = 0
  let currentScale = 1.0
  let gridHelper: THREE.GridHelper
  let showGrid = $state(true)
  let selectedCategory = $state("All")
  let searchQuery = $state("")
  let selectedPlacedObject = $state<{ mesh: THREE.Group, modelPath: string } | null>(null)
  let isPanning = $state(false)
  let isDraggingObject = $state(false)
  let isRotatingCamera = $state(false)
  let isOptionKeyHeld = $state(false)
  let isCommandKeyHeld = $state(false)
  let hoveredObject = $state<{ mesh: THREE.Group, modelPath: string } | null>(null)
  let animationsEnabled = $state(false)
  let hasMouseMoved = $state(false) // Track if mouse moved during click
  let mouseDownPosition = { x: 0, y: 0 } // Track mouse position on down
  let previewHasBeenPositioned = $state(false) // Track if preview mesh has been positioned by mouse

  // Maps Management
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

  let savedMaps = $state<MapData[]>([])
  let currentMapId = $state<string | null>(null)
  let currentMapName = $state<string>('Untitled Map')
  let activeTab = $state<'models' | 'maps' | 'options'>('models')
  let timeOfDay = $state<'dawn' | 'day' | 'sunset' | 'night'>('sunset')
  let weather = $state<'clear' | 'rain' | 'snow' | 'fog'>('clear')
  let polygonCount = $state(0)
  const MAX_POLYGON_WARNING = 100000

  // Auto-generate settings
  let autoGenTrees = $state(8)
  let autoGenBuildings = $state(8)
  let autoGenVehicles = $state(8)
  let autoGenAnimals = $state(8)

  // First-person mode (POV Mode)
  let isFirstPersonMode = $state(false)
  let isPOVPaused = $state(false) // Track if POV mode is paused
  let fpPosition = new THREE.Vector3(0, 10, 0) // Start at height 10 (drop from sky)
  let fpVelocity = new THREE.Vector3(0, 0, 0) // Velocity for jumping and falling
  let fpYaw = 0
  let fpPitch = 0
  let fpKeysPressed = new Set<string>()
  let savedCameraPosition: THREE.Vector3 | null = null
  let savedCameraRotation: THREE.Euler | null = null
  let savedControlsTarget: THREE.Vector3 | null = null
  const GRAVITY = -20 // Gravity acceleration
  const JUMP_VELOCITY = 8 // Initial upward velocity for jump
  const GROUND_LEVEL = 1.65 // Eye height above ground (matches animated woman model)

  // Stuck detection for POV mode
  let lastPOVPosition = new THREE.Vector3()
  let stuckCheckTimer = 0
  let stuckCounter = 0
  const STUCK_CHECK_INTERVAL = 1000 // Check every second
  const STUCK_THRESHOLD = 0.1 // Minimum distance to consider movement
  const STUCK_COUNT_LIMIT = 2 // How many checks before unstuck action

  // Animation mixers for animated models
  interface AnimatedObject {
    mesh: THREE.Group
    mixer: THREE.AnimationMixer
    clips: THREE.AnimationClip[]
  }
  let animatedObjects: AnimatedObject[] = []

  // Selection outline
  let selectionHelper: THREE.BoxHelper | null = null
  let hoverHelper: THREE.BoxHelper | null = null

  // Thumbnail previews
  interface ModelThumbnail {
    model: ModelInfo
    dataUrl: string
  }
  let thumbnails = $state<Map<string, string>>(new Map())
  let thumbnailsLoading = $state(true)
  const THUMBNAIL_CACHE_KEY = 'worldBuilder_thumbnailCache'
  const THUMBNAIL_VERSION_KEY = 'worldBuilder_thumbnailVersion'
  const CURRENT_THUMBNAIL_VERSION = '1.0' // Increment to invalidate cache

  // Undo/Redo history
  interface HistoryState {
    placedObjects: Array<{
      modelPath: string
      position: { x: number, y: number, z: number }
      rotation: { x: number, y: number, z: number }
      scale: { x: number, y: number, z: number }
    }>
  }
  let history = $state<HistoryState[]>([])
  let historyIndex = $state(-1)

  const categories = ["All", "Animals", "Blocks", "Buildings", "Characters", "Creatures", "Decor", "Fences", "Furniture", "Items", "Nature", "Roads", "Urban", "Vehicles"]

  // Randomize model catalog on load
  function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  onMount(() => {
    // Randomize the catalog order
    modelCatalog = shuffleArray(modelCatalog)

    // Load saved maps from localStorage
    loadMapsFromStorage()

    initScene()
    animate()
    generateThumbnails()

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
      if (renderer) {
        renderer.dispose()
      }
    }
  })

  function loadMapsFromStorage() {
    const stored = localStorage.getItem('worldBuilder_maps')
    if (stored) {
      try {
        savedMaps = JSON.parse(stored)
      } catch (e) {
        console.error('Failed to load maps:', e)
        savedMaps = []
      }
    }
  }

  function saveMapsToStorage() {
    localStorage.setItem('worldBuilder_maps', JSON.stringify(savedMaps))
  }

  function initScene() {
    // Scene
    scene = new THREE.Scene()
    updateEnvironment()

    // Camera
    camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    )
    camera.position.set(20, 20, 20)
    camera.lookAt(0, 0, 0)

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    container.appendChild(renderer.domElement)

    // Orbit Controls
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.maxPolarAngle = Math.PI / 2 - 0.1 // Prevent going below ground
    controls.minDistance = 5
    controls.maxDistance = 1000
    controls.enablePan = true
    controls.panSpeed = 1.0
    controls.zoomSpeed = 2.0 // Increased zoom sensitivity
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    }

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    ambientLight.name = 'ambientLight'
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.name = 'directionalLight'
    directionalLight.position.set(50, 50, 50)
    directionalLight.castShadow = true
    directionalLight.shadow.camera.left = -100
    directionalLight.shadow.camera.right = 100
    directionalLight.shadow.camera.top = 100
    directionalLight.shadow.camera.bottom = -100
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    scene.add(directionalLight)

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(200, 200)
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d5016,
      roughness: 0.8,
    })
    ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // Grid - increased resolution by 10x (40 -> 400 divisions)
    gridHelper = new THREE.GridHelper(200, 400, 0x888888, 0x444444)
    gridHelper.position.y = 0.01
    scene.add(gridHelper)

    // Handle window resize
    window.addEventListener("resize", onWindowResize)

    // Mouse events
    renderer.domElement.addEventListener("mousemove", onMouseMove)
    renderer.domElement.addEventListener("mousemove", onFPMouseMove)
    renderer.domElement.addEventListener("mousedown", onMouseDown)
    renderer.domElement.addEventListener("mouseup", onMouseUp)
    renderer.domElement.addEventListener("click", onMouseClick)
    renderer.domElement.addEventListener("contextmenu", onRightClick)
  }

  function updateEnvironment() {
    if (!scene) return

    // Sky gradients for different times of day
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

    const gradient = skyGradients[timeOfDay]

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
    let fogDensity = weather === 'fog' ? 100 : 200
    if (weather === 'rain') fogDensity = 150
    if (weather === 'snow') fogDensity = 120

    scene.fog = new THREE.Fog(gradient.fogColor, 50, fogDensity)

    // Update lighting
    const ambientLight = scene.getObjectByName('ambientLight') as THREE.AmbientLight
    const directionalLight = scene.getObjectByName('directionalLight') as THREE.DirectionalLight

    if (ambientLight) {
      ambientLight.intensity = gradient.ambientIntensity
    }
    if (directionalLight) {
      directionalLight.intensity = gradient.directionalIntensity
    }
  }

  function onWindowResize() {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }

  function onMouseMove(event: MouseEvent) {
    // Skip all build mode mouse interactions in POV mode
    if (isFirstPersonMode) return

    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    // Track if mouse has moved significantly (more than 5 pixels from down position)
    const dx = event.clientX - mouseDownPosition.x
    const dy = event.clientY - mouseDownPosition.y
    const distanceMoved = Math.sqrt(dx * dx + dy * dy)
    if (distanceMoved > 5) {
      hasMouseMoved = true
      // Hide preview when dragging starts (for any operation including panning/rotating)
      if (previewMesh && !selectedPlacedObject) {
        previewMesh.visible = false
      }
    }

    if (isDraggingObject && selectedPlacedObject) {
      // Drag selected object
      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObject(ground)

      if (intersects.length > 0) {
        const point = intersects[0].point

        // Snap to grid if enabled
        if (showGrid) {
          const gridSize = 0.5
          point.x = Math.round(point.x / gridSize) * gridSize
          point.z = Math.round(point.z / gridSize) * gridSize
        }

        selectedPlacedObject.mesh.position.set(point.x, selectedPlacedObject.mesh.position.y, point.z)
      }
    } else if (selectedModel && previewMesh && !isPanning && !isRotatingCamera && !selectedPlacedObject) {
      // Only update preview if no object is selected
      updatePreviewPosition()

      // Check for hover on existing objects
      raycaster.setFromCamera(mouse, camera)
      const meshes = placedObjects.map(obj => obj.mesh)
      const intersects = raycaster.intersectObjects(meshes, true)

      if (intersects.length > 0) {
        // Find the top-level placed object
        let hoveredMesh = intersects[0].object
        while (hoveredMesh.parent && hoveredMesh.parent !== scene) {
          hoveredMesh = hoveredMesh.parent
        }

        const obj = placedObjects.find(obj => obj.mesh === hoveredMesh)
        if (obj) {
          hoveredObject = obj
          // Hide preview when hovering over existing object
          if (previewMesh) {
            previewMesh.visible = false
          }
        }
      } else {
        hoveredObject = null
        // Show preview when not hovering over existing object (only if no object selected)
        if (previewMesh && !selectedPlacedObject) {
          previewMesh.visible = true
        }
      }
    } else {
      hoveredObject = null
    }
  }

  function updatePreviewPosition() {
    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObject(ground)

    if (intersects.length > 0 && previewMesh) {
      const point = intersects[0].point

      // Snap to grid if enabled - finer 0.5 unit grid
      if (showGrid) {
        const gridSize = 0.5
        point.x = Math.round(point.x / gridSize) * gridSize
        point.z = Math.round(point.z / gridSize) * gridSize
      }

      previewMesh.position.set(point.x, 0, point.z)
      previewMesh.rotation.y = currentRotation
      previewMesh.scale.set(currentScale, currentScale, currentScale)

      // Mark that preview has been positioned
      previewHasBeenPositioned = true
    }
  }

  async function selectModel(model: ModelInfo) {
    selectedModel = model

    // Reset preview positioning flag
    previewHasBeenPositioned = false

    // Remove old preview
    if (previewMesh) {
      scene.remove(previewMesh)
    }

    // Load and create preview
    const loader = new GLTFLoader()
    try {
      const gltf = await loader.loadAsync(model.path)
      previewMesh = gltf.scene
      previewMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = child.material.clone()
          child.material.transparent = true
          child.material.opacity = 0.6
        }
      })
      scene.add(previewMesh)
    } catch (error) {
      console.error("Failed to load model:", error)
    }
  }

  function onMouseDown(event: MouseEvent) {
    if (event.button !== 0) return // Only left click
    if (isFirstPersonMode) return // Disable all build mode interactions in POV mode

    // Record mouse position and reset movement tracking
    mouseDownPosition = { x: event.clientX, y: event.clientY }
    hasMouseMoved = false

    // Don't process clicks if any modifier key is held
    if (isPanning || isRotatingCamera) return

    // Check if clicking on selected object to start dragging
    if (selectedPlacedObject && !isOptionKeyHeld && !isCommandKeyHeld) {
      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObject(selectedPlacedObject.mesh, true)

      if (intersects.length > 0) {
        isDraggingObject = true
        controls.enabled = false // Disable orbit controls while dragging
        if (renderer?.domElement) {
          renderer.domElement.style.cursor = 'move'
        }
      }
    }
  }

  function onMouseUp(event: MouseEvent) {
    // Reset camera rotation mode
    if (isRotatingCamera) {
      isRotatingCamera = false
      controls.enablePan = true
      controls.minPolarAngle = 0
      controls.maxPolarAngle = Math.PI / 2 - 0.1
      if (renderer?.domElement) {
        renderer.domElement.style.cursor = 'default'
      }
    }

    if (isDraggingObject) {
      isDraggingObject = false
      controls.enabled = true
      if (renderer?.domElement) {
        renderer.domElement.style.cursor = 'default'
      }
      saveHistory()
    }

    // Show preview again after any drag operation (if not holding modifier keys)
    if (hasMouseMoved && previewMesh && !selectedPlacedObject && !isPanning && !isRotatingCamera) {
      previewMesh.visible = true
    }
  }

  async function onMouseClick(event: MouseEvent) {
    if (event.button !== 0) return // Only left click
    if (isFirstPersonMode) return // Disable all build mode clicks in POV mode
    if (isPanning) return // Don't place objects while panning
    if (isDraggingObject) return // Don't process click if we just finished dragging
    if (isRotatingCamera) return // Don't place objects when rotating camera
    if (isOptionKeyHeld) return // Don't place objects while Option is held
    if (isCommandKeyHeld) return // Don't place objects while Command is held
    if (hasMouseMoved) return // Don't place objects if mouse was dragged

    // Check if clicking on an existing object to select it
    raycaster.setFromCamera(mouse, camera)
    const meshes = placedObjects.map(obj => obj.mesh)
    const intersects = raycaster.intersectObjects(meshes, true)

    if (intersects.length > 0) {
      // Find the top-level placed object
      let clickedObject = intersects[0].object
      while (clickedObject.parent && clickedObject.parent !== scene) {
        clickedObject = clickedObject.parent
      }

      const obj = placedObjects.find(obj => obj.mesh === clickedObject)
      if (obj) {
        selectedPlacedObject = obj
        return
      }
    } else {
      // Clicking empty space - deselect object
      if (selectedPlacedObject) {
        selectedPlacedObject = null
        // Preview will be shown by $effect
        return
      }
    }

    // Place new object if a model is selected
    if (!selectedModel || !previewMesh) return

    // Don't place if preview hasn't been positioned yet
    if (!previewHasBeenPositioned) return

    const loader = new GLTFLoader()
    try {
      const gltf = await loader.loadAsync(selectedModel.path)
      const newObject = gltf.scene
      newObject.position.copy(previewMesh.position)
      newObject.rotation.copy(previewMesh.rotation)
      newObject.scale.set(currentScale, currentScale, currentScale)

      newObject.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })

      scene.add(newObject)
      placedObjects.push({ mesh: newObject, modelPath: selectedModel.path })

      // Check if this is an animated model (only play if animations enabled)
      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(newObject)
        gltf.animations.forEach((clip) => {
          const action = mixer.clipAction(clip)
          if (animationsEnabled) {
            action.play()
          }
        })
        animatedObjects.push({ mesh: newObject, mixer, clips: gltf.animations })
      }

      // Save history after placing object
      saveHistory()
    } catch (error) {
      console.error("Failed to place model:", error)
    }
  }

  function onRightClick(event: MouseEvent) {
    event.preventDefault()
    if (isFirstPersonMode) return // Disable right-click in POV mode

    // Raycast to find object to delete
    raycaster.setFromCamera(mouse, camera)
    const meshes = placedObjects.map(obj => obj.mesh)
    const intersects = raycaster.intersectObjects(meshes, true)

    if (intersects.length > 0) {
      // Find the top-level placed object
      let objectToRemove = intersects[0].object
      while (objectToRemove.parent && objectToRemove.parent !== scene) {
        objectToRemove = objectToRemove.parent
      }

      const index = placedObjects.findIndex(obj => obj.mesh === objectToRemove)
      if (index > -1) {
        scene.remove(placedObjects[index].mesh)

        // Remove from animated objects if it exists
        const animIndex = animatedObjects.findIndex(obj => obj.mesh === objectToRemove)
        if (animIndex > -1) {
          animatedObjects.splice(animIndex, 1)
        }

        placedObjects.splice(index, 1)
        saveHistory()
      }
    }
  }

  function rotatePreview(direction: number = 1) {
    // 30 degree rotation increments (π/6)
    const rotationAmount = (Math.PI / 6) * direction

    // Only rotate if no object is selected (preview mode only)
    if (!selectedPlacedObject) {
      currentRotation += rotationAmount
      if (previewMesh) {
        previewMesh.rotation.y = currentRotation
      }
    }

    // Rotate selected object
    if (selectedPlacedObject) {
      selectedPlacedObject.mesh.rotation.y += rotationAmount
      saveHistory()
    }
  }

  function scaleUp() {
    // Only scale selected object, not preview
    if (selectedPlacedObject) {
      const newScale = selectedPlacedObject.mesh.scale.x * 1.2
      selectedPlacedObject.mesh.scale.set(newScale, newScale, newScale)
      saveHistory()
    } else if (previewMesh) {
      // Only scale preview if no object is selected
      currentScale = Math.min(currentScale * 1.2, 10)
      previewMesh.scale.set(currentScale, currentScale, currentScale)
    }
  }

  function scaleDown() {
    // Only scale selected object, not preview
    if (selectedPlacedObject) {
      const newScale = selectedPlacedObject.mesh.scale.x * 0.8
      selectedPlacedObject.mesh.scale.set(newScale, newScale, newScale)
      saveHistory()
    } else if (previewMesh) {
      // Only scale preview if no object is selected
      currentScale = Math.max(currentScale * 0.8, 0.1)
      previewMesh.scale.set(currentScale, currentScale, currentScale)
    }
  }

  function resetScale() {
    // Only reset selected object, not preview
    if (selectedPlacedObject) {
      selectedPlacedObject.mesh.scale.set(1, 1, 1)
      saveHistory()
    } else if (previewMesh) {
      // Only reset preview if no object is selected
      currentScale = 1.0
      previewMesh.scale.set(1, 1, 1)
    }
  }

  function toggleGrid() {
    showGrid = !showGrid
    gridHelper.visible = showGrid
  }

  function toggleAnimations() {
    animationsEnabled = !animationsEnabled
    // Update all existing animated objects
    animatedObjects.forEach(({ mixer, clips }) => {
      mixer.stopAllAction()
      if (animationsEnabled) {
        // Re-play all animations if enabled
        clips.forEach((clip) => {
          const action = mixer.clipAction(clip)
          action.play()
        })
      }
    })
  }

  function deleteSelected() {
    if (!selectedPlacedObject) return

    const index = placedObjects.findIndex(obj => obj === selectedPlacedObject)
    if (index > -1) {
      const meshToDelete = selectedPlacedObject.mesh
      scene.remove(meshToDelete)

      // Remove from animated objects if it exists
      const animIndex = animatedObjects.findIndex(obj => obj.mesh === meshToDelete)
      if (animIndex > -1) {
        animatedObjects.splice(animIndex, 1)
      }

      placedObjects.splice(index, 1)
      selectedPlacedObject = null
      saveHistory()
    }
  }

  function clearScene() {
    if (confirm("Clear all objects from the scene?")) {
      placedObjects.forEach(obj => scene.remove(obj.mesh))
      placedObjects = []
      animatedObjects = []
      currentMapId = null
      currentMapName = 'Untitled Map'
      updatePolygonCount()
    }
  }

  function createNewMap() {
    if (placedObjects.length > 0) {
      if (!confirm("Start a new map? Current unsaved work will be lost.")) {
        return
      }
    }
    clearScene()
    activeTab = 'models'
  }

  async function generateMapThumbnail(): Promise<string> {
    // Create a temporary camera view
    const thumbRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    thumbRenderer.setSize(256, 256)
    thumbRenderer.shadowMap.enabled = true

    const thumbCamera = camera.clone()
    thumbRenderer.render(scene, thumbCamera)
    const thumbnail = thumbRenderer.domElement.toDataURL('image/png')
    thumbRenderer.dispose()

    return thumbnail
  }

  async function saveCurrentMap(mapName?: string, mapDescription?: string) {
    const name = mapName || currentMapName || 'Untitled Map'
    const description = mapDescription || ''

    if (!name.trim()) {
      alert('Please enter a map name')
      return
    }

    const thumbnail = await generateMapThumbnail()
    const now = Date.now()

    const mapData: MapData = {
      id: currentMapId || `map_${now}`,
      name: name.trim(),
      description: description.trim(),
      created: currentMapId ? savedMaps.find(m => m.id === currentMapId)?.created || now : now,
      modified: now,
      thumbnail,
      environment: {
        timeOfDay,
        weather,
        fogDensity: scene.fog instanceof THREE.Fog ? scene.fog.far : 200
      },
      objects: placedObjects.map(obj => ({
        modelPath: obj.modelPath,
        position: { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z },
        rotation: { x: obj.mesh.rotation.x, y: obj.mesh.rotation.y, z: obj.mesh.rotation.z },
        scale: { x: obj.mesh.scale.x, y: obj.mesh.scale.y, z: obj.mesh.scale.z }
      })),
      stats: {
        objectCount: placedObjects.length,
        polygonCount
      }
    }

    // Update or add map
    const existingIndex = savedMaps.findIndex(m => m.id === mapData.id)
    if (existingIndex >= 0) {
      savedMaps[existingIndex] = mapData
    } else {
      savedMaps = [...savedMaps, mapData]
    }

    currentMapId = mapData.id
    currentMapName = name
    saveMapsToStorage()

    alert(`Map "${name}" saved! (${placedObjects.length} objects)`)
  }

  async function saveAsNewMap() {
    const baseName = currentMapName || 'Untitled Map'
    const newName = prompt(`Save as new map. Enter a name:`, `${baseName} (Copy)`)

    if (!newName || !newName.trim()) {
      return
    }

    const thumbnail = await generateMapThumbnail()
    const now = Date.now()

    const mapData: MapData = {
      id: `map_${now}`,
      name: newName.trim(),
      description: '',
      created: now,
      modified: now,
      thumbnail,
      environment: {
        timeOfDay,
        weather,
        fogDensity: scene.fog instanceof THREE.Fog ? scene.fog.far : 200
      },
      objects: placedObjects.map(obj => ({
        modelPath: obj.modelPath,
        position: { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z },
        rotation: { x: obj.mesh.rotation.x, y: obj.mesh.rotation.y, z: obj.mesh.rotation.z },
        scale: { x: obj.mesh.scale.x, y: obj.mesh.scale.y, z: obj.mesh.scale.z }
      })),
      stats: {
        objectCount: placedObjects.length,
        polygonCount
      }
    }

    savedMaps = [...savedMaps, mapData]
    currentMapId = mapData.id
    currentMapName = newName.trim()
    saveMapsToStorage()

    alert(`New map "${newName}" created! (${placedObjects.length} objects)`)
  }

  async function loadMap(mapId: string) {
    const map = savedMaps.find(m => m.id === mapId)
    if (!map) {
      alert('Map not found!')
      return
    }

    // Clear current scene
    placedObjects.forEach(obj => scene.remove(obj.mesh))
    placedObjects = []
    animatedObjects = []
    selectedPlacedObject = null

    // Load environment settings
    timeOfDay = map.environment.timeOfDay
    weather = map.environment.weather
    updateEnvironment()

    // Load objects
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
        placedObjects.push({ mesh: newObject, modelPath: objData.modelPath })

        // Check if animated
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(newObject)
          gltf.animations.forEach((clip) => {
            const action = mixer.clipAction(clip)
            if (animationsEnabled) {
              action.play()
            }
          })
          animatedObjects.push({ mesh: newObject, mixer, clips: gltf.animations })
        }
      } catch (error) {
        console.error("Failed to load object:", error)
      }
    }

    currentMapId = map.id
    currentMapName = map.name
    updatePolygonCount()
    activeTab = 'models'

    alert(`Map "${map.name}" loaded! (${placedObjects.length} objects)`)
  }

  function deleteMap(mapId: string) {
    const map = savedMaps.find(m => m.id === mapId)
    if (!map) return

    if (!confirm(`Delete map "${map.name}"? This cannot be undone.`)) {
      return
    }

    savedMaps = savedMaps.filter(m => m.id !== mapId)
    saveMapsToStorage()

    if (currentMapId === mapId) {
      currentMapId = null
      currentMapName = 'Untitled Map'
    }
  }

  function exportMap(mapId: string) {
    const map = savedMaps.find(m => m.id === mapId)
    if (!map) return

    const dataStr = JSON.stringify(map, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${map.name.replace(/[^a-z0-9]/gi, '_')}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importMap() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const mapData: MapData = JSON.parse(text)

        // Generate new ID to avoid conflicts
        mapData.id = `map_${Date.now()}`
        mapData.created = Date.now()
        mapData.modified = Date.now()

        savedMaps = [...savedMaps, mapData]
        saveMapsToStorage()

        alert(`Map "${mapData.name}" imported successfully!`)
      } catch (error) {
        alert('Failed to import map. Invalid file format.')
        console.error(error)
      }
    }

    input.click()
  }

  // Validate spawn position to ensure player is not stuck
  function validateSpawnPosition(position: THREE.Vector3): boolean {
    const raycaster = new THREE.Raycaster()
    const directions = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
    ]

    // Check for obstacles in all directions
    for (const direction of directions) {
      raycaster.set(position, direction)
      const intersects = raycaster.intersectObjects(
        placedObjects.map(obj => obj.mesh),
        true
      )

      // If obstacle is too close (within 3 units), position is invalid
      if (intersects.length > 0 && intersects[0].distance < 3) {
        return false
      }
    }

    return true
  }

  // Auto generate map with smart object placement
  async function autoGenerateMap() {
    if (!confirm('This will clear the current map and generate a new one. Continue?')) {
      return
    }

    if (modelCatalog.length === 0) {
      alert('No models available in the catalog!')
      return
    }

    // Clear existing objects
    placedObjects.forEach(obj => {
      scene.remove(obj.mesh)
      if (obj.mixer) {
        const index = animatedObjects.findIndex(a => a.mesh === obj.mesh)
        if (index !== -1) {
          animatedObjects.splice(index, 1)
        }
      }
    })
    placedObjects = []

    // Categorize models
    const trees = modelCatalog.filter(m =>
      m.name.toLowerCase().includes('tree') ||
      m.name.toLowerCase().includes('pine') ||
      m.name.toLowerCase().includes('oak')
    )
    const buildings = modelCatalog.filter(m =>
      m.name.toLowerCase().includes('building') ||
      m.name.toLowerCase().includes('house') ||
      m.name.toLowerCase().includes('tower')
    )
    const vehicles = modelCatalog.filter(m =>
      m.name.toLowerCase().includes('car') ||
      m.name.toLowerCase().includes('truck') ||
      m.name.toLowerCase().includes('vehicle')
    )
    const animals = modelCatalog.filter(m =>
      m.name.toLowerCase().includes('animal') ||
      m.name.toLowerCase().includes('dog') ||
      m.name.toLowerCase().includes('cat') ||
      m.name.toLowerCase().includes('bird')
    )
    const other = modelCatalog.filter(m =>
      !trees.includes(m) && !buildings.includes(m) &&
      !vehicles.includes(m) && !animals.includes(m)
    )

    const newObjects: Array<{ mesh: THREE.Group, modelPath: string, rotation: number, scale: number, mixer: THREE.AnimationMixer | null }> = []
    const loader = new GLTFLoader()

    // Helper to place object
    const placeModel = async (model: any, position: THREE.Vector3, scale: number) => {
      try {
        const gltf = await new Promise<any>((resolve, reject) => {
          loader.load(model.path, (gltf) => resolve(gltf), undefined, (error) => reject(error))
        })

        const mesh = gltf.scene
        mesh.position.copy(position)
        mesh.rotation.y = Math.random() * Math.PI * 2
        mesh.scale.setScalar(scale)
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })

        scene.add(mesh)

        let mixer: THREE.AnimationMixer | null = null
        if (gltf.animations && gltf.animations.length > 0 && animationsEnabled) {
          mixer = new THREE.AnimationMixer(mesh)
          const action = mixer.clipAction(gltf.animations[0])
          action.play()
          animatedObjects = [...animatedObjects, { mesh, mixer }]
        }

        newObjects.push({ mesh, modelPath: model.path, rotation: mesh.rotation.y, scale, mixer })
      } catch (error) {
        console.error('Failed to load model:', model.path, error)
      }
    }

    // Place trees
    for (let i = 0; i < autoGenTrees && trees.length > 0; i++) {
      const model = trees[Math.floor(Math.random() * trees.length)]
      const pos = new THREE.Vector3((Math.random() - 0.5) * 150, 0, (Math.random() - 0.5) * 150)
      await placeModel(model, pos, 2.0 + Math.random() * 2.0)
    }

    // Place buildings (larger, in a circle)
    for (let i = 0; i < autoGenBuildings && buildings.length > 0; i++) {
      const model = buildings[Math.floor(Math.random() * buildings.length)]
      const angle = (i / autoGenBuildings) * Math.PI * 2
      const radius = 40 + Math.random() * 30
      const pos = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
      await placeModel(model, pos, 3.0 + Math.random() * 2.0)
    }

    // Place vehicles
    for (let i = 0; i < autoGenVehicles && vehicles.length > 0; i++) {
      const model = vehicles[Math.floor(Math.random() * vehicles.length)]
      const pos = new THREE.Vector3((Math.random() - 0.5) * 100, 0, (Math.random() - 0.5) * 100)
      await placeModel(model, pos, 1.5 + Math.random())
    }

    // Place animals
    for (let i = 0; i < autoGenAnimals && animals.length > 0; i++) {
      const model = animals[Math.floor(Math.random() * animals.length)]
      const pos = new THREE.Vector3((Math.random() - 0.5) * 120, 0, (Math.random() - 0.5) * 120)
      await placeModel(model, pos, 1.0 + Math.random() * 0.5)
    }

    // Sprinkle 15-20 random other objects
    const otherCount = 15 + Math.floor(Math.random() * 6)
    for (let i = 0; i < otherCount && other.length > 0; i++) {
      const model = other[Math.floor(Math.random() * other.length)]
      const pos = new THREE.Vector3((Math.random() - 0.5) * 130, 0, (Math.random() - 0.5) * 130)
      await placeModel(model, pos, 0.8 + Math.random() * 1.5)
    }

    // Update placedObjects all at once
    placedObjects = newObjects

    // Reset camera to good overview position
    camera.position.set(50, 50, 50)
    camera.lookAt(0, 0, 0)
    controls.target.set(0, 0, 0)
    controls.update()

    updatePolygonCount()
    console.log('Auto-generation complete!')
    alert(`Map generated successfully! Placed ${placedObjects.length} objects.`)
  }

  function updatePolygonCount() {
    let count = 0
    placedObjects.forEach(obj => {
      obj.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry) {
          const geometry = child.geometry
          if (geometry.index) {
            count += geometry.index.count / 3
          } else if (geometry.attributes.position) {
            count += geometry.attributes.position.count / 3
          }
        }
      })
    })
    polygonCount = Math.round(count)
  }

  const clock = new THREE.Clock()

  function animate() {
    animationId = requestAnimationFrame(animate)

    const delta = clock.getDelta()

    // Update first-person mode
    updateFirstPersonMode(delta)

    // Update animation mixers only if animations are enabled
    if (animationsEnabled) {
      animatedObjects.forEach(({ mixer }) => {
        mixer.update(delta)
      })
    }

    // Update selection helper
    if (selectedPlacedObject && selectionHelper) {
      selectionHelper.update()
    }

    // Update hover helper
    if (hoveredObject && hoverHelper) {
      hoverHelper.update()
    }

    if (!isFirstPersonMode) {
      controls.update()
    }
    renderer.render(scene, camera)
  }

  $effect(() => {
    if (gridHelper) {
      gridHelper.visible = showGrid
    }
  })

  // Don't use $effect for polygon count - it causes infinite loops
  // Instead, call updatePolygonCount() manually when objects are added/removed

  // Update environment when time of day or weather changes
  $effect(() => {
    // Reading these values establishes the dependency
    const currentTime = timeOfDay
    const currentWeather = weather
    // Now update
    if (scene) {
      updateEnvironment()
    }
  })

  $effect(() => {
    // Update selection outline when selection changes
    if (selectionHelper) {
      scene.remove(selectionHelper)
      selectionHelper = null
    }

    if (selectedPlacedObject) {
      selectionHelper = new THREE.BoxHelper(selectedPlacedObject.mesh, 0x00ff00)
      scene.add(selectionHelper)

      // Hide preview when object is selected
      if (previewMesh) {
        previewMesh.visible = false
      }
    } else {
      // Show preview when no object is selected
      if (previewMesh) {
        previewMesh.visible = true
      }
    }
  })

  $effect(() => {
    // Update hover outline when hover changes
    if (hoverHelper) {
      scene.remove(hoverHelper)
      hoverHelper = null
    }

    if (hoveredObject) {
      hoverHelper = new THREE.BoxHelper(hoveredObject.mesh, 0xffff00) // Yellow for hover
      scene.add(hoverHelper)
    }
  })

  // POV Mode functions
  function enterPOVMode() {
    if (isFirstPersonMode) return

    // Save current camera state
    savedCameraPosition = camera.position.clone()
    savedCameraRotation = camera.rotation.clone()
    savedControlsTarget = controls.target.clone()

    // Use current camera position but set height to 10
    fpPosition.set(camera.position.x, 10, camera.position.z)

    // Calculate yaw from current camera rotation to maintain view direction
    // Extract yaw from the camera's current rotation
    fpYaw = camera.rotation.y
    fpPitch = 0 // Keep pitch at 0 (looking straight at horizon)

    // Start falling (gravity will pull down)
    fpVelocity.set(0, 0, 0)

    // Set camera rotation order before entering POV mode
    camera.rotation.order = 'YXZ'

    // Set initial camera rotation to be perfectly level
    camera.rotation.set(0, fpYaw, 0, 'YXZ')

    // Enter POV mode
    isFirstPersonMode = true
    isPOVPaused = false
    controls.enabled = false

    // Request pointer lock for mouse look
    if (renderer?.domElement) {
      renderer.domElement.requestPointerLock()
    }

    // Hide preview and deselect objects
    if (previewMesh) previewMesh.visible = false
    selectedPlacedObject = null
  }

  function pausePOVMode() {
    isPOVPaused = true
    // Exit pointer lock when paused
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
  }

  function continuePOVMode() {
    isPOVPaused = false
    // Re-request pointer lock
    if (renderer?.domElement) {
      renderer.domElement.requestPointerLock()
    }
  }

  function exitFirstPersonMode() {
    if (!isFirstPersonMode) return

    isFirstPersonMode = false
    isPOVPaused = false
    controls.enabled = true

    // Restore camera
    if (savedCameraPosition && savedCameraRotation && savedControlsTarget) {
      camera.position.copy(savedCameraPosition)
      camera.rotation.copy(savedCameraRotation)
      controls.target.copy(savedControlsTarget)
    }

    // Exit pointer lock
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }

    // Clear selected model and preview to go back to "build mode"
    selectedModel = null
    if (previewMesh) {
      scene.remove(previewMesh)
      previewMesh = null
    }
    currentRotation = 0
    currentScale = 1.0
  }

  function onFPMouseMove(event: MouseEvent) {
    if (!isFirstPersonMode || isPOVPaused || document.pointerLockElement !== renderer?.domElement) return

    const sensitivity = 0.002
    fpYaw -= event.movementX * sensitivity
    fpPitch -= event.movementY * sensitivity
    fpPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, fpPitch))
  }

  function checkAndFixStuckPlayerPOV(delta: number) {
    // Check if player is trying to move
    const isTryingToMove = fpKeysPressed.has('w') || fpKeysPressed.has('a') ||
                          fpKeysPressed.has('s') || fpKeysPressed.has('d')

    if (!isTryingToMove) {
      stuckCounter = 0
      return
    }

    stuckCheckTimer += delta * 1000

    if (stuckCheckTimer >= STUCK_CHECK_INTERVAL) {
      const distance = fpPosition.distanceTo(lastPOVPosition)

      if (distance < STUCK_THRESHOLD && isTryingToMove) {
        stuckCounter++
        console.log(`Player may be stuck. Counter: ${stuckCounter}, Distance moved: ${distance.toFixed(3)}`)

        if (stuckCounter >= STUCK_COUNT_LIMIT) {
          console.log('Player is stuck! Attempting to unstuck...')

          // Try shifting the player in different directions
          const shiftDistance = 2
          const testDirections = [
            new THREE.Vector3(shiftDistance, 0, 0),
            new THREE.Vector3(-shiftDistance, 0, 0),
            new THREE.Vector3(0, 0, shiftDistance),
            new THREE.Vector3(0, 0, -shiftDistance),
            new THREE.Vector3(shiftDistance, 0, shiftDistance),
            new THREE.Vector3(-shiftDistance, 0, -shiftDistance),
          ]

          let foundValidPosition = false
          for (const direction of testDirections) {
            const testPos = fpPosition.clone().add(direction)
            testPos.y = fpPosition.y // Keep same height

            if (validateSpawnPosition(testPos)) {
              fpPosition.copy(testPos)
              camera.position.copy(fpPosition)
              foundValidPosition = true
              console.log('Successfully unstuck player to:', testPos)
              break
            }
          }

          if (!foundValidPosition) {
            // Last resort: teleport to origin or a random safe position
            const safePos = new THREE.Vector3(0, GROUND_LEVEL, 0)
            if (validateSpawnPosition(safePos)) {
              fpPosition.copy(safePos)
              camera.position.copy(fpPosition)
              console.log('Teleported player to origin')
            } else {
              // Try random positions
              for (let i = 0; i < 10; i++) {
                const randomPos = new THREE.Vector3(
                  (Math.random() - 0.5) * 40,
                  GROUND_LEVEL,
                  (Math.random() - 0.5) * 40
                )
                if (validateSpawnPosition(randomPos)) {
                  fpPosition.copy(randomPos)
                  camera.position.copy(fpPosition)
                  console.log('Teleported player to random safe position:', randomPos)
                  break
                }
              }
            }
          }

          stuckCounter = 0
        }
      } else {
        // Player is moving fine, reset counter
        stuckCounter = 0
      }

      lastPOVPosition.copy(fpPosition)
      stuckCheckTimer = 0
    }
  }

  function updateFirstPersonMode(delta: number) {
    if (!isFirstPersonMode || isPOVPaused) return

    // Update camera orientation
    camera.rotation.order = 'YXZ'
    camera.rotation.y = fpYaw
    camera.rotation.x = fpPitch
    camera.rotation.z = 0 // Ensure no roll

    // Horizontal movement
    const moveSpeed = 5.0 // units per second
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    forward.y = 0
    forward.normalize()

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
    right.y = 0
    right.normalize()

    const movement = new THREE.Vector3()

    if (fpKeysPressed.has('w')) movement.add(forward)
    if (fpKeysPressed.has('s')) movement.sub(forward)
    if (fpKeysPressed.has('d')) movement.add(right)
    if (fpKeysPressed.has('a')) movement.sub(right)

    if (movement.length() > 0) {
      movement.normalize().multiplyScalar(moveSpeed * delta)
      fpPosition.x += movement.x
      fpPosition.z += movement.z
    }

    // Gravity and jumping
    const onGround = fpPosition.y <= GROUND_LEVEL

    if (onGround) {
      fpVelocity.y = 0
      fpPosition.y = GROUND_LEVEL

      // Jump when space is pressed and on ground
      if (fpKeysPressed.has(' ')) {
        fpVelocity.y = JUMP_VELOCITY
      }
    } else {
      // Apply gravity when in air
      fpVelocity.y += GRAVITY * delta
    }

    // Update vertical position
    fpPosition.y += fpVelocity.y * delta

    // Ensure we don't go below ground
    if (fpPosition.y < GROUND_LEVEL) {
      fpPosition.y = GROUND_LEVEL
      fpVelocity.y = 0
    }

    // Check for stuck player and fix if needed
    checkAndFixStuckPlayerPOV(delta)

    // Update camera position
    camera.position.copy(fpPosition)
  }

  function getFilteredModels() {
    let filtered = modelCatalog

    // Filter by category
    if (selectedCategory !== "All") {
      filtered = filtered.filter(m => m.category === selectedCategory)
    } else {
      // For "All" category, show a randomized selection
      filtered = shuffleArray(modelCatalog)
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(m => m.name.toLowerCase().includes(query))
    }

    return filtered
  }

  function clearSelection() {
    selectedModel = null
    if (previewMesh) {
      scene.remove(previewMesh)
      previewMesh = null
    }
    currentRotation = 0
    currentScale = 1.0
  }

  function saveHistory() {
    const state: HistoryState = {
      placedObjects: placedObjects.map(obj => ({
        modelPath: obj.modelPath,
        position: { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z },
        rotation: { x: obj.mesh.rotation.x, y: obj.mesh.rotation.y, z: obj.mesh.rotation.z },
        scale: { x: obj.mesh.scale.x, y: obj.mesh.scale.y, z: obj.mesh.scale.z },
      }))
    }

    // Remove any future states if we're not at the end
    history = history.slice(0, historyIndex + 1)
    history.push(state)
    historyIndex = history.length - 1

    // Limit history to 50 states
    if (history.length > 50) {
      history = history.slice(-50)
      historyIndex = history.length - 1
    }
  }

  async function undo() {
    if (historyIndex <= 0) return

    historyIndex--
    await restoreHistoryState(history[historyIndex])
  }

  async function redo() {
    if (historyIndex >= history.length - 1) return

    historyIndex++
    await restoreHistoryState(history[historyIndex])
  }

  async function restoreHistoryState(state: HistoryState) {
    // Clear current scene
    placedObjects.forEach(obj => scene.remove(obj.mesh))
    placedObjects = []
    animatedObjects = []
    selectedPlacedObject = null

    const loader = new GLTFLoader()

    for (const objData of state.placedObjects) {
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
        placedObjects.push({ mesh: newObject, modelPath: objData.modelPath })

        // Check if animated (only play if animations enabled)
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(newObject)
          gltf.animations.forEach((clip) => {
            const action = mixer.clipAction(clip)
            if (animationsEnabled) {
              action.play()
            }
          })
          animatedObjects.push({ mesh: newObject, mixer, clips: gltf.animations })
        }
      } catch (error) {
        console.error("Failed to restore object:", error)
      }
    }
  }

  // Generate 3D thumbnails for all models
  async function generateThumbnails() {
    // Check if we have cached thumbnails
    try {
      const cachedVersion = localStorage.getItem(THUMBNAIL_VERSION_KEY)
      const cachedData = localStorage.getItem(THUMBNAIL_CACHE_KEY)

      if (cachedVersion === CURRENT_THUMBNAIL_VERSION && cachedData) {
        const cached = JSON.parse(cachedData)
        thumbnails = new Map(Object.entries(cached))
        thumbnailsLoading = false
        console.log('Loaded thumbnails from cache')
        return
      } else {
        console.log('Cache invalid or not found, generating thumbnails...')
      }
    } catch (error) {
      console.error('Failed to load cached thumbnails:', error)
    }

    // Generate thumbnails
    const thumbScene = new THREE.Scene()
    thumbScene.background = new THREE.Color(0x2a2a3e)

    const thumbCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    const thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    thumbRenderer.setSize(128, 128)
    thumbRenderer.shadowMap.enabled = true

    // Brighter lighting for thumbnails
    const ambLight = new THREE.AmbientLight(0xffffff, 1.0)
    thumbScene.add(ambLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(5, 5, 5)
    dirLight.castShadow = true
    thumbScene.add(dirLight)

    // Add fill light for better brightness
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6)
    fillLight.position.set(-5, 3, -5)
    thumbScene.add(fillLight)

    const loader = new GLTFLoader()
    const newThumbnails = new Map<string, string>()

    // Generate thumbnails in batches to avoid freezing
    const batchSize = 10
    for (let i = 0; i < modelCatalog.length; i += batchSize) {
      const batch = modelCatalog.slice(i, i + batchSize)

      await Promise.all(batch.map(async (model) => {
        try {
          const gltf = await loader.loadAsync(model.path)
          const obj = gltf.scene

          // Calculate bounding box and center the model
          const box = new THREE.Box3().setFromObject(obj)
          const center = box.getCenter(new THREE.Vector3())
          const size = box.getSize(new THREE.Vector3())

          obj.position.sub(center)
          thumbScene.add(obj)

          // Position camera closer to fill more of the frame (2x bigger preview)
          const maxDim = Math.max(size.x, size.y, size.z)
          const distance = maxDim * 0.9
          thumbCamera.position.set(distance, distance * 0.7, distance)
          thumbCamera.lookAt(0, 0, 0)

          // Render thumbnail
          thumbRenderer.render(thumbScene, thumbCamera)
          const dataUrl = thumbRenderer.domElement.toDataURL('image/png')
          newThumbnails.set(model.path, dataUrl)

          // Clean up
          thumbScene.remove(obj)
        } catch (error) {
          console.error(`Failed to generate thumbnail for ${model.name}:`, error)
          // Use a placeholder for failed thumbnails
          newThumbnails.set(model.path, '')
        }
      }))

      // Update state after each batch
      thumbnails = new Map(newThumbnails)
    }

    // Cache the thumbnails
    try {
      const cacheData = Object.fromEntries(newThumbnails)
      localStorage.setItem(THUMBNAIL_CACHE_KEY, JSON.stringify(cacheData))
      localStorage.setItem(THUMBNAIL_VERSION_KEY, CURRENT_THUMBNAIL_VERSION)
      console.log('Cached thumbnails to localStorage')
    } catch (error) {
      console.error('Failed to cache thumbnails:', error)
    }

    thumbnailsLoading = false
    thumbRenderer.dispose()
  }
</script>

<style>
  /* Ensure canvas stays within its container */
  canvas {
    display: block;
    max-width: 100%;
    max-height: 100%;
  }
</style>

<svelte:head>
  <title>World Builder | Dougie's Game Hub</title>
</svelte:head>

<svelte:window
  onkeydown={(e) => {
    // Don't capture keyboard events when typing in input fields
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      // Only allow Escape to work in input fields
      if (e.key === 'Escape') {
        target.blur() // Unfocus the input
      }
      return
    }

    // Handle Escape key (works in both modes)
    if (e.key === "Escape") {
      e.preventDefault()
      if (isFirstPersonMode && !isPOVPaused) {
        // Pause POV mode to show menu (only if not already paused)
        pausePOVMode()
      } else if (!isFirstPersonMode) {
        // Clear any selected placed object
        selectedPlacedObject = null
        // Clear selected model from menu and remove preview
        selectedModel = null
        if (previewMesh) {
          scene.remove(previewMesh)
          previewMesh = null
        }
        currentRotation = 0
        currentScale = 1.0
      }
      return
    }

    // WASD and Space keys for first-person mode
    if (isFirstPersonMode) {
      const key = e.key.toLowerCase()
      if (['w', 'a', 's', 'd'].includes(key)) {
        fpKeysPressed.add(key)
      }
      if (e.key === ' ') {
        e.preventDefault()
        fpKeysPressed.add(' ')
        return // Don't let space trigger panning in FP mode
      }
      return // Skip all other build mode keys in FP mode
    }

    // All build mode keyboard controls below (only active when NOT in FP mode)
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault()
      rotatePreview(e.key === "ArrowLeft" ? -1 : 1)
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      scaleUp()
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      scaleDown()
    }
    if (e.key === "g" || e.key === "G") {
      e.preventDefault()
      toggleGrid()
    }
    if (e.key === "=" || e.key === "+") {
      e.preventDefault()
      scaleUp()
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault()
      scaleDown()
    }
    if (e.key === "0") {
      e.preventDefault()
      resetScale()
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault()
      deleteSelected()
    }
    if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      if (e.shiftKey) {
        redo()
      } else {
        undo()
      }
    }
    if (e.key === "y" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      redo()
    }
    if (e.key === " ") {
      e.preventDefault()
      isPanning = true
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN
      if (renderer?.domElement) {
        renderer.domElement.style.cursor = 'grab'
      }
      // Hide preview mesh while panning
      if (previewMesh && !selectedPlacedObject) {
        previewMesh.visible = false
      }
    }
    // Track Option/Alt key press - enables level rotation (horizontal spin only)
    if (e.key === "Alt") {
      e.preventDefault()
      isOptionKeyHeld = true
      isRotatingCamera = true
      controls.enabled = true
      controls.enableRotate = true
      controls.enablePan = false
      // Lock polar angle to maintain level
      const currentPolarAngle = controls.getPolarAngle()
      controls.minPolarAngle = currentPolarAngle
      controls.maxPolarAngle = currentPolarAngle
      if (renderer?.domElement) {
        renderer.domElement.style.cursor = 'grab'
      }
      // Hide preview mesh while rotating
      if (previewMesh && !selectedPlacedObject) {
        previewMesh.visible = false
      }
    }
    // Track Command/Control key press - enables free rotation
    if (e.key === "Meta" || e.key === "Control") {
      e.preventDefault()
      isCommandKeyHeld = true
      isRotatingCamera = true
      controls.enabled = true
      controls.enableRotate = true
      controls.enablePan = false
      controls.minPolarAngle = 0
      controls.maxPolarAngle = Math.PI / 2 - 0.1
      if (renderer?.domElement) {
        renderer.domElement.style.cursor = 'grab'
      }
      // Hide preview mesh while rotating
      if (previewMesh && !selectedPlacedObject) {
        previewMesh.visible = false
      }
    }
  }}
  onkeyup={(e) => {
    // Don't capture keyboard events when typing in input fields
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return
    }

    // WASD and Space keys for first-person mode
    if (isFirstPersonMode) {
      const key = e.key.toLowerCase()
      if (['w', 'a', 's', 'd'].includes(key)) {
        fpKeysPressed.delete(key)
      }
      if (e.key === ' ') {
        e.preventDefault()
        fpKeysPressed.delete(' ')
        return // Don't trigger panning cleanup in FP mode
      }
    }
    if (e.key === " ") {
      e.preventDefault()
      isPanning = false
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
      if (renderer?.domElement) {
        renderer.domElement.style.cursor = 'default'
      }
      // Show preview mesh again when done panning
      if (previewMesh && !selectedPlacedObject) {
        previewMesh.visible = true
      }
    }
    // Reset Option/Alt key state
    if (e.key === "Alt") {
      e.preventDefault()
      isOptionKeyHeld = false
      isRotatingCamera = false
      controls.enablePan = true
      controls.minPolarAngle = 0
      controls.maxPolarAngle = Math.PI / 2 - 0.1
      if (renderer?.domElement) {
        renderer.domElement.style.cursor = 'default'
      }
      // Show preview mesh again when done rotating
      if (previewMesh && !selectedPlacedObject) {
        previewMesh.visible = true
      }
    }
    // Reset Command/Control key state
    if (e.key === "Meta" || e.key === "Control") {
      e.preventDefault()
      isCommandKeyHeld = false
      isRotatingCamera = false
      controls.enablePan = true
      controls.minPolarAngle = 0
      controls.maxPolarAngle = Math.PI / 2 - 0.1
      if (renderer?.domElement) {
        renderer.domElement.style.cursor = 'default'
      }
      // Show preview mesh again when done rotating
      if (previewMesh && !selectedPlacedObject) {
        previewMesh.visible = true
      }
    }
  }}
/>

<div class="flex flex-col md:flex-row h-screen overflow-hidden">
  <!-- Toolbar - bottom right -->
  <div class="absolute bottom-8 right-6 z-20 bg-base-200/90 backdrop-blur-sm p-4 rounded-lg shadow-lg flex flex-nowrap gap-2 items-center whitespace-nowrap">
    <button
      class="btn btn-sm {!selectedModel ? 'btn-accent' : 'btn-ghost'}"
      onclick={clearSelection}
      title="Select Mode (clear current model)"
    >
      ↖️
    </button>
    <div class="divider divider-horizontal m-0"></div>
    <button
      class="btn btn-sm btn-warning text-lg font-bold"
      onclick={undo}
      disabled={historyIndex <= 0}
      title="Undo (Ctrl+Z)"
    >
      ↶
    </button>
    <button
      class="btn btn-sm btn-warning text-lg font-bold"
      onclick={redo}
      disabled={historyIndex >= history.length - 1}
      title="Redo (Ctrl+Y)"
    >
      ↷
    </button>
    <div class="divider divider-horizontal m-0"></div>
    <button class="btn btn-sm btn-secondary" onclick={clearScene}>🗑️ Clear</button>
    <button class="btn btn-sm {showGrid ? 'btn-accent' : 'btn-ghost'}" onclick={toggleGrid}>
      📐 Grid: {showGrid ? 'ON' : 'OFF'}
    </button>
    <button class="btn btn-sm {animationsEnabled ? 'btn-accent' : 'btn-ghost'}" onclick={toggleAnimations}>
      🎬 Animate: {animationsEnabled ? 'ON' : 'OFF'}
    </button>
    <button
      class="btn btn-sm {isFirstPersonMode ? 'btn-error' : 'btn-accent'}"
      onclick={isFirstPersonMode ? exitFirstPersonMode : enterPOVMode}
      title={isFirstPersonMode ? 'Exit POV mode and return to build mode (ESC)' : 'Enter first-person POV mode - drop from the sky and explore your world!'}
    >
      {isFirstPersonMode ? '🚪 Build Mode' : '👁️ POV Mode'}
    </button>
    <div class="divider divider-horizontal m-0"></div>
    <button class="btn btn-sm btn-info text-lg font-bold" onclick={scaleDown}>−</button>
    <button class="btn btn-sm btn-ghost" onclick={resetScale}>1:1</button>
    <button class="btn btn-sm btn-info text-lg font-bold" onclick={scaleUp}>+</button>
    <div class="divider divider-horizontal m-0"></div>
    <div class="badge badge-info">{placedObjects.length} objects</div>
    <div class="badge badge-primary">{polygonCount.toLocaleString()} polys</div>
    {#if polygonCount > MAX_POLYGON_WARNING}
      <div class="badge badge-error">⚠️ High Poly Count!</div>
    {/if}
    {#if selectedPlacedObject}
      <div class="badge badge-success">Object Selected</div>
    {/if}
    {#if isFirstPersonMode}
      <div class="badge badge-error">POV Mode - WASD to move, Mouse to look, Space to jump, ESC to exit</div>
    {/if}
  </div>

  <!-- Sidebar with Tabs -->
  <div class="w-full md:w-96 h-64 md:h-screen bg-base-200 overflow-hidden flex flex-col order-last md:order-first relative z-50">
    <!-- Tab Headers -->
    <div class="tabs tabs-boxed m-2 relative">
      <button
        type="button"
        class="tab {activeTab === 'models' ? 'tab-active' : ''}"
        onclick={(e) => {
          e.preventDefault()
          requestAnimationFrame(() => {
            activeTab = 'models'
          })
        }}
      >
        🎨 Models
      </button>
      <button
        type="button"
        class="tab {activeTab === 'maps' ? 'tab-active' : ''}"
        onclick={(e) => {
          e.preventDefault()
          requestAnimationFrame(() => {
            activeTab = 'maps'
          })
        }}
      >
        🗺️ Maps
      </button>
      <button
        type="button"
        class="tab {activeTab === 'options' ? 'tab-active' : ''}"
        onclick={(e) => {
          e.preventDefault()
          requestAnimationFrame(() => {
            activeTab = 'options'
          })
        }}
      >
        ⚙️ Options
      </button>
    </div>

    <!-- Tab Content -->
    <div class="flex-1 overflow-y-auto p-4 pt-0" style="pointer-events: auto;">
      {#if activeTab === 'models'}
        <!-- Models Tab -->
        <h2 class="text-2xl font-bold mb-4">Object Palette</h2>

        <!-- Search Bar -->
        <div class="form-control mb-2">
          <input
            type="text"
            placeholder="Search models..."
            class="input input-sm input-bordered w-full"
            bind:value={searchQuery}
          />
        </div>

        <!-- Category Dropdown -->
        <div class="form-control mb-4">
          <select
            class="select select-sm select-bordered w-full"
            bind:value={selectedCategory}
          >
            {#each categories as category}
              <option value={category}>{category}</option>
            {/each}
          </select>
        </div>

        <!-- Model Count -->
        <div class="text-xs text-gray-500 mb-3 flex justify-between items-center">
          <span>{getFilteredModels().length} models</span>
          {#if thumbnailsLoading}
            <span class="loading loading-spinner loading-xs"></span>
          {/if}
        </div>

        <!-- Model Grid -->
        <div class="grid grid-cols-3 gap-2">
          {#each getFilteredModels() as model}
            <button
              class="btn btn-ghost p-0.5 h-auto flex-col gap-1 {selectedModel?.path === model.path ? 'ring-2 ring-primary' : ''}"
              onclick={() => selectModel(model)}
              title={model.name}
            >
              <div class="w-full aspect-square bg-base-300 rounded-md overflow-hidden flex items-center justify-center p-0.5">
                {#if thumbnails.has(model.path) && thumbnails.get(model.path)}
                  <img
                    src={thumbnails.get(model.path)}
                    alt={model.name}
                    class="w-full h-full object-cover brightness-125"
                  />
                {:else if !thumbnailsLoading}
                  <span class="text-4xl opacity-100">
                    {model.category === 'Animals' ? '🐾' :
                     model.category === 'Enemies' ? '👾' :
                     model.category === 'Nature' ? '🌳' :
                     model.category === 'Buildings' ? '🏠' :
                     model.category === 'Vehicles' ? '🚗' :
                     model.category === 'Props' ? '📦' : '⬜'}
                  </span>
                {:else}
                  <span class="loading loading-spinner loading-sm"></span>
                {/if}
              </div>
              <span class="text-xs truncate w-full">{model.name}</span>
            </button>
          {/each}
        </div>

      {:else if activeTab === 'maps'}
        <!-- Maps Tab -->
        <h2 class="text-2xl font-bold mb-4">Map Manager</h2>

        <!-- Current Map Info -->
        <div class="bg-base-300 p-3 rounded-lg mb-4">
          <div class="text-sm font-semibold mb-1">Current Map:</div>
          <input
            type="text"
            class="input input-sm input-bordered w-full mb-2"
            bind:value={currentMapName}
            placeholder="Map name..."
          />
          {#if currentMapId}
            <!-- Editing existing map -->
            <div class="flex gap-2 mb-2">
              <button
                class="btn btn-sm btn-primary flex-1"
                onclick={() => saveCurrentMap(currentMapName)}
                title="Overwrite the existing map"
              >
                💾 Save (Overwrite)
              </button>
            </div>
            <div class="flex gap-2">
              <button
                class="btn btn-sm btn-outline flex-1"
                onclick={saveAsNewMap}
                title="Save as a new copy"
              >
                📄 Save As New
              </button>
              <button
                class="btn btn-sm btn-success"
                onclick={createNewMap}
              >
                ✨ New
              </button>
            </div>
          {:else}
            <!-- Creating new map -->
            <div class="flex gap-2">
              <button
                class="btn btn-sm btn-primary flex-1"
                onclick={() => saveCurrentMap(currentMapName)}
              >
                💾 Save Map
              </button>
              <button
                class="btn btn-sm btn-success"
                onclick={createNewMap}
              >
                ✨ New
              </button>
            </div>
          {/if}
        </div>

        <!-- Import/Export -->
        <div class="flex gap-2 mb-4">
          <button
            class="btn btn-sm btn-outline flex-1"
            onclick={importMap}
          >
            📥 Import
          </button>
        </div>

        <!-- Auto Generate -->
        <div class="mb-4">
          <h4 class="font-semibold mb-2">Auto Generate Settings</h4>
          <div class="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label class="label label-text text-xs">Trees</label>
              <input type="number" bind:value={autoGenTrees} min="0" max="50" class="input input-xs input-bordered w-full" />
            </div>
            <div>
              <label class="label label-text text-xs">Buildings</label>
              <input type="number" bind:value={autoGenBuildings} min="0" max="20" class="input input-xs input-bordered w-full" />
            </div>
            <div>
              <label class="label label-text text-xs">Vehicles</label>
              <input type="number" bind:value={autoGenVehicles} min="0" max="20" class="input input-xs input-bordered w-full" />
            </div>
            <div>
              <label class="label label-text text-xs">Animals</label>
              <input type="number" bind:value={autoGenAnimals} min="0" max="20" class="input input-xs input-bordered w-full" />
            </div>
          </div>
          <button
            class="btn btn-sm btn-accent w-full"
            onclick={autoGenerateMap}
          >
            🎲 Auto Generate Map
          </button>
          <p class="text-xs text-gray-500 mt-1 text-center">
            Automatically place objects for fun gameplay
          </p>
        </div>

        <!-- Saved Maps List -->
        <h3 class="text-lg font-bold mb-2">Saved Maps ({savedMaps.length})</h3>

        {#if savedMaps.length === 0}
          <div class="text-sm text-gray-500 text-center py-8">
            No saved maps yet.<br/>Create and save your first map!
          </div>
        {:else}
          <div class="space-y-2">
            {#each [...savedMaps].sort((a, b) => b.modified - a.modified) as map}
              <div class="card bg-base-300 shadow-sm">
                <div class="card-body p-3">
                  {#if map.thumbnail}
                    <img
                      src={map.thumbnail}
                      alt={map.name}
                      class="w-full h-24 object-cover rounded mb-2"
                    />
                  {/if}
                  <div class="font-semibold text-sm">{map.name}</div>
                  <div class="text-xs text-gray-500">
                    {map.stats.objectCount} objects • {map.stats.polygonCount.toLocaleString()} polys
                    <br/>
                    {map.environment.timeOfDay} • {map.environment.weather}
                  </div>
                  <div class="flex gap-1 mt-2">
                    <button
                      class="btn btn-xs btn-primary flex-1"
                      onclick={() => loadMap(map.id)}
                    >
                      Load
                    </button>
                    <button
                      class="btn btn-xs btn-outline"
                      onclick={() => exportMap(map.id)}
                      title="Export to file"
                    >
                      📤
                    </button>
                    <button
                      class="btn btn-xs btn-error"
                      onclick={() => deleteMap(map.id)}
                      title="Delete map"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}

      {:else if activeTab === 'options'}
        <!-- Options Tab -->
        <h2 class="text-2xl font-bold mb-4">Environment</h2>

        <!-- Time of Day -->
        <div class="form-control mb-4">
          <label class="label">
            <span class="label-text font-semibold">Time of Day</span>
          </label>
          <div class="grid grid-cols-2 gap-2">
            <button
              class="btn btn-sm {timeOfDay === 'dawn' ? 'btn-primary' : 'btn-outline'}"
              onclick={() => timeOfDay = 'dawn'}
            >
              🌅 Dawn
            </button>
            <button
              class="btn btn-sm {timeOfDay === 'day' ? 'btn-primary' : 'btn-outline'}"
              onclick={() => timeOfDay = 'day'}
            >
              ☀️ Day
            </button>
            <button
              class="btn btn-sm {timeOfDay === 'sunset' ? 'btn-primary' : 'btn-outline'}"
              onclick={() => timeOfDay = 'sunset'}
            >
              🌇 Sunset
            </button>
            <button
              class="btn btn-sm {timeOfDay === 'night' ? 'btn-primary' : 'btn-outline'}"
              onclick={() => timeOfDay = 'night'}
            >
              🌙 Night
            </button>
          </div>
        </div>

        <!-- Weather -->
        <div class="form-control mb-4">
          <label class="label">
            <span class="label-text font-semibold">Weather</span>
          </label>
          <div class="grid grid-cols-2 gap-2">
            <button
              class="btn btn-sm {weather === 'clear' ? 'btn-primary' : 'btn-outline'}"
              onclick={() => weather = 'clear'}
            >
              ☀️ Clear
            </button>
            <button
              class="btn btn-sm {weather === 'fog' ? 'btn-primary' : 'btn-outline'}"
              onclick={() => weather = 'fog'}
            >
              🌫️ Fog
            </button>
            <button
              class="btn btn-sm {weather === 'rain' ? 'btn-primary' : 'btn-outline'}"
              onclick={() => weather = 'rain'}
            >
              🌧️ Rain
            </button>
            <button
              class="btn btn-sm {weather === 'snow' ? 'btn-primary' : 'btn-outline'}"
              onclick={() => weather = 'snow'}
            >
              ❄️ Snow
            </button>
          </div>
        </div>

        <!-- Stats -->
        <div class="divider"></div>
        <h3 class="text-lg font-bold mb-2">Scene Stats</h3>
        <div class="stats stats-vertical shadow w-full">
          <div class="stat p-3">
            <div class="stat-title text-xs">Objects</div>
            <div class="stat-value text-2xl">{placedObjects.length}</div>
          </div>
          <div class="stat p-3">
            <div class="stat-title text-xs">Polygons</div>
            <div class="stat-value text-2xl {polygonCount > MAX_POLYGON_WARNING ? 'text-error' : ''}">
              {(polygonCount / 1000).toFixed(1)}k
            </div>
            {#if polygonCount > MAX_POLYGON_WARNING}
              <div class="stat-desc text-error">High poly count may affect performance</div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- 3D Viewport -->
  <div class="flex-1 relative min-w-0">
    <div
      bind:this={container}
      class="w-full h-full bg-black"
    >
      <!-- Instructions overlay -->
      {#if placedObjects.length === 0}
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div class="bg-black/70 p-8 rounded-lg text-white text-center max-w-md">
            <h3 class="text-2xl font-bold mb-4">🏗️ Start Building!</h3>
            <p class="text-sm text-left">
              <strong>Placing Objects:</strong><br/>
              1. Select an object from the sidebar<br/>
              2. Press <kbd class="kbd kbd-xs bg-base-300 text-base-content">Arrow Keys</kbd> to rotate<br/>
              3. Press <kbd class="kbd kbd-xs bg-base-300 text-base-content">+</kbd>/<kbd class="kbd kbd-xs bg-base-300 text-base-content">-</kbd> to scale<br/>
              4. Click to place in the world<br/><br/>

              <strong>Editing Objects:</strong><br/>
              5. Click placed objects to select them<br/>
              6. Use <kbd class="kbd kbd-xs bg-base-300 text-base-content">Arrow Keys</kbd> to rotate selection<br/>
              7. Use <kbd class="kbd kbd-xs bg-base-300 text-base-content">+</kbd>/<kbd class="kbd kbd-xs bg-base-300 text-base-content">-</kbd> to resize<br/>
              8. Press <kbd class="kbd kbd-xs bg-base-300 text-base-content">Delete</kbd> to remove<br/><br/>

              <strong>Camera:</strong><br/>
              9. Drag to rotate camera<br/>
              10. Hold <kbd class="kbd kbd-xs bg-base-300 text-base-content">Space</kbd> + drag to pan<br/>
              11. Scroll to zoom in/out
            </p>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- POV Mode Pause Overlay -->
  {#if isPOVPaused}
    <div class="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div class="bg-base-200 p-8 rounded-lg shadow-xl flex flex-col gap-4 max-w-md">
        <h2 class="text-3xl font-bold text-center">POV Mode Paused</h2>
        <div class="flex flex-col gap-3">
          <button
            class="btn btn-primary btn-lg"
            onclick={continuePOVMode}
          >
            Continue
          </button>
          <button
            class="btn btn-error btn-lg"
            onclick={exitFirstPersonMode}
          >
            Exit POV Mode
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
