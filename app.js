/* Fargo: Character Connections
 * Two views over the same data:
 *   - "All Seasons": every character in one graph, tagged with the season symbol(s)
 *     they appear in; recurring people are merged into a single bridge node.
 *   - Per-season: one season's web of characters, colored by faction.
 * Nodes = characters (circular portrait + name), edges = relationships.
 */
(function () {
  "use strict";

  var DATA = window.FARGO_DATA;

  // Symbol + color per season (used in the unified view).
  var SEASON_SYM = { 1: "✢", 2: "✶", 3: "✳", 4: "✻", 5: "✹" }; // ✢ ✶ ✳ ✻ ✹
  var SEASON_COLOR = { 1: "#ef4444", 2: "#f59e0b", 3: "#22c55e", 4: "#3b82f6", 5: "#a855f7" };

  // Same person across seasons, body-swapped via casting -> map each alias id to one canonical id.
  var MERGE = {
    "s2-lou-solverson": "s1-lou-solverson",     // Lou: state trooper (S2) -> diner-owning father (S1)
    "s4-satchel-cannon": "s2-mike-milligan"     // Satchel Cannon (S4) grows up into Mike Milligan (S2)
  };
  function canon(id) { return MERGE[id] || id; }

  // Documented cross-season appearances: extra season tag(s) on a character who is
  // listed under one season in data.js but verifiably recurs in others.
  var EXTRA_SEASONS = {
    "s1-molly-solverson": [2],   // adult Bemidji deputy (S1); a little girl in 1979 (S2)
    "s1-mr-numbers": [2],        // Fargo hitman (S1); the hearing boy signing in the S2 finale
    "s1-mr-wrench": [2, 3],      // Fargo hitman (S1); the deaf boy in the S2 finale; Nikki's ally (S3)
    "s2-gale-kitchen": [4],      // Kitchen Brother (S2); drives Mike's car in the S4 coda
    "s2-joe-bulo": [4],          // KC "Northern Expansion" boss (S2); younger cameo in 1950 (S4)
    "s2-hanzee-dent": [1]        // Gerhardt enforcer (S2); IMPLIED to become Moses Tripoli (S1)
  };

  // Cross-season edges that exist between seasons (not inside any single season's data).
  var EXTRA_EDGES = [
    { source: "s1-mr-wrench", target: "s3-nikki-swango", label: "allies with", season: 3 },
    { source: "s2-hanzee-dent", target: "s1-mr-wrench", label: "saves as a boy", season: 2 },
    { source: "s2-hanzee-dent", target: "s1-mr-numbers", label: "saves as a boy", season: 2 },
    { source: "s2-betsy-solverson", target: "s1-molly-solverson", label: "mother of", season: 2 },
    { source: "s2-gale-kitchen", target: "s2-mike-milligan", label: "reunites with (S4 cameo)", season: 4 }
  ];

  // Richer copy for the merged / cross-season characters.
  var OVERRIDE = {
    "s1-lou-solverson": {
      actor: "Keith Carradine (2006) / Patrick Wilson (1979)",
      role: "Minnesota State Trooper in 1979 (S2); by 2006 a widowed diner owner and Molly's father (S1)."
    },
    "s2-mike-milligan": {
      name: "Mike Milligan",
      aka: "a.k.a. Satchel Cannon",
      actor: "Bokeem Woodbine (S2) / Rodney L. Jones III (S4)",
      role: "Satchel Cannon, the boy traded between the Cannon and Fadda syndicates in 1950 (S4), who grows up into the smooth Kansas City enforcer Mike Milligan by 1979 (S2)."
    },
    "s1-molly-solverson": {
      role: "Dogged Bemidji deputy who cracks the 2006 murders (S1); first appears as Lou & Betsy's little girl in 1979 (S2)."
    },
    "s1-mr-wrench": {
      role: "Deaf Fargo-syndicate hitman who hunts Lester in 2006 (S1). He first appears as a deaf boy in the 1979 finale (S2), then returns in 2010 as Nikki Swango's avenging ally (S3). The only character to appear in three seasons."
    },
    "s1-mr-numbers": {
      role: "Fargo-syndicate hitman and Wrench's partner (S1); glimpsed as the hearing boy signing with young Wrench in the 1979 finale (S2)."
    },
    "s2-gale-kitchen": {
      role: "Kansas City \"Kitchen Brother\" gunman under Mike Milligan (S2); reappears driving Mike's car in the 1950 coda (S4 cameo)."
    },
    "s2-joe-bulo": {
      role: "Kansas City \"Northern Expansion\" boss, beheaded by Hanzee (S2); appears as a younger man in 1950 (S4 cameo)."
    },
    "s2-hanzee-dent": {
      aka: "implied: Moses Tripoli (S1)",
      role: "Gerhardt enforcer and tracker (S2). In the finale he's given a new face and identity, and is strongly implied (though played by a different actor) to become Moses Tripoli, boss of the Fargo crime syndicate in 2006 (S1)."
    }
  };

  // Palette for per-season faction coloring.
  var PALETTE = [
    "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7",
    "#06b6d4", "#ec4899", "#84cc16", "#fb923c", "#64748b"
  ];

  // Register the fcose layout if available; otherwise fall back to cose.
  var LAYOUT = "cose";
  try {
    if (window.cytoscapeFcose) { cytoscape.use(window.cytoscapeFcose); LAYOUT = "fcose"; }
  } catch (e) { /* keep cose fallback */ }

  var cy = null;
  var mode = "all";            // "all" | "season"
  var activeSeason = null;     // season object when mode === "season"
  var activeChars = [];        // lookup source for the current view
  var activeConns = [];
  var colorMap = {};           // faction -> color (season mode)
  var unifiedCache = null;
  var FREE_LAYOUT = true;      // all-seasons view: float clusters organically vs. stack vertically

  // ---- data shaping ------------------------------------------------------

  function getUnified() {
    if (unifiedCache) return unifiedCache;
    var byId = {}, chars = [];
    DATA.seasons.forEach(function (s) {
      s.characters.forEach(function (c) {
        var id = canon(c.id);
        if (!byId[id]) {
          var o = OVERRIDE[id] || {};
          var node = {
            id: id, name: o.name || c.name, aka: o.aka || null,
            actor: o.actor || c.actor, role: o.role || c.role,
            group: c.group, image: c.image, seasons: []
          };
          byId[id] = node;
          chars.push(node);
        }
        var n = byId[id];
        if (n.seasons.indexOf(s.season) < 0) n.seasons.push(s.season);
        if (!n.image && c.image) n.image = c.image;       // prefer any real portrait
      });
    });

    // Tag documented cross-season appearances (no separate node exists for these).
    Object.keys(EXTRA_SEASONS).forEach(function (id) {
      var n = byId[canon(id)];
      if (!n) return;
      EXTRA_SEASONS[id].forEach(function (s) { if (n.seasons.indexOf(s) < 0) n.seasons.push(s); });
    });

    var conns = [];
    DATA.seasons.forEach(function (s) {
      s.connections.forEach(function (cn) {
        var a = canon(cn.source), b = canon(cn.target);
        if (a !== b) conns.push({ source: a, target: b, label: cn.label, season: s.season });
      });
    });
    EXTRA_EDGES.forEach(function (e) {
      var a = canon(e.source), b = canon(e.target);
      if (a !== b && byId[a] && byId[b]) conns.push({ source: a, target: b, label: e.label, season: e.season });
    });

    unifiedCache = { characters: chars, connections: conns };
    return unifiedCache;
  }

  function groupsToColors(characters) {
    var map = {}, i = 0;
    characters.forEach(function (c) {
      if (!(c.group in map)) { map[c.group] = PALETTE[i % PALETTE.length]; i++; }
    });
    return map;
  }

  // SVG monogram used when a character has no portrait (or it fails to load).
  function initialsAvatar(name, color) {
    var clean = name.replace(/["'].*?["']/g, " ").replace(/["']/g, " ");
    var parts = clean.split(/\s+/).filter(Boolean);
    var initials = parts.slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join("");
    var svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>" +
      "<rect width='120' height='120' fill='" + color + "'/>" +
      "<text x='60' y='66' font-family='Helvetica,Arial,sans-serif' font-size='46' " +
      "font-weight='700' fill='#ffffff' text-anchor='middle'>" + initials + "</text></svg>";
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  // A circular ring split into one colored arc per season. One season -> a solid
  // ring; two -> half/half; three -> thirds. Center is transparent so the photo shows.
  function polar(r, deg) { var a = deg * Math.PI / 180; return [50 + r * Math.cos(a), 50 + r * Math.sin(a)]; }
  function arcSeg(ri, ro, a0, a1, fill) {
    var oo = polar(ro, a0), o1 = polar(ro, a1), i1 = polar(ri, a1), i0 = polar(ri, a0);
    var large = (a1 - a0) > 180 ? 1 : 0;
    var d = "M" + oo[0].toFixed(2) + " " + oo[1].toFixed(2) +
      " A" + ro + " " + ro + " 0 " + large + " 1 " + o1[0].toFixed(2) + " " + o1[1].toFixed(2) +
      " L" + i1[0].toFixed(2) + " " + i1[1].toFixed(2) +
      " A" + ri + " " + ri + " 0 " + large + " 0 " + i0[0].toFixed(2) + " " + i0[1].toFixed(2) + " Z";
    return "<path d='" + d + "' fill='" + fill + "'/>";
  }
  function ringSvg(colors) {
    var ri = 39, ro = 50, parts = [];
    // single season -> two same-colored halves (a full ring); 2+ seasons -> one arc each
    var segs = colors.length === 1 ? [colors[0], colors[0]] : colors;
    var m = segs.length;
    for (var i = 0; i < m; i++) {
      parts.push(arcSeg(ri, ro, -90 + 360 * i / m, -90 + 360 * (i + 1) / m, segs[i]));
    }
    var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'>" + parts.join("") + "</svg>";
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  // Bake a portrait + a season-split ring into one PNG (canvas) so it always renders.
  // Used for bridge nodes, where a layered SVG ring proved unreliable.
  function compositeRing(im, colors) {
    var S = 200, R = 100, ri = 84;             // canvas px; ring band = ri..R
    var canvas = document.createElement("canvas");
    canvas.width = S; canvas.height = S;
    var ctx = canvas.getContext("2d");
    var iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
    var scale = Math.max(S / iw, S / ih);
    var dw = iw * scale, dh = ih * scale;
    var dx = -(dw - S) / 2, dy = -(dh - S) * 0.2;   // cover crop, biased 20% toward the top
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R, 0, 2 * Math.PI); ctx.closePath(); ctx.clip();
    ctx.drawImage(im, dx, dy, dw, dh);
    ctx.restore();
    var n = colors.length, rMid = (ri + R) / 2;
    ctx.lineWidth = R - ri;
    for (var i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(R, R, rMid, -Math.PI / 2 + 2 * Math.PI * i / n - 0.012,
                          -Math.PI / 2 + 2 * Math.PI * (i + 1) / n + 0.012);
      ctx.strokeStyle = colors[i];
      ctx.stroke();
    }
    return canvas.toDataURL("image/png");
  }

  function symbolsFor(seasons) {
    return seasons.slice().sort(function (a, b) { return a - b; })
      .map(function (s) { return SEASON_SYM[s]; }).join("");
  }

  // Build cytoscape elements for either view.
  function buildElements() {
    var nodes = activeChars.map(function (c) {
      var color, label, seasons, bridge, ringColors;
      if (mode === "all") {
        seasons = c.seasons.slice().sort(function (a, b) { return a - b; });
        bridge = seasons.length > 1;
        color = SEASON_COLOR[seasons[0]];
        ringColors = seasons.map(function (s) { return SEASON_COLOR[s]; });
        label = symbolsFor(seasons) + "\n" + c.name;
      } else {
        seasons = [activeSeason.season];
        bridge = false;
        color = colorMap[c.group];
        ringColors = [color];
        label = c.name;
      }
      var avatar = initialsAvatar(c.name, color);
      var ring = ringSvg(ringColors);
      var img = c.image || avatar;
      // Single-season nodes get a solid colored border; bridges get the SVG split-ring overlay.
      return {
        data: {
          id: c.id, name: c.name, aka: c.aka || null, actor: c.actor, role: c.role,
          group: c.group, seasons: seasons, bridge: bridge, color: color, label: label,
          ring: ring, ringColors: ringColors, avatar: avatar, realImg: c.image, img: img,
          bgImages: bridge ? [img, ring] : [img]
        }
      };
    });
    var edges = activeConns.map(function (cn, idx) {
      var ecolor = mode === "all" ? SEASON_COLOR[cn.season] : "#5a6b8c";
      return { data: { id: "e" + idx, source: cn.source, target: cn.target, label: cn.label, season: cn.season || null, ecolor: ecolor, cpd: 22 } };
    });
    return nodes.concat(edges);
  }

  // Verify portraits actually load (with CORS, matching Cytoscape's fetch); fall back to monogram.
  function resolveImages() {
    cy.nodes().forEach(function (n) {
      var url = n.data("realImg");
      if (!url) return;
      var ring = n.data("ring");
      var isBridge = n.data("bridge");
      var im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = function () {
        if (isBridge) {
          try { n.data("bgImages", [compositeRing(im, n.data("ringColors"))]); return; }
          catch (e) { n.data("bgImages", [url, ring]); return; }   // fallback: layered SVG ring
        }
        n.data("bgImages", [url]);
      };
      im.onerror = function () { n.data("bgImages", isBridge ? [n.data("avatar"), ring] : [n.data("avatar")]); };
      im.src = url;
    });
  }

  function cyStyle() {
    return [
      {
        selector: "node",
        style: {
          "background-image": "data(bgImages)",
          "background-fit": "cover",
          "background-position-x": "50%",
          "background-position-y": "20%",
          "background-color": "data(color)",
          "background-image-crossorigin": "anonymous",
          "border-width": 5,
          "border-color": "data(color)",
          "width": 62, "height": 62, "shape": "ellipse",
          "label": "data(label)",
          "font-size": 9.5, "font-weight": 600, "color": "#f4f7fb",
          "text-valign": "bottom", "text-halign": "center", "text-margin-y": 5,
          "text-outline-width": 2.5, "text-outline-color": "#0b1220",
          "text-max-width": 96, "text-wrap": "wrap", "text-justification": "center",
          "min-zoomed-font-size": 4
        }
      },
      // bridge characters (2+ seasons): bigger, no border (they use the season-split ring from data(bgImages))
      { selector: "node[?bridge]", style: { "border-width": 0, "width": 78, "height": 78, "font-size": 11 } },
      {
        selector: "edge",
        style: {
          "width": 1.6,
          "line-color": "data(ecolor)",
          "target-arrow-color": "data(ecolor)",
          "target-arrow-shape": "triangle", "arrow-scale": 0.85,
          "curve-style": "unbundled-bezier",
          "control-point-distances": "data(cpd)",
          "control-point-weights": 0.5,
          "opacity": 0.4,
          "font-size": 8, "color": "#cbd5e1", "text-rotation": "autorotate",
          "text-background-color": "#0b1220", "text-background-opacity": 0.85,
          "text-background-padding": 2, "text-background-shape": "roundrectangle"
        }
      },
      { selector: "edge.labeled", style: { "label": "data(label)" } },
      { selector: "node.dim", style: { "opacity": 0.1 } },
      { selector: "edge.dim", style: { "opacity": 0.04 } },
      { selector: "node.hl", style: { "border-color": "#ffffff", "border-width": 4 } },
      { selector: "node.focus", style: { "border-color": "#ef4444", "border-width": 5, "width": 80, "height": 80 } },
      {
        selector: "edge.hl",
        style: {
          "opacity": 1, "width": 2.6,
          "line-color": "#ef4444", "target-arrow-color": "#ef4444",
          "label": "data(label)", "color": "#fde2e2", "z-index": 10
        }
      }
    ];
  }

  function runLayout() {
    if (mode === "all") { applyBandedLayout(); return; }
    cy.layout({
      name: LAYOUT,
      animate: true, animationDuration: 700, fit: true, padding: 55,
      randomize: true, nodeSeparation: 95, idealEdgeLength: 95,
      nodeRepulsion: 11000, gravity: 0.2, gravityRange: 3.0, packComponents: true
    }).run();
  }

  // Stacked-by-season layout for the unified view: each season is a tidy cluster,
  // S1 on top down to S5, and characters who span seasons sit in the lanes between.
  // Deterministic Fruchterman-Reingold force layout for one cluster: nodes repel,
  // connected nodes attract, anisotropic gravity keeps the blob wide-and-short.
  // Returns positions centered at (cx, cyc). No randomness -> stable across reloads.
  // Per-cluster layout: same-season characters attract strongly (springs pull connected ones
  // tight) and repel only at close range (so each circle keeps personal space). No long-range
  // repulsion -> compact communities with fewer crossing lines. Deterministic (stable reloads).
  function forceCluster(ids, edges, cx, cyc) {
    var n = ids.length, pos = {};
    if (n === 1) { var p = {}; p[ids[0]] = { x: cx, y: cyc }; return p; }
    ids.forEach(function (id, i) {                 // deterministic seed ring
      var ang = 2 * Math.PI * i / n, r = 40 + 12 * Math.sqrt(n);
      pos[id] = { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
    });
    var L = 122, PS = 120, ITER = 500;
    for (var it = 0; it < ITER; it++) {
      var disp = {};
      ids.forEach(function (id) { disp[id] = { x: 0, y: 0 }; });
      edges.forEach(function (e) {                  // springs: pull connected toward length L
        var A = e[0], B = e[1];
        if (!pos[A] || !pos[B]) return;
        var dx = pos[B].x - pos[A].x, dy = pos[B].y - pos[A].y;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.1, f = (d - L) * 0.05;
        disp[A].x += dx / d * f; disp[A].y += dy / d * f;
        disp[B].x -= dx / d * f; disp[B].y -= dy / d * f;
      });
      for (var i = 0; i < n; i++) {                 // short-range repulsion = personal space
        for (var j = i + 1; j < n; j++) {
          var A = ids[i], B = ids[j];
          var dx = pos[A].x - pos[B].x, dy = pos[A].y - pos[B].y;
          var d = Math.sqrt(dx * dx + dy * dy) || 0.1;
          if (d < PS) {
            var f = (PS - d) * 0.22;
            disp[A].x += dx / d * f; disp[A].y += dy / d * f;
            disp[B].x -= dx / d * f; disp[B].y -= dy / d * f;
          }
        }
      }
      var temp = 20 * (1 - it / ITER) + 1;
      ids.forEach(function (id) {
        disp[id].x -= pos[id].x * 0.006; disp[id].y -= pos[id].y * 0.018;   // cohesion + mild flatten
        var dd = Math.sqrt(disp[id].x * disp[id].x + disp[id].y * disp[id].y) || 0.1;
        var lim = Math.min(dd, temp);
        pos[id].x += disp[id].x / dd * lim;
        pos[id].y += disp[id].y / dd * lim;
      });
    }
    // hard personal-space floor so no two portraits overlap
    var MIN = 110;
    for (var pass = 0; pass < 80; pass++) {
      var moved = false;
      for (var a = 0; a < n; a++) {
        for (var b = a + 1; b < n; b++) {
          var A = ids[a], B = ids[b];
          var dx = pos[A].x - pos[B].x, dy = pos[A].y - pos[B].y;
          var d = Math.sqrt(dx * dx + dy * dy) || 0.1;
          if (d < MIN) {
            var push = (MIN - d) / 2 + 0.5, ux = dx / d, uy = dy / d;
            pos[A].x += ux * push; pos[A].y += uy * push;
            pos[B].x -= ux * push; pos[B].y -= uy * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    ids.forEach(function (id) {
      minx = Math.min(minx, pos[id].x); maxx = Math.max(maxx, pos[id].x);
      miny = Math.min(miny, pos[id].y); maxy = Math.max(maxy, pos[id].y);
    });
    var ox = (minx + maxx) / 2, oy = (miny + maxy) / 2;
    ids.forEach(function (id) { pos[id].x += cx - ox; pos[id].y += cyc - oy; });
    return pos;
  }

  function bandedPositions() {
    var u = getUnified();
    var BAND_Y = 880;
    var pos = {}, charById = {};
    u.characters.forEach(function (c) { charById[c.id] = c; });

    // Group single-season "core" nodes by season; map id -> its season.
    var coreSet = {};
    u.characters.forEach(function (c) {
      if (c.seasons.length === 1) coreSet[c.id] = c.seasons[0];
    });

    for (var s = 1; s <= 5; s++) {
      var ids = u.characters
        .filter(function (c) { return coreSet[c.id] === s; })
        .sort(function (a, b) {
          return (a.group || "").localeCompare(b.group || "") || a.name.localeCompare(b.name);
        })
        .map(function (c) { return c.id; });
      if (!ids.length) continue;
      var edges = [];
      u.connections.forEach(function (cn) {
        if (coreSet[cn.source] === s && coreSet[cn.target] === s) edges.push([cn.source, cn.target]);
      });
      var cpos = forceCluster(ids, edges, 0, (s - 1) * BAND_Y);
      Object.keys(cpos).forEach(function (id) { pos[id] = cpos[id]; });
    }

    // Bridge characters -> a lane midway below their earliest season.
    var lanes = {};
    u.characters.filter(function (c) { return c.seasons.length > 1; }).forEach(function (c) {
      var mn = Math.min.apply(null, c.seasons);
      (lanes[mn] = lanes[mn] || []).push(c);
    });
    Object.keys(lanes).forEach(function (key) {
      var arr = lanes[key].sort(function (a, b) { return a.name.localeCompare(b.name); });
      var laneY = (Number(key) - 1) * BAND_Y + BAND_Y / 2;
      var m = arr.length;
      arr.forEach(function (c, i) { pos[c.id] = { x: (i - (m - 1) / 2) * 250, y: laneY }; });
    });

    return pos;
  }

  // Shared overlap-removal: push apart any pair of nodes closer than MIN.
  function pushApart(pos, ids, MIN, passes) {
    for (var pass = 0; pass < passes; pass++) {
      var moved = false;
      for (var a = 0; a < ids.length; a++) {
        for (var b = a + 1; b < ids.length; b++) {
          var A = ids[a], B = ids[b];
          var dx = pos[A].x - pos[B].x, dy = pos[A].y - pos[B].y;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < MIN) {
            var ux, uy;
            if (d < 0.5) { var ang = a * 2.399; ux = Math.cos(ang); uy = Math.sin(ang); d = 0.1; }  // separate coincident
            else { ux = dx / d; uy = dy / d; }
            var push = (MIN - d) / 2 + 0.5;
            pos[A].x += ux * push; pos[A].y += uy * push;
            pos[B].x -= ux * push; pos[B].y -= uy * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
  }

  // "Free" layout: keep the tight per-cluster communities, but let the clusters float and
  // arrange themselves by their bridge links (no fixed vertical season order). Clusters attract
  // along shared bridges and repel by footprint; bridges sit between the clusters they join.
  function freePositions() {
    var u = getUnified();
    var coreSet = {};
    u.characters.forEach(function (c) { if (c.seasons.length === 1) coreSet[c.id] = c.seasons[0]; });

    var clusters = {};
    for (var s = 1; s <= 5; s++) {
      var ids = u.characters.filter(function (c) { return coreSet[c.id] === s; })
        .sort(function (a, b) { return (a.group || "").localeCompare(b.group || "") || a.name.localeCompare(b.name); })
        .map(function (c) { return c.id; });
      if (!ids.length) continue;
      var iedges = [];
      u.connections.forEach(function (cn) { if (coreSet[cn.source] === s && coreSet[cn.target] === s) iedges.push([cn.source, cn.target]); });
      var rel = forceCluster(ids, iedges, 0, 0);
      var R = 0; ids.forEach(function (id) { R = Math.max(R, Math.sqrt(rel[id].x * rel[id].x + rel[id].y * rel[id].y)); });
      clusters[s] = { ids: ids, rel: rel, radius: R + 55 };
    }
    var seasons = Object.keys(clusters).map(Number);

    var bridges = u.characters.filter(function (c) { return c.seasons.length > 1; });
    var weight = {};
    bridges.forEach(function (b) {
      var ss = b.seasons;
      for (var x = 0; x < ss.length; x++) for (var y = x + 1; y < ss.length; y++) {
        if (!clusters[ss[x]] || !clusters[ss[y]]) continue;
        var key = Math.min(ss[x], ss[y]) + "," + Math.max(ss[x], ss[y]);
        weight[key] = (weight[key] || 0) + 1;
      }
    });

    var ctr = {};
    seasons.forEach(function (s, i) { var ang = 2 * Math.PI * i / seasons.length; ctr[s] = { x: Math.cos(ang) * 500, y: Math.sin(ang) * 500 }; });
    for (var it = 0; it < 600; it++) {
      var disp = {}; seasons.forEach(function (s) { disp[s] = { x: 0, y: 0 }; });
      for (var a = 0; a < seasons.length; a++) for (var b2 = a + 1; b2 < seasons.length; b2++) {
        var sa = seasons[a], sb = seasons[b2];
        var dx = ctr[sb].x - ctr[sa].x, dy = ctr[sb].y - ctr[sa].y, d = Math.sqrt(dx * dx + dy * dy) || 0.1;
        var minGap = clusters[sa].radius + clusters[sb].radius + 130;
        if (d < minGap) { var rf = (minGap - d) * 0.06; disp[sa].x -= dx / d * rf; disp[sa].y -= dy / d * rf; disp[sb].x += dx / d * rf; disp[sb].y += dy / d * rf; }
        var lr = (clusters[sa].radius * clusters[sb].radius) / (d * d) * 10;
        disp[sa].x -= dx / d * lr; disp[sa].y -= dy / d * lr; disp[sb].x += dx / d * lr; disp[sb].y += dy / d * lr;
        var w = weight[Math.min(sa, sb) + "," + Math.max(sa, sb)] || 0;
        if (w > 0) { var ideal = minGap + 30, af = (d - ideal) * 0.012 * w; disp[sa].x += dx / d * af; disp[sa].y += dy / d * af; disp[sb].x -= dx / d * af; disp[sb].y -= dy / d * af; }
      }
      var temp = 45 * (1 - it / 600) + 2;
      seasons.forEach(function (s) {
        disp[s].x -= ctr[s].x * 0.002; disp[s].y -= ctr[s].y * 0.002;
        var dd = Math.sqrt(disp[s].x * disp[s].x + disp[s].y * disp[s].y) || 0.1, lim = Math.min(dd, temp);
        ctr[s].x += disp[s].x / dd * lim; ctr[s].y += disp[s].y / dd * lim;
      });
    }

    var pos = {};
    seasons.forEach(function (s) { clusters[s].ids.forEach(function (id) { pos[id] = { x: ctr[s].x + clusters[s].rel[id].x, y: ctr[s].y + clusters[s].rel[id].y }; }); });
    var bgroups = {};
    bridges.forEach(function (b) {
      var key = b.seasons.slice().sort(function (x, y) { return x - y; }).join(",");
      (bgroups[key] = bgroups[key] || []).push(b);
    });
    Object.keys(bgroups).forEach(function (key) {
      var arr = bgroups[key], ss = arr[0].seasons, sx = 0, sy = 0, cnt = 0;
      ss.forEach(function (s) { if (ctr[s]) { sx += ctr[s].x; sy += ctr[s].y; cnt++; } });
      var ccx = cnt ? sx / cnt : 0, ccy = cnt ? sy / cnt : 0;
      arr.forEach(function (b, i) {                      // fan same-season-set bridges out
        var ang = 2 * Math.PI * i / arr.length, r = arr.length > 1 ? 95 : 0;
        pos[b.id] = { x: ccx + Math.cos(ang) * r, y: ccy + Math.sin(ang) * r };
      });
    });

    pushApart(pos, Object.keys(pos), 112, 160);
    return pos;
  }

  function applyBandedLayout() {
    var pos = FREE_LAYOUT ? freePositions() : bandedPositions();
    routeEdges(pos);
    cy.layout({
      name: "preset",
      positions: function (node) { return pos[node.id()] || { x: 0, y: 0 }; },
      fit: true, padding: 60, animate: true, animationDuration: 650
    }).run();
  }

  // Obstacle-aware edge routing: Cytoscape has no node-avoidance, so for each line we try a
  // range of bends (both sides), sample each resulting curve, and keep the one that crosses the
  // fewest nodes, preferring the gentlest bend on ties. Computed from final node positions.
  var BEND_CANDIDATES = [0, 45, -45, 80, -80, 120, -120, 165, -165, 215, -215,
    270, -270, 330, -330, 400, -400];
  function routeEdges(pos) {
    var rad = {}, ids = Object.keys(pos);
    cy.nodes().forEach(function (n) { rad[n.id()] = n.outerWidth() / 2; });
    cy.edges().forEach(function (e) {
      var sId = e.data("source"), tId = e.data("target");
      var s = pos[sId], t = pos[tId];
      if (!s || !t) { e.data("cpd", 0); return; }
      var dx = t.x - s.x, dy = t.y - s.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
      var px = -dy / len, py = dx / len;                 // left normal
      var mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
      var bestCpd = 0, bestHits = 1e9;
      for (var ci = 0; ci < BEND_CANDIDATES.length; ci++) {
        var cpd = BEND_CANDIDATES[ci];
        var cx = mx + px * cpd, cy2 = my + py * cpd;     // control point at midpoint + bend
        var hits = 0;
        for (var ti = 1; ti < 22; ti++) {
          var u = ti / 22, b = (1 - u) * (1 - u), m = 2 * (1 - u) * u, a = u * u;
          var bx = b * s.x + m * cx + a * t.x, by = b * s.y + m * cy2 + a * t.y;
          for (var k = 0; k < ids.length; k++) {
            var id = ids[k];
            if (id === sId || id === tId) continue;
            var rr = (rad[id] || 35) + 5;
            var ex = bx - pos[id].x, ey = by - pos[id].y;
            if (ex * ex + ey * ey < rr * rr) { hits++; break; }
          }
        }
        if (hits < bestHits || (hits === bestHits && Math.abs(cpd) < Math.abs(bestCpd))) {
          bestHits = hits; bestCpd = cpd;
        }
        if (bestHits === 0 && cpd === 0) break;          // straight is already clear
      }
      e.data("cpd", bestCpd);
    });
  }

  // ---- highlight / selection --------------------------------------------

  function clearHighlight() {
    cy.elements().removeClass("dim hl focus");
    hidePanel();
  }

  function highlightNode(node) {
    var hood = node.closedNeighborhood();
    cy.elements().addClass("dim");
    hood.removeClass("dim");
    hood.nodes().addClass("hl");
    node.connectedEdges().addClass("hl");
    node.addClass("focus").removeClass("hl");
    showPanel(node);
  }

  function highlightEdge(edge) {
    cy.elements().addClass("dim");
    edge.removeClass("dim").addClass("hl");
    edge.connectedNodes().removeClass("dim").addClass("hl");
    showConnectionPanel(edge);
  }

  // ---- detail panel ------------------------------------------------------

  var panel = document.getElementById("panel");

  function connectionsFor(id) {
    var out = [];
    activeConns.forEach(function (cn) {
      if (cn.source === id) out.push({ rel: cn.label, dir: "to", otherId: cn.target, season: cn.season });
      else if (cn.target === id) out.push({ rel: cn.label, dir: "from", otherId: cn.source, season: cn.season });
    });
    return out;
  }

  function nameOf(id) {
    var c = activeChars.find(function (x) { return x.id === id; });
    return c ? c.name : id;
  }

  function showPanel(node) {
    var d = node.data();
    var img = document.getElementById("panel-img");
    img.src = d.img;
    img.onerror = function () { this.src = d.avatar; };
    img.style.borderColor = d.color;
    document.getElementById("panel-name").textContent = d.name;

    var akaEl = document.getElementById("panel-aka");
    if (d.aka) { akaEl.textContent = d.aka; akaEl.hidden = false; } else { akaEl.hidden = true; }

    document.getElementById("panel-actor").textContent = d.actor ? "played by " + d.actor : "";

    // Seasons (all view) vs faction chip (season view)
    var seasonsEl = document.getElementById("panel-seasons");
    var groupEl = document.getElementById("panel-group");
    if (mode === "all") {
      seasonsEl.innerHTML = "";
      d.seasons.forEach(function (s) {
        var meta = DATA.seasons.find(function (x) { return x.season === s; });
        var chip = document.createElement("span");
        chip.className = "season-chip";
        chip.style.color = SEASON_COLOR[s];
        chip.style.borderColor = SEASON_COLOR[s];
        chip.innerHTML = '<span class="sc-sym">' + SEASON_SYM[s] + "</span>" + meta.title;
        seasonsEl.appendChild(chip);
      });
      seasonsEl.hidden = false;
      groupEl.style.display = "none";
    } else {
      seasonsEl.hidden = true;
      groupEl.style.display = "inline-block";
      groupEl.textContent = d.group;
      groupEl.style.backgroundColor = d.color;
    }

    document.getElementById("panel-role").textContent = d.role || "";

    var list = document.getElementById("panel-conn-list");
    list.innerHTML = "";
    connectionsFor(d.id).forEach(function (cn) {
      var li = document.createElement("li");
      var arrow = cn.dir === "to" ? "→" : "←";
      var sym = (mode === "all" && cn.season) ? '<span class="conn-sym" style="color:' + SEASON_COLOR[cn.season] + '">' + SEASON_SYM[cn.season] + "</span> " : "";
      li.innerHTML =
        sym + '<span class="conn-rel">' + cn.rel + '</span>' +
        '<span class="conn-arrow">' + arrow + '</span>' +
        '<span class="conn-name">' + nameOf(cn.otherId) + '</span>';
      li.addEventListener("click", function () {
        var target = cy.getElementById(cn.otherId);
        if (target.nonempty()) {
          clearHighlight();
          highlightNode(target);
          cy.animate({ center: { eles: target }, duration: 300 });
        }
      });
      list.appendChild(li);
    });

    panel.hidden = false;
  }

  // Panel shown when a connection LINE is clicked: who, the relationship, and the season.
  function showConnectionPanel(edge) {
    var sN = edge.source(), tN = edge.target(), sd = sN.data(), td = tN.data();
    var img = document.getElementById("panel-img");
    img.src = sd.img;
    img.onerror = function () { this.src = sd.avatar; };
    img.style.borderColor = sd.color;

    document.getElementById("panel-name").textContent = sd.name + "  →  " + td.name;
    document.getElementById("panel-aka").hidden = true;

    var sn = edge.data("season"), seasonLine = "";
    if (mode === "all" && sn) {
      var meta = DATA.seasons.find(function (x) { return x.season === sn; });
      seasonLine = "   ·   " + SEASON_SYM[sn] + " " + (meta ? meta.title : "");
    }
    document.getElementById("panel-actor").textContent = "“" + edge.data("label") + "”" + seasonLine;

    document.getElementById("panel-seasons").hidden = true;
    document.getElementById("panel-group").style.display = "none";
    document.getElementById("panel-role").textContent = "";

    var list = document.getElementById("panel-conn-list");
    list.innerHTML = "";
    [sN, tN].forEach(function (node) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="conn-rel">view</span><span class="conn-arrow">→</span>' +
        '<span class="conn-name">' + node.data("name") + "</span>";
      li.addEventListener("click", function () {
        clearHighlight();
        highlightNode(node);
        cy.animate({ center: { eles: node }, duration: 300 });
      });
      list.appendChild(li);
    });

    panel.hidden = false;
  }

  function hidePanel() { panel.hidden = true; }

  // ---- chrome: tabs, legend, meta ---------------------------------------

  function renderTabs() {
    var nav = document.getElementById("season-tabs");
    nav.innerHTML = "";

    var all = document.createElement("button");
    all.className = "season-btn all-tab";
    all.dataset.view = "all";
    all.innerHTML = '<span class="all-syms">' +
      SEASON_SYM[1] + SEASON_SYM[2] + SEASON_SYM[3] + SEASON_SYM[4] + SEASON_SYM[5] +
      "</span> All Seasons";
    all.addEventListener("click", setAll);
    nav.appendChild(all);

    DATA.seasons.forEach(function (s) {
      var btn = document.createElement("button");
      btn.className = "season-btn";
      btn.dataset.season = s.season;
      btn.innerHTML = SEASON_SYM[s.season] + " " + s.title + '<span class="yr">' + s.year + "</span>";
      btn.addEventListener("click", function () { setSeason(s.season); });
      nav.appendChild(btn);
    });
  }

  function setActiveTab(key) {
    document.querySelectorAll(".season-btn").forEach(function (b) {
      var isAll = b.dataset.view === "all";
      var match = key === "all" ? isAll : Number(b.dataset.season) === key;
      b.classList.toggle("active", match);
    });
  }

  function renderLegendSeason() {
    var el = document.getElementById("legend");
    var html = "<h4>Factions</h4>";
    Object.keys(colorMap).forEach(function (g) {
      html += '<div class="legend-item"><span class="legend-dot" style="background:' + colorMap[g] + '"></span>' + g + "</div>";
    });
    el.innerHTML = html;
  }

  function renderLegendAll() {
    var el = document.getElementById("legend");
    var html = "<h4>Seasons</h4>";
    [1, 2, 3, 4, 5].forEach(function (s) {
      var meta = DATA.seasons.find(function (x) { return x.season === s; });
      html += '<div class="legend-item"><span class="legend-sym" style="color:' + SEASON_COLOR[s] + '">' +
        SEASON_SYM[s] + "</span>" + meta.title + ' <span class="lg-year">' + meta.year + "</span></div>";
    });
    html += '<div class="legend-item legend-bridge"><span class="legend-dot" style="background:conic-gradient(from -90deg,' +
      SEASON_COLOR[1] + ' 0 50%,' + SEASON_COLOR[2] + ' 50% 100%)"></span>Split ring = appears in 2+ seasons</div>';
    el.innerHTML = html;
  }

  // ---- view builders -----------------------------------------------------

  function renderGraph() {
    var els = buildElements();
    if (!cy) {
      cy = cytoscape({
        container: document.getElementById("cy"),
        elements: els, style: cyStyle(),
        minZoom: 0.15, maxZoom: 3
      });
      cy.on("tap", "node", function (evt) { clearHighlight(); highlightNode(evt.target); });
      cy.on("tap", "edge", function (evt) { clearHighlight(); highlightEdge(evt.target); });
      cy.on("tap", function (evt) { if (evt.target === cy) clearHighlight(); });
    } else {
      cy.elements().remove();
      cy.add(els);
      clearHighlight();
      if (document.getElementById("toggle-labels").checked) cy.edges().addClass("labeled");
    }
    runLayout();
    resolveImages();
  }

  function setAll() {
    mode = "all";
    activeSeason = null;
    var u = getUnified();
    activeChars = u.characters;
    activeConns = u.connections;
    document.getElementById("season-blurb").textContent =
      "All five seasons in one map. Each character's ring is split into the colors of the seasons they appear in.";
    document.getElementById("season-stats").textContent =
      activeChars.length + " characters · " + activeConns.length + " connections";
    renderLegendAll();
    setActiveTab("all");
    renderGraph();
  }

  function setSeason(seasonNum) {
    mode = "season";
    activeSeason = DATA.seasons.find(function (s) { return s.season === seasonNum; });
    colorMap = groupsToColors(activeSeason.characters);
    activeChars = activeSeason.characters;
    activeConns = activeSeason.connections;
    document.getElementById("season-blurb").textContent = activeSeason.blurb;
    document.getElementById("season-stats").textContent =
      activeChars.length + " characters · " + activeConns.length + " connections";
    renderLegendSeason();
    setActiveTab(seasonNum);
    renderGraph();
  }

  // ---- search ------------------------------------------------------------

  function setupSearch() {
    var input = document.getElementById("search");
    var results = document.getElementById("search-results");
    function close() { results.hidden = true; results.innerHTML = ""; }

    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      if (!q) { close(); return; }
      var seen = {}, hits = [];
      DATA.seasons.forEach(function (s) {
        s.characters.forEach(function (c) {
          if (c.name.toLowerCase().indexOf(q) === -1) return;
          var cid = canon(c.id);
          if (mode === "all" && seen[cid]) return;   // one entry per person in unified view
          seen[cid] = true;
          hits.push({ id: mode === "all" ? cid : c.id, name: c.name, season: s.season, title: s.title });
        });
      });
      results.innerHTML = "";
      hits.slice(0, 8).forEach(function (h) {
        var li = document.createElement("li");
        var tag = mode === "all" ? "" : '<span class="sr-season">' + h.title + "</span>";
        li.innerHTML = "<span>" + h.name + "</span>" + tag;
        li.addEventListener("click", function () {
          input.value = "";
          close();
          var switched = false;
          if (mode === "season" && h.season !== activeSeason.season) { setSeason(h.season); switched = true; }
          var node = cy.getElementById(h.id);
          setTimeout(function () {
            if (node.nonempty()) {
              clearHighlight();
              highlightNode(node);
              cy.animate({ center: { eles: node }, zoom: 1.1, duration: 400 });
            }
          }, switched ? 750 : 0);
        });
        results.appendChild(li);
      });
      results.hidden = hits.length === 0;
    });

    document.addEventListener("click", function (e) {
      if (!e.target.closest(".search")) close();
    });
  }

  // ---- toolbar -----------------------------------------------------------

  function setupToolbar() {
    document.getElementById("btn-fit").addEventListener("click", function () {
      cy.animate({ fit: { padding: 55 }, duration: 350 });
    });
    document.getElementById("btn-relayout").addEventListener("click", runLayout);
    var layoutBtn = document.getElementById("btn-layout");
    layoutBtn.textContent = "Layout: " + (FREE_LAYOUT ? "Free" : "Stacked");
    layoutBtn.addEventListener("click", function () {
      FREE_LAYOUT = !FREE_LAYOUT;
      this.textContent = "Layout: " + (FREE_LAYOUT ? "Free" : "Stacked");
      if (mode === "all") setAll();
    });
    document.getElementById("toggle-labels").addEventListener("change", function (e) {
      if (e.target.checked) cy.edges().addClass("labeled");
      else cy.edges().removeClass("labeled");
    });
    document.getElementById("panel-close").addEventListener("click", clearHighlight);
  }

  // ---- init --------------------------------------------------------------

  renderTabs();
  setupSearch();
  setupToolbar();
  setAll();   // default to the unified all-seasons view
})();
