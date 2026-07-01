# ElectroBard

A web-based sound board and music tool for tabletop RPG game masters (GMs). A GM builds a personal library of audio, organizes it into layers and sets, and triggers it during a play session. This glossary fixes the domain vocabulary; it is not a spec.

## Language

**GM (Game Master)**:
The human running a tabletop RPG session who controls the audio — the person ElectroBard is for. Also the only listener at launch.
_Avoid_: Player, host

**User**:
The account a GM owns; the unit of data ownership. Every Sound, Layer, Set, and upload belongs to exactly one User. Real authentication is deferred — during early development every request resolves to a single implicit current user (see [[multitenant-model-deferred-auth]]) — but the model is multi-tenant from the start.
_Avoid_: Account (as a separate concept), owner

**Player**:
A participant at the GM's table who hears the audio but never controls what is played. Not a user of the app at launch. A planned future feature lets a Player become a **Listener** with their own account.
_Avoid_: Guest

**Controller**:
The role that decides what plays (triggers sets, sets playback mode, loop/shuffle). Always and only the GM. There is exactly one Controller.
_Avoid_: Driver, host, DJ

**Listener** _(future)_:
A Player with an account whose device passively plays the program the Controller triggered. A Listener can adjust only their own mix (overall and per-layer volume) and never changes what is played. The GM is implicitly the first Listener.
_Avoid_: Subscriber, viewer

**Program**:
What is currently playing across all layers — the authoritative playback state owned by the Controller. Distinct from a Listener's local mix of that program.
_Avoid_: Playback state (in user-facing language), now-playing, queue

**Sound**:
A single library entry the GM can play, backed by exactly one audio source. Carries tags and can belong to multiple sets.
_Avoid_: Track, clip, audio

**Audio source**:
The backing of a Sound — where the audio comes from and how it is played. Today: an uploaded file (stored on the server, played via Web Audio) or a YouTube link (played in an embedded iframe). The abstraction is metadata-level only; playback capabilities differ by type. See [[client-side-audio]].
_Avoid_: Provider, backend, origin

**Tag**:
A free-form label on a Sound used for organization and to auto-populate sets.
_Avoid_: Category, keyword

**Layer**:
A named, independently-mixed channel that holds sets and has its own volume and playback mode. Ships with three starter layers (music, ambience, sound effects) that are ordinary layers with no special behavior.
_Avoid_: Channel, group, bus

**Set**:
A collection of Sounds within a Layer, triggered as a unit from the session view. Exactly one composition mode: a **manual set** (GM picks sounds, GM-defined order) or a **tag-based set** (auto-populated by tags, updates dynamically, ordered by title A→Z when not shuffled). Never both. Has loop and shuffle settings.
_Avoid_: Playlist, group, queue, bucket

**Playback mode**:
A Layer setting governing how many of its sets play at once: *single set* (triggering a new set immediately stops the current one — a hard cut, no transition at launch) or *multiset* (sets mix), with an optional *self-stacking* refinement allowing one set to be triggered again and layer over itself.
_Avoid_: Overlap mode, mix mode, stack same set

**Session (view)**:
The live performance surface where the GM sees all layers at once with per-set trigger buttons and per-layer volume, and plays audio during a game. Distinct from any login/server session.
_Avoid_: Stage, board, dashboard
