/* =============================================
   TALUDES — Main Application Coordinator
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes;
  var State = T.State;
  var Calc = T.Calculations;
  var Geo = T.Geometry;

  var _lastResult = null;
  var _comparisonMode = false;
  var _sensitivityMode = false;
  var _sensitivityParam = 'waterTable';
  var _searchWorker = null;
  var _searchAnimating = false;
  var _isDark = false;
  var _onboardingStep = 0;

  // --- Init ---
  function init() {
    // Load URL params or saved state or defaults
    var urlParams = T.URLParams.parse();
    var savedState = T.Storage.load('lastState', null);
    var initialState = Object.assign({}, T.DEFAULTS);

    if (urlParams) {
      Object.assign(initialState, urlParams);
    } else if (savedState) {
      Object.assign(initialState, savedState);
    }

    // Calculate default circle if not set
    if (initialState.circleX == null) {
      var def = Geo.defaultCircle(initialState.height, initialState.slopeAngle);
      initialState.circleX = def.cx;
      initialState.circleY = def.cy;
      initialState.circleR = def.r;
    }

    // Load preferences
    _isDark = T.Storage.load('darkMode', false);
    if (_isDark) document.documentElement.setAttribute('data-theme', 'dark');

    _onboardingStep = T.Storage.load('onboardingStep', 0);

    // Init state
    State.init(initialState);

    // Init UI components
    T.Results.init();
    T.Tooltip.init();
    T.Renderer.init(
      document.getElementById('main-canvas'),
      document.getElementById('canvas-container')
    );
    T.Renderer.setDark(_isDark);

    T.Controls.init(handleParamChange);
    T.Controls.updateFromState(initialState);
    T.Controls.setUnits(initialState.units || T.Storage.load('units', 'si'));

    T.Scenarios.init(handleScenarioSelect);

    T.Sensitivity.init(function (param, value) {
      handleParamChange(param, value);
    });
    T.Sensitivity.setDark(_isDark);

    T.Interactions.init(document.getElementById('main-canvas'), {
      onCircleMove: handleCircleMove,
      onSliceHover: handleSliceHover,
      onSliceLeave: handleSliceLeave
    });

    // Subscribe to state changes
    var debouncedRecalc = T.debounce(recalculate, 50);
    State.subscribe(function () {
      debouncedRecalc();
      T.Storage.save('lastState', State.get());
    });

    // Keyboard shortcuts
    initKeyboard();

    // Dark mode toggle
    initDarkMode();

    // Guide
    initGuide();

    // Monte Carlo
    initMonteCarlo();

    // Onboarding
    showOnboardingTip();

    // Saved analyses
    initSavedAnalyses();

    // Share button
    initShareButton();

    // Export buttons
    initExportButtons();

    // Initial calculation
    recalculate();

    // Search button
    var searchBtn = document.getElementById('btn-search-critical');
    if (searchBtn) {
      searchBtn.addEventListener('click', startCriticalSearch);
    }

    // Reset button
    var resetBtn = document.getElementById('btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', resetToDefaults);
    }

    // Comparison toggle
    var compBtn = document.getElementById('btn-compare');
    if (compBtn) {
      compBtn.addEventListener('click', toggleComparison);
    }

    // Sensitivity buttons
    var sensButtons = document.querySelectorAll('.btn-sensitivity');
    sensButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var param = this.dataset.param;
        toggleSensitivity(param);
      });
    });
  }

  // --- Recalculate ---
  function recalculate() {
    var state = State.get();
    _lastResult = Calc.analyze(state);

    T.Renderer.setResult(_lastResult);
    T.Results.update(_lastResult);

    if (_comparisonMode && _lastResult && _lastResult.valid) {
      var both = Calc.analyzeBoth(state);
      T.Results.showComparison(both.fellenius, both.bishop);
    }

    if (_sensitivityMode) {
      T.Sensitivity.show(_sensitivityParam, state);
    }

    // Auto Monte Carlo
    runMonteCarlo(state);
  }

  // --- Event Handlers ---
  function handleParamChange(key, value) {
    if (key === 'units') {
      State.set('units', value);
      T.Controls.setUnits(value);
      T.Storage.save('units', value);
      return;
    }
    if (key === 'drainedMode') {
      State.set('drainedMode', value);
      if (!value) State.set('friction', 0);
      T.Controls.updateFromState(State.get());
      return;
    }

    // If geometry changed, recalculate default circle
    if (key === 'height' || key === 'slopeAngle') {
      State.batch(function () {
        State.set(key, value);
        var def = Geo.defaultCircle(State.get('height'), State.get('slopeAngle'));
        State.set('circleX', def.cx);
        State.set('circleY', def.cy);
        State.set('circleR', def.r);
      });
      T.Controls.updateFromState(State.get());
    } else {
      State.set(key, value);
    }

    // Track onboarding
    if (_onboardingStep === 0) {
      _onboardingStep = 1;
      T.Storage.save('onboardingStep', 1);
      showOnboardingTip();
    }
  }

  function handleCircleMove(wx, wy) {
    State.batch(function () {
      State.set('circleX', parseFloat(wx.toFixed(1)));
      State.set('circleY', parseFloat(wy.toFixed(1)));
    });
    T.Controls.updateFromState(State.get());

    // Onboarding
    if (_onboardingStep === 1) {
      _onboardingStep = 2;
      T.Storage.save('onboardingStep', 2);
      showOnboardingTip();
    }
  }

  function handleSliceHover(idx) {
    if (!_lastResult || !_lastResult.slices || idx < 0) return;
    var slice = _lastResult.slices[idx];
    T.Results.highlightSlice(idx);

    // Get canvas position for tooltip
    var cp = T.Renderer.worldToCanvas(slice.xMid, (slice.yTop + slice.yBottom) / 2);
    T.Tooltip.show(slice, cp.x, cp.y);
  }

  function handleSliceLeave() {
    T.Results.highlightSlice(-1);
    T.Tooltip.hide();
  }

  function handleScenarioSelect(scenario) {
    var params = scenario.params;
    var def = Geo.defaultCircle(params.height, params.slopeAngle);

    // Animate sliders to new values
    var keys = Object.keys(params);
    State.batch(function () {
      for (var i = 0; i < keys.length; i++) {
        State.set(keys[i], params[keys[i]]);
      }
      State.set('circleX', def.cx);
      State.set('circleY', def.cy);
      State.set('circleR', def.r);
      State.set('drainedMode', true);
    });

    // Animate controls
    for (var i = 0; i < keys.length; i++) {
      T.Controls.animateTo(keys[i], params[keys[i]], 400);
    }
    T.Controls.animateTo('circleX', def.cx, 400);
    T.Controls.animateTo('circleY', def.cy, 400);
    T.Controls.animateTo('circleR', def.r, 400);
    T.Controls.updateFromState(State.get());
  }

  // --- Critical Circle Search ---
  function startCriticalSearch() {
    var btn = document.getElementById('btn-search-critical');
    var progressEl = document.getElementById('search-progress');
    if (!btn) return;

    btn.disabled = true;
    btn.textContent = 'Buscando...';
    if (progressEl) progressEl.style.display = 'block';

    var state = State.get();
    _searchAnimating = true;

    // Use setTimeout to keep UI responsive (no Worker for file:// compat)
    setTimeout(function () {
      var searchResult = Calc.findCriticalCircle(state, function (progress) {
        if (progressEl) {
          progressEl.textContent = progress.tried + '/' + progress.total +
            ' — Mejor FS: ' + (progress.bestFS < 99 ? progress.bestFS.toFixed(2) : '...');
        }
      });

      // Show ghost circles animation
      if (searchResult.candidates.length > 0) {
        animateSearchResult(searchResult, function () {
          applySearchResult(searchResult);
          btn.disabled = false;
          btn.textContent = 'Buscar Círculo Crítico';
          if (progressEl) progressEl.style.display = 'none';
          _searchAnimating = false;
        });
      } else {
        btn.disabled = false;
        btn.textContent = 'Buscar Círculo Crítico';
        if (progressEl) {
          progressEl.textContent = 'No se encontró un círculo válido.';
          setTimeout(function () { progressEl.style.display = 'none'; }, 3000);
        }
        _searchAnimating = false;
      }

      // Onboarding
      if (_onboardingStep === 2) {
        _onboardingStep = 3;
        T.Storage.save('onboardingStep', 3);
        showOnboardingTip();
      }
    }, 50);
  }

  function animateSearchResult(searchResult, onDone) {
    var candidates = searchResult.candidates;
    var phases = [
      { start: 0, end: 700, count: Math.min(12, candidates.length), opacity: 0.15, showFS: false },
      { start: 700, end: 1700, count: Math.min(6, candidates.length), opacity: 0.25, showFS: true },
      { start: 1700, end: 2000, count: 1, opacity: 0.5, showFS: true }
    ];

    var startTime = performance.now();

    function step(now) {
      var elapsed = now - startTime;
      var ghosts = [];

      for (var p = 0; p < phases.length; p++) {
        var phase = phases[p];
        if (elapsed >= phase.start && elapsed < phase.end) {
          var t = (elapsed - phase.start) / (phase.end - phase.start);
          var count = Math.ceil(phase.count * t);
          for (var i = 0; i < count && i < candidates.length; i++) {
            ghosts.push({
              cx: candidates[i].cx,
              cy: candidates[i].cy,
              r: candidates[i].r,
              fs: candidates[i].fs,
              opacity: phase.opacity * (1 - t * 0.3),
              showFS: phase.showFS
            });
          }
        }
      }

      T.Renderer.setGhostCircles(ghosts);

      if (elapsed < 2000) {
        requestAnimationFrame(step);
      } else {
        T.Renderer.setGhostCircles([]);
        onDone();
      }
    }

    requestAnimationFrame(step);
  }

  function applySearchResult(searchResult) {
    if (!searchResult.bestConfig) return;
    var best = searchResult.bestConfig;
    State.batch(function () {
      State.set('circleX', best.cx);
      State.set('circleY', best.cy);
      State.set('circleR', best.r);
    });
    T.Controls.updateFromState(State.get());

    var progressEl = document.getElementById('search-progress');
    if (progressEl) {
      progressEl.textContent = 'Se probaron ' + searchResult.tried + ' configuraciones. ' +
        'Círculo crítico: FS = ' + searchResult.bestFS.toFixed(2);
      progressEl.style.display = 'block';
      setTimeout(function () { progressEl.style.display = 'none'; }, 5000);
    }
  }

  // --- Comparison Mode ---
  function toggleComparison() {
    _comparisonMode = !_comparisonMode;
    var btn = document.getElementById('btn-compare');
    if (btn) btn.classList.toggle('active', _comparisonMode);
    if (_comparisonMode) {
      recalculate();
    } else {
      T.Results.hideComparison();
    }
  }

  // --- Sensitivity Mode ---
  function toggleSensitivity(param) {
    if (_sensitivityMode && _sensitivityParam === param) {
      _sensitivityMode = false;
      T.Sensitivity.hide();
    } else {
      _sensitivityMode = true;
      _sensitivityParam = param;
      T.Sensitivity.show(param, State.get());
    }
  }

  // --- Reset ---
  function resetToDefaults() {
    var def = Object.assign({}, T.DEFAULTS);
    var circle = Geo.defaultCircle(def.height, def.slopeAngle);
    def.circleX = circle.cx;
    def.circleY = circle.cy;
    def.circleR = circle.r;
    State.init(def);
    T.Controls.updateFromState(def);
    State._doNotify();
  }

  // --- Keyboard ---
  function initKeyboard() {
    document.addEventListener('keydown', function (e) {
      // Don't trigger when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          if (e.shiftKey) {
            T.Export.toPDF(_lastResult);
          } else {
            T.Export.canvasToPNG(_lastResult);
          }
        }
        return;
      }

      var shortcut = T.SHORTCUTS[e.key];
      if (!shortcut) return;

      switch (shortcut.action) {
        case 'reset': resetToDefaults(); break;
        case 'criticalSearch': startCriticalSearch(); break;
        case 'toggleMethod':
          var m = State.get('method') === 'bishop' ? 'fellenius' : 'bishop';
          State.set('method', m);
          T.Controls.updateFromState(State.get());
          break;
        case 'toggleSensitivity': toggleSensitivity(_sensitivityParam); break;
        case 'toggleComparison': toggleComparison(); break;
        default:
          if (shortcut.action.startsWith('scenario:')) {
            var idx = parseInt(shortcut.action.split(':')[1]);
            var keys = Object.keys(T.SCENARIOS);
            if (keys[idx]) {
              handleScenarioSelect(T.SCENARIOS[keys[idx]]);
            }
          }
      }
    });
  }

  // --- Dark Mode ---
  function initDarkMode() {
    var btn = document.getElementById('btn-dark-mode');
    if (!btn) return;
    updateDarkButton(btn);
    btn.addEventListener('click', function () {
      _isDark = !_isDark;
      document.documentElement.setAttribute('data-theme', _isDark ? 'dark' : 'light');
      T.Renderer.setDark(_isDark);
      T.Sensitivity.setDark(_isDark);
      T.MonteCarlo.setDark(_isDark);
      T.Storage.save('darkMode', _isDark);
      updateDarkButton(btn);
    });
  }

  function updateDarkButton(btn) {
    btn.textContent = _isDark ? 'Claro' : 'Oscuro';
    btn.title = _isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  }

  // --- Monte Carlo ---
  var _mcCustomSigmas = null;
  var _mcCustomN = null;

  function initMonteCarlo() {
    T.MonteCarlo.setDark(_isDark);

    // Config panel
    var configContainer = document.getElementById('mc-config');
    if (configContainer) {
      var state = State.get();
      T.MonteCarlo.renderConfig(configContainer, state, function (sigmas, nSamples) {
        _mcCustomSigmas = sigmas;
        _mcCustomN = nSamples;
        runMonteCarlo(State.get());
      });
    }
  }

  function runMonteCarlo(state) {
    var resultsEl = document.getElementById('mc-results');
    if (!resultsEl) return;

    T.MonteCarlo.cancel(); // cancel previous

    if (_mcCustomSigmas) {
      T.MonteCarlo.run(state, _mcCustomSigmas, _mcCustomN || 2000, function (mcResult) {
        T.MonteCarlo.renderCompact(resultsEl, mcResult);
      });
    } else {
      T.MonteCarlo.autoRun(state, function (mcResult) {
        T.MonteCarlo.renderCompact(resultsEl, mcResult);
      });
    }
  }

  // --- Guide ---
  function initGuide() {
    var btn = document.getElementById('btn-help');
    var panel = document.getElementById('guide-panel');
    if (!btn || !panel) return;

    var html = '<div class="guide-header"><span>Ayuda</span><button class="guide-close" id="guide-close">&times;</button></div>';
    var entries = T.GUIDE;
    for (var key in entries) {
      var g = entries[key];
      html += '<details class="guide-item"><summary>' + g.title + '</summary>' +
        '<p>' + g.text + '</p></details>';
    }

    // Keyboard shortcuts section
    html += '<details class="guide-item"><summary>Atajos de teclado</summary><ul>';
    for (var k in T.SHORTCUTS) {
      html += '<li><kbd>' + k.toUpperCase() + '</kbd> — ' + T.SHORTCUTS[k].desc + '</li>';
    }
    html += '<li><kbd>Ctrl+E</kbd> — Exportar imagen</li>';
    html += '<li><kbd>Ctrl+Shift+E</kbd> — Exportar PDF</li>';
    html += '</ul></details>';

    panel.innerHTML = html;

    function openGuide() { panel.classList.add('show'); }
    function closeGuide() { panel.classList.remove('show'); }

    btn.addEventListener('click', function () {
      if (panel.classList.contains('show')) { closeGuide(); } else { openGuide(); }
    });

    document.getElementById('guide-close').addEventListener('click', closeGuide);

    // Close on click outside
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('show') && !panel.contains(e.target) && e.target !== btn) {
        closeGuide();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('show')) closeGuide();
    });
  }

  // --- Onboarding ---
  function showOnboardingTip() {
    var bar = document.getElementById('onboarding-bar');
    if (!bar) return;

    var tips = [
      'Ajusta un parámetro para ver cómo cambia el factor de seguridad.',
      'Haz clic en el gráfico para mover el centro del círculo de falla.',
      'Usa la búsqueda del círculo crítico para explorar superficies con menor factor de seguridad.',
      null // done
    ];

    var tip = tips[_onboardingStep];
    if (tip) {
      bar.textContent = tip;
      bar.style.display = 'block';
    } else {
      bar.style.display = 'none';
    }
  }

  // --- Saved Analyses ---
  function initSavedAnalyses() {
    var saveBtn = document.getElementById('btn-save-analysis');
    var loadContainer = document.getElementById('saved-analyses');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', function () {
      var name = prompt('Nombre para este análisis:');
      if (!name) return;
      T.Storage.saveAnalysis(name, State.get());
      updateSavedList();
    });

    updateSavedList();
  }

  function updateSavedList() {
    var container = document.getElementById('saved-analyses');
    if (!container) return;
    var saved = T.Storage.getSavedAnalyses();
    if (saved.length === 0) {
      container.innerHTML = '<p class="saved-empty">Sin análisis guardados</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < saved.length; i++) {
      html += '<div class="saved-item">' +
        '<button class="saved-load" data-idx="' + i + '">' + saved[i].name + '</button>' +
        '<button class="saved-delete" data-name="' + saved[i].name + '" title="Eliminar">&times;</button>' +
        '</div>';
    }
    container.innerHTML = html;

    container.querySelectorAll('.saved-load').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(this.dataset.idx);
        var s = T.Storage.getSavedAnalyses()[idx];
        if (s) {
          State.init(Object.assign({}, T.DEFAULTS, s.params));
          T.Controls.updateFromState(State.get());
          State._doNotify();
        }
      });
    });

    container.querySelectorAll('.saved-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        T.Storage.deleteSavedAnalysis(this.dataset.name);
        updateSavedList();
      });
    });
  }

  // --- Share ---
  function initShareButton() {
    var btn = document.getElementById('btn-share');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var url = T.URLParams.generate(State.get());
      var fullURL = window.location.origin + url;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(fullURL).then(function () {
          btn.textContent = 'Enlace copiado';
          setTimeout(function () { btn.textContent = 'Compartir URL'; }, 2000);
        });
      } else {
        prompt('Copiar esta URL:', fullURL);
      }
    });
  }

  // --- Export ---
  function initExportButtons() {
    var imgBtn = document.getElementById('btn-export-img');
    var pdfBtn = document.getElementById('btn-export-pdf');
    if (imgBtn) imgBtn.addEventListener('click', function () { T.Export.canvasToPNG(_lastResult); });
    if (pdfBtn) pdfBtn.addEventListener('click', function () { T.Export.toPDF(_lastResult); });
  }

  // --- Start ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
