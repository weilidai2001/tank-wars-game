# IRON SIGHT — 3D Split-Screen Tank Wars

A 3D arcade Main Battle Tank (MBT) arena game playable solo or in **1–4 player couch split-screen**, built from scratch with Three.js and Web Audio.

- **Play 3D Tank Wars Live**: https://weilidai2001.github.io/tank-wars-game/
- **Play Classic 2D Battle City**: https://weilidai2001.github.io/tank-wars-game/classic-2d/

## Features
- **3D Behind-the-Tank Perspective**: Drive detailed camouflaged MBTs through 8 destructible 3D arenas (`V` cycles camera views; `[` / `]` adjusts vertical pitch).
- **Forward-Constrained Auto-Aim (`±28°`)**: Steer your vehicle while your turret automatically locks onto the nearest unobstructed target in your front arc.
- **Directional Tank Armor**:
  - **Front Armor (`3×`)**: 3 hits to destroy
  - **Side Flank (`2×`)**: 2 hits to destroy
  - **Rear Reactor Core (`1×`)**: 1-hit instant backstab!
- **5-Stage Destructible Brick Walls & Indestructible Steel Walls**: Brick walls visibly crack, crumble, and collapse across 5 progressive damage states; use your Tractor Beam to grab and redeploy wall blocks.
- **Live Rotating GPS Minimap**: Per-player Sat-Nav radar (`Tab` toggles Heading-Up vs North-Up) plus a 4th-quadrant Satellite Command overview in 3-player mode.
- **Co-op Base Defense & Versus Arena Deathmatch**: Defend the Golden Eagle Core together or battle up to 4 players + AI bots to 10 frags.
- **Keyboard + USB/Bluetooth Joystick Support**: Full HTML5 Gamepad API support with analog deadzones and dual-rumble haptics.

## Controls

| Player | Move / Turn | Fire Cannon | Grab / Drop Wall |
| :--- | :--- | :--- | :--- |
| **1P (+ Joystick)** | `W` `A` `S` `D` or `Left Stick / D-Pad` | `Space` / `F` / `Trigger` | `E` / `Q` / `B` |
| **2P** | `↑` `←` `↓` `→` | `Enter` / `/` | `Right Ctrl` / `\` |
| **3P** | `U` `H` `J` `K` | `I` | `O` / `Y` |
| **4P** | `Numpad 8` `4` `5` `6` | `Numpad 0` | `Numpad Enter` |
