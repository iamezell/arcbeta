# 3D Models Directory

This directory contains all 3D models used in the ARC Beta WebXR application.

## Directory Structure

```
public/models/
├── characters/          # Player avatars and NPCs
│   ├── director.glb    # Director role avatar
│   ├── actor.glb        # Actor role avatar
│   └── audience.glb     # Audience role avatar
├── environment/         # Scenery and buildings
│   ├── stage.glb        # Main stage/theater
│   ├── theater.glb      # Theater building
│   └── props/           # Interactive objects
│       ├── chair.glb     # Seating
│       ├── table.glb    # Tables
│       └── microphone.glb # Audio equipment
├── effects/            # Visual effects and particles
│   ├── spotlight.glb    # Lighting effects
│   └── smoke.glb        # Atmospheric effects
└── ui/                 # 3D UI elements
    ├── buttons.glb      # Interactive buttons
    └── panels.glb       # Information panels
```

## Model Format Guidelines

### Preferred Format: GLB
- ✅ Single file containing geometry, textures, and animations
- ✅ Smaller file size and faster loading
- ✅ Better compression and optimization
- ✅ Recommended for production use

### Alternative Format: GLTF
- ✅ Human-readable JSON format
- ✅ Separate texture files for debugging
- ✅ Good for development and testing

## Loading Models in Code

### Basic Model Loading
```typescript
// Load a model
const model = await arcClient.loadModel('/models/characters/director.glb');

// Load environment model with positioning
await arcClient.loadEnvironmentModel(
  '/models/environment/stage.glb',
  new THREE.Vector3(0, 0, -10),
  new THREE.Euler(0, Math.PI, 0)
);
```

### Model Requirements
- **Shadows**: All models automatically have shadows enabled
- **Scale**: Models should be exported at appropriate scale (1 unit = 1 meter)
- **Origin**: Models should be centered at origin (0,0,0)
- **Materials**: Use PBR materials for realistic lighting
- **Animations**: Include animations in GLB files when needed

## Performance Considerations

### File Size Limits
- **Characters**: < 2MB per model
- **Environment**: < 10MB per model
- **Props**: < 1MB per model
- **Effects**: < 5MB per model

### Optimization Tips
- Use texture compression (BC7, ASTC)
- Optimize geometry (reduce polygons where possible)
- Combine similar materials
- Use instancing for repeated objects
- Consider LOD (Level of Detail) for complex models

## Asset Pipeline

### Recommended Tools
- **Blender**: For modeling and animation
- **glTF Pipeline**: For optimization and compression
- **Three.js Editor**: For quick testing and validation

### Export Settings
- **Format**: GLB (binary)
- **Compression**: Draco compression enabled
- **Materials**: Export materials and textures
- **Animations**: Include all animations
- **Scale**: 1.0 (1 unit = 1 meter)

## Usage Examples

### Loading Character Models
```typescript
// In your scene setup
const directorModel = await arcClient.loadModel('/models/characters/director.glb');
directorModel.position.set(5, 0, 0);
scene.add(directorModel);
```

### Loading Environment
```typescript
// Load theater environment
await arcClient.loadEnvironmentModel('/models/environment/theater.glb');

// Load stage props
await arcClient.loadEnvironmentModel(
  '/models/environment/props/microphone.glb',
  new THREE.Vector3(0, 1, -5)
);
```

### Loading Effects
```typescript
// Load lighting effects
const spotlight = await arcClient.loadModel('/models/effects/spotlight.glb');
spotlight.position.set(0, 8, 0);
scene.add(spotlight);
```

## Troubleshooting

### Common Issues
1. **Model not loading**: Check file path and format
2. **Missing textures**: Ensure textures are embedded in GLB
3. **Scale issues**: Verify model scale in Blender
4. **Performance problems**: Optimize geometry and textures

### Debug Tips
- Check browser console for loading errors
- Use Three.js Inspector for model debugging
- Test models in Three.js Editor first
- Verify file sizes are within limits







