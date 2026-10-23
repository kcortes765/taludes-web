/* =============================================
   TALUDES — Canvas Renderer
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes = global.Taludes || {};
  var Renderer = T.Renderer = {};
  var COLORS = T.COLORS;

  var _canvas, _ctx, _container;
  var _transform = null;
  var _needsRender = true;
  var _lastResult = null;
  var _hoveredSlice = -1;
  var _ghostCircles = [];
  var _animating = false;
  var _isDark = false;

  Renderer.init = function (canvasEl, containerEl) {
    _canvas = canvasEl;
    _ctx = canvasEl.getContext('2d');
    _container = containerEl;

    Renderer.resize();
    var ro = new ResizeObserver(function () { Renderer.resize(); });
    ro.observe(_container);

    requestAnimationFrame(renderLoop);
  };

  Renderer.resize = function () {
    var rect = _container.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    _canvas.width = rect.width * dpr;
    _canvas.height = rect.height * dpr;
    _canvas.style.width = rect.width + 'px';
    _canvas.style.height = rect.height + 'px';
    _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _transform = null;
    _needsRender = true;
  };

  Renderer.setDark = function (dark) {
    _isDark = dark;
    _needsRender = true;
  };

  Renderer.setResult = function (result) {
    _lastResult = result;
    _needsRender = true;
  };

  Renderer.setHoveredSlice = function (idx) {
    if (_hoveredSlice !== idx) {
      _hoveredSlice = idx;
      _needsRender = true;
    }
  };

  Renderer.setGhostCircles = function (circles) {
    _ghostCircles = circles || [];
    _needsRender = true;
  };

  Renderer.requestRender = function () {
    _needsRender = true;
  };

  // --- Coordinate Transform ---
  function computeTransform(bounds) {
    var cw = _canvas.width / (window.devicePixelRatio || 1);
    var ch = _canvas.height / (window.devicePixelRatio || 1);

    var pad = 20;
    var ww = bounds.maxX - bounds.minX;
    var wh = bounds.maxY - bounds.minY;
    var scaleX = (cw - pad * 2) / ww;
    var scaleY = (ch - pad * 2) / wh;
    var scale = Math.min(scaleX, scaleY);
    var ox = pad + ((cw - pad * 2) - ww * scale) / 2;
    var oy = pad + ((ch - pad * 2) - wh * scale) / 2;
    return {
      scale: scale,
      ox: ox, oy: oy,
      minX: bounds.minX, maxY: bounds.maxY,
      cw: cw, ch: ch
    };
  }

  function w2c(tx, wx, wy) {
    return {
      x: tx.ox + (wx - tx.minX) * tx.scale,
      y: tx.oy + (tx.maxY - wy) * tx.scale
    };
  }

  function c2w(tx, cx, cy) {
    return {
      x: tx.minX + (cx - tx.ox) / tx.scale,
      y: tx.maxY - (cy - tx.oy) / tx.scale
    };
  }

  Renderer.canvasToWorld = function (px, py) {
    if (!_transform) return { x: 0, y: 0 };
    return c2w(_transform, px, py);
  };

  Renderer.worldToCanvas = function (wx, wy) {
    if (!_transform) return { x: 0, y: 0 };
    return w2c(_transform, wx, wy);
  };

  Renderer.getTransform = function () { return _transform; };

  // --- Render Loop ---
  function renderLoop() {
    if (_needsRender) {
      render();
      _needsRender = false;
    }
    requestAnimationFrame(renderLoop);
  }

  function render() {
    if (!_lastResult) return;
    var res = _lastResult;
    var cw = _canvas.width / (window.devicePixelRatio || 1);
    var ch = _canvas.height / (window.devicePixelRatio || 1);

    if (!res.profile || !res.circle || ![res.circle.cx, res.circle.cy, res.circle.r].every(Number.isFinite)) {
      _ctx.clearRect(0, 0, cw, ch);
      _transform = null;
      return;
    }

    // Compute bounds & transform
    var bounds = T.Geometry.worldBounds(res.profile, res.circle.cx, res.circle.cy, res.circle.r);
    _transform = computeTransform(bounds);
    var tx = _transform;

    // Clear
    _ctx.clearRect(0, 0, cw, ch);

    // Sky gradient
    var skyGrad = _ctx.createLinearGradient(0, 0, 0, ch);
    skyGrad.addColorStop(0, _isDark ? COLORS.skyDarkTop : COLORS.skyTop);
    skyGrad.addColorStop(1, _isDark ? COLORS.skyDarkBottom : COLORS.skyBottom);
    _ctx.fillStyle = skyGrad;
    _ctx.fillRect(0, 0, cw, ch);

    // Grid dots
    drawGrid(tx, cw, ch);

    // Water table (behind soil)
    if (res.waterTable > 0) drawWater(tx, res);

    // Soil mass
    drawSoil(tx, res);

    // Failure circle
    drawFailureCircle(tx, res);

    // Ghost circles (search animation)
    if (_ghostCircles.length > 0) drawGhostCircles(tx, res);

    // Slices
    if (res.slices) drawSlices(tx, res);

    // Circle center mark
    drawCenter(tx, res.circle.cx, res.circle.cy);

    // Scale bar
    drawScaleBar(tx, cw, ch);

    // Mouse coordinates (drawn by interaction handler)
  }

  // --- Drawing Functions ---

  function drawGrid(tx, cw, ch) {
    var gridColor = _isDark ? COLORS.gridDark : COLORS.grid;
    _ctx.fillStyle = gridColor;
    // Determine grid spacing (1m, 2m, 5m depending on zoom)
    var pixPerMeter = tx.scale;
    var spacing = 1;
    if (pixPerMeter < 8) spacing = 5;
    else if (pixPerMeter < 20) spacing = 2;

    var startX = Math.floor(tx.minX / spacing) * spacing;
    var endX = tx.minX + cw / tx.scale;
    var startY = Math.floor((tx.maxY - ch / tx.scale) / spacing) * spacing;
    var endY = tx.maxY;

    for (var x = startX; x <= endX; x += spacing) {
      for (var y = startY; y <= endY; y += spacing) {
        var p = w2c(tx, x, y);
        _ctx.beginPath();
        _ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
        _ctx.fill();
      }
    }
  }

  function drawSoil(tx, res) {
    var profile = res.profile;
    var pts = profile.points;
    _ctx.beginPath();
    // Soil polygon: profile top, then drop down, go left, go up
    var first = w2c(tx, pts[0].x, pts[0].y);
    _ctx.moveTo(first.x, first.y);
    for (var i = 1; i < pts.length; i++) {
      var p = w2c(tx, pts[i].x, pts[i].y);
      _ctx.lineTo(p.x, p.y);
    }
    // Close downward (deep underground)
    var deepY = w2c(tx, 0, res.circle.cy - res.circle.r - 5).y;
    var lastPt = w2c(tx, pts[pts.length - 1].x, pts[pts.length - 1].y);
    _ctx.lineTo(lastPt.x, deepY);
    _ctx.lineTo(first.x, deepY);
    _ctx.closePath();
    _ctx.fillStyle = _isDark ? COLORS.soilDark : COLORS.soil;
    _ctx.fill();
    _ctx.strokeStyle = _isDark ? COLORS.soilDarkBorder : COLORS.soilBorder;
    _ctx.lineWidth = 2;
    _ctx.stroke();
  }

  function drawWater(tx, res) {
    var wt = res.waterTable;
    if (wt <= 0) return;
    var profile = res.profile;
    var H = profile.H;
    var L = profile.L;

    // Water level line
    _ctx.save();
    _ctx.setLineDash([6, 4]);
    _ctx.strokeStyle = COLORS.waterLine;
    _ctx.lineWidth = 1.5;

    // Water intersects slope face at some point
    var waterSlopeX = (wt / H) * L;
    if (wt > H) waterSlopeX = L;

    var leftX = Math.min(-profile.extLeft, waterSlopeX - 2);
    var rightX = wt >= H ? L + profile.extRight : waterSlopeX;

    var pL = w2c(tx, leftX, wt);
    var pR = w2c(tx, rightX, wt);
    _ctx.beginPath();
    _ctx.moveTo(pL.x, pL.y);
    _ctx.lineTo(pR.x, pR.y);

    // If water intersects slope face, draw down the face
    if (wt < H && wt > 0) {
      // Water surface meets slope face
    }

    _ctx.stroke();
    _ctx.setLineDash([]);

    // Water fill (semi-transparent area below water line inside soil)
    _ctx.fillStyle = COLORS.waterFill;
    _ctx.beginPath();

    // Left edge at water level
    _ctx.moveTo(pL.x, pL.y);
    _ctx.lineTo(pR.x, pR.y);

    // Down along slope face or vertical
    if (wt < H) {
      var pSlope = w2c(tx, waterSlopeX, wt);
      _ctx.lineTo(pSlope.x, pSlope.y);
    }

    // Down to ground level
    var pToe = w2c(tx, 0, 0);
    _ctx.lineTo(pToe.x, pToe.y);
    var pLeft = w2c(tx, leftX, 0);
    _ctx.lineTo(pLeft.x, pLeft.y);
    _ctx.lineTo(pL.x, pL.y);
    _ctx.closePath();
    _ctx.fill();

    _ctx.restore();
  }

  function drawFailureCircle(tx, res) {
    var fs = res.fs;
    var cx = res.circle.cx;
    var cy = res.circle.cy;
    var r = res.circle.r;

    var centerCanvas = w2c(tx, cx, cy);
    var rCanvas = r * tx.scale;

    _ctx.save();
    if (fs === null || fs === undefined) {
      _ctx.strokeStyle = '#999';
      _ctx.setLineDash([5, 5]);
      _ctx.lineWidth = 1;
    } else if (fs >= T.FS_STABLE) {
      _ctx.strokeStyle = COLORS.circleSafe;
      _ctx.setLineDash([8, 6]);
      _ctx.lineWidth = 1.5;
    } else if (fs >= T.FS_CAUTION) {
      _ctx.strokeStyle = COLORS.circleCaution;
      _ctx.setLineDash([6, 4]);
      _ctx.lineWidth = 2;
    } else {
      _ctx.strokeStyle = COLORS.circleDanger;
      _ctx.setLineDash([]);
      _ctx.lineWidth = 3;
    }

    _ctx.beginPath();
    _ctx.arc(centerCanvas.x, centerCanvas.y, rCanvas, 0, Math.PI * 2);
    _ctx.stroke();

    // Fracture lines for FS < 1
    if (fs !== null && fs < T.FS_CAUTION) {
      drawFractureLines(tx, res);
    }

    _ctx.restore();
  }

  function drawFractureLines(tx, res) {
    var ints = T.Geometry.circleIntersections(res.profile, res.circle.cx, res.circle.cy, res.circle.r);
    if (!ints) return;
    _ctx.strokeStyle = 'rgba(220,53,69,0.4)';
    _ctx.lineWidth = 1;
    _ctx.setLineDash([]);
    var cx = res.circle.cx;
    var cy = res.circle.cy;
    var r = res.circle.r;
    var numLines = 8;
    var entryAngle = Math.atan2(cy - ints.entry.y, ints.entry.x - cx);
    var exitAngle = Math.atan2(cy - ints.exit.y, ints.exit.x - cx);

    for (var i = 0; i < numLines; i++) {
      var t = (i + 0.5) / numLines;
      var angle = entryAngle + t * (exitAngle - entryAngle);
      var px = cx + r * Math.cos(angle);
      var py = cy - r * Math.sin(angle);
      var p = w2c(tx, px, py);
      var len = 4 + Math.random() * 6;
      var dir = angle + (Math.random() - 0.5) * 0.5;
      _ctx.beginPath();
      _ctx.moveTo(p.x, p.y);
      _ctx.lineTo(p.x + Math.cos(dir) * len, p.y - Math.sin(dir) * len);
      _ctx.stroke();
    }
  }

  function drawGhostCircles(tx) {
    _ctx.save();
    for (var i = 0; i < _ghostCircles.length; i++) {
      var gc = _ghostCircles[i];
      var p = w2c(tx, gc.cx, gc.cy);
      var rr = gc.r * tx.scale;
      var alpha = gc.opacity || 0.15;
      var color = gc.fs < 1.0 ? '220,53,69' : (gc.fs < 1.5 ? '230,126,34' : '100,100,100');
      _ctx.strokeStyle = 'rgba(' + color + ',' + alpha + ')';
      _ctx.lineWidth = 1;
      _ctx.setLineDash([4, 4]);
      _ctx.beginPath();
      _ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      _ctx.stroke();

      // FS label
      if (gc.showFS) {
        _ctx.fillStyle = 'rgba(' + color + ',' + (alpha + 0.2) + ')';
        _ctx.font = '10px monospace';
        _ctx.fillText(gc.fs.toFixed(2), p.x - 12, p.y - rr - 4);
      }
    }
    _ctx.setLineDash([]);
    _ctx.restore();
  }

  function drawSlices(tx, res) {
    var slices = res.slices;
    if (!slices) return;

    for (var i = 0; i < slices.length; i++) {
      var s = slices[i];
      var isHovered = (i === _hoveredSlice);

      // Color based on contribution ratio
      var ratio = s.contributionRatio;
      var color;
      if (ratio > 1.2) {
        // Good (blue) - interpolate intensity
        var t = Math.min((ratio - 1.2) / 1.0, 1);
        color = lerpColor(COLORS.sliceNeutral, COLORS.sliceGood, t);
      } else if (ratio < 0.8) {
        var t2 = Math.min((0.8 - ratio) / 0.6, 1);
        color = lerpColor(COLORS.sliceNeutral, COLORS.sliceBad, t2);
      } else {
        color = COLORS.sliceNeutral;
      }

      // Draw slice polygon
      var tl = w2c(tx, s.topLeft.x, s.topLeft.y);
      var tr = w2c(tx, s.topRight.x, s.topRight.y);
      var br = w2c(tx, s.botRight.x, s.botRight.y);
      var bl = w2c(tx, s.botLeft.x, s.botLeft.y);

      _ctx.beginPath();
      _ctx.moveTo(tl.x, tl.y);
      _ctx.lineTo(tr.x, tr.y);
      _ctx.lineTo(br.x, br.y);
      _ctx.lineTo(bl.x, bl.y);
      _ctx.closePath();

      var alpha = isHovered ? 0.85 : 0.6;
      _ctx.fillStyle = hexToRgba(color, alpha);
      _ctx.fill();

      // Border
      _ctx.strokeStyle = isHovered ? '#333' : 'rgba(0,0,0,0.3)';
      _ctx.lineWidth = isHovered ? 2 : 0.5;
      _ctx.stroke();

      // Water pattern for submerged slices
      if (s.hw > 0 && s.hw > s.height * 0.1) {
        drawWaterPattern(tx, s, tl, tr, br, bl);
      }

      // Critical slice (worst ratio) — pulsing border
      if (res.slices.length > 1) {
        var worst = res.slices.reduce(function (a, b) {
          return a.contributionRatio < b.contributionRatio ? a : b;
        });
        if (s === worst && !isHovered) {
          _ctx.strokeStyle = COLORS.circleDanger;
          _ctx.lineWidth = 2;
          _ctx.setLineDash([3, 3]);
          _ctx.stroke();
          _ctx.setLineDash([]);
        }
      }
    }
  }

  function drawWaterPattern(tx, s, tl, tr, br, bl) {
    _ctx.save();
    _ctx.strokeStyle = 'rgba(91,155,213,0.3)';
    _ctx.lineWidth = 0.5;
    // Horizontal lines inside the slice (water zone)
    var waterTopY = Math.max(tl.y, tr.y); // canvas Y of top of water in slice
    var steps = 3;
    for (var j = 1; j <= steps; j++) {
      var frac = j / (steps + 1);
      var y = waterTopY + (Math.max(bl.y, br.y) - waterTopY) * frac;
      _ctx.beginPath();
      // Lerp x positions
      var xL = bl.x + (tl.x - bl.x) * (1 - frac);
      var xR = br.x + (tr.x - br.x) * (1 - frac);
      _ctx.moveTo(xL, y);
      _ctx.lineTo(xR, y);
      _ctx.stroke();
    }
    _ctx.restore();
  }

  function drawCenter(tx, cx, cy) {
    var p = w2c(tx, cx, cy);
    var size = 8;
    _ctx.save();
    _ctx.strokeStyle = _isDark ? '#ccc' : COLORS.center;
    _ctx.lineWidth = 1.5;
    // Crosshair
    _ctx.beginPath();
    _ctx.moveTo(p.x - size, p.y);
    _ctx.lineTo(p.x + size, p.y);
    _ctx.moveTo(p.x, p.y - size);
    _ctx.lineTo(p.x, p.y + size);
    _ctx.stroke();
    // Small circle
    _ctx.beginPath();
    _ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    _ctx.stroke();
    _ctx.restore();
  }

  function drawScaleBar(tx, cw, ch) {
    // Determine a nice scale length
    var pixPerMeter = tx.scale;
    var targetPx = 80;
    var meters = targetPx / pixPerMeter;
    // Round to nice number
    var nice = [1, 2, 5, 10, 20, 50];
    var best = nice[0];
    for (var i = 0; i < nice.length; i++) {
      if (Math.abs(nice[i] - meters) < Math.abs(best - meters)) best = nice[i];
    }
    var barPx = best * pixPerMeter;

    var x = 15;
    var y = ch - 15;
    _ctx.save();
    _ctx.strokeStyle = _isDark ? '#aaa' : '#555';
    _ctx.fillStyle = _isDark ? '#aaa' : '#555';
    _ctx.lineWidth = 2;
    _ctx.beginPath();
    _ctx.moveTo(x, y);
    _ctx.lineTo(x + barPx, y);
    // End ticks
    _ctx.moveTo(x, y - 4);
    _ctx.lineTo(x, y + 4);
    _ctx.moveTo(x + barPx, y - 4);
    _ctx.lineTo(x + barPx, y + 4);
    _ctx.stroke();
    _ctx.font = '11px system-ui, sans-serif';
    _ctx.textAlign = 'center';
    _ctx.fillText(best + ' m', x + barPx / 2, y - 8);
    _ctx.restore();
  }

  // Draw mouse coordinates on canvas
  Renderer.drawMouseCoords = function (wx, wy) {
    if (!_transform) return;
    var cw = _transform.cw;
    var ch = _transform.ch;
    _ctx.save();
    _ctx.fillStyle = _isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)';
    _ctx.fillRect(cw - 135, ch - 30, 130, 25);
    _ctx.fillStyle = _isDark ? '#ccc' : '#444';
    _ctx.font = '11px monospace';
    _ctx.textAlign = 'right';
    _ctx.fillText('X: ' + wx.toFixed(1) + 'm  Y: ' + wy.toFixed(1) + 'm', cw - 10, ch - 13);
    _ctx.restore();
  };

  // --- Hit Testing ---
  Renderer.hitTestSlice = function (wx, wy) {
    if (!_lastResult || !_lastResult.slices) return -1;
    var slices = _lastResult.slices;
    for (var i = 0; i < slices.length; i++) {
      var s = slices[i];
      if (wx >= s.xLeft && wx <= s.xRight) {
        var yTop = T.Geometry.surfaceY(_lastResult.profile, wx);
        var dx = wx - _lastResult.circle.cx;
        var disc = _lastResult.circle.r * _lastResult.circle.r - dx * dx;
        var yBot = disc >= 0 ? _lastResult.circle.cy - Math.sqrt(disc) : -999;
        if (wy >= yBot && wy <= yTop) return i;
      }
    }
    return -1;
  };

  // --- Utility ---
  function hexToRgba(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function lerpColor(hex1, hex2, t) {
    var r1 = parseInt(hex1.slice(1, 3), 16);
    var g1 = parseInt(hex1.slice(3, 5), 16);
    var b1 = parseInt(hex1.slice(5, 7), 16);
    var r2 = parseInt(hex2.slice(1, 3), 16);
    var g2 = parseInt(hex2.slice(3, 5), 16);
    var b2 = parseInt(hex2.slice(5, 7), 16);
    var r = Math.round(r1 + (r2 - r1) * t);
    var g = Math.round(g1 + (g2 - g1) * t);
    var b = Math.round(b1 + (b2 - b1) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
