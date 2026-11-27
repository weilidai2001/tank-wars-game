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
- **Refined Lighting & Tank Surfaces** (after [Tanks3D](https://github.com/tourzhao/Tanks3D)): warm key sun (`#fff2dc`) from behind the chase camera, cool sky fill, a procedural sky environment map and sharper 4096 shadow maps (2048 on phones) with self-shadowing turrets and soft contact shadows. Three distinct surface responses: matte painted armor with nation-specific **polygon camouflage** (USA woodland, Soviet winter whitewash, German panzer gray) mapped triplanar across hull, turret and gun; half-metallic steel; and dead-matte rubber. Gun tubes are painted at the breech and bare steel toward the muzzle, with one continuous highlight along the barrel and a dark bore. Running gear is a visible track loop over rubber-tired road wheels.
- **Battle Effects**: bright-nosed **shell tracers** with additive streaks and smoke trails, directional star-shaped muzzle jets with smoke and a light flash, layered explosions (hot core → fireballs → sparks → debris → rolling smoke), **burning wrecks** and HQ fires, smoke from damaged tanks, track dust, sparks on steel and masonry dust. All of it is GPU-instanced and pooled.
- **Arcade Sound** from the Tanks3D sample set: cannon, impacts, pickups, a looping idle/moving **engine bed**, and the Battle City **stage-start and game-over** jingles (other sounds duck under them), with distance attenuation from your own tank. Uses Ogg, falling back to AAC for browsers without Ogg (see [asset licenses](assets/ASSET_LICENSES.md)).
- **4 Wall Materials & Progressive Destruction**:
  - **Brick Walls (5 HP)**: Tanks3D masonry texture with 5-stage 3D crumbling deterioration, blown-out chunks and a mortar bump map (open-country arenas use the Tanks3D battlefield-grass ground).
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
│   ├── MaterialLibrary.js      # PBR materials, wall/ground textures (incl. Tanks3D grass & masonry)
│   ├── ArmorSurfaces.js        # Polygon camo, triplanar painted-armor shader, track textures
│   ├── TankMeshBuilder.js      # Data-driven 3D hull/turret/tracked & 6-wheeled rig builder
│   ├── ArenaRenderer.js        # 3D arena meshes, progressive wall ruins, national HQ monuments
│   ├── ParticleField.js        # GPU-instanced billboard particles (glow, smoke, streaks, flames)
│   ├── EffectsRenderer.js      # EventBus-driven tracers, muzzle blasts, explosions, fires & crates
│   └── HudRenderer.js          # 2D Canvas HUD, status cards, auto-aim brackets, GPS minimap
├── audio/
│   └── SoundEngine.js          # EventBus-driven sample bank + engine bed (synth fallback)
├── game/
│   └── GameEngine.js           # Facade orchestrating systems & match state machine
└── ui/
    └── MenuController.js       # DOM mission setup overlay & toolbar controller

assets/                         # Tanks3D sounds & textures + license notices (ASSET_LICENSES.md)
```

## Controls

| Player | Move / Turn | Fire Cannon | Grab / Drop Wall |
| :--- | :--- | :--- | :--- |
| **1P (+ Mouse / Gamepad)** | `↑` `←` `↓` `→` or `Left Stick / D-Pad` | `Enter` / `LMB` / `/` / `Trigger` | `RMB` / `Right Ctrl` / `\` / `B` |
| **2P** | `W` `A` `S` `D` | `Space` / `F` | `E` / `Q` |
| **3P** | `U` `H` `J` `K` | `I` | `O` / `Y` |
| **4P** | `Numpad 8` `4` `5` `6` | `Numpad 0` | `Numpad Enter` |
| **Touch (iPhone / iPad)** | Left-thumb joystick | **Fire** button (hold) | **Grab** button (hand) |

**Touch (iPhone / iPad)**: Play in landscape; the joystick and buttons appear during a match (in portrait a rotate prompt covers the game and pauses local play). The joystick drives the 1P tank, or your own tank when you join a LAN / Online room from the device. Push up to drive, down to reverse and sideways to pivot in place; how far you push sets the speed, and the hull always turns toward the side your thumb is on, even when reversing. Tap the 3D view to resume after a pause or to play again after Game Over, and use the 🏠 / ⏸ toolbar icons for Menu and Pause. For full-screen play, use Safari's **Share → Add to Home Screen**. Sound starts on your first tap and plays even with the Ring/Silent switch on silent (like a video would); use the 🔊 toolbar icon to mute it. Add `?touch=1` (or `?touch=0`) to the URL to force the touch controls on (or off), e.g. in a desktop browser's device emulation.

**Global Shortcuts**: `V` Cycle Camera (`Behind Tank` / `Turret Sight` / `High Chase` / `Full Map View`) · `[` / `]` Pitch / Elevation · `,` / `.` Rotate Full Map Yaw · `Tab` Toggle GPS Mode · `H` Toggle Status Cards · `M` Mute · `P` Pause · `Esc` Menu.
