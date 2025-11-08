# 🏗️ World Builder

A Minecraft-style 3D world builder with 234+ models!

## Features

### 🎨 Object Palette
- **234 GLB models** automatically loaded from your asset packs
- **Categorized library**: Nature, Buildings, Animals, Blocks, Enemies
- **Search functionality** to find models quickly
- Real-time preview before placement

### 🎮 Controls
- **Left Click**: Place selected object
- **Right Click**: Delete object under cursor
- **Press R**: Rotate object before placing (45° increments)
- **Press G**: Toggle grid snap on/off
- **Mouse Drag**: Rotate camera view (orbit controls)
- **Scroll**: Zoom in/out

### 🔧 Building System
- **Grid snapping** (optional) - 5x5 unit grid
- **Free rotation** - 8 rotation angles
- **Ground plane** with 200x200 build area
- **Real-time shadows** and lighting

### 🎬 Animations
- **Animated creatures** (Enemies collection) automatically play animations
- Animals and enemies come to life when placed!

### 💾 Save/Load
- Save your creation to localStorage
- Load previously saved worlds
- Preserves all object positions, rotations, and model references

### 🌅 Visuals
- **Sunset gradient sky** matching your FPS game aesthetic
- **Dynamic shadows** from directional light
- **Fog effect** for atmosphere
- **Anti-aliased rendering**

## Asset Collections Used

1. **Animated Enemies** (5 models) - Frog, Rat, Snake, Spider, Wasp
2. **City Pack** (~57 models) - Buildings, props, characters
3. **Cube World Kit** (~85 models) - Blocks, animals, items
4. **Farm Animal Pack** - Various farm animals
5. **Stylized Nature MegaKit** (~68 models) - Trees, rocks, plants
6. **Ultimate Stylized Nature Pack** - Additional nature elements

## Technical Details

- **Engine**: Three.js with GLTFLoader
- **Camera**: Orbit controls for easy building
- **Lighting**: Ambient + Directional with shadows
- **Performance**: Efficient model loading and animation system
- **Responsive**: Works on mobile and desktop

## Future Enhancements

Possible additions:
- Undo/Redo system
- Object scaling
- Copy/paste objects
- Export to  image/screenshot
- Day/night cycle toggle
- Animal wandering AI
- Multiplayer sharing (export JSON)
