# 📡 ARC Beta API Documentation

## REST API Endpoints

### GET /

**Description**: Serve the main lobby and role selection page

**Response**: HTML (index.ejs)

**Usage**:
```bash
GET https://localhost:443/
```

---

### GET /scene

**Description**: Serve the WebXR 3D scene page

**Query Parameters**:
- `role` (string, optional): User's role (Director/Actor/Audience)
- `name` (string, optional): User's display name

**Response**: HTML (vrscene.ejs)

**Usage**:
```bash
GET https://localhost:443/scene?role=Director&name=Alice
```

---

### GET /lobby/status

**Description**: Get current lobby status and connected users

**Response**:
```json
{
  "users": [
    {
      "id": "socket_id_123",
      "name": "Alice",
      "role": "Director"
    }
  ],
  "isActive": false,
  "userCount": 1
}
```

**Usage**:
```bash
GET https://localhost:443/lobby/status
```

---

### GET /lobby/user/:socketId

**Description**: Get specific user by socket ID

**Parameters**:
- `socketId` (string): Socket.IO connection ID

**Response**:
```json
{
  "id": "socket_id_123",
  "name": "Alice",
  "role": "Director"
}
```

**Error Response** (404):
```json
{
  "error": "User not found"
}
```

**Usage**:
```bash
GET https://localhost:443/lobby/user/socket_id_123
```

---

## Socket.IO Events

### Client → Server Events

#### `joinLobby`

**Description**: User joins the lobby with a selected role

**Payload**:
```typescript
{
  role: 'Director' | 'Actor' | 'Audience',
  name: string
}
```

**Example**:
```javascript
socket.emit('joinLobby', {
  role: 'Director',
  name: 'Alice'
});
```

**Response Events**:
- `lobbyState` - Current lobby users
- `userJoined` - Broadcast to all users

---

#### `activateLevel`

**Description**: Director activates the 3D scene for all users

**Payload**: None

**Example**:
```javascript
socket.emit('activateLevel');
```

**Response Events**:
- `startExperience` - Broadcast to all users
- `error` - If not a Director

**Authorization**: Director role only

---

#### `playerMove`

**Description**: Send player position and rotation updates

**Payload**:
```typescript
{
  position: { x: number, y: number, z: number },
  rotation: { x: number, y: number, z: number }
}
```

**Example**:
```javascript
socket.emit('playerMove', {
  position: { x: 5.0, y: 1.6, z: -3.2 },
  rotation: { x: 0, y: 1.57, z: 0 }
});
```

**Response Events**:
- `playerMove` - Broadcast to other users (not sender)

**Throttling**: Client-side throttled to 20 updates/sec

---

### Server → Client Events

#### `connect`

**Description**: Socket.IO connection established

**Payload**: None

**Usage**:
```javascript
socket.on('connect', () => {
  console.log('Connected:', socket.id);
});
```

---

#### `disconnect`

**Description**: Socket.IO connection lost

**Payload**: None

**Usage**:
```javascript
socket.on('disconnect', () => {
  console.log('Disconnected');
});
```

---

#### `lobbyState`

**Description**: Receive current lobby state (sent on join)

**Payload**:
```typescript
{
  users: Array<{
    id: string,
    name: string,
    role: 'Director' | 'Actor' | 'Audience'
  }>
}
```

**Usage**:
```javascript
socket.on('lobbyState', (data) => {
  console.log('Lobby users:', data.users);
});
```

---

#### `userJoined`

**Description**: A new user joined the lobby

**Payload**:
```typescript
{
  id: string,        // Socket ID
  name: string,      // Display name
  role: string       // Director/Actor/Audience
}
```

**Usage**:
```javascript
socket.on('userJoined', (data) => {
  console.log(`${data.name} joined as ${data.role}`);
});
```

---

#### `userLeft`

**Description**: A user disconnected from the lobby

**Payload**:
```typescript
{
  id: string,        // Socket ID
  name: string       // Display name
}
```

**Usage**:
```javascript
socket.on('userLeft', (data) => {
  console.log(`${data.name} left`);
});
```

---

#### `startExperience`

**Description**: Director activated the level, transition to 3D scene

**Payload**: None

**Usage**:
```javascript
socket.on('startExperience', () => {
  window.location.href = '/scene?role=' + role + '&name=' + name;
});
```

---

#### `playerMove`

**Description**: Another player moved (position/rotation update)

**Payload**:
```typescript
{
  id: string,                                    // Socket ID of moving player
  position: { x: number, y: number, z: number },
  rotation: { x: number, y: number, z: number }
}
```

**Usage**:
```javascript
socket.on('playerMove', (data) => {
  updateRemotePlayer(data.id, data.position, data.rotation);
});
```

---

#### `error`

**Description**: Server-side error occurred

**Payload**:
```typescript
{
  message: string    // Error description
}
```

**Usage**:
```javascript
socket.on('error', (data) => {
  alert('Error: ' + data.message);
});
```

---

## Database Models

### User Model

**Collection**: `users`

**Schema**:
```typescript
{
  socketId: string (required, unique),
  name: string (required),
  role: 'Director' | 'Actor' | 'Audience' (required),
  roomId: string (optional),
  createdAt: Date (default: now)
}
```

**Methods**:
- Standard Mongoose methods (find, findOne, save, delete, etc.)

**Indexes**:
- `socketId` - Unique index

---

### Room Model

**Collection**: `rooms`

**Schema**:
```typescript
{
  roomId: string (required, unique),
  users: string[] (array of socket IDs),
  isActive: boolean (default: false),
  createdAt: Date (default: now),
  activatedAt: Date (optional)
}
```

**Methods**:
- Standard Mongoose methods

**Indexes**:
- `roomId` - Unique index

---

## Client-Side Classes

### ARCClient

**Location**: `src/arc-client.ts`

**Constructor**:
```typescript
new ARCClient(role: string, playerName: string)
```

**Methods**:
- `getSocketClient()` - Get Socket.IO client instance

**Properties**:
- `scene` - Three.js Scene
- `camera` - Three.js PerspectiveCamera
- `renderer` - Three.js WebGLRenderer
- `remotePlayers` - Map of remote player avatars

---

### FPSController

**Location**: `src/fps-controller.ts`

**Constructor**:
```typescript
new FPSController(
  camera: THREE.Camera,
  domElement: HTMLElement,
  role: string
)
```

**Methods**:
- `update(delta: number)` - Update movement and camera
- `getPosition()` - Get current camera position
- `getRotation()` - Get current camera rotation

**Controls**:
- WASD/Arrow keys for movement
- Mouse for look (requires pointer lock)
- Space for jump

---

### SocketClient

**Location**: `src/socket-client.ts`

**Constructor**:
```typescript
new SocketClient()
```

**Methods**:
- `joinLobby(role: string, name: string)` - Join lobby
- `activateLevel()` - Activate level (Director only)
- `sendPlayerMove(position, rotation)` - Send position update
- `onStartExperience(callback)` - Register callback
- `onPlayerMove(callback)` - Register callback
- `onUserJoined(callback)` - Register callback
- `onUserLeft(callback)` - Register callback
- `getSocketId()` - Get socket ID

---

## Rate Limiting

### Position Updates

- **Client-side throttling**: 20 updates/sec (50ms interval)
- **Server-side**: No explicit rate limiting (relies on client throttling)

### Connection Limits

- **MongoDB Atlas Free Tier**: 500 concurrent connections
- **Socket.IO**: No explicit limit (limited by server resources)

---

## Security Considerations

### CORS

**Configuration** (backend/https-server.ts):
```typescript
{
  origin: '*',  // ⚠️ Development only! Use specific origins in production
  methods: ['GET', 'POST']
}
```

**Production recommendation**:
```typescript
{
  origin: 'https://your-domain.com',
  methods: ['GET', 'POST'],
  credentials: true
}
```

---

### SSL/TLS

- **Development**: Self-signed certificates
- **Production**: Use Let's Encrypt or commercial certificates

---

### Input Validation

**Current implementation**:
- Role validation via `isValidRole()` utility
- Socket ID validation via database queries

**Recommended additions for production**:
- Username sanitization (XSS prevention)
- Position/rotation value bounds checking
- Connection rate limiting

---

## Example Usage Flows

### Complete User Flow

```javascript
// 1. User selects role on lobby page
socket.emit('joinLobby', { role: 'Actor', name: 'Bob' });

// 2. Receive lobby state
socket.on('lobbyState', (data) => {
  // Display users in UI
});

// 3. Director activates level
socket.emit('activateLevel');  // Director only

// 4. All users receive start signal
socket.on('startExperience', () => {
  window.location.href = '/scene';
});

// 5. In 3D scene, send position updates
setInterval(() => {
  socket.emit('playerMove', {
    position: camera.position,
    rotation: camera.rotation
  });
}, 50);

// 6. Receive other players' positions
socket.on('playerMove', (data) => {
  updateAvatar(data.id, data.position, data.rotation);
});
```

---

## Testing with curl

### Test REST API

```bash
# Get lobby status
curl -k https://localhost:443/lobby/status

# Get specific user
curl -k https://localhost:443/lobby/user/socket_id_123
```

### Test Socket.IO (with wscat)

```bash
# Install wscat
npm install -g wscat

# Connect
wscat -c wss://localhost:443/socket.io/?EIO=4&transport=websocket --no-check

# Send message
42["joinLobby",{"role":"Actor","name":"Test"}]
```

---

## Performance Optimization

### Current Implementation

- Position updates throttled to 20 Hz
- Player avatars use simple geometry (capsule + sphere)
- Three.js renderer uses `setAnimationLoop` for VR compatibility

### Recommendations for Scale

- Implement spatial partitioning for position updates
- Use interest management (only send nearby player updates)
- Add server-side position interpolation
- Implement state compression for network efficiency

---

**For more information, see the main [README.md](README.md) and [SETUP.md](SETUP.md)**

