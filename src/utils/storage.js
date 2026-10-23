/* =============================================
   TALUDES — localStorage, URL params, Units, Export
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes = global.Taludes || {};

  // --- localStorage ---
  var Storage = T.Storage = {};
  var PREFIX = 'taludes_';

  Storage.save = function (key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); }
    catch (e) { /* quota exceeded or private browsing */ }
  };

  Storage.load = function (key, fallback) {
    try {
      var val = localStorage.getItem(PREFIX + key);
      return val ? JSON.parse(val) : fallback;
    } catch (e) { return fallback; }
  };

  Storage.remove = function (key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) {}
  };

  Storage.saveAnalysis = function (name, params) {
    var saved = Storage.load('savedAnalyses', []);
    // Remove duplicate name
    saved = saved.filter(function (s) { return s.name !== name; });
    saved.unshift({ name: name, params: params, date: new Date().toISOString() });
    if (saved.length > 10) saved = saved.slice(0, 10);
    Storage.save('savedAnalyses', saved);
  };

  Storage.getSavedAnalyses = function () {
    return Storage.load('savedAnalyses', []);
  };

  Storage.deleteSavedAnalysis = function (name) {
    var saved = Storage.load('savedAnalyses', []);
    saved = saved.filter(function (s) { return s.name !== name; });
    Storage.save('savedAnalyses', saved);
  };

  // --- URL Parameters ---
  var URLParams = T.URLParams = {};

  var PARAM_MAP = {
    h: 'height', a: 'slopeAngle', g: 'gamma', c: 'cohesion',
    f: 'friction', nf: 'waterTable', m: 'method', n: 'numSlices',
    cx: 'circleX', cy: 'circleY', r: 'circleR', dm: 'drainedMode', units: 'units'
  };
  var REVERSE_MAP = {};
  for (var k in PARAM_MAP) REVERSE_MAP[PARAM_MAP[k]] = k;

  URLParams.parse = function () {
    var search = window.location.search;
    if (!search) return null;
    var params = new URLSearchParams(search);
    var result = {};
    var hasAny = false;
    for (var short in PARAM_MAP) {
      var val = params.get(short);
      if (val !== null) {
        var long = PARAM_MAP[short];
        result[long] = long === 'drainedMode' ? val !== 'false' :
          (long === 'method' || long === 'units' ? val : Number(val));
        hasAny = true;
      }
    }
    return hasAny ? result : null;
  };

  URLParams.generate = function (params) {
    var parts = [];
    var keys = ['height', 'slopeAngle', 'gamma', 'cohesion', 'friction',
                'waterTable', 'method', 'numSlices', 'circleX', 'circleY', 'circleR', 'drainedMode', 'units'];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var short = REVERSE_MAP[key];
      if (short && params[key] != null) {
        var val = String(params[key]);
        parts.push(short + '=' + encodeURIComponent(val));
      }
    }
    return window.location.pathname + '?' + parts.join('&');
  };

  // --- Unit Conversion ---
  var Units = T.Units = {};

  Units.toImperial = function (value, siUnit) {
    switch (siUnit) {
      case 'm': return value * T.UNIT_FACTORS.m_to_ft;
      case 'kN/m³': return value * T.UNIT_FACTORS.kN_m3_to_pcf;
      case 'kPa': return value * T.UNIT_FACTORS.kPa_to_psf;
      default: return value;
    }
  };

  Units.toSI = function (value, siUnit) {
    switch (siUnit) {
      case 'm': return value / T.UNIT_FACTORS.m_to_ft;
      case 'kN/m³': return value / T.UNIT_FACTORS.kN_m3_to_pcf;
      case 'kPa': return value / T.UNIT_FACTORS.kPa_to_psf;
      default: return value;
    }
  };

  // --- Image Export ---
  var Export = T.Export = {};

  Export.canvasToPNG = function (result) {
    var mainCanvas = document.getElementById('main-canvas');
    if (!mainCanvas) return;

    // Create offscreen canvas with header
    var scale = 2;
    var headerH = 80;
    var off = document.createElement('canvas');
    off.width = mainCanvas.width / (window.devicePixelRatio || 1) * scale;
    off.height = (mainCanvas.height / (window.devicePixelRatio || 1) + headerH) * scale;
    var octx = off.getContext('2d');
    octx.scale(scale, scale);

    var w = off.width / scale;

    // White background
    octx.fillStyle = '#fff';
    octx.fillRect(0, 0, w, off.height / scale);

    // Header
    octx.fillStyle = '#333';
    octx.font = 'bold 16px system-ui, sans-serif';
    octx.fillText('Análisis de Estabilidad de Taludes', 15, 25);
    octx.font = '11px system-ui, sans-serif';
    octx.fillStyle = '#666';
    if (result && result.valid) {
      var p = result.params;
      var info = 'H=' + p.height + 'm  β=' + p.slopeAngle + '°  γ=' + p.gamma + 'kN/m³  ' +
                 'c=' + p.cohesion + 'kPa  φ=' + p.friction + '°  NF=' + p.waterTable + 'm';
      octx.fillText(info, 15, 45);
      var mName = result.method === 'bishop' ? 'Bishop' : 'Fellenius';
      var fsText = 'FS (' + mName + ') = ' + result.fs.toFixed(2);
      octx.font = 'bold 13px system-ui, sans-serif';
      octx.fillStyle = T.Results.fsColor(result.fs);
      octx.fillText(fsText, 15, 65);
    }
    octx.fillStyle = '#999';
    octx.font = '10px system-ui';
    octx.textAlign = 'right';
    octx.fillText(new Date().toLocaleDateString(), w - 15, 25);
    octx.fillText('TALUDES', w - 15, 40);
    octx.textAlign = 'left';

    // Draw main canvas
    octx.drawImage(mainCanvas, 0, headerH,
      mainCanvas.width / (window.devicePixelRatio || 1),
      mainCanvas.height / (window.devicePixelRatio || 1));

    // Download
    off.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'taludes-analisis.png';
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  // --- PDF Export (simple HTML-based print) ---
  Export.toPDF = function (result) {
    if (!result || !result.valid) return;
    var p = result.params;
    var mName = result.method === 'bishop' ? 'Bishop Simplificado' : 'Fellenius (Ordinario)';

    // Build a printable page
    var win = window.open('', '_blank');
    if (!win) { alert('Habilite ventanas emergentes para exportar PDF.'); return; }

    var sliceRows = '';
    if (result.slices) {
      for (var i = 0; i < result.slices.length; i++) {
        var s = result.slices[i];
        sliceRows += '<tr><td>' + (i + 1) + '</td><td>' + s.weight.toFixed(1) +
          '</td><td>' + s.alpha.toFixed(1) + '°</td><td>' + s.porePressure.toFixed(1) +
          '</td><td>' + s.resistance.toFixed(1) + '</td><td>' + s.shearForce.toFixed(1) + '</td></tr>';
      }
    }

    var status = !result.converged || result.mAlphaWarning ? 'NO CONCLUYENTE' :
      (result.fs >= 1.5 ? 'ESTABLE' : (result.fs >= 1.0 ? 'PRECAUCIÓN' : 'INESTABLE'));
    var statusColor = result.fs >= 1.5 ? '#27AE60' : (result.fs >= 1.0 ? '#F39C12' : '#E74C3C');

    win.document.write('<!DOCTYPE html><html><head><title>Análisis de Estabilidad</title>' +
      '<style>' +
      'body{font-family:system-ui,sans-serif;margin:40px;color:#333;max-width:800px;}' +
      'h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px;}' +
      'h2{font-size:14px;color:#555;margin-top:24px;}' +
      'table{border-collapse:collapse;width:100%;margin:10px 0;}' +
      'td,th{border:1px solid #ddd;padding:5px 8px;font-size:11px;text-align:right;}' +
      'th{background:#f5f5f5;text-align:center;}' +
      '.fs-big{font-size:36px;font-weight:bold;margin:10px 0;}' +
      '.params{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;font-size:12px;}' +
      '.disclaimer{margin-top:30px;padding:10px;background:#f9f9f9;border:1px solid #ddd;font-size:10px;color:#888;}' +
      '@media print{body{margin:20px;}}' +
      '</style></head><body>' +
      '<h1>Análisis de Estabilidad de Taludes</h1>' +
      '<div style="display:flex;justify-content:space-between;font-size:12px;color:#888;">' +
        '<span>Fecha: ' + new Date().toLocaleDateString() + '</span>' +
        '<span>TALUDES</span>' +
      '</div>' +
      '<h2>Parámetros de Entrada</h2>' +
      '<div class="params">' +
        '<div>Altura: <strong>' + p.height + ' m</strong></div>' +
        '<div>Ángulo: <strong>' + p.slopeAngle + '°</strong></div>' +
        '<div>Peso unitario: <strong>' + p.gamma + ' kN/m³</strong></div>' +
        '<div>Cohesión: <strong>' + p.cohesion + ' kPa</strong></div>' +
        '<div>Fricción: <strong>' + p.friction + '°</strong></div>' +
        '<div>Nivel freático: <strong>' + p.waterTable + ' m</strong></div>' +
        '<div>Método: <strong>' + mName + '</strong></div>' +
        '<div>Dovelas: <strong>' + result.numSlicesValid + '</strong></div>' +
        '<div>Centro: <strong>(' + result.circle.cx.toFixed(1) + ', ' + result.circle.cy.toFixed(1) + ')</strong></div>' +
        '<div>Radio: <strong>' + result.circle.r.toFixed(1) + ' m</strong></div>' +
      '</div>' +
      '<h2>Resultado</h2>' +
      '<div class="fs-big" style="color:' + statusColor + '">FS = ' + result.fs.toFixed(2) + ' — ' + status + '</div>' +
      (result.method === 'bishop' ? '<div style="font-size:12px;">' +
        (result.converged ? 'Convergió en ' + result.iterations + ' iteraciones' : 'No convergió: resultado no concluyente') +
        (result.mAlphaWarning ? '. Coeficiente mα limitado: resultado aproximado' : '') + '</div>' : '') +
      '<h2>Tabla de Dovelas</h2>' +
      '<table><thead><tr><th>#</th><th>Peso (kN)</th><th>α</th><th>u (kPa)</th><th>Resist. (kN)</th><th>F.motriz (kN)</th></tr></thead>' +
      '<tbody>' + sliceRows + '</tbody></table>' +
      '<div class="disclaimer">' +
        '<strong>NOTA:</strong> Cálculo 2D preliminar mediante equilibrio límite (método de dovelas). ' +
        'Suelo homogéneo con superficie de falla circular. ' +
        'No sustituye un estudio geotécnico detallado ni un diseño profesional. ' +
        'Los resultados son indicativos y deben ser validados por un profesional competente.' +
      '</div>' +
      '</body></html>');

    win.document.close();
    setTimeout(function () { win.print(); }, 500);
  };

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
