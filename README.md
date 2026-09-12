# MINKU-FIGHT — Wi-Fi & Global Online Stick Duel

A high-performance martial arts 2D stick fighting game built with pure Vanilla JavaScript, HTML5 Canvas, Web Audio procedural sound synthesis, and real-time WebRTC P2P netcode.

Designed to be hosted with zero backend server dependencies on **Cloudflare Pages**, **GitHub Pages**, **Vercel**, or run locally on the same Wi-Fi.

---

## ⚡ Key Features

- **4 Unique Fighters with Custom Specials**:
  - **KAGE (The Shadow)**: Dark fire ninja with Ember Shot, Shadow Mirage rush, and the Fist of Ashes super.
  - **VOLT (Live Wire)**: Speed demon wielding zigzagging Volt Bolts, Lightning Flash dash, and Thousand Volts thunderstorm super.
  - **NIMBUS (Storm Dancer)**: Aerial acrobat with piercing Tempest Razor wind discs, Gale Drill rush, and Tempest Fury whirlwind vortex.
  - **GAIZER (Iron Tempest)**: Heavyweight armored bruiser with bouncing Magma Boulders, super-armored Iron Juggernaut bash, and volcanic Gaizer Slam eruptions.

- **Real-Time Multiplayer (Flawless Online & Local)**:
  - **⚡ Online Quick Match**: Instant random matchmaking with players worldwide.
  - **Room Code Duels**: 4-letter room codes for private duels.
  - **WebRTC Direct P2P**: Direct browser-to-browser data channels with sub-frame input replication.
  - **Local Wi-Fi WebSocket**: 4ms ultra-fast local network play via `server.js`.
  - **Instant QR Code**: Scan host screen with a mobile camera to join immediately.
  - **BroadcastChannel**: Instant 0ms latency dual-tab testing on the same computer.

- **Fighting Mechanics**:
  - High / Low guarding (crouch block guards low sweeps).
  - Unblockable command grabs that counter turtling guards.
  - Uppercut launchers into aerial juggles.
  - Wall bounces off stage boundaries for extended combos.
  - Dynamic hitstop freeze frames and K.O. slow motion.
  - Procedural Web Audio synthesizer (impacts, bone cracks, electric zaps, taiko battle music, synthetic voice announcer).

---

## 🚀 How to Deploy to Cloudflare Pages (Free & Instant)

1. **Push this repository to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of MINKU-FIGHT"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```

2. **Deploy on Cloudflare Pages**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
   - Select your GitHub repository.
   - Set **Build command**: *(Leave empty)*.
   - Set **Build output directory**: `/` *(or root directory)*.
   - Click **Save and Deploy**.
   - Your game is now live with global HTTPS, ready for anyone in the world to play online!

---

## 🎮 Local Wi-Fi Play

To play across devices on your home or office Wi-Fi:
1. Double-click `start_game.bat` (or run `node server.js` in terminal).
2. It automatically prints your Wi-Fi URL (e.g. `http://192.168.X.Y:8080`).
3. Click **HOST DUEL** on your PC to see the 4-letter code and QR Code.
4. Open the link or scan the QR Code on your phone/tablet/laptop to duel with < 4ms latency!

---

## 🕹️ Controls

| Action | Player 1 (WASD / Gamepad 1) | Player 2 (Arrows / Gamepad 2) |
|---|---|---|
| **Move / Dash** | `A` / `D` (Double-tap to Dash) | `←` / `→` (Double-tap to Dash) |
| **Jump / Crouch** | `W` (or Space) / `S` | `↑` / `↓` |
| **Punch (Hook)** | `J` | `Num 1` or `,` |
| **Kick (Roundhouse)** | `K` | `Num 2` or `.` |
| **Uppercut (Launcher)** | `S` + `J` | `↓` + `Num 1` |
| **Sweep (Knockdown)** | `S` + `K` | `↓` + `Num 2` |
| **Block (Guard)** | `L` (Hold) | `Num 3` or `/` |
| **Grab / Throw** | `H` | `Num 0` or `P` |
| **Special 1 (Projectile)** | `U` (30% Meter) | `Num 4` or `;` |
| **Special 2 (Rush)** | `I` (30% Meter) | `Num 5` or `'` |
| **SUPER Attack** | `O` (100% Meter) | `Num 6` or `[` |
