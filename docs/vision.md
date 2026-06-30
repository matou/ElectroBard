**Electrobard - Vision Document**

Electrobard provides tabletop RPG game masters with an intuitive tool for managing and triggering background audio during sessions. It replaces cluttered audio systems like Foundry's with a streamlined, user-friendly interface.

**Architecture**

Electrobard uses a backend server with multiple frontend clients. We'll launch with a web client that works on desktop and mobile browsers. Future iterations will add dedicated mobile and desktop applications.

**Core Features**

Game masters can build a personal sound library by uploading audio files or pasting streaming links. Each sound gets tagged for organization and assigned to customizable layers. The app provides three default layers—music, ambience, and sound effects—but GMs can create and configure layers however they want.

Within each layer, GMs organize sounds into sets. Sets can be auto-populated by tags or built manually. Each set has configurable settings including loop, shuffle, and overlap rules for how multiple sets interact.

During play, the GM sees all layers at once with quick-access buttons for each set. Switching between sets triggers fade effects. Per-layer volume controls let GMs mix audio on the fly.

**Future Iterations**

Stream Deck support and the ability to share audio with players over local network or online.

**Scope**

Web client launches first. No library or set sharing between users initially.