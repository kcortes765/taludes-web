/* =============================================
   TALUDES — Monte Carlo Probabilistic Analysis
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes = global.Taludes || {};
  var MC = T.MonteCarlo = {};

  var _isDark = false;
  var _cancelId = 0; // for cancelling in-flight runs
  var _lastResult = null;

  // Default uncertainties (σ as ratio of current value)
  MC.DEFAULT_SIGMA = {
    cohesion:   0.30,
    friction:   0.17,
    gamma:      0.06,
    waterTable: 0.50
  };

  var MIN_VALUES = {
    cohesion:   0,
    friction:   0,
    gamma:      10,
    waterTable: 0
  };

  var AUTO_SAMPLES = 2000;

  MC.setDark = function (dark) { _isDark = dark; };
  MC.getLastResult = function () { return _lastResult; };

  // --- Random sampling ---
  function randNormal(mean, sigma, random) {
    var u1 = Math.max(Number.MIN_VALUE, random());
    var u2 = random();
    return mean + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function randTruncNormal(mean, sigma, min, max, random) {
    if (!Number.isFinite(mean) || !Number.isFinite(sigma) || sigma < 0 || min > max) return NaN;
    if (sigma === 0) return mean >= min && mean <= max ? mean : NaN;
    random = random || Math.random;
    var closest = Math.max(min, Math.min(max, mean));
    var zClosest = (closest - mean) / sigma;
    for (var attempt = 0; attempt < 10000; attempt++) {
      if ((max - min) / sigma <= 2 || mean < min || mean > max) {
        // Rejection from a uniform proposal remains efficient for narrow bounds.
        var proposal = min + (max - min) * random();
        var z = (proposal - mean) / sigma;
        if (Math.log(Math.max(Number.MIN_VALUE, random())) <= -0.5 * (z * z - zClosest * zClosest)) return proposal;
      } else {
        var val = randNormal(mean, sigma, random);
        if (val >= min && val <= max) return val;
      }
    }
    return NaN; // A sampling failure must not become an artificial boundary value.
  }

  MC.sampleTruncatedNormal = randTruncNormal;

  function seededRandom(seed) {
    var state = seed >>> 0;
    return function () {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return (state + 0.5) / 4294967296;
    };
  }

  // Compute default sigmas from current param values
  MC.computeSigmas = function (params) {
    return {
      cohesion:   Math.max(0.5, params.cohesion * MC.DEFAULT_SIGMA.cohesion),
      friction:   Math.max(0.5, params.friction * MC.DEFAULT_SIGMA.friction),
      gamma:      Math.max(0.3, params.gamma * MC.DEFAULT_SIGMA.gamma),
      waterTable: Math.max(0.3, params.waterTable * MC.DEFAULT_SIGMA.waterTable)
    };
  };

  // --- Main run (chunked, cancellable) ---
  MC.run = function (baseParams, sigmas, nSamples, onDone, options) {
    _cancelId++;
    var myId = _cancelId;
    var results = [];
    var batchSize = 500;
    var idx = 0;
    var seed = options && Number.isInteger(options.seed) ? options.seed >>> 0 : 20261023;
    var random = seededRandom(seed);
    var rejected = 0;
    var inputError = !baseParams || !sigmas || !Number.isInteger(nSamples) || nSamples < 2 || nSamples > 50000 ||
      Object.keys(MC.DEFAULT_SIGMA).some(function (key) { return !Number.isFinite(sigmas[key]) || sigmas[key] < 0; });

    var fixed = {
      circleX: baseParams && baseParams.circleX,
      circleY: baseParams && baseParams.circleY,
      circleR: baseParams && baseParams.circleR
    };

    function processBatch() {
      if (myId !== _cancelId) return; // cancelled
      if (inputError) {
        var invalidStats = computeStats([]);
        _lastResult = { samples: [], stats: invalidStats, requested: nSamples, rejected: nSamples,
          reliable: false, seed: seed, error: 'Revisar incertidumbres y número de muestras (2 a 50.000).' };
        if (onDone) onDone(_lastResult);
        return;
      }

      var end = Math.min(idx + batchSize, nSamples);

      for (var i = idx; i < end; i++) {
        var p = {};
        for (var k in baseParams) p[k] = baseParams[k];

        if (sigmas.cohesion > 0) {
          p.cohesion = randTruncNormal(baseParams.cohesion, sigmas.cohesion, MIN_VALUES.cohesion, T.RANGES.cohesion.max, random);
        }
        if (sigmas.friction > 0) {
          p.friction = randTruncNormal(baseParams.friction, sigmas.friction, MIN_VALUES.friction, T.RANGES.friction.max, random);
        }
        if (sigmas.gamma > 0) {
          p.gamma = randTruncNormal(baseParams.gamma, sigmas.gamma, MIN_VALUES.gamma, T.RANGES.gamma.max, random);
        }
        if (sigmas.waterTable > 0) {
          var maxWT = baseParams.height || T.RANGES.waterTable.max;
          p.waterTable = randTruncNormal(baseParams.waterTable, sigmas.waterTable, MIN_VALUES.waterTable, maxWT, random);
        }

        p.circleX = fixed.circleX;
        p.circleY = fixed.circleY;
        p.circleR = fixed.circleR;

        var result = T.Calculations.analyze(p);
        if (result.valid && result.converged !== false && !result.mAlphaWarning && result.fs != null && Number.isFinite(result.fs)) {
          results.push(result.fs);
        } else rejected++;
      }

      idx = end;

      if (idx < nSamples) {
        setTimeout(processBatch, 0);
      } else {
        var stats = computeStats(results);
        var reliable = rejected === 0 && results.length >= 2;
        if (!reliable) {
          stats.pFailure = stats.pCaution = stats.beta = null;
          stats.pFailureLow = stats.pFailureHigh = null;
        }
        var mcResult = { samples: results, stats: stats, requested: nSamples, rejected: rejected,
          reliable: reliable, seed: seed };
        _lastResult = mcResult;
        if (onDone) onDone(mcResult);
      }
    }

    setTimeout(processBatch, 0);
  };

  // Cancel any in-flight run
  MC.cancel = function () { _cancelId++; };

  // Auto-run with default sigmas
  MC.autoRun = function (params, onDone) {
    var sigmas = MC.computeSigmas(params);
    MC.run(params, sigmas, AUTO_SAMPLES, onDone);
  };

  // --- Statistics ---
  function computeStats(samples) {
    if (samples.length === 0) {
      return { n: 0, mean: null, median: null, stdDev: null, pFailure: null, pCaution: null,
        min: null, max: null, beta: null, p5: null, p95: null, pFailureLow: null, pFailureHigh: null };
    }

    var n = samples.length;
    var sorted = samples.slice().sort(function (a, b) { return a - b; });

    var sum = 0, failCount = 0, cautionCount = 0;
    for (var i = 0; i < n; i++) {
      sum += sorted[i];
      if (sorted[i] < 1.0) failCount++;
      if (sorted[i] < 1.5) cautionCount++;
    }

    var mean = sum / n;
    var sqDiffSum = 0;
    for (var j = 0; j < n; j++) { var d = sorted[j] - mean; sqDiffSum += d * d; }
    var stdDev = n > 1 ? Math.sqrt(sqDiffSum / (n - 1)) : 0;

    var median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    if (sorted[0] === sorted[n - 1]) stdDev = 0;
    var beta = stdDev > 0 ? (mean - 1.0) / stdDev : null;

    // Wilson 95% interval for the empirical failure proportion.
    var z95 = 1.959963984540054;
    var proportion = failCount / n;
    var denom = 1 + z95 * z95 / n;
    var center = (proportion + z95 * z95 / (2 * n)) / denom;
    var half = z95 * Math.sqrt(proportion * (1 - proportion) / n + z95 * z95 / (4 * n * n)) / denom;
    return {
      n: n, mean: mean, median: median, stdDev: stdDev,
      pFailure: (failCount / n) * 100,
      pFailureLow: 100 * Math.max(0, center - half),
      pFailureHigh: 100 * Math.min(1, center + half),
      pCaution: (cautionCount / n) * 100,
      min: sorted[0], max: sorted[n - 1],
      beta: beta,
      p5: sorted[Math.floor(n * 0.05)],
      p95: sorted[Math.floor(n * 0.95)]
    };
  }

  // --- Render compact results (always-visible panel) ---
  MC.renderCompact = function (container, mcResult) {
    if (!mcResult || mcResult.samples.length === 0) {
      container.innerHTML = '<div class="mc-loading">Sin muestras válidas. Revisar geometría y parámetros.</div>';
      return;
    }
    if (mcResult.reliable === false || mcResult.rejected > 0) {
      container.innerHTML = '<div class="mc-loading">Análisis no concluyente: ' + mcResult.stats.n +
        ' muestras válidas de ' + mcResult.requested + '. No se estima P(falla). Revisar geometría y convergencia.</div>';
      return;
    }

    var stats = mcResult.stats;
    var html = '';

    // Top stats row — the key numbers
    html += '<div class="mc-top-stats">';
    html += '<div class="mc-top-stat">' +
      '<span class="mc-big-number" style="color:' + riskColor(stats.pFailure) + '">' + stats.pFailure.toFixed(1) + '%</span>' +
      '<span class="mc-big-label">P(falla)</span>' +
      '</div>';
    html += '<div class="mc-top-stat">' +
      '<span class="mc-big-number" style="color:' + betaColor(stats.beta) + '">' + (stats.beta == null ? '—' : stats.beta.toFixed(1)) + '</span>' +
       '<span class="mc-big-label">β por momentos</span>' +
      '</div>';
    html += '<div class="mc-top-stat">' +
      '<span class="mc-big-number" style="color:' + fsColor(stats.mean) + '">' + stats.mean.toFixed(2) + '</span>' +
      '<span class="mc-big-label">FS medio</span>' +
      '</div>';
    html += '</div>';

    // Risk label
    html += '<div class="mc-risk-badge" style="background:' + riskBg(stats.pFailure) + ';color:' + riskColor(stats.pFailure) + '">' +
      'Estimación para la superficie seleccionada</div>';
    html += '<div class="mc-details">IC 95% de P(falla): ' + stats.pFailureLow.toFixed(3) + '% a ' +
      stats.pFailureHigh.toFixed(3) + '% (Wilson). No representa la falla global del talud.</div>';

    // Canvas
    html += '<canvas id="mc-canvas" width="560" height="220"></canvas>';

    // Detail stats (collapsed by default)
    html += '<details class="mc-details"><summary>Detalle estadístico</summary>';
    html += '<div class="mc-stats-detail">';
    html += detailRow('Mediana', stats.median.toFixed(3));
    html += detailRow('Desv. Est. σ', stats.stdDev.toFixed(3));
    html += detailRow('P(FS<1.5)', stats.pCaution.toFixed(1) + '%');
    html += detailRow('Rango', stats.min.toFixed(2) + ' — ' + stats.max.toFixed(2));
    html += detailRow('Percentil 5%', stats.p5.toFixed(2));
    html += detailRow('Percentil 95%', stats.p95.toFixed(2));
    html += detailRow('Muestras válidas', stats.n.toString());
    html += detailRow('Semilla', String(mcResult.seed));
    html += '</div></details>';

    container.innerHTML = html;

    drawHistogram(document.getElementById('mc-canvas'), mcResult.samples, stats, _isDark);
  };

  function detailRow(label, value) {
    return '<div class="mc-detail-row"><span>' + label + '</span><span>' + value + '</span></div>';
  }

  // --- Config form (expandable) ---
  MC.renderConfig = function (container, params, onApply) {
    var sigmas = MC.computeSigmas(params);
    var fields = [
      { key: 'cohesion',   label: 'Cohesión c',    unit: 'kPa',   val: params.cohesion,   sigma: sigmas.cohesion },
      { key: 'friction',   label: 'Fricción φ',    unit: '°',     val: params.friction,   sigma: sigmas.friction },
      { key: 'gamma',      label: 'Peso unit. γ',  unit: 'kN/m³', val: params.gamma,      sigma: sigmas.gamma },
      { key: 'waterTable', label: 'Nivel freático', unit: 'm',     val: params.waterTable, sigma: sigmas.waterTable }
    ];

    var html = '<div class="mc-config-grid">';
    html += '<div class="mc-config-header"><span>Parámetro</span><span>Valor</span><span>± σ</span></div>';
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      html += '<div class="mc-config-row">' +
        '<span>' + f.label + '</span>' +
        '<span class="mc-param-val">' + f.val.toFixed(1) + ' ' + f.unit + '</span>' +
        '<input type="number" class="mc-sigma-input" data-key="' + f.key + '" value="' + f.sigma.toFixed(1) + '" min="0" step="0.1">' +
        '</div>';
    }
    html += '<div class="mc-config-row mc-samples-config">' +
      '<span>Muestras</span><span></span>' +
      '<input type="number" id="mc-nsamples" value="' + AUTO_SAMPLES + '" min="100" max="50000" step="100">' +
      '</div>';
    html += '</div>';
    html += '<button class="btn btn-sm mc-apply-btn" id="mc-apply-btn">Aplicar y recalcular</button>';

    container.innerHTML = html;

    document.getElementById('mc-apply-btn').addEventListener('click', function () {
      var customSigmas = {};
      var inputs = container.querySelectorAll('.mc-sigma-input');
      for (var j = 0; j < inputs.length; j++) {
        customSigmas[inputs[j].dataset.key] = parseFloat(inputs[j].value) || 0;
      }
      var nSamples = parseInt(document.getElementById('mc-nsamples').value) || AUTO_SAMPLES;
      if (onApply) onApply(customSigmas, Math.max(100, Math.min(50000, nSamples)));
    });
  };

  // --- Color helpers ---
  function riskColor(pf) {
    if (pf < 1) return 'var(--green)';
    if (pf < 10) return 'var(--yellow)';
    return 'var(--red)';
  }

  function riskBg(pf) {
    if (pf < 1) return 'rgba(39,174,96,0.12)';
    if (pf < 10) return 'rgba(243,156,18,0.12)';
    return 'rgba(231,76,60,0.12)';
  }

  function riskLabel(pf) {
    if (pf < 0.1) return 'Riesgo despreciable';
    if (pf < 1) return 'Riesgo bajo';
    if (pf < 10) return 'Riesgo moderado';
    if (pf < 30) return 'Riesgo alto';
    return 'Riesgo muy alto';
  }

  function fsColor(fs) {
    if (fs >= 1.5) return 'var(--green)';
    if (fs >= 1.0) return 'var(--yellow)';
    return 'var(--red)';
  }

  function betaColor(beta) {
    if (beta >= 3) return 'var(--green)';
    if (beta >= 1.5) return 'var(--yellow)';
    return 'var(--red)';
  }

  // --- Histogram ---
  function drawHistogram(canvas, samples, stats, isDark) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    var W = canvas.width / dpr;
    var H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var ml = 40, mr = 12, mt = 20, mb = 22;
    var pw = W - ml - mr;
    var ph = H - mt - mb;

    // Background
    ctx.fillStyle = isDark ? '#1a1a2e' : '#fafafa';
    ctx.fillRect(0, 0, W, H);

    // Bin data
    var nBins = Math.min(50, Math.max(20, Math.round(samples.length / 40)));
    var minFS = Math.max(0, stats.min - 0.15);
    var maxFS = stats.max + 0.15;
    if (minFS > 0.8) minFS = 0.8;
    if (maxFS < 2.0) maxFS = 2.0;
    var binW = (maxFS - minFS) / nBins;
    var bins = new Array(nBins).fill(0);

    for (var i = 0; i < samples.length; i++) {
      var bi = Math.floor((samples[i] - minFS) / binW);
      if (bi >= 0 && bi < nBins) bins[bi]++;
    }

    var maxCount = 0;
    for (var b = 0; b < nBins; b++) { if (bins[b] > maxCount) maxCount = bins[b]; }
    if (maxCount === 0) return;

    // Failure zone background shading
    var x10 = ml + ((1.0 - minFS) / (maxFS - minFS)) * pw;
    if (x10 > ml) {
      ctx.fillStyle = isDark ? 'rgba(231,76,60,0.08)' : 'rgba(231,76,60,0.06)';
      ctx.fillRect(ml, mt, Math.min(x10, ml + pw) - ml, ph);
    }

    // Bins
    for (var b2 = 0; b2 < nBins; b2++) {
      if (bins[b2] === 0) continue;
      var fsStart = minFS + b2 * binW;
      var fsMid = fsStart + binW / 2;
      var x = ml + ((fsStart - minFS) / (maxFS - minFS)) * pw;
      var w = (binW / (maxFS - minFS)) * pw;
      var h = (bins[b2] / maxCount) * ph;
      var y = mt + ph - h;

      if (fsMid < 1.0) {
        ctx.fillStyle = isDark ? 'rgba(231,76,60,0.75)' : 'rgba(231,76,60,0.65)';
      } else if (fsMid < 1.5) {
        ctx.fillStyle = isDark ? 'rgba(243,156,18,0.65)' : 'rgba(243,156,18,0.55)';
      } else {
        ctx.fillStyle = isDark ? 'rgba(39,174,96,0.65)' : 'rgba(39,174,96,0.55)';
      }

      ctx.beginPath();
      roundRect(ctx, x, y, Math.max(w - 1, 1), h, 1);
      ctx.fill();
    }

    // Reference lines (labels INSIDE chart, at top)
    drawRef(ctx, 1.0, 'FS=1.0', minFS, maxFS, ml, pw, mt, ph, isDark ? '#E74C3C' : '#c0392b');
    drawRef(ctx, 1.5, 'FS=1.5', minFS, maxFS, ml, pw, mt, ph, isDark ? '#27AE60' : '#229954');

    // Mean line
    var xMean = ml + ((stats.mean - minFS) / (maxFS - minFS)) * pw;
    ctx.save();
    ctx.strokeStyle = isDark ? '#5DADE2' : '#2471A3';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xMean, mt);
    ctx.lineTo(xMean, mt + ph);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = isDark ? '#5DADE2' : '#2471A3';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('μ=' + stats.mean.toFixed(2), xMean, mt - 5);
    ctx.restore();

    // Axes
    ctx.strokeStyle = isDark ? '#444' : '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ml, mt + ph);
    ctx.lineTo(ml + pw, mt + ph);
    ctx.stroke();

    // X axis labels (skip if too close to ref lines)
    ctx.fillStyle = isDark ? '#888' : '#999';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    var xStep = niceStep(maxFS - minFS, 6);
    var xStart = Math.ceil(minFS / xStep) * xStep;
    for (var xv = xStart; xv <= maxFS; xv += xStep) {
      var px = ml + ((xv - minFS) / (maxFS - minFS)) * pw;
      // Skip if too close to reference lines
      var tooClose = (Math.abs(xv - 1.0) < xStep * 0.4) || (Math.abs(xv - 1.5) < xStep * 0.4);
      if (!tooClose) {
        ctx.fillText(xv.toFixed(1), px, mt + ph + 12);
      }
    }

    // Y axis: just min/max
    ctx.textAlign = 'right';
    ctx.fillText('0', ml - 4, mt + ph + 3);
    ctx.fillText(maxCount, ml - 4, mt + 8);
  }

  function drawRef(ctx, fsVal, label, minFS, maxFS, ml, pw, mt, ph, color) {
    var x = ml + ((fsVal - minFS) / (maxFS - minFS)) * pw;
    if (x < ml || x > ml + pw) return;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, mt);
    ctx.lineTo(x, mt + ph);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label inside chart at bottom
    ctx.fillStyle = color;
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, mt + ph + 12);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (h < 2) { ctx.rect(x, y, w, h); return; }
    r = Math.min(r, h / 2, w / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
  }

  function niceStep(range, targetTicks) {
    var rough = range / targetTicks;
    var mag = Math.pow(10, Math.floor(Math.log10(rough)));
    var norm = rough / mag;
    if (norm < 1.5) return mag;
    if (norm < 3) return 2 * mag;
    if (norm < 7) return 5 * mag;
    return 10 * mag;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
