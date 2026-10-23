/* =============================================
   TALUDES — Geometry: slopes, circles, slices
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes = global.Taludes || {};
  var Geo = T.Geometry = {};

  var DEG = Math.PI / 180;

  // --- Slope Profile ---
  // Origin at toe. X right, Y up.
  // Profile: flat base → slope face → flat crest
  Geo.slopeProfile = function (H, betaDeg) {
    var beta = betaDeg * DEG;
    var L = H / Math.tan(beta); // horizontal run of the slope face
    var ext = Math.max(H * 0.6, 5); // extension beyond toe/crest
    return {
      toe:   { x: 0, y: 0 },
      crest: { x: L, y: H },
      L: L,
      H: H,
      beta: beta,
      extLeft:  ext,
      extRight: ext,
      // Full profile points (left to right)
      points: [
        { x: -ext, y: 0 },
        { x: 0,    y: 0 },
        { x: L,    y: H },
        { x: L + ext, y: H }
      ]
    };
  };

  // Y of slope surface at given X
  Geo.surfaceY = function (profile, x) {
    if (x <= 0) return 0;
    if (x >= profile.L) return profile.H;
    return (x / profile.L) * profile.H; // linear interpolation on slope face
  };

  // --- Default Circle Position ---
  Geo.defaultCircle = function (H, betaDeg) {
    var beta = betaDeg * DEG;
    var L = H / Math.tan(beta);
    // Center above and slightly behind slope midpoint
    var cx = L * 0.35;
    var cy = H * 1.6;
    // Radius to encompass the slope
    var dx = L * 0.5 - cx;
    var dy = -cy;
    var r = Math.sqrt(dx * dx + dy * dy) * 1.15;
    // Ensure circle passes below the toe
    var rToToe = Math.sqrt(cx * cx + cy * cy);
    if (r < rToToe * 0.95) r = rToToe * 1.02;
    return { cx: cx, cy: cy, r: r };
  };

  // --- Circle-Slope Intersections ---
  // Find where the circle intersects the slope profile.
  // Returns { entry: {x,y}, exit: {x,y} } or null if no valid intersection.
  Geo.circleIntersections = function (profile, cx, cy, r) {
    var intersections = [];

    // 1) Intersection with base (y = 0, x <= 0)
    var baseInts = circleLineHorizontal(cx, cy, r, 0);
    for (var i = 0; i < baseInts.length; i++) {
      if (baseInts[i].x <= 0.001) intersections.push(baseInts[i]);
    }

    // 2) Intersection with slope face (from toe to crest)
    var slopeInts = circleLineSegment(cx, cy, r,
      0, 0, profile.L, profile.H);
    for (i = 0; i < slopeInts.length; i++) {
      intersections.push(slopeInts[i]);
    }

    // 3) Intersection with crest (y = H, x >= L)
    var crestInts = circleLineHorizontal(cx, cy, r, profile.H);
    for (i = 0; i < crestInts.length; i++) {
      if (crestInts[i].x >= profile.L - 0.001) intersections.push(crestInts[i]);
    }

    // Slices use the lower semicircle. An upper-arc intersection cannot close it.
    var eps = 1e-7 * Math.max(1, profile.H, r);
    intersections = intersections.filter(function (p) {
      var radicand = r * r - (p.x - cx) * (p.x - cx);
      return radicand >= -eps &&
        Math.abs(p.y - (cy - Math.sqrt(Math.max(0, radicand)))) <= eps;
    });
    if (intersections.length < 2) return null;

    // Sort by x
    intersections.sort(function (a, b) { return a.x - b.x; });
    intersections = intersections.filter(function (p, index, all) {
      return index === 0 || Math.abs(p.x - all[index - 1].x) > eps;
    });
    if (intersections.length < 2) return null;

    // Entry = leftmost on the lower arc, Exit = rightmost
    var entry = intersections[0];
    var exit = intersections[intersections.length - 1];

    // Validate: entry should be to the left of exit
    if (exit.x - entry.x < 0.5) return null;

    // Do not bridge separate soil regions or use an arc above the ground.
    var checks = [entry.x, exit.x, 0, profile.L, cx];
    for (var j = 1; j < 100; j++) checks.push(entry.x + (exit.x - entry.x) * j / 100);
    for (var k = 0; k < checks.length; k++) {
      var x = checks[k];
      if (x < entry.x || x > exit.x) continue;
      var arcY = cy - Math.sqrt(Math.max(0, r * r - (x - cx) * (x - cx)));
      if (arcY > Geo.surfaceY(profile, x) + eps) return null;
    }

    return { entry: entry, exit: exit };
  };

  // Circle intersection with horizontal line y = yLine
  function circleLineHorizontal(cx, cy, r, yLine) {
    var dy = yLine - cy;
    var disc = r * r - dy * dy;
    if (disc < 0) return [];
    var sq = Math.sqrt(disc);
    var results = [];
    results.push({ x: cx - sq, y: yLine });
    if (sq > 0.01) results.push({ x: cx + sq, y: yLine });
    return results;
  }

  // Circle intersection with line segment (x1,y1)→(x2,y2)
  function circleLineSegment(cx, cy, r, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var fx = x1 - cx;
    var fy = y1 - cy;
    var a = dx * dx + dy * dy;
    var b = 2 * (fx * dx + fy * dy);
    var c = fx * fx + fy * fy - r * r;
    var disc = b * b - 4 * a * c;
    if (disc < 0) return [];
    var sq = Math.sqrt(disc);
    var results = [];
    var t1 = (-b - sq) / (2 * a);
    var t2 = (-b + sq) / (2 * a);
    if (t1 >= -0.001 && t1 <= 1.001) {
      t1 = Math.max(0, Math.min(1, t1));
      results.push({ x: x1 + t1 * dx, y: y1 + t1 * dy });
    }
    if (t2 >= -0.001 && t2 <= 1.001 && Math.abs(t2 - t1) > 0.001) {
      t2 = Math.max(0, Math.min(1, t2));
      results.push({ x: x1 + t2 * dx, y: y1 + t2 * dy });
    }
    return results;
  }

  // --- Tension Crack Depth ---
  // Zc = 2c / (γ √Ka) where Ka = tan²(45° - φ/2)
  Geo.tensionCrackDepth = function (c, phi, gamma) {
    if (c <= 0 || gamma <= 0) return 0;
    var phiRad = phi * DEG;
    var Ka = Math.pow(Math.tan(Math.PI / 4 - phiRad / 2), 2);
    if (Ka <= 0) return 0;
    var Zc = (2 * c) / (gamma * Math.sqrt(Ka));
    return Zc;
  };

  // --- Generate Slices ---
  Geo.generateSlices = function (profile, cx, cy, r, numSlices, waterTableY, gamma, c, phi) {
    var ints = Geo.circleIntersections(profile, cx, cy, r);
    if (!ints) return null;

    var entryX = ints.entry.x;
    var exitX = ints.exit.x;
    var totalWidth = exitX - entryX;
    var b = totalWidth / numSlices; // slice width

    // Tension crack
    var Zc = Geo.tensionCrackDepth(c, phi, gamma);
    var crackY = profile.H - Zc; // Y level below which crack exists

    var slices = [];
    for (var i = 0; i < numSlices; i++) {
      var xLeft = entryX + i * b;
      var xRight = xLeft + b;
      var xMid = xLeft + b / 2;

      // Top of slice: slope surface
      var yTop = Geo.surfaceY(profile, xMid);

      // Bottom of slice: circle arc
      var dx = xMid - cx;
      var discr = r * r - dx * dx;
      if (discr < 0) continue; // slice center outside circle
      var yBottom = cy - Math.sqrt(discr);

      // Skip slices with negligible height
      var height = yTop - yBottom;
      if (height < 0.01) continue;

      // Tension crack: if base is in crack zone, skip this slice
      if (Zc > 0 && yBottom > crackY && yBottom > yTop - 0.5) continue;

      // Base angle α: sin(α) = (xMid - cx) / r
      var sinAlpha = (xMid - cx) / r;
      sinAlpha = Math.max(-1, Math.min(1, sinAlpha));
      var alpha = Math.asin(sinAlpha);
      var cosAlpha = Math.cos(alpha);

      // Base length
      var baseLength = b / cosAlpha;
      if (!isFinite(baseLength) || baseLength <= 0) baseLength = b;

      // Area (approximate as trapezoid)
      var yTopLeft = Geo.surfaceY(profile, xLeft);
      var yTopRight = Geo.surfaceY(profile, xRight);
      var dxL = xLeft - cx;
      var dxR = xRight - cx;
      var discrL = r * r - dxL * dxL;
      var discrR = r * r - dxR * dxR;
      var yBotLeft = discrL >= 0 ? cy - Math.sqrt(discrL) : yBottom;
      var yBotRight = discrR >= 0 ? cy - Math.sqrt(discrR) : yBottom;
      var hLeft = Math.max(0, yTopLeft - yBotLeft);
      var hRight = Math.max(0, yTopRight - yBotRight);
      var area = (hLeft + hRight) / 2 * b;

      // Weight
      var weight = gamma * area;

      // Pore pressure at base
      var hw = 0;
      if (waterTableY > yBottom) {
        hw = waterTableY - yBottom;
        // Check if water table exits through slope face
        var slopeYatMid = Geo.surfaceY(profile, xMid);
        if (waterTableY > slopeYatMid) {
          // Water seeps out — use cos²(slopeAngle) correction
          hw = slopeYatMid - yBottom;
          if (hw < 0) hw = 0;
        }
      }
      var porePressure = T.GAMMA_WATER * hw;

      slices.push({
        index: i,
        xLeft: xLeft,
        xRight: xRight,
        xMid: xMid,
        yTop: yTop,
        yBottom: yBottom,
        height: height,
        width: b,
        area: area,
        weight: weight,
        alpha: alpha / DEG, // degrees for display
        alphaRad: alpha,
        sinAlpha: sinAlpha,
        cosAlpha: cosAlpha,
        baseLength: baseLength,
        hw: hw,
        porePressure: porePressure,
        // Will be filled by calculations
        resistance: 0,
        shearForce: 0,
        mAlpha: 1,
        mAlphaWarning: false,
        contributionRatio: 1,
        // Geometry for rendering
        topLeft:  { x: xLeft,  y: yTopLeft },
        topRight: { x: xRight, y: yTopRight },
        botLeft:  { x: xLeft,  y: yBotLeft },
        botRight: { x: xRight, y: yBotRight }
      });
    }

    return slices.length > 0 ? slices : null;
  };

  // --- World Bounds for Canvas ---
  Geo.worldBounds = function (profile, cx, cy, r) {
    var pad = Math.max(profile.H * 0.3, 3);
    var minX = Math.min(-profile.extLeft, cx - r) - pad;
    var maxX = Math.max(profile.L + profile.extRight, cx + r) + pad;
    var minY = Math.min(cy - r, -pad);
    var maxY = Math.max(profile.H + pad, cy + r * 0.3);
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  };

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
