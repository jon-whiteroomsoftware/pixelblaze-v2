// FASTEST acceptance test. Paste this into the DevTools console of the DEPLOYED
// https origin (https://jon-whiteroomsoftware.github.io/pixelblaze-v2/...) with
// the H1 spike extension loaded. No page needs to be deployed -- the content
// script is already injected on that origin.
//
// This drives a full write/read round-trip through the bridge:
//   https page -> extension -> ws://LAN -> real device -> back to console
//
//   1. read current config (so we can restore brightness afterwards)
//   2. dim the lights to 1/3 brightness   <- you should SEE this on the hardware
//   3. raise the lights to 2/3 brightness <- and SEE this
//   4. restore the original brightness
//   5. read config again to confirm
//
// Watch the actual LEDs change between steps -- that is the hardware round-trip.
;(async () => {
  const TAG_REQ = "pbx-h1-spike/request";
  const TAG_RES = "pbx-h1-spike/response";

  // Send one Pixelblaze command through the extension and await the reply.
  // `collectMs` is how long the worker listens for device text frames before
  // resolving (use a longer window for reads, a short one for fire-and-forget writes).
  const send = (command, collectMs = 700) =>
    new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      const onReply = (event) => {
        const m = event.data;
        if (!m || m.tag !== TAG_RES || m.id !== id) return;
        window.removeEventListener("message", onReply);
        resolve(m);
      };
      window.addEventListener("message", onReply);
      window.postMessage({ tag: TAG_REQ, id, command, collectMs }, "*");
    });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Pull a brightness value out of whatever frames a getConfig returned. The
  // brightness read path is undocumented, so we probe defensively and report
  // what we find rather than assuming a shape.
  const brightnessFrom = (frames) => {
    for (const f of frames ?? []) {
      if (f && typeof f.brightness === "number") return f.brightness;
    }
    return undefined;
  };

  console.log("%c[H1 spike] starting write/read round-trip...", "font-weight:bold");

  // --- 1. read current config -------------------------------------------------
  const before = await send({ getConfig: true }, 900);
  if (!before.ok) {
    console.error("[H1 spike] FAILED at getConfig:", before.error);
    return;
  }
  const original = brightnessFrom(before.frames);
  console.log(
    "[H1 spike] connected. getConfig frames:",
    before.frames,
    original !== undefined
      ? `(brightness reads back as ${original})`
      : "(device did not report a readable brightness -- watch the LEDs instead)",
  );

  // --- 2. dim to 1/3 ----------------------------------------------------------
  console.log("[H1 spike] setting brightness -> 0.33 (watch the lights dim)...");
  const dim = await send({ brightness: 0.33 }, 300);
  if (!dim.ok) {
    console.error("[H1 spike] FAILED setting brightness 0.33:", dim.error);
    return;
  }
  await sleep(2000);

  // --- 3. raise to 2/3 --------------------------------------------------------
  console.log("[H1 spike] setting brightness -> 0.66 (watch the lights brighten)...");
  const bright = await send({ brightness: 0.66 }, 300);
  if (!bright.ok) {
    console.error("[H1 spike] FAILED setting brightness 0.66:", bright.error);
    return;
  }
  await sleep(2000);

  // --- 4. restore -------------------------------------------------------------
  const restoreTo = original !== undefined ? original : 1;
  console.log(`[H1 spike] restoring brightness -> ${restoreTo}...`);
  await send({ brightness: restoreTo }, 300);
  await sleep(500);

  // --- 5. confirm -------------------------------------------------------------
  const after = await send({ getConfig: true }, 900);
  const confirmed = brightnessFrom(after.frames);
  if (confirmed !== undefined) {
    console.log(
      `%c[H1 spike] OK -- write/read round-trip confirmed. brightness now reads ${confirmed}.`,
      "color:#0a7d28;font-weight:bold",
    );
  } else {
    console.log(
      "%c[H1 spike] OK -- writes were sent and acknowledged across the bridge. " +
        "Confirm visually that the LEDs dimmed and brightened. " +
        "(No readable brightness in getConfig on this firmware.)",
      "color:#0a7d28;font-weight:bold",
    );
  }
})();
