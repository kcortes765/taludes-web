/* =============================================
   TALUDES — Fellenius, Bishop, Analytical
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes = global.Taludes || {};
  var Calc = T.Calculations = {};

  var DEG = Math.PI / 180;

  // --- Fellenius (Ordinary Method of Slices) ---
  // FS = Σ[c·l + (W·cosα - u·l)·tanφ] / Σ[W·sinα]
  Calc.fellenius = function (slices, c, phiDeg) {
    // No shear strength at all
    if (c <= 0 && phiDeg <= 0) {
      var noStrengthDriving = 0;
      for (var k = 0; k < slices.length; k++) {
        slices[k].resistance = 0;
        slices[k].shearForce = slices[k].weight * slices[k].sinAlpha;
        slices[k].contributionRatio = 0;
        noStrengthDriving += slices[k].shearForce;
      }
      return { fs: 0, converged: true, iterations: 0, sumResisting: 0, sumDriving: noStrengthDriving, noStrength: true };
    }
    var tanPhi = Math.tan(phiDeg * DEG);
    var sumResisting = 0;
    var sumDriving = 0;

    for (var i = 0; i < slices.length; i++) {
      var s = slices[i];
      var Ncl = s.weight * s.cosAlpha - s.porePressure * s.baseLength;
      if (Ncl < 0) Ncl = 0; // no tension

      var resistance = c * s.baseLength + Ncl * tanPhi;
      var driving = s.weight * s.sinAlpha;

      s.resistance = resistance;
      s.shearForce = driving;

      sumResisting += resistance;
      sumDriving += driving;
    }

    if (sumDriving <= 0) return { fs: NaN, converged: false, iterations: 0 };

    var fs = sumResisting / sumDriving;

    // Compute contribution ratios
    for (var j = 0; j < slices.length; j++) {
      var sf = Math.abs(slices[j].shearForce);
      slices[j].contributionRatio = sf > 0.001 ? slices[j].resistance / sf : 2.0;
    }

    return {
      fs: Math.max(0, fs),
      converged: true,
      iterations: 0,
      sumResisting: sumResisting,
      sumDriving: sumDriving
    };
  };

  // --- Bishop Simplified ---
  // FS = Σ[(c·b + (W - u·b)·tanφ) / mα] / Σ[W·sinα]
  // mα = cosα + sinα·tanφ/FS
  // Iterative
  Calc.bishop = function (slices, c, phiDeg) {
    // No shear strength at all
    if (c <= 0 && phiDeg <= 0) {
      return Calc.fellenius(slices, c, phiDeg);
    }
    var tanPhi = Math.tan(phiDeg * DEG);
    var maxIter = T.BISHOP_MAX_ITER;
    var tol = T.BISHOP_TOLERANCE;
    var relax = T.BISHOP_RELAXATION;
    var mAlphaMin = T.MALPHA_MIN;

    // Sum of W·sinα (constant)
    var sumDriving = 0;
    for (var i = 0; i < slices.length; i++) {
      sumDriving += slices[i].weight * slices[i].sinAlpha;
    }
    if (sumDriving <= 0) return { fs: NaN, converged: false, iterations: 0 };

    // Initial guess from Fellenius
    var fellResult = Calc.fellenius(slices, c, phiDeg);
    var currentFS = Math.max(0.5, fellResult.fs);
    var converged = false;
    var iter;

    for (iter = 0; iter < maxIter; iter++) {
      var sumNumerator = 0;
      var anyWarning = false;

      for (i = 0; i < slices.length; i++) {
        var s = slices[i];
        var mAlpha = s.cosAlpha + (s.sinAlpha * tanPhi) / Math.max(Number.EPSILON, currentFS);

        s.mAlphaWarning = false;
        if (mAlpha < mAlphaMin) {
          mAlpha = mAlphaMin;
          s.mAlphaWarning = true;
          anyWarning = true;
        }
        s.mAlpha = mAlpha;

        var term = (c * s.width + (s.weight - s.porePressure * s.width) * tanPhi) / mAlpha;
        sumNumerator += term;
      }

      var newFS = sumNumerator / sumDriving;
      newFS = Math.max(0, newFS);

      // Check convergence
      if (Math.abs(newFS - currentFS) < tol) {
        currentFS = newFS;
        converged = true;
        iter++;
        break;
      }

      // Sub-relaxation to prevent oscillation
      if (iter > 20) {
        currentFS = relax * currentFS + (1 - relax) * newFS;
      } else {
        currentFS = newFS;
      }
    }

    // Final pass to compute per-slice resistance and contribution
    for (i = 0; i < slices.length; i++) {
      var sl = slices[i];
      var mA = sl.cosAlpha + (sl.sinAlpha * tanPhi) / Math.max(Number.EPSILON, currentFS);
      sl.mAlphaWarning = mA < mAlphaMin;
      if (sl.mAlphaWarning) mA = mAlphaMin;
      sl.mAlpha = mA;
      sl.resistance = (c * sl.width + (sl.weight - sl.porePressure * sl.width) * tanPhi) / mA;
      sl.shearForce = sl.weight * sl.sinAlpha;
      var sf = Math.abs(sl.shearForce);
      sl.contributionRatio = sf > 0.001 ? sl.resistance / sf : 2.0;
    }

    return {
      fs: Math.max(0, currentFS),
      converged: converged,
      iterations: iter,
      sumDriving: sumDriving,
      mAlphaWarning: slices.some(function(s) { return s.mAlphaWarning; })
    };
  };

  // --- Analytical FS for c=0 (infinite slope) ---
  // FS = tan(φ) / tan(β)
  Calc.analyticalGranular = function (phiDeg, betaDeg) {
    var tanPhi = Math.tan(phiDeg * DEG);
    var tanBeta = Math.tan(betaDeg * DEG);
    if (tanBeta < 0.001) return 99.99;
    return tanPhi / tanBeta;
  };

  // --- Full Analysis ---
  // Runs geometry + chosen method, returns complete results
  Calc.analyze = function (params) {
    function invalid(message, profile, circle) {
      return { valid: false, error: message, fs: null, slices: null,
        profile: profile || null, circle: circle || null, converged: false };
    }
    if (!params || !['height', 'slopeAngle', 'gamma', 'cohesion', 'friction', 'waterTable', 'numSlices'].every(function (key) {
      return Number.isFinite(params[key]);
    }) || params.height <= 0 || params.gamma <= 0 || params.slopeAngle <= 0 ||
      params.slopeAngle >= 90 || params.cohesion < 0 || params.friction < 0 ||
      params.friction >= 90 || !Number.isInteger(params.numSlices) ||
      params.numSlices < 1 || params.numSlices > 1000 ||
      (params.method != null && params.method !== 'bishop' && params.method !== 'fellenius')) {
      return invalid('Parámetros no válidos. Revisar valores, unidades y número de dovelas.');
    }
    var profile = T.Geometry.slopeProfile(params.height, params.slopeAngle);

    // Circle position
    var cx = params.circleX;
    var cy = params.circleY;
    var r  = params.circleR;
    if (cx == null || cy == null || r == null) {
      var def = T.Geometry.defaultCircle(params.height, params.slopeAngle);
      cx = cx != null ? cx : def.cx;
      cy = cy != null ? cy : def.cy;
      r  = r  != null ? r  : def.r;
    }

    if (![cx, cy, r].every(Number.isFinite) || r <= 0) {
      return invalid('Centro o radio del círculo no válido.', profile);
    }

    // Effective parameters (undrained mode: φ=0, ignore water)
    var cohesion = params.cohesion;
    var friction = params.drainedMode === false ? 0 : params.friction;
    var waterTable = params.drainedMode === false ? 0 : params.waterTable;

    // Generate slices
    var slices = T.Geometry.generateSlices(
      profile, cx, cy, r, params.numSlices,
      waterTable, params.gamma, cohesion, friction
    );

    if (!slices || slices.length === 0) {
      return {
        valid: false,
        error: 'Círculo sin intersección válida. Ajustar centro o radio.',
        profile: profile,
        circle: { cx: cx, cy: cy, r: r },
        fs: null,
        slices: null
      };
    }

    var driving = slices.reduce(function (sum, s) { return sum + s.weight * s.sinAlpha; }, 0);
    var totalWeight = slices.reduce(function (sum, s) { return sum + s.weight; }, 0);
    if (driving <= 1e-12 * Math.max(1, totalWeight)) {
      return invalid('Superficie sin momento deslizante en la dirección analizada.', profile, { cx: cx, cy: cy, r: r });
    }

    // Calculate FS
    var result;
    if (params.method === 'fellenius') {
      result = Calc.fellenius(slices, cohesion, friction);
    } else {
      result = Calc.bishop(slices, cohesion, friction);
    }

    if (!Number.isFinite(result.fs)) {
      return invalid('El cálculo no produjo un factor de seguridad finito.', profile, { cx: cx, cy: cy, r: r });
    }

    // Analytical FS for c≈0
    var analyticalFS = null;
    if (cohesion < 0.5) {
      analyticalFS = Calc.analyticalGranular(friction, params.slopeAngle);
    }

    // Tension crack info
    var tensionCrack = T.Geometry.tensionCrackDepth(cohesion, friction, params.gamma);

    return {
      valid: true,
      profile: profile,
      circle: { cx: cx, cy: cy, r: r },
      slices: slices,
      fs: result.fs,
      method: params.method,
      converged: result.converged,
      iterations: result.iterations || 0,
      mAlphaWarning: result.mAlphaWarning || false,
      sumResisting: result.sumResisting,
      sumDriving: result.sumDriving,
      analyticalFS: analyticalFS,
      tensionCrackDepth: tensionCrack,
      waterTable: waterTable,
      numSlicesValid: slices.length,
      params: {
        height: params.height,
        slopeAngle: params.slopeAngle,
        gamma: params.gamma,
        cohesion: cohesion,
        friction: friction,
        waterTable: waterTable,
        numSlices: params.numSlices
      }
    };
  };

  // --- Dual Analysis (for comparison mode) ---
  Calc.analyzeBoth = function (params) {
    var p1 = Object.assign({}, params, { method: 'fellenius' });
    var p2 = Object.assign({}, params, { method: 'bishop' });
    return {
      fellenius: Calc.analyze(p1),
      bishop: Calc.analyze(p2)
    };
  };

  // --- Critical Circle Search ---
  // Grid search for minimum FS
  Calc.findCriticalCircle = function (params, onProgress) {
    var H = params.height;
    var beta = params.slopeAngle * DEG;
    var L = H / Math.tan(beta);
    var grid = T.SEARCH_GRID;

    // Search ranges
    var xMin = -H * grid.xPadding;
    var xMax = L + H * grid.xPadding;
    var yMin = H * grid.yMin;
    var yMax = H * grid.yMax;
    var rMin = H * grid.rMin;
    var rMax = H * grid.rMax;

    var xStep = (xMax - xMin) / grid.xSteps;
    var yStep = (yMax - yMin) / grid.ySteps;
    var rStep = (rMax - rMin) / grid.rSteps;

    var bestFS = Infinity;
    var bestConfig = null;
    var tried = 0;
    var total = (grid.xSteps + 1) * (grid.ySteps + 1) * (grid.rSteps + 1);
    var candidates = [];

    for (var xi = 0; xi <= grid.xSteps; xi++) {
      for (var yi = 0; yi <= grid.ySteps; yi++) {
        for (var ri = 0; ri <= grid.rSteps; ri++) {
          var cx = xMin + xi * xStep;
          var cy = yMin + yi * yStep;
          var r  = rMin + ri * rStep;

          tried++;

          var testParams = Object.assign({}, params, {
            circleX: cx, circleY: cy, circleR: r
          });
          var result = Calc.analyze(testParams);

          if (result.valid && result.converged && !result.mAlphaWarning && Number.isFinite(result.fs) && result.fs >= 0) {
            candidates.push({ cx: cx, cy: cy, r: r, fs: result.fs });
            if (result.fs < bestFS) {
              bestFS = result.fs;
              bestConfig = { cx: cx, cy: cy, r: r };
            }
          }

          if (onProgress && tried % 100 === 0) {
            onProgress({ tried: tried, total: total, bestFS: bestFS });
          }
        }
      }
    }

    // Refine: grid search around best result
    if (bestConfig) {
      var refineRange = Math.max(xStep, yStep, rStep) * 1.5;
      var refineCenter = Object.assign({}, bestConfig);
      var refineSteps = 5;
      var rfs = refineRange / refineSteps;

      for (xi = -refineSteps; xi <= refineSteps; xi++) {
        for (yi = -refineSteps; yi <= refineSteps; yi++) {
          for (ri = -refineSteps; ri <= refineSteps; ri++) {
            cx = refineCenter.cx + xi * rfs;
            cy = refineCenter.cy + yi * rfs;
            r  = refineCenter.r  + ri * rfs;
            if (r < 1) continue;

            var tp = Object.assign({}, params, {
              circleX: cx, circleY: cy, circleR: r
            });
            var res = Calc.analyze(tp);
            tried++;

            if (res.valid && res.converged && !res.mAlphaWarning && Number.isFinite(res.fs) && res.fs >= 0 && res.fs < bestFS) {
              bestFS = res.fs;
              bestConfig = { cx: cx, cy: cy, r: r };
            }
          }
        }
      }
    }

    // Sort candidates for animation
    candidates.sort(function (a, b) { return a.fs - b.fs; });
    var topCandidates = candidates.slice(0, 20);

    return {
      bestConfig: bestConfig,
      bestFS: bestFS,
      tried: tried,
      candidates: topCandidates
    };
  };

  // --- Sensitivity Analysis ---
  Calc.sensitivitySweep = function (params, paramName, steps) {
    steps = steps || 20;
    var range = T.RANGES[paramName];
    if (!range) return [];

    var stepSize = (range.max - range.min) / steps;
    var results = [];

    for (var i = 0; i <= steps; i++) {
      var val = range.min + i * stepSize;
      var testParams = Object.assign({}, params);
      testParams[paramName] = val;

      // Recalculate circle for geometry changes
      if (paramName === 'height' || paramName === 'slopeAngle') {
        var def = T.Geometry.defaultCircle(testParams.height, testParams.slopeAngle);
        testParams.circleX = def.cx;
        testParams.circleY = def.cy;
        testParams.circleR = def.r;
      }

      var result = Calc.analyze(testParams);
      results.push({
        value: val,
        fs: result.valid ? result.fs : null,
        valid: result.valid
      });
    }

    return results;
  };

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
