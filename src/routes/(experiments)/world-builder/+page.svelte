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

  // Animation mixers for animated models
  interface AnimatedObject {
    mesh: THREE.Group
    mixer: THREE.AnimationMixer
  }
  let animatedObjects: AnimatedObject[] = []

  // Selection outline
  let selectionHelper: THREE.BoxHelper | null = null

  const categories = ["All", "Nature", "Buildings", "Animals", "Blocks", "Enemies"]

  onMount(() => {
    initScene()
    animate()
    modelCatalog = modelPaths

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId)
      }
      if (renderer) {
        renderer.dispose()
      }
    }
  })

  function initScene() {
    // Scene with sunset gradient sky
    scene = new THREE.Scene()

    const canvas = document.createElement("canvas")
    canvas.width = 512
    canvas.height = 512
    const context = canvas.getContext("2d")!
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, "#1a1a3e")
    gradient.addColorStop(0.4, "#6B4E71")
    gradient.addColorStop(0.7, "#D4738F")
    gradient.addColorStop(1, "#FF9A56")
    context.fillStyle = gradient
    context.fillRect(0, 0, canvas.width, canvas.height)

    const texture = new THREE.CanvasTexture(canvas)
    scene.background = texture
    scene.fog = new THREE.Fog(0xff9a56, 50, 200)

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
    controls.maxDistance = 100
    controls.enablePan = true
    controls.panSpeed = 1.0
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN
    }

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
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

    // Grid
    gridHelper = new THREE.GridHelper(200, 40, 0x888888, 0x444444)
    gridHelper.position.y = 0.01
    scene.add(gridHelper)

    // Handle window resize
    window.addEventListener("resize", onWindowResize)

    // Mouse events
    renderer.domElement.addEventListener("mousemove", onMouseMove)
    renderer.domElement.addEventListener("click", onMouseClick)
    renderer.domElement.addEventListener("contextmenu", onRightClick)
  }

  function onWindowResize() {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }

  function onMouseMove(event: MouseEvent) {
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    if (selectedModel && previewMesh && !isPanning) {
      updatePreviewPosition()
    }
  }

  function updatePreviewPosition() {
    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObject(ground)

    if (intersects.length > 0 && previewMesh) {
      const point = intersects[0].point

      // Snap to grid if enabled
      if (showGrid) {
        const gridSize = 5
        point.x = Math.round(point.x / gridSize) * gridSize
        point.z = Math.round(point.z / gridSize) * gridSize
      }

      previewMesh.position.set(point.x, 0, point.z)
      previewMesh.rotation.y = currentRotation
      previewMesh.scale.set(currentScale, currentScale, currentScale)
    }
  }

  async function selectModel(model: ModelInfo) {
    selectedModel = model

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

  async function onMouseClick(event: MouseEvent) {
    if (event.button !== 0) return // Only left click
    if (isPanning) return // Don't place objects while panning

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
      // Deselect if clicking empty space
      selectedPlacedObject = null
    }

    // Place new object if a model is selected
    if (!selectedModel || !previewMesh) return

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

      // Check if this is an animated model
      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(newObject)
        gltf.animations.forEach((clip) => {
          const action = mixer.clipAction(clip)
          action.play()
        })
        animatedObjects.push({ mesh: newObject, mixer })
      }
    } catch (error) {
      console.error("Failed to place model:", error)
    }
  }

  function onRightClick(event: MouseEvent) {
    event.preventDefault()

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
      }
    }
  }

  function rotatePreview() {
    currentRotation += Math.PI / 4
    if (previewMesh) {
      previewMesh.rotation.y = currentRotation
    }
    if (selectedPlacedObject) {
      selectedPlacedObject.mesh.rotation.y += Math.PI / 4
    }
  }

  function scaleUp() {
    if (selectedPlacedObject) {
      const newScale = selectedPlacedObject.mesh.scale.x * 1.2
      selectedPlacedObject.mesh.scale.set(newScale, newScale, newScale)
    } else {
      currentScale = Math.min(currentScale * 1.2, 10)
      if (previewMesh) {
        previewMesh.scale.set(currentScale, currentScale, currentScale)
      }
    }
  }

  function scaleDown() {
    if (selectedPlacedObject) {
      const newScale = selectedPlacedObject.mesh.scale.x * 0.8
      selectedPlacedObject.mesh.scale.set(newScale, newScale, newScale)
    } else {
      currentScale = Math.max(currentScale * 0.8, 0.1)
      if (previewMesh) {
        previewMesh.scale.set(currentScale, currentScale, currentScale)
      }
    }
  }

  function resetScale() {
    if (selectedPlacedObject) {
      selectedPlacedObject.mesh.scale.set(1, 1, 1)
    } else {
      currentScale = 1.0
      if (previewMesh) {
        previewMesh.scale.set(1, 1, 1)
      }
    }
  }

  function toggleGrid() {
    showGrid = !showGrid
    gridHelper.visible = showGrid
  }

  function deleteSelected() {
    if (!selectedPlacedObject) return

    const index = placedObjects.findIndex(obj => obj === selectedPlacedObject)
    if (index > -1) {
      scene.remove(selectedPlacedObject.mesh)

      // Remove from animated objects if it exists
      const animIndex = animatedObjects.findIndex(obj => obj.mesh === selectedPlacedObject.mesh)
      if (animIndex > -1) {
        animatedObjects.splice(animIndex, 1)
      }

      placedObjects.splice(index, 1)
      selectedPlacedObject = null
    }
  }

  function clearScene() {
    if (confirm("Clear all objects from the scene?")) {
      placedObjects.forEach(obj => scene.remove(obj.mesh))
      placedObjects = []
      animatedObjects = []
    }
  }

  function saveWorld() {
    const worldData = placedObjects.map(obj => ({
      modelPath: obj.modelPath,
      position: { x: obj.mesh.position.x, y: obj.mesh.position.y, z: obj.mesh.position.z },
      rotation: { x: obj.mesh.rotation.x, y: obj.mesh.rotation.y, z: obj.mesh.rotation.z },
      scale: { x: obj.mesh.scale.x, y: obj.mesh.scale.y, z: obj.mesh.scale.z },
    }))

    localStorage.setItem("worldBuilder_save", JSON.stringify(worldData))
    alert("World saved! (" + placedObjects.length + " objects)")
  }

  async function loadWorld() {
    const savedData = localStorage.getItem("worldBuilder_save")
    if (!savedData) {
      alert("No saved world found!")
      return
    }

    // Clear current scene
    placedObjects.forEach(obj => scene.remove(obj.mesh))
    placedObjects = []
    animatedObjects = []
    selectedPlacedObject = null

    const worldData = JSON.parse(savedData)
    const loader = new GLTFLoader()

    for (const objData of worldData) {
      try {
        const gltf = await loader.loadAsync(objData.modelPath)
        const newObject = gltf.scene
        newObject.position.set(objData.position.x, objData.position.y, objData.position.z)
        newObject.rotation.set(objData.rotation.x, objData.rotation.y, objData.rotation.z)

        // Load scale (with fallback for old saves)
        if (objData.scale) {
          newObject.scale.set(objData.scale.x, objData.scale.y, objData.scale.z)
        }

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
            action.play()
          })
          animatedObjects.push({ mesh: newObject, mixer })
        }
      } catch (error) {
        console.error("Failed to load object:", error)
      }
    }

    alert("World loaded! (" + placedObjects.length + " objects)")
  }

  const clock = new THREE.Clock()

  function animate() {
    animationId = requestAnimationFrame(animate)

    const delta = clock.getDelta()

    // Update animation mixers
    animatedObjects.forEach(({ mixer }) => {
      mixer.update(delta)
    })

    // Update selection helper
    if (selectedPlacedObject && selectionHelper) {
      selectionHelper.update()
    }

    controls.update()
    renderer.render(scene, camera)
  }

  $effect(() => {
    if (gridHelper) {
      gridHelper.visible = showGrid
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
    }
  })

  function getFilteredModels() {
    let filtered = modelCatalog

    // Filter by category
    if (selectedCategory !== "All") {
      filtered = filtered.filter(m => m.category === selectedCategory)
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(m => m.name.toLowerCase().includes(query))
    }

    return filtered
  }
</script>

<svelte:head>
  <title>World Builder | Dougie's Game Hub</title>
</svelte:head>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "r" || e.key === "R") {
      e.preventDefault()
      rotatePreview()
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
    if (e.key === "Escape") {
      e.preventDefault()
      selectedPlacedObject = null
    }
    if (e.key === " ") {
      e.preventDefault()
      isPanning = true
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN
      if (renderer?.domElement) {
        renderer.domElement.style.cursor = 'grab'
      }
      // Hide preview mesh while panning
      if (previewMesh) {
        previewMesh.visible = false
      }
    }
  }}
  onkeyup={(e) => {
    if (e.key === " ") {
      e.preventDefault()
      isPanning = false
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
      if (renderer?.domElement) {
        renderer.domElement.style.cursor = 'default'
      }
      // Show preview mesh again when done panning
      if (previewMesh) {
        previewMesh.visible = true
      }
    }
  }}
/>

<div class="flex flex-col md:flex-row h-screen overflow-hidden">
  <!-- Toolbar - bottom right -->
  <div class="absolute bottom-8 right-6 z-20 bg-base-200/90 backdrop-blur-sm p-4 rounded-lg shadow-lg flex flex-nowrap gap-2 items-center whitespace-nowrap">
    <button class="btn btn-sm btn-primary" onclick={saveWorld}>💾 Save</button>
    <button class="btn btn-sm btn-success" onclick={loadWorld}>📂 Load</button>
    <button class="btn btn-sm btn-secondary" onclick={clearScene}>🗑️ Clear</button>
    <button class="btn btn-sm {showGrid ? 'btn-accent' : 'btn-ghost'}" onclick={toggleGrid}>
      📐 Grid: {showGrid ? 'ON' : 'OFF'}
    </button>
    <div class="divider divider-horizontal m-0"></div>
    <button class="btn btn-sm btn-ghost" onclick={scaleDown}>−</button>
    <button class="btn btn-sm btn-ghost" onclick={resetScale}>1:1</button>
    <button class="btn btn-sm btn-ghost" onclick={scaleUp}>+</button>
    <div class="divider divider-horizontal m-0"></div>
    <div class="badge badge-info">{placedObjects.length} objects</div>
    {#if selectedPlacedObject}
      <div class="badge badge-success">Object Selected</div>
    {/if}
  </div>

  <!-- Object Palette Sidebar -->
  <div class="w-full md:w-80 h-64 md:h-screen bg-base-200 overflow-y-auto p-4 order-last md:order-first">
    <h2 class="text-2xl font-bold mb-4">🎨 Object Palette</h2>

    <!-- Search Bar -->
    <div class="form-control mb-2">
      <input
        type="text"
        placeholder="Search models..."
        class="input input-sm input-bordered w-full"
        bind:value={searchQuery}
      />
    </div>

    <!-- Category Filter -->
    <div class="flex flex-wrap gap-1 mb-4">
      {#each categories as category}
        <button
          class="btn btn-xs {selectedCategory === category ? 'btn-primary' : 'btn-ghost'}"
          onclick={() => selectedCategory = category}
        >
          {category}
        </button>
      {/each}
    </div>

    <!-- Model List -->
    <div class="text-xs text-gray-500 mb-2">
      {getFilteredModels().length} models
    </div>
    <div class="space-y-1">
      {#each getFilteredModels() as model}
        <button
          class="btn btn-xs w-full justify-start {selectedModel?.path === model.path ? 'btn-primary' : 'btn-ghost'}"
          onclick={() => selectModel(model)}
        >
          <span class="text-xs">{model.category === 'Animals' || model.category === 'Enemies' ? '🐾' : model.category === 'Nature' ? '🌳' : model.category === 'Buildings' ? '🏠' : '⬜'}</span>
          <span class="truncate text-xs">{model.name}</span>
        </button>
      {/each}
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
              2. Press <kbd class="kbd kbd-xs">R</kbd> to rotate<br/>
              3. Press <kbd class="kbd kbd-xs">+</kbd>/<kbd class="kbd kbd-xs">-</kbd> to scale<br/>
              4. Click to place in the world<br/><br/>

              <strong>Editing Objects:</strong><br/>
              5. Click placed objects to select them<br/>
              6. Use <kbd class="kbd kbd-xs">R</kbd> to rotate selection<br/>
              7. Use <kbd class="kbd kbd-xs">+</kbd>/<kbd class="kbd kbd-xs">-</kbd> to resize<br/>
              8. Press <kbd class="kbd kbd-xs">Delete</kbd> to remove<br/><br/>

              <strong>Camera:</strong><br/>
              9. Drag to rotate camera<br/>
              10. Hold <kbd class="kbd kbd-xs">Space</kbd> + drag to pan<br/>
              11. Scroll to zoom in/out
            </p>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
