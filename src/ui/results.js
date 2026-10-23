/* =============================================
   TALUDES — Results Panel (FS gauge, table, comparison)
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes = global.Taludes || {};
  var Results = T.Results = {};

  var _fsDisplay, _fsBar, _fsStatus, _fsContext, _fsMethod;
  var _tableBody;
  var _comparisonPanel;
  var _warningEl;
  var _analyticalEl;
  var _animatingFS = null;

  Results.init = function () {
    _fsDisplay = document.getElementById('fs-value');
    _fsBar = document.getElementById('fs-bar-fill');
    _fsStatus = document.getElementById('fs-status');
    _fsContext = document.getElementById('fs-context');
    _fsMethod = document.getElementById('fs-method');
    _tableBody = document.getElementById('slices-table-body');
    _comparisonPanel = document.getElementById('comparison-panel');
    _warningEl = document.getElementById('calc-warning');
    _analyticalEl = document.getElementById('analytical-note');
  };

  Results.update = function (result) {
    if (!result || !result.valid) {
      if (_animatingFS) cancelAnimationFrame(_animatingFS);
      _animatingFS = null;
      if (_fsDisplay) _fsDisplay.textContent = '—';
      if (_fsStatus) _fsStatus.textContent = result ? result.error : 'Sin resultado';
      if (_fsStatus) _fsStatus.className = 'fs-status';
      if (_fsBar) _fsBar.style.width = '0%';
      if (_tableBody) _tableBody.innerHTML = '';
      if (_warningEl) _warningEl.style.display = 'none';
      if (_fsMethod) _fsMethod.textContent = '';
      if (_analyticalEl) _analyticalEl.style.display = 'none';
      if (_comparisonPanel) _comparisonPanel.style.display = 'none';
      return;
    }

    // FS display with animation
    animateFS(result.fs);

    // Bar
    if (_fsBar) {
      var pct = Math.min(result.fs / 2.5 * 100, 100);
      _fsBar.style.width = pct + '%';
      _fsBar.style.backgroundColor = fsColor(result.fs);
    }

    // Status
    if (_fsStatus) {
      var status, statusClass;
      if (!result.converged || result.mAlphaWarning) {
        status = 'NO CONCLUYENTE';
        statusClass = 'fs-status caution';
      } else if (result.fs >= T.FS_STABLE) {
        status = 'ESTABLE';
        statusClass = 'fs-status stable';
      } else if (result.fs >= T.FS_CAUTION) {
        status = 'PRECAUCIÓN';
        statusClass = 'fs-status caution';
      } else {
        status = 'INESTABLE';
        statusClass = 'fs-status danger';
      }
      _fsStatus.textContent = status;
      _fsStatus.className = statusClass;
    }

    // Method info
    if (_fsMethod) {
      var mName = result.method === 'bishop' ? 'Bishop' : 'Fellenius';
      var iterText = result.method === 'bishop' ? ' (' + result.iterations + ' iter)' : '';
      _fsMethod.textContent = mName + iterText;
    }

    // Warnings
    if (_warningEl) {
      var warnings = [];
      if (result.mAlphaWarning) {
        warnings.push('mα clampeado en algunas dovelas. Resultado aproximado.');
      }
      if (!result.converged) {
        warnings.push('Bishop no convergió. Resultado aproximado. Probar otro círculo o usar Fellenius.');
      }
      if (warnings.length > 0) {
        _warningEl.textContent = warnings.join(' ');
        _warningEl.style.display = 'block';
      } else {
        _warningEl.style.display = 'none';
      }
    }

    // Analytical note
    if (_analyticalEl) {
      if (result.analyticalFS != null) {
        _analyticalEl.textContent = 'FS analítico (c=0, talud infinito): ' + result.analyticalFS.toFixed(2);
        _analyticalEl.style.display = 'block';
      } else {
        _analyticalEl.style.display = 'none';
      }
    }

    // Slices table
    updateTable(result.slices);
  };

  Results.highlightSlice = function (idx) {
    if (!_tableBody) return;
    var rows = _tableBody.querySelectorAll('tr');
    rows.forEach(function (row, i) {
      row.classList.toggle('highlighted', i === idx);
    });
  };

  Results.showComparison = function (fellResult, bishopResult) {
    if (!_comparisonPanel) return;
    if (!fellResult || !fellResult.valid || !bishopResult || !bishopResult.valid) {
      _comparisonPanel.style.display = 'none';
      return;
    }

    _comparisonPanel.style.display = 'block';
    var diff = ((bishopResult.fs - fellResult.fs) / fellResult.fs * 100).toFixed(1);
    var sign = diff >= 0 ? '+' : '';

    _comparisonPanel.innerHTML =
      '<div class="comparison-header">' +
        '<div class="comp-method">' +
          '<div class="comp-label">FELLENIUS</div>' +
          '<div class="comp-fs" style="color:' + fsColor(fellResult.fs) + '">' + fellResult.fs.toFixed(2) + '</div>' +
        '</div>' +
        '<div class="comp-vs">vs</div>' +
        '<div class="comp-method">' +
          '<div class="comp-label">BISHOP</div>' +
          '<div class="comp-fs" style="color:' + fsColor(bishopResult.fs) + '">' + bishopResult.fs.toFixed(2) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="comp-diff">Diferencia: Bishop ' + sign + diff + '%</div>' +
      '<p class="comp-explanation">Bishop es más preciso porque considera fuerzas entre dovelas. ' +
        'Fellenius es conservador: útil como cota inferior de seguridad.</p>';
  };

  Results.hideComparison = function () {
    if (_comparisonPanel) _comparisonPanel.style.display = 'none';
  };

  function animateFS(targetFS) {
    if (!_fsDisplay) return;
    if (_animatingFS) cancelAnimationFrame(_animatingFS);
    _animatingFS = null;
    var current = parseFloat(_fsDisplay.textContent) || 0;
    if (Math.abs(current - targetFS) < 0.005) {
      _fsDisplay.textContent = targetFS.toFixed(2);
      _fsDisplay.style.color = fsColor(targetFS);
      return;
    }

    if (_animatingFS) cancelAnimationFrame(_animatingFS);
    var start = performance.now();
    var duration = 300;

    function step(now) {
      var t = Math.min((now - start) / duration, 1);
      t = t * t * (3 - 2 * t); // smoothstep
      var val = current + (targetFS - current) * t;
      _fsDisplay.textContent = val.toFixed(2);
      _fsDisplay.style.color = fsColor(val);
      if (t < 1) {
        _animatingFS = requestAnimationFrame(step);
      } else {
        _animatingFS = null;
      }
    }
    _animatingFS = requestAnimationFrame(step);
  }

  function updateTable(slices) {
    if (!_tableBody || !slices) return;
    var html = '';
    for (var i = 0; i < slices.length; i++) {
      var s = slices[i];
      var ratio = s.contributionRatio;
      var rowClass = ratio < 0.8 ? 'slice-bad' : (ratio > 1.2 ? 'slice-good' : 'slice-neutral');
      html += '<tr class="' + rowClass + '" data-slice="' + i + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + s.weight.toFixed(1) + '</td>' +
        '<td>' + s.alpha.toFixed(1) + '°</td>' +
        '<td>' + s.porePressure.toFixed(1) + '</td>' +
        '<td>' + s.resistance.toFixed(1) + '</td>' +
        '<td>' + s.shearForce.toFixed(1) + '</td>' +
        '</tr>';
    }
    _tableBody.innerHTML = html;

    // Row hover → highlight slice
    var rows = _tableBody.querySelectorAll('tr');
    rows.forEach(function (row) {
      row.addEventListener('mouseenter', function () {
        var idx = parseInt(this.dataset.slice);
        T.Renderer.setHoveredSlice(idx);
      });
      row.addEventListener('mouseleave', function () {
        T.Renderer.setHoveredSlice(-1);
      });
    });
  }

  function fsColor(fs) {
    if (fs >= T.FS_STABLE) return T.COLORS.fsGreen;
    if (fs >= T.FS_CAUTION) {
      // Lerp yellow to green
      var t = (fs - T.FS_CAUTION) / (T.FS_STABLE - T.FS_CAUTION);
      return t > 0.5 ? T.COLORS.fsYellow : T.COLORS.fsYellow;
    }
    return T.COLORS.fsRed;
  }
  Results.fsColor = fsColor;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
