# Model Assignment Guide

## How Models Are Assigned to Players

Your ARC Beta application now automatically loads and displays 3D models for each player based on their role.

## Default Behavior

Currently, all players (Director, Actor, Audience) use the same model: **`char.glb`**

The model is loaded from: `/models/characters/char.glb`

## Customizing Models per Role

To assign different models to different roles, edit `src/arc-client.ts` around lines **156-163**:

```typescript
private async loadPlayerModel(playerGroup: THREE.Group | null, role: string, name: string): Promise<void> {
  // Determine model path based on role
  let modelPath = '/models/characters/char.glb'; // Default
  
  // ✨ UNCOMMENT AND CUSTOMIZE THESE LINES:
  if (role === 'Director') {
    modelPath = '/models/characters/director.glb';
  } else if (role === 'Actor') {
    modelPath = '/models/characters/actor.glb';
  } else if (role === 'Audience') {
    modelPath = '/models/characters/audience.glb';
  }
  
  // ... rest of code
}
```

## Directory Structure

Place your models in:

```
public/models/characters/
├── char.glb           # Default/fallback model
├── director.glb       # Director role model (optional)
├── actor.glb          # Actor role model (optional)
└── audience.glb       # Audience role model (optional)
```

## How It Works

### For Remote Players (Other Users)
1. When a new player joins, their role is detected
2. The appropriate model is loaded based on role
3. Model is displayed in the scene at their position
4. Falls back to colorful placeholder if model fails to load

### For Local Player (You)
1. Your model loads based on your role
2. Model is hidden by default (since you see through the camera)
3. You can enable third-person view by uncommenting code

## Enabling Third-Person View

If you want to see your own avatar, edit `src/arc-client.ts` line **177-181**:

```typescript
// Change from:
model.visible = false;

// To:
// model.visible = false;
this.camera.add(model);
model.position.set(0, -1.6, -2); // Position behind camera
```

## Model Requirements

### File Format
- **Recommended**: GLB (single file with embedded textures)
- **Alternative**: GLTF + textures folder

### File Size
- Keep character models under **2MB** for best performance
- Optimize textures and geometry before export

### Scale
- Models should be exported at **real-world scale** (1 unit = 1 meter)
- Player height should be approximately 1.8 units tall

### Origin Point
- Models should be centered at origin (0, 0, 0)
- Feet should touch Y=0
- Model should face forward (positive Z direction)

## Example: Custom Role Models

### Step 1: Prepare Your Models
```
Director model:  director.glb  →  public/models/characters/
Actor model:     actor.glb     →  public/models/characters/
Audience model:  audience.glb  →  public/models/characters/
```

### Step 2: Update Code
Edit `src/arc-client.ts` to uncomment role-based model selection

### Step 3: Rebuild
```bash
npm run build:frontend
```

### Step 4: Test
Start your server and join with different roles to see different models!

## Troubleshooting

### Model Not Appearing?
1. Check browser console for loading errors
2. Verify file path is correct
3. Ensure model format is GLB or GLTF
4. Check file size isn't too large

### Model Appears at Wrong Scale?
- Adjust scale in `loadPlayerModel()` method:
  ```typescript
  model.scale.set(1, 1, 1); // Modify as needed
  ```

### Model Position Looks Wrong?
- Add position offset:
  ```typescript
  model.position.set(0, 0, 0); // Adjust offset
  ```

## Current Setup

Your current `char.glb` model will be used for **all players** until you customize the role-based paths. The system includes:

✅ Automatic model loading based on role  
✅ Fallback to placeholder if model fails  
✅ Name labels above each player  
✅ Color-coded placeholders (Orange=Director, Blue=Actor, Purple=Audience)  
✅ Physics-based movement for all avatars







