/* =============================================
   TALUDES — Narrative Tooltips
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes = global.Taludes || {};
  var Tooltip = T.Tooltip = {};

  var _el;

  Tooltip.init = function () {
    _el = document.getElementById('slice-tooltip');
    if (!_el) {
      _el = document.createElement('div');
      _el.id = 'slice-tooltip';
      _el.className = 'slice-tooltip';
      document.body.appendChild(_el);
    }
  };

  Tooltip.show = function (slice, canvasX, canvasY) {
    if (!_el || !slice) return;

    var lines = [];
    lines.push('<strong>Dovela ' + (slice.index + 1) + '</strong>');
    lines.push('');
    lines.push('W = ' + slice.weight.toFixed(1) + ' kN &nbsp; α = ' +
               slice.alpha.toFixed(1) + '°');

    if (slice.porePressure > 0) {
      var reduction = slice.weight > 0 ?
        ((slice.porePressure * slice.baseLength) / slice.weight * 100).toFixed(0) : 0;
      lines.push('u = ' + slice.porePressure.toFixed(1) + ' kPa (−' + reduction + '% N\')');
    }

    lines.push('');
    var ratio = slice.contributionRatio;
    if (ratio > 1.2) {
      lines.push('<span class="contrib-good">ESTABILIZANTE</span> (R/S = ' + ratio.toFixed(2) + ')');
    } else if (ratio > 0.8) {
      lines.push('<span class="contrib-neutral">NEUTRAL</span> (R/S = ' + ratio.toFixed(2) + ')');
    } else {
      lines.push('<span class="contrib-bad">DESESTABILIZANTE</span> (R/S = ' + ratio.toFixed(2) + ')');
    }

    lines.push('');
    lines.push('Resist. = ' + slice.resistance.toFixed(1) + ' kN');
    lines.push('Motriz = ' + slice.shearForce.toFixed(1) + ' kN');

    if (slice.mAlphaWarning) {
      lines.push('');
      lines.push('<span class="warning-text">mα limitado: resultado aproximado</span>');
    }

    _el.innerHTML = lines.join('<br>');
    _el.style.display = 'block';

    // Position near the canvas element
    var canvasRect = document.getElementById('main-canvas').getBoundingClientRect();
    var x = canvasRect.left + canvasX + 15;
    var y = canvasRect.top + canvasY - 10;

    // Keep tooltip on screen
    var tw = _el.offsetWidth;
    var th = _el.offsetHeight;
    if (x + tw > window.innerWidth - 10) x = canvasRect.left + canvasX - tw - 15;
    if (y + th > window.innerHeight - 10) y = window.innerHeight - th - 10;
    if (y < 5) y = 5;

    _el.style.left = x + 'px';
    _el.style.top = y + 'px';
  };

  Tooltip.hide = function () {
    if (_el) _el.style.display = 'none';
  };

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
