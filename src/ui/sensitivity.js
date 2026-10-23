/* =============================================
   TALUDES — Sensitivity Analysis Chart
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes = global.Taludes || {};
  var Sensitivity = T.Sensitivity = {};

  var _container;
  var _canvas, _ctx;
  var _active = false;
  var _currentParam = null;
  var _data = [];
  var _currentValue = 0;
  var _onPointClick = null;
  var _isDark = false;

  Sensitivity.init = function (onPointClick) {
    _container = document.getElementById('sensitivity-panel');
    _onPointClick = onPointClick;
  };

  Sensitivity.setDark = function (dark) {
    _isDark = dark;
    if (_active) Sensitivity.render();
  };

  Sensitivity.show = function (paramName, params) {
    if (!_container) return;
    _active = true;
    _currentParam = paramName;
    _currentValue = params[paramName];

    // Run sweep
    _data = T.Calculations.sensitivitySweep(params, paramName, 25);

    _container.style.display = 'block';
    _container.innerHTML =
      '<div class="sensitivity-header">' +
        '<span>Sensibilidad: <strong>' + (T.LABELS[paramName] || paramName) + '</strong></span>' +
        '<button class="btn-close-sensitivity" onclick="Taludes.Sensitivity.hide()">Cerrar</button>' +
      '</div>' +
      '<canvas id="sensitivity-canvas" width="580" height="280"></canvas>' +
      '<div id="sensitivity-insight" class="sensitivity-insight"></div>';

    _canvas = document.getElementById('sensitivity-canvas');
    _ctx = _canvas.getContext('2d');

    // Make canvas responsive
    var rect = _container.getBoundingClientRect();
    _canvas.width = Math.min(rect.width - 20, 600);
    _canvas.height = 260;

    Sensitivity.render();
    generateInsight();

    // Click handler
    _canvas.addEventListener('click', handleChartClick);
    _canvas.addEventListener('mousemove', handleChartHover);
  };

  Sensitivity.hide = function () {
    _active = false;
    if (_container) _container.style.display = 'none';
  };

  Sensitivity.isActive = function () { return _active; };

  Sensitivity.render = function () {
    if (!_canvas || !_ctx || !_data.length) return;

    var w = _canvas.width;
    var h = _canvas.height;
    var pad = { top: 20, right: 20, bottom: 40, left: 50 };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var ctx = _ctx;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = _isDark ? '#1a1a2e' : '#fafafa';
    ctx.fillRect(0, 0, w, h);

    // Data ranges
    var validData = _data.filter(function (d) { return d.valid && d.fs != null; });
    if (validData.length < 2) return;

    var xMin = validData[0].value;
    var xMax = validData[validData.length - 1].value;
    var yMin = 0;
    var yMax = Math.max(2.5, Math.max.apply(null, validData.map(function (d) { return d.fs; })) * 1.1);

    function toX(v) { return pad.left + ((v - xMin) / (xMax - xMin)) * plotW; }
    function toY(fs) { return pad.top + (1 - (fs - yMin) / (yMax - yMin)) * plotH; }
    function fromX(px) { return xMin + (px - pad.left) / plotW * (xMax - xMin); }

    // Reference lines
    var refLines = [
      { fs: 1.0, color: 'rgba(231,76,60,0.5)', label: 'FS = 1.0 (Límite)' },
      { fs: 1.5, color: 'rgba(39,174,96,0.5)', label: 'FS = 1.5 (Estable)' }
    ];
    for (var r = 0; r < refLines.length; r++) {
      var ref = refLines[r];
      if (ref.fs >= yMin && ref.fs <= yMax) {
        var ry = toY(ref.fs);
        ctx.strokeStyle = ref.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.left, ry);
        ctx.lineTo(w - pad.right, ry);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ref.color;
        ctx.font = '10px system-ui';
        ctx.textAlign = 'right';
        ctx.fillText(ref.label, w - pad.right, ry - 4);
      }
    }

    // Data line
    ctx.strokeStyle = _isDark ? '#5B9BD5' : '#2980B9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    var first = true;
    for (var i = 0; i < validData.length; i++) {
      var px = toX(validData[i].value);
      var py = toY(validData[i].fs);
      if (first) { ctx.moveTo(px, py); first = false; }
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Data points
    for (i = 0; i < validData.length; i++) {
      px = toX(validData[i].value);
      py = toY(validData[i].fs);
      ctx.fillStyle = _isDark ? '#5B9BD5' : '#2980B9';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Current value marker
    var curX = toX(_currentValue);
    var curFSData = validData.reduce(function (closest, d) {
      return Math.abs(d.value - _currentValue) < Math.abs(closest.value - _currentValue) ? d : closest;
    });
    if (curFSData) {
      var curY = toY(curFSData.fs);
      ctx.fillStyle = '#E74C3C';
      ctx.beginPath();
      ctx.arc(curX, curY, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(curX, curY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Axes
    ctx.strokeStyle = _isDark ? '#666' : '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.lineTo(w - pad.right, h - pad.bottom);
    ctx.stroke();

    // X axis labels
    ctx.fillStyle = _isDark ? '#aaa' : '#333';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    var numXTicks = 5;
    for (i = 0; i <= numXTicks; i++) {
      var xVal = xMin + (xMax - xMin) * i / numXTicks;
      var xPx = toX(xVal);
      ctx.fillText(xVal.toFixed(1), xPx, h - pad.bottom + 15);
      ctx.beginPath();
      ctx.moveTo(xPx, h - pad.bottom);
      ctx.lineTo(xPx, h - pad.bottom + 4);
      ctx.stroke();
    }

    // X label
    var range = T.RANGES[_currentParam];
    var unit = range ? range.unit : '';
    ctx.fillText((T.LABELS[_currentParam] || _currentParam) + (unit ? ' (' + unit + ')' : ''), w / 2, h - 5);

    // Y axis labels
    ctx.textAlign = 'right';
    var numYTicks = 5;
    for (i = 0; i <= numYTicks; i++) {
      var yVal = yMin + (yMax - yMin) * i / numYTicks;
      var yPx = toY(yVal);
      ctx.fillText(yVal.toFixed(1), pad.left - 8, yPx + 4);
      ctx.beginPath();
      ctx.moveTo(pad.left - 3, yPx);
      ctx.lineTo(pad.left, yPx);
      ctx.stroke();
    }

    // Y label
    ctx.save();
    ctx.translate(12, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Factor de Seguridad', 0, 0);
    ctx.restore();
  };

  function generateInsight() {
    var el = document.getElementById('sensitivity-insight');
    if (!el) return;

    var validData = _data.filter(function (d) { return d.valid && d.fs != null; });

    // Find where FS crosses 1.0
    var crossingValue = null;
    for (var i = 1; i < validData.length; i++) {
      if ((validData[i - 1].fs >= 1.0 && validData[i].fs < 1.0) ||
          (validData[i - 1].fs < 1.0 && validData[i].fs >= 1.0)) {
        // Linear interpolation
        var f1 = validData[i - 1].fs, f2 = validData[i].fs;
        var v1 = validData[i - 1].value, v2 = validData[i].value;
        crossingValue = v1 + (1.0 - f1) / (f2 - f1) * (v2 - v1);
        break;
      }
    }

    var range = T.RANGES[_currentParam];
    var unit = range ? range.unit : '';
    var label = T.LABELS[_currentParam] || _currentParam;

    if (crossingValue !== null) {
      el.textContent = 'El talud se vuelve inestable (FS < 1.0) cuando ' +
        label.toLowerCase() + ' alcanza ' + crossingValue.toFixed(1) + ' ' + unit + '.';
    } else if (validData.length > 0 && validData[0].fs < 1.0 && validData[validData.length - 1].fs < 1.0) {
      el.textContent = 'El talud es inestable en todo el rango de ' + label.toLowerCase() + '.';
    } else {
      el.textContent = 'El talud permanece estable en todo el rango de ' + label.toLowerCase() + '.';
    }
  }

  function handleChartClick(e) {
    // Click on chart → load that config
    if (!_onPointClick || !_data.length) return;
    var rect = _canvas.getBoundingClientRect();
    var px = e.clientX - rect.left;
    var pad = 50;
    var plotW = _canvas.width - pad - 20;
    var validData = _data.filter(function (d) { return d.valid; });
    if (validData.length < 2) return;
    var xMin = validData[0].value;
    var xMax = validData[validData.length - 1].value;
    var val = xMin + (px - pad) / plotW * (xMax - xMin);
    val = Math.max(xMin, Math.min(xMax, val));
    _onPointClick(_currentParam, val);
  }

  function handleChartHover(e) {
    var rect = _canvas.getBoundingClientRect();
    var px = e.clientX - rect.left;
    var pad = 50;
    var plotW = _canvas.width - pad - 20;
    var validData = _data.filter(function (d) { return d.valid; });
    if (validData.length < 2) return;
    var xMin = validData[0].value;
    var xMax = validData[validData.length - 1].value;
    var val = xMin + (px - pad) / plotW * (xMax - xMin);

    // Find nearest data point
    var nearest = validData.reduce(function (a, b) {
      return Math.abs(a.value - val) < Math.abs(b.value - val) ? a : b;
    });
    if (nearest) {
      _canvas.title = (T.LABELS[_currentParam] || _currentParam) + ': ' +
        nearest.value.toFixed(1) + ' → FS = ' + (nearest.fs ? nearest.fs.toFixed(2) : '—');
    }
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
