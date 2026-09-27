// REFERENCE IMPLEMENTATION (QA only) of the ClawdOverlay placement maths, spec §3.3 / §3.4.
// preview.html loads renderer/overlay.js (executor B) when it exists and falls back to this file
// otherwise; the page labels which one is active. Pure functions: no DOM, no timers.
// Values are cell px inside #pet-body (logical px × 4).
(function () {
  "use strict";
  const F = { HAT_OK: 1, EMOTE_OK: 2, FACE_OK: 4, MIRRORED: 8, TINTED: 16, MARK_SIDE: 32, MARK_TOP: 64 };

  // rowName may be an alias → [baseRowName, baseFrameIndex]
  function resolve(meta, rowName, frame) {
    const a = meta.aliases && meta.aliases[rowName];
    if (a) return [a.of, a.frameIndices[Math.min(frame, a.frameIndices.length - 1)]];
    return [rowName, frame];
  }

  function anchorOf(meta, rowName, frame) {
    const [base, fi] = resolve(meta, rowName, frame);
    const arr = meta.anchors && meta.anchors[base];
    return arr && arr[fi] ? arr[fi] : null;
  }

  // opts: { flip, climbSide, hidden, bubbleVisible, badgeVisible, hatId, animChanged, prevHatTop, frameChanges, foreignSkin }
  function hatBox(meta, rowName, frame, opts) {
    opts = opts || {};
    const off = { visible: false, left: 0, top: 0, bgX: 0, bgY: 0, mirror: false, col: 0, targetTop: null, why: "" };
    if (!meta || !meta.hats || !opts.hatId) return Object.assign(off, { why: "no hat" });
    const h = meta.hats.list[opts.hatId];
    const a = anchorOf(meta, rowName, frame);
    if (!h || !a) return Object.assign(off, { why: h ? "no anchor" : "unknown hat" });
    const [hx, hy, ey, fl, view] = a;
    const why =
      opts.foreignSkin ? "foreign skin" :
      opts.hidden ? "hiddenMode" :
      !(fl & F.HAT_OK) ? "no HAT_OK" :
      h.hideWhenTinted && fl & F.TINTED ? "tinted" :
      h.hideInSide && view === 2 ? "side view" :
      h.needsFace && !(fl & F.FACE_OK && view === 0) ? "no FACE_OK" :
      opts.bubbleVisible && !opts.climbSide && h.anchor === "head" && hy - h.height < 0 ? "bubble clash" : "";
    const hxp = opts.flip ? 47 - hx : hx;
    const cols = meta.hats.cols;
    let col = [cols.front, cols.q, cols.side][view] ?? cols.front;
    const changes = opts.frameChanges != null ? opts.frameChanges : frame;
    if (h.altEveryFrame && changes % 2 === 1) col = cols.alt;
    if (h.altEvery2Frames && Math.floor(changes / 2) % 2 === 1) col = cols.alt;
    const targetTop = 4 * (h.anchor === "eyes" ? ey : hy) - 96;
    let top = targetTop;
    // follow-through: the head moved down >= 3 logical px within the same animation → trail 2 px above, one frame
    if (!opts.animChanged && opts.prevHatTop != null && targetTop - opts.prevHatTop >= 12) top = targetTop - 8;
    return {
      visible: !why,
      why,
      left: 4 * hxp - 80,
      top,
      targetTop,
      bgX: -(col * meta.hats.cellW),
      bgY: -(h.row * meta.hats.cellH),
      mirror: !!(fl & F.MIRRORED) !== !!opts.flip,
      col,
      height: h.anchor === "head" ? h.height : 0,
    };
  }

  // opts: { flip, climbSide, hidden, bubbleVisible, badgeVisible, emote, col, hatHeight, foreignSkin }
  function emoteBox(meta, rowName, frame, opts) {
    opts = opts || {};
    const off = { visible: false, left: 0, top: 0, bgX: 0, bgY: 0, rotate: 0, anchor: "side", why: "" };
    if (!meta || !meta.emotes || !opts.emote) return Object.assign(off, { why: "no emote" });
    const e = meta.emotes.list[opts.emote];
    if (!e) return Object.assign(off, { why: "unknown emote" });
    const a = opts.foreignSkin ? [24, 22, 26, 2, 0] : anchorOf(meta, rowName, frame);
    if (!a) return Object.assign(off, { why: "no anchor" });
    const [hx, hy, , fl] = a;
    const hxp = opts.flip ? 47 - hx : hx;
    const mirrored = !!(fl & F.MIRRORED) || !!opts.flip;
    const anchor = opts.climbSide || opts.hidden ? "top" : e.anchor;
    const why =
      !(fl & F.EMOTE_OK) ? "no EMOTE_OK" :
      anchor === "side" && fl & F.MARK_SIDE ? "MARK_SIDE" :
      anchor === "top" && fl & F.MARK_TOP ? "MARK_TOP" :
      anchor === "top" && opts.bubbleVisible && !opts.climbSide ? "top emote + bubble" : "";
    let left, top;
    if (anchor === "side") {
      const hyEff = opts.badgeVisible && !opts.climbSide && !mirrored ? Math.max(hy, 16) : hy;
      top = 4 * (hyEff + 2 - 23);
      // lead decision 2 (2026-09-27): hx' + 22 (was §3.4's 21); mirrored right-aligned at hx' - 22
      left = mirrored ? 4 * (hxp - 22 - e.w + 1) : 4 * (hxp + 22);
    } else {
      const H = opts.hatHeight || 0;
      top = 4 * (hy - 2 - H - 23);
      left = 4 * (hxp - 12);
    }
    const piv = anchor === "top" ? meta.emotes.pivotTop : meta.emotes.pivotSide;
    const col = opts.col != null ? opts.col : 2;
    return {
      visible: !why,
      why,
      left,
      top,
      bgX: -(col * meta.emotes.cellW),
      bgY: -(e.row * meta.emotes.cellH),
      rotate: opts.climbSide === "right" ? 90 : opts.climbSide === "left" ? -90 : 0,
      origin: [4 * piv[0] + 2, 4 * piv[1] + 2],
      anchor,
    };
  }

  window.ClawdOverlayRef = { hatBox, emoteBox, resolve, anchorOf, FLAGS: F };
  if (!window.ClawdOverlay) window.ClawdOverlay = { hatBox, emoteBox, __reference: true };
})();
