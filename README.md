# IRON SIGHT — 3D Split-Screen Tank Wars

A 3D arcade armored-combat arena game playable solo, with an **AI Wingman**, or in **1–4 player couch split-screen**, built from scratch with Three.js and Web Audio on a modular SOLID architecture.

- **Play 3D Tank Wars Live**: https://weilidai2001.github.io/tank-wars-game/
- **Classic 2D Battle City** (separate repo): https://weilidai2001.github.io/tank-wars-game-2d/ ([source](https://github.com/weilidai2001/tank-wars-game-2d))

## Features

- **12 Player Tanks Across 3 National Upgrade Lines**:
  - **USA (Woodland Olive)**: `M4A3 Sherman` → `M26 Pershing` → `M60A3 Patton` → `M1A1 Abrams`
  - **USSR (Winter Whitewash)**: `T-34/76` → `IS-2 Heavy` → `T-62` → `T-90A`
  - **Germany (Panzer Gray)**: `Panther Ausf. A` → `Tiger II` → `Leopard 1` → `Leopard 2A4`
  - Upgrading via Power-Up crates dynamically hot-swaps your 3D tank hull, turret silhouette (cast domes, sloped hex, ERA-tiled dome, angular wedge, flat-cheek box), gun caliber, and combat performance.
- **4 Distinct Enemy Archetypes**: `Panzer II Scout`, `Sd.Kfz. 231` **6-Wheeled Armored Recon Car**, `Panzer III Striker`, and heavy `Tiger Goliath`.
- **Co-op Base Defense, 1P + AI Wingman & Versus Deathmatch**: Defend your National HQ Core solo, alongside an autonomous tactical **P2 AI Wingman** (with friendly-fire HQ guard), or in 2–4P split-screen / Versus Arena Deathmatch.
- **4 Camera Modes (`V` to Cycle)**:
  - **Behind Tank (Chase)**, **Turret Sight (1P Hood)**, and **High Chase** with smooth exponential damping and anti-wall-clipping raycasts.
  - **Full Map Tactical View**: Fixed-center full-battlefield overview framing the entire 91m × 91m arena (`[` / `]` adjusts elevation, `,` / `.` rotates yaw, minimap auto-hides).
- **Refined Daylight PBR Lighting & Surfaces**: Warm directional key sunlight (`#fff2dc`) + cool sky hemisphere fill (`#a1bcc2`) + rim backlight, with distinct PBR responses for matte painted camo armor, smooth-shaded brushed gun steel, completely matte rubber road-wheel tires, and procedural bump-mapped walls.
- **4 Wall Materials & Progressive Destruction**:
  - **Brick Walls (5 HP)**: 5-stage 3D crumbling deterioration + procedural mortar bump map.
  - **Reinforced Concrete (3 HP)**: Precast concrete barriers that spall and expose rusted rebar rods.
  - **Steel Walls (4 HP)**: Cool blue-gray X-ribbed armor plates vulnerable to Tier-IV Steel-Breaker cannons.
  - **Permanent Bastion Steel**: Gold-trimmed indestructible cover.
  - Use your **Tractor Beam** to grab and redeploy Brick, Concrete, or Steel blocks (preserving wall HP).
- **Enhanced Vehicle Physics & Combat**:
  - Damped spring suspension (acceleration squat, braking dive, turning roll, cannon recoil kick, idle engine breathing) and displacement-driven running gear (treads & wheels never spin while blocked against walls).
  - Ice traction zones with momentum slip carry-over; adaptive micro-stepped ballistics with **mid-air opposing shell-vs-shell cancellation**; forward-constrained auto-aim (`±28°`) with velocity lead; directional tank armor (**Front 3×**, **Side 2×**, **Back Core 1-Hit Kill**).
- **12 Handcrafted 3D Combat Arenas** with unique atmosphere/lighting palettes, stepped-bank animated water canals, translucent multi-crown forests, and shimmering ice lanes.
- **Toggleable Translucent HUD (`H`) & Live GPS Minimap (`Tab`)**: Per-player Sat-Nav radar (`Heading-Up` vs `North-Up`), vehicle telemetry cards, and a 4th-quadrant Satellite Command overview in 3-player mode.
- **Keyboard + Mouse + USB/Bluetooth Gamepad Support**: Full HTML5 Gamepad API with analog deadzones, D-Pad, flight-stick POV hat, and dual-rumble haptics.
- **iPhone & iPad Touch Controls**: Landscape on-screen analog joystick plus Fire and Grab buttons, with true multi-touch (steer, hold Fire and tap Grab at once). Works for solo play and for each guest's own tank in LAN / Online matches.

## Architecture (SOLID & Extensible)

The codebase separates pure simulation rules from rendering, input, audio, and UI via Dependency Injection and an EventBus:

```text
src/
├── main.js                     # Thin composition root
├── core/
│   ├── EventBus.js             # Pub/Sub domain events (DIP)
│   └── MathUtils.js            # Pure math, angle wrapping, armor zone classification
├── config/
│   ├── constants.js            # World dimensions, tile types, camera presets, spawns
│   ├── vehicles.js             # Data-driven registry: 3 nations × 4 tiers + 4 enemy classes (OCP)
│   ├── powerups.js             # Strategy-pattern power-up registry (OCP)
│   └── arenas.js               # 12 arena layouts & per-sector lighting palettes
├── world/
│   └── ArenaGrid.js            # Pure simulation grid, wall HP, breaching, LOS raycast (SRP)
├── systems/
│   ├── CollisionSystem.js      # Circle-vs-AABB sliding, mass-weighted separation, shell cancellation
│   ├── MovementSystem.js       # Traction, ice drift, spring suspension, displacement-driven treads
│   ├── CombatSystem.js         # Auto-aim, adaptive micro-step ballistics, directional armor, tractor beam
│   ├── AISystem.js             # Enemy wave/bot AI & autonomous Co-op AI Wingman
│   ├── PowerupSystem.js        # Crate lifecycle & strategy dispatch
│   └── CameraSystem.js         # Follow cameras, anti-clip raycast, Full Map Overview, Hor+ FOV
├── input/
│   ├── InputManager.js         # 4P Keyboard, P1 Mouse, Gamepad/Haptics & Touch abstraction (ISP)
│   └── TouchControls.js        # iPhone/iPad on-screen joystick + Fire/Grab buttons (multi-touch)
├── render/
│   ├── SceneManager.js         # WebGLRenderer, ACESFilmic lighting rig, split-screen & overview passes
│   ├── MaterialLibrary.js      # Procedural PBR textures + bump maps (armor, steel, rubber, walls)
│   ├── TankMeshBuilder.js      # Data-driven 3D hull/turret/tracked & 6-wheeled rig builder
│   ├── ArenaRenderer.js        # 3D arena meshes, progressive wall ruins, national HQ monuments
│   ├── EffectsRenderer.js      # EventBus-driven explosions, smoke plumes, sparks, shells & crates
│   └── HudRenderer.js          # 2D Canvas HUD, status cards, auto-aim brackets, GPS minimap
├── audio/
│   └── SoundEngine.js          # EventBus-driven procedural Web Audio SFX
├── game/
│   └── GameEngine.js           # Facade orchestrating systems & match state machine
└── ui/
    └── MenuController.js       # DOM mission setup overlay & toolbar controller
```

## Controls

| Player | Move / Turn | Fire Cannon | Grab / Drop Wall |
| :--- | :--- | :--- | :--- |
| **1P (+ Mouse / Gamepad)** | `↑` `←` `↓` `→` or `Left Stick / D-Pad` | `Enter` / `LMB` / `/` / `Trigger` | `RMB` / `Right Ctrl` / `\` / `B` |
| **2P** | `W` `A` `S` `D` | `Space` / `F` | `E` / `Q` |
| **3P** | `U` `H` `J` `K` | `I` | `O` / `Y` |
| **4P** | `Numpad 8` `4` `5` `6` | `Numpad 0` | `Numpad Enter` |
| **Touch (iPhone / iPad)** | Left-thumb joystick | **Fire** button (hold) | **Grab** button (hand) |

**Touch (iPhone / iPad)**: Play in landscape; the joystick and buttons appear during a match (in portrait a rotate prompt covers the game and pauses local play). The joystick drives the 1P tank, or your own tank when you join a LAN / Online room from the device. Tap the 3D view to resume after a pause or to play again after Game Over, and use the 🏠 / ⏸ toolbar icons for Menu and Pause. For full-screen play, use Safari's **Share → Add to Home Screen**. Add `?touch=1` (or `?touch=0`) to the URL to force the touch controls on (or off), e.g. in a desktop browser's device emulation.

**Global Shortcuts**: `V` Cycle Camera (`Behind Tank` / `Turret Sight` / `High Chase` / `Full Map View`) · `[` / `]` Pitch / Elevation · `,` / `.` Rotate Full Map Yaw · `Tab` Toggle GPS Mode · `H` Toggle Status Cards · `M` Mute · `P` Pause · `Esc` Menu.
