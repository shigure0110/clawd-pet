// ── Claw'd overlay placement (hats and emotes) ─────────────────
// Pure maths, no DOM and no timers, so the QA preview (tools/qa/preview.html) can load the same
// file. Spec: _work/anim_plan_20260926.md §3.3-§3.6. All results are cell px inside #pet-body
// (192×208, one sprite cell; 1 logical px = 4 cell px).
//
//   ClawdOverlay.hatBox(meta, rowName, frame, opts)
//     opts: { flip, climbSide: null|"left"|"right", hidden, bubbleVisible, badgeVisible,
//             hatId, animChanged, prevHatTop, tick?, foreign? }
//     → { visible, left, top, bgX, bgY, mirror, col, targetTop, originX, reason }
//     Apply: left/top as px; background-position bgX bgY; when `mirror`,
//     transform-origin <originX>px 0 (82px) + transform scaleX(-1). `targetTop` is the top without the landing
//     trail: pass it back as `prevHatTop` on the next frame change.
//
//   ClawdOverlay.emoteBox(meta, rowName, frame, opts)
//     opts: { flip, climbSide, hidden, bubbleVisible, badgeVisible, emote, col, hatHeight, foreign? }
//     → { visible, left, top, bgX, bgY, rotate, anchor, originX, originY, reason }
//     Apply: left/top as px; background-position bgX bgY; when `rotate` is not 0,
//     transform-origin originX originY (px) + transform rotate(<rotate>deg).
//
// `rowName` may be an alias; then `frame` is the position in the alias's frame list and it is
// resolved to the base row's frame. For a row, `frame` is the frame index in that row.
// `tick` (optional) counts frame changes; the headband / halo alternate on it (frame index if absent).
// `foreign` (optional) marks an imported skin: no hats, emotes on the fixed anchor [24,22,26,2,0].
(function (root) {
  "use strict";

  const FLAGS = { HAT_OK: 1, EMOTE_OK: 2, FACE_OK: 4, MIRRORED: 8, TINTED: 16, MARK_SIDE: 32, MARK_TOP: 64 };
  const FOREIGN_ANCHOR = [24, 22, 26, 2, 0];
  const LOGICAL_W = 47; // x' = 47 - x mirrors a logical column of the 48-wide cell

  // alias → [baseRow, baseFrame]; a row → itself
  function resolveFrame(meta, rowName, frame) {
    const f = frame | 0;
    const al = meta && meta.aliases && meta.aliases[rowName];
    if (al && Array.isArray(al.frameIndices) && al.frameIndices.length) {
      const i = Math.max(0, Math.min(al.frameIndices.length - 1, f));
      return [al.of, al.frameIndices[i]];
    }
    return [rowName, f];
  }

  // [hx, hy, ey, flags, view] for that row/alias frame, or null when meta has none
  function anchorOf(meta, rowName, frame) {
    const [base, bf] = resolveFrame(meta, rowName, frame);
    const rows = meta && meta.anchors && meta.anchors[base];
    const a = rows && rows[bf];
    return Array.isArray(a) && a.length >= 5 ? a : null;
  }

  function hidden(res, reason) {
    res.visible = false;
    res.reason = reason;
    return res;
  }

  function hatBox(meta, rowName, frame, opts) {
    const o = opts || {};
    const res = { visible: false, left: 0, top: 0, bgX: 0, bgY: 0, mirror: false, col: 0, targetTop: null, originX: 82, reason: "" };
    const H = meta && meta.hats;
    const hat = H && H.list && o.hatId ? H.list[o.hatId] : null;
    if (!hat) return hidden(res, o.hatId ? "unknown hat" : "no hat");
    const a = anchorOf(meta, rowName, frame);
    if (!a) return hidden(res, "no anchor");
    const [hx, hy, ey, flags, view] = a;
    const cellW = H.cellW || 160;
    const cellH = H.cellH || 128;
    const pivot = H.pivot || [20, 24];
    const unit = cellW / 40; // 4 cell px per logical px
    const cols = H.cols || { front: 0, q: 1, side: 2, alt: 3 };
    const flip = !!o.flip;
    const hxp = flip ? LOGICAL_W - hx : hx;
    const eyes = hat.anchor === "eyes";
    const ay = eyes ? ey : hy;
    const height = Number(hat.height) || 0;

    // Head anchor: the hat's pivot pixel (20,24) lands on (hx', hy); shades on (hx', ey)
    res.left = unit * hxp - unit * pivot[0];
    res.targetTop = unit * ay - unit * pivot[1];
    res.top = res.targetTop;

    let col = view === 1 ? cols.q : view === 2 ? cols.side : cols.front;
    const tick = o.tick != null ? o.tick | 0 : frame | 0;
    if (view === 0 && hat.altEveryFrame && tick % 2) col = cols.alt;
    if (view === 0 && hat.altEvery2Frames && Math.floor(tick / 2) % 2) col = cols.alt;
    res.col = col;
    res.bgX = -col * cellW;
    res.bgY = -(hat.row | 0) * cellH;
    res.mirror = flip !== !!(flags & FLAGS.MIRRORED);
    res.originX = unit * pivot[0] + unit / 2; // mirror about the pivot pixel's centre (82px)

    if (o.foreign) return hidden(res, "foreign skin");
    if (o.hidden) return hidden(res, "hiddenMode");
    if (!(flags & FLAGS.HAT_OK)) return hidden(res, "frame not HAT_OK");
    if (hat.hideWhenTinted && flags & FLAGS.TINTED) return hidden(res, "tinted frame");
    if (hat.hideInSide && view === 2) return hidden(res, "side view");
    if (hat.needsFace && (!(flags & FLAGS.FACE_OK) || view !== 0)) return hidden(res, "face not free");
    if (o.bubbleVisible && !o.climbSide && ay - height < 0) return hidden(res, "would touch the bubble");

    // Follow-through: a landing (head down ≥ 3 logical px inside one animation) trails 2 px above
    // for this one frame, then snaps. Rises and animation changes snap at once.
    if (!o.animChanged && o.prevHatTop != null && res.targetTop - o.prevHatTop >= 3 * unit) {
      res.top = res.targetTop - 2 * unit;
      res.reason = "trailing";
    }
    res.visible = true;
    return res;
  }

  function emoteBox(meta, rowName, frame, opts) {
    const o = opts || {};
    const res = { visible: false, left: 0, top: 0, bgX: 0, bgY: 0, rotate: 0, anchor: "side", originX: 0, originY: 0, reason: "" };
    const E = meta && meta.emotes;
    const em = E && E.list && o.emote ? E.list[o.emote] : null;
    if (!em) return hidden(res, o.emote ? "unknown emote" : "no emote");
    const a = o.foreign ? FOREIGN_ANCHOR : anchorOf(meta, rowName, frame) || FOREIGN_ANCHOR;
    const [hx, hy, , flags] = a;
    const cellW = E.cellW || 96;
    const cellH = E.cellH || 96;
    const unit = cellW / 24;
    const pivotSide = E.pivotSide || [0, 23];
    const pivotTop = E.pivotTop || [12, 23];
    const w = Math.max(1, em.w | 0);
    const flip = !!o.flip;
    const hxp = flip ? LOGICAL_W - hx : hx;
    // A side emote sits on the crab's right, or on its left when the frame shows mirrored
    // (a CSS flip or a baked-mirrored row, but not both)
    const sideMirror = flip !== !!(flags & FLAGS.MIRRORED);
    // In a climb or at the edge every emote uses the top anchor, which points away from the wall
    const useTop = !!o.climbSide || !!o.hidden || em.anchor === "top";
    res.anchor = useTop ? "top" : "side";
    res.bgX = -(o.col | 0) * cellW;
    res.bgY = -(em.row | 0) * cellH;

    if (useTop) {
      // Glyph columns inside the cell: top emotes are centred on pivotTop's column, side emotes
      // start at column 0
      const c0 = em.anchor === "top" ? pivotTop[0] - Math.floor(w / 2) : pivotSide[0];
      const c1 = c0 + w - 1;
      // The cell column that sits on (hx', hy - 2 - H). Outside a climb the glyph is centred on it.
      // In a climb the glyph is counter-rotated upright about that pixel; it is then shifted so the
      // whole glyph sits beyond the head, away from the wall (climb-right: screen-left of the
      // pixel; climb-left: screen-right), instead of straddling the head.
      let pc = Math.floor((c0 + c1) / 2);
      if (o.climbSide === "right") pc = c1 + 1;
      else if (o.climbSide === "left") pc = c0 - 1;
      const py = hy - 2 - (Number(o.hatHeight) || 0);
      res.left = unit * (hxp - pc);
      res.top = unit * (py - pivotTop[1]);
      res.originX = unit * pc + unit / 2;
      res.originY = unit * pivotTop[1] + unit / 2;
      res.rotate = o.climbSide === "right" ? 90 : o.climbSide === "left" ? -90 : 0;
    } else {
      // Side: the box's bottom-left pixel at (hx' + 22, hy + 2); mirrored → right-aligned at hx' - 22
      // (lead decision 2 after Gates 1+2: one logical px more clearance than §3.4's 21).
      // With the session badge up, a right-hand emote never rises above hy 16 (§1.5).
      const hyEff = o.badgeVisible && !o.climbSide && !sideMirror ? Math.max(hy, 16) : hy;
      res.top = unit * (hyEff + 2 - pivotSide[1]);
      res.left = sideMirror ? unit * (hxp - 22 - w + 1) : unit * (hxp + 22);
      res.originX = unit * pivotSide[0] + unit / 2;
      res.originY = unit * pivotSide[1] + unit / 2;
    }

    if (!(flags & FLAGS.EMOTE_OK)) return hidden(res, "frame not EMOTE_OK");
    if (useTop && flags & FLAGS.MARK_TOP) return hidden(res, "baked top mark");
    if (!useTop && flags & FLAGS.MARK_SIDE) return hidden(res, "baked side mark");
    if (useTop && o.bubbleVisible && !o.climbSide) return hidden(res, "top emote under a bubble");
    res.visible = true;
    return res;
  }

  const api = { FLAGS, FOREIGN_ANCHOR, resolveFrame, anchorOf, hatBox, emoteBox };
  root.ClawdOverlay = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
