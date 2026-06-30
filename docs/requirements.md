# Electrobard — Requirements Document

## 1. Overview

Electrobard is a web-based sound board and music tool for tabletop RPG (TTRPG) game masters. It lets GMs build a personal sound library, organize sounds into customizable layers and sets, and trigger audio during play sessions with per-layer volume control. The app aims to replace cluttered audio systems (such as Foundry's) with a streamlined, intuitive interface for managing background audio.

The web client launches first and works on both desktop and mobile browsers. Dedicated mobile and desktop applications are planned for future iterations.

## 2. Architecture

Electrobard uses a backend server with multiple frontend clients. The launch target is a web client (desktop and mobile browsers). The backend exposes a REST API so that additional clients can be added over time.

An **audio source abstraction layer** sits at the core of the audio model. An audio source can be an uploaded file, a YouTube link, or other source types added later. The system is designed so new source types can be introduced without reworking the rest of the application.

## 3. Sound Library

- GMs build a personal sound library by **uploading audio files** or **pasting YouTube links**.
- Uploaded files are **stored on the server**.
- YouTube links are **played directly from YouTube's player** (audio is not extracted, to avoid legal issues).
- Each sound is **tagged** for organization.
- A sound can be **added to multiple sets**.
- GMs can **preview/play individual sounds in the library** before adding them to sets.

## 4. Layers

- GMs start with three default layers: **music**, **ambience**, and **sound effects**.
- The default layers are starting conveniences only — they can be **modified, deleted, or recreated** exactly like custom layers. There is no functional difference between default and custom layers.
- GMs can **create and configure custom layers** freely.
- **Layer configuration persists** between sessions.

### 4.1 Layer Settings (launch)

- **Playback mode**, with the following options:
    - **Single set** — triggering a new set stops the currently playing set; only one set plays at a time.
    - **Multiset** — multiple sets can play at the same time; their audio mixes together.
        - **Stack same set** (subsetting of multiset) — allows the same set to be triggered multiple times so that it layers on top of itself.
- **Volume control** — each layer has its own volume.

_Example:_ the default music layer would typically use single set mode (no overlap), while the default sound effects layer would use multiset mode so effects can stack.

### 4.2 Layer Settings (future)

- **Mute** and **solo** per layer.

## 5. Sets

- Within each layer, GMs organize sounds into **sets**.
- Sets can be **built manually** or **auto-populated by tags**.
- Tag-based sets **update dynamically**: when a sound matching the set's tags is added it appears in the set, and when a sound's tag is removed it disappears from the set automatically.

### 5.1 Set Settings

- **Loop** — the set repeats.
- **Shuffle** — the set plays its sounds in randomized order. When looping, the set **re-shuffles on each loop** (a fresh random order every cycle). Shuffle is a per-set setting only; there is no layer-level shuffle.

## 6. Playback & Mixing (Session View)

- During a session, the GM sees **all layers at once**, each with **quick-access buttons** for its sets and its own **volume slider**.
- Each set button shows its **current playback status** (playing or stopped).
- **Clicking a set** triggers playback; **clicking it again stops it**.
- Triggering behavior depends on the layer's playback mode:
    - **Single set** — triggering a new set stops any currently playing set in that layer.
    - **Multiset** — multiple sets play together and mix; with **stack same set** enabled, the same set can be triggered multiple times and layer over itself.
- Sets play their sounds **in order or shuffled**, based on the set's shuffle setting.
- **Per-layer volume** lets the GM mix audio on the fly.

## 7. Technical Requirements (Non-Functional)

- **Backend language:** Python.
- **Database:** PostgreSQL.
- **API:** REST.
- **Frontend (launch):** web client supporting desktop and mobile browsers.

## 8. Future Iterations

- Customizable **transition effects** between sounds/sets (e.g., crossfades). Initial release plays sounds without transitions.
- **Mute and solo** controls per layer.
- **Stream Deck** support.
- **Sharing audio with players** over local network or online.
- Dedicated **mobile and desktop applications**.
- Additional **audio source types** via the audio source abstraction layer.

## 9. Scope & Constraints

- Web client launches first.
- **No library or set sharing between users** in the initial release.
- Naming note: the term **"stack same set"** is a working name and may change.