// ─────────────────────────────────────────────────────────────────────────
// THROWAWAY TUI shell for the AudioSourcePlayer status reducer (#31).
// Drive the pure state machine by hand and watch the unified status + the
// effects it emits — the interesting moment is seeing a YouTube 101/150/100
// fire PERSIST_ERRORED while a file loaderror does not.
//
// Run:  node prototypes/audio-source-player/tui.ts
// (Node 24 strips the TS types natively — no build step.)
// ─────────────────────────────────────────────────────────────────────────

import {
  initialStatus,
  reduce,
  type Effect,
  type PlayerEvent,
  type PlayerStatus,
  type SourceKind,
} from "./player.ts";

const B = "\x1b[1m";
const D = "\x1b[2m";
const R = "\x1b[0m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const RED = "\x1b[31m";

let status: PlayerStatus = initialStatus("file");
let effectLog: string[] = []; // last few effects, newest last
let lastEvent = "—";

function dispatch(event: PlayerEvent, label: string) {
  const { status: next, effects } = reduce(status, event);
  status = next;
  lastEvent = label;
  for (const e of effects) effectLog.push(fmtEffect(e));
  effectLog = effectLog.slice(-8);
}

function fmtEffect(e: Effect): string {
  switch (e.type) {
    case "PERSIST_ERRORED":
      return `${RED}${B}PERSIST_ERRORED${R} ${D}is_errored=true — "${e.detail}"${R}`;
    case "DRIVER_SET_VOLUME":
      return `${D}driver.setVolume(${e.volume.toFixed(2)})${R}`;
    default:
      return `${D}driver.${e.type.replace("DRIVER_", "").toLowerCase()}()${R}`;
  }
}

function stateColor(s: string): string {
  if (s === "playing") return G;
  if (s === "error") return RED;
  if (s === "loading") return Y;
  return "";
}

function render() {
  process.stdout.write("\x1b[2J\x1b[H");
  const c = stateColor(status.state);
  const err =
    status.state === "error"
      ? `  ${status.errorClass === "persistent" ? RED : Y}[${status.errorClass}]${R} ${D}${status.errorDetail}${R}`
      : "";

  const out = [
    `${B}AudioSourcePlayer — status reducer prototype${R}  ${D}(#31 / map #20)${R}`,
    "",
    `  ${B}kind${R}    ${status.kind === "youtube" ? RED + "youtube" + R : Y + "file" + R}`,
    `  ${B}state${R}   ${c}${status.state}${R}${err}`,
    `  ${B}volume${R}  ${status.volume.toFixed(2)}`,
    "",
    `  ${D}last event:${R} ${lastEvent}`,
    "",
    `${B}Effects emitted${R} ${D}(watch PERSIST_ERRORED — the is_errored write)${R}`,
    ...(effectLog.length ? effectLog.map((l) => "  " + l) : [`  ${D}(none yet)${R}`]),
    "",
    `${B}Interface commands${R} ${D}(kind-agnostic)${R}`,
    `  ${B}p${R} ${D}play${R}   ${B}s${R} ${D}stop${R}   ${B}+/-${R} ${D}volume${R}`,
    "",
    `${B}Switch source kind${R}`,
    `  ${B}f${R} ${D}new file source${R}   ${B}y${R} ${D}new youtube source${R}`,
    "",
    `${B}Inject raw driver events${R}`,
    `  ${Y}file (Howler):${R}  ${B}1${R} ${D}load${R} ${B}2${R} ${D}play${R} ${B}3${R} ${D}end${R} ${B}4${R} ${D}loaderror${R} ${B}5${R} ${D}playerror${R}`,
    `  ${RED}youtube (IFrame):${R} ${B}6${R} ${D}buffering${R} ${B}7${R} ${D}playing${R} ${B}8${R} ${D}ended${R}`,
    `                    ${B}!${R} ${D}err 101 embed-off${R} ${B}@${R} ${D}err 100 gone${R} ${B}#${R} ${D}err 2 bad-id${R} ${B}$${R} ${D}err 5 html5${R}`,
    "",
    `  ${B}q${R} ${D}quit${R}`,
  ].join("\n");
  process.stdout.write(out + "\n");
}

const handlers: Record<string, () => void> = {
  p: () => dispatch({ t: "PLAY" }, "PLAY (interface)"),
  s: () => dispatch({ t: "STOP" }, "STOP (interface)"),
  "+": () => dispatch({ t: "SET_VOLUME", v: status.volume + 0.1 }, "SET_VOLUME +"),
  "-": () => dispatch({ t: "SET_VOLUME", v: status.volume - 0.1 }, "SET_VOLUME -"),
  f: () => ((status = initialStatus("file")), (effectLog = []), (lastEvent = "→ new file source")),
  y: () => ((status = initialStatus("youtube")), (effectLog = []), (lastEvent = "→ new youtube source")),
  "1": () => dispatch({ t: "FILE_LOAD" }, "Howler 'load'"),
  "2": () => dispatch({ t: "FILE_PLAY" }, "Howler 'play'"),
  "3": () => dispatch({ t: "FILE_END" }, "Howler 'end'"),
  "4": () => dispatch({ t: "FILE_LOADERROR" }, "Howler 'loaderror'"),
  "5": () => dispatch({ t: "FILE_PLAYERROR" }, "Howler 'playerror'"),
  "6": () => dispatch({ t: "YT_BUFFERING" }, "IFrame state 3 (buffering)"),
  "7": () => dispatch({ t: "YT_PLAYING" }, "IFrame state 1 (playing)"),
  "8": () => dispatch({ t: "YT_ENDED" }, "IFrame state 0 (ended)"),
  "!": () => dispatch({ t: "YT_ERROR", code: 101 }, "IFrame onError 101"),
  "@": () => dispatch({ t: "YT_ERROR", code: 100 }, "IFrame onError 100"),
  "#": () => dispatch({ t: "YT_ERROR", code: 2 }, "IFrame onError 2"),
  $: () => dispatch({ t: "YT_ERROR", code: 5 }, "IFrame onError 5"),
};

const stdin = process.stdin;
stdin.setRawMode?.(true);
stdin.resume();
stdin.setEncoding("utf8");
render();
stdin.on("data", (key: string) => {
  if (key === "q" || key === "") {
    process.stdout.write("\x1b[2J\x1b[H");
    process.exit(0);
  }
  const h = handlers[key];
  if (h) {
    h();
    render();
  }
});
