/* =============================================
   TALUDES — UI Controls (sliders + inputs)
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes = global.Taludes || {};
  var Controls = T.Controls = {};

  var _paramInputs = {};
  var _onChange = null;
  var _units = 'si';

  Controls.init = function (onChange) {
    _onChange = onChange;
    initSliders();
    initMethodToggle();
    initDrainedToggle();
    initUnitToggle();
  };

  Controls.setUnits = function (u) {
    _units = u === 'imperial' ? 'imperial' : 'si';
    updateLabels();
    document.querySelectorAll('.unit-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.units === _units);
    });
    Object.keys(_paramInputs).forEach(function (key) {
      var p = _paramInputs[key];
      applyBounds(p);
      if (p.siValue != null) setInputValue(key, p.siValue);
    });
  };

  Controls.updateFromState = function (state) {
    // Update dynamic ranges before setting values
    if (state.height != null && state.slopeAngle != null) {
      Controls.updateDynamicRanges(state.height, state.slopeAngle);
    }
    if (state.units) Controls.setUnits(state.units);
    var keys = ['height', 'slopeAngle', 'gamma', 'cohesion', 'friction',
                'waterTable', 'numSlices', 'circleX', 'circleY', 'circleR'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (_paramInputs[k] && state[k] != null) {
        setInputValue(k, state[k]);
      }
    }
    // Method toggle
    var mBtns = document.querySelectorAll('.method-btn');
    mBtns.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.method === state.method);
    });
    // Drained toggle
    var drained = state.drainedMode !== false;
    var dBtns = document.querySelectorAll('.drained-btn');
    dBtns.forEach(function (btn) {
      btn.classList.toggle('active',
        (btn.dataset.mode === 'drained' && drained) ||
        (btn.dataset.mode === 'undrained' && !drained));
    });
    // Disable friction in undrained mode
    var fricSlider = _paramInputs.friction;
    if (fricSlider) {
      fricSlider.slider.disabled = !drained;
      fricSlider.input.disabled = !drained;
      fricSlider.container.classList.toggle('disabled', !drained);
    }
    // Change cohesion label
    var cLabel = document.getElementById('label-cohesion');
    if (cLabel) {
      cLabel.textContent = drained ? 'Cohesión c' : 'Resist. no drenada Su';
    }
    document.querySelectorAll('.unit-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.units === _units);
    });
  };

  // Update dynamic ranges based on current geometry
  Controls.updateDynamicRanges = function (H, slopeAngle) {
    var beta = slopeAngle * Math.PI / 180;
    var L = H / Math.tan(beta);
    updateRange('circleR', Math.max(2, +(0.5 * H).toFixed(1)), +(3 * H).toFixed(1));
    updateRange('circleX', +(-H).toFixed(1), +((L + H)).toFixed(1));
    updateRange('circleY', +(0.5 * H).toFixed(1), +(4 * H).toFixed(1));
    updateRange('waterTable', 0, H);
  };

  function updateRange(key, newMin, newMax) {
    var p = _paramInputs[key];
    if (!p) return;
    p.range.min = newMin;
    p.range.max = newMax;
    applyBounds(p);
  }

  // Animate slider to new value
  Controls.animateTo = function (key, targetValue, duration) {
    duration = duration || 400;
    var input = _paramInputs[key];
    if (!input) return;
    var startValue = input.siValue != null ? input.siValue : fromDisplay(parseFloat(input.slider.value), input.range.unit);
    var startTime = performance.now();

    function step(now) {
      var t = Math.min((now - startTime) / duration, 1);
      t = t * t * (3 - 2 * t); // smoothstep
      var val = startValue + (targetValue - startValue) * t;
      setInputValue(key, val);
      if (t < 1) requestAnimationFrame(step);
      else if (_onChange) _onChange(key, targetValue);
    }
    requestAnimationFrame(step);
  };

  function initSliders() {
    var params = [
      { key: 'height', group: 'geometry' },
      { key: 'slopeAngle', group: 'geometry' },
      { key: 'gamma', group: 'soil' },
      { key: 'cohesion', group: 'soil' },
      { key: 'friction', group: 'soil' },
      { key: 'waterTable', group: 'water' },
      { key: 'numSlices', group: 'analysis' },
      { key: 'circleX', group: 'circle' },
      { key: 'circleY', group: 'circle' },
      { key: 'circleR', group: 'circle' }
    ];

    for (var i = 0; i < params.length; i++) {
      var p = params[i];
      var container = document.getElementById('param-' + p.key);
      if (!container) continue;

      var range = T.RANGES[p.key];
      var slider = container.querySelector('input[type="range"]');
      var input = container.querySelector('input[type="number"]');

      if (!slider || !input) continue;

      slider.min = range.min;
      slider.max = range.max;
      slider.step = range.step;
      input.min = range.min;
      input.max = range.max;
      input.step = range.step;

      _paramInputs[p.key] = { slider: slider, input: input, container: container, range: range, siValue: null };
      applyBounds(_paramInputs[p.key]);

      // Slider → input sync + state update
      (function (key, slider, input, range) {
        slider.addEventListener('input', function () {
          input.value = this.value;
          var val = clamp(fromDisplay(parseFloat(this.value), range.unit), range.min, range.max);
          _paramInputs[key].siValue = val;
          if (_onChange) _onChange(key, val);
        });
        input.addEventListener('change', function () {
          var val = clamp(fromDisplay(parseFloat(this.value), range.unit), range.min, range.max);
          setInputValue(key, val);
          if (_onChange) _onChange(key, val);
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') this.blur();
        });
      })(p.key, slider, input, range);
    }
  }

  function initMethodToggle() {
    var btns = document.querySelectorAll('.method-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        if (_onChange) _onChange('method', this.dataset.method);
      });
    });
  }

  function initDrainedToggle() {
    var btns = document.querySelectorAll('.drained-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        var drained = this.dataset.mode === 'drained';
        if (_onChange) _onChange('drainedMode', drained);
        if (!drained) {
          if (_onChange) _onChange('friction', 0);
        }
      });
    });
  }

  function initUnitToggle() {
    var btns = document.querySelectorAll('.unit-btn');
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        this.classList.add('active');
        Controls.setUnits(this.dataset.units);
        if (_onChange) _onChange('units', _units);
        updateLabels();
      });
    });
  }

  function setInputValue(key, val) {
    var p = _paramInputs[key];
    if (!p) return;
    var clamped = clamp(val, p.range.min, p.range.max);
    p.siValue = clamped;
    var display = toDisplay(clamped, p.range.unit);
    p.slider.value = display;
    p.input.value = Number(display.toFixed(_units === 'imperial' ? 4 : getDecimals(p.range.step)));
  }

  function toDisplay(value, unit) {
    return _units === 'imperial' ? T.Units.toImperial(value, unit) : value;
  }

  function fromDisplay(value, unit) {
    return _units === 'imperial' ? T.Units.toSI(value, unit) : value;
  }

  function applyBounds(p) {
    var min = toDisplay(p.range.min, p.range.unit);
    var max = toDisplay(p.range.max, p.range.unit);
    var step = toDisplay(p.range.step, p.range.unit);
    p.slider.min = p.input.min = min;
    p.slider.max = p.input.max = max;
    p.slider.step = p.input.step = step;
  }

  function updateLabels() {
    // Update unit labels based on current unit system
    var unitEls = document.querySelectorAll('[data-unit]');
    unitEls.forEach(function (el) {
      var siUnit = el.dataset.unit;
      if (_units === 'imperial' && T.IMPERIAL_UNITS[siUnit]) {
        el.textContent = T.IMPERIAL_UNITS[siUnit];
      } else {
        el.textContent = siUnit;
      }
    });
  }

  function clamp(val, min, max) {
    if (isNaN(val)) return min;
    return Math.max(min, Math.min(max, val));
  }

  function getDecimals(step) {
    var s = step.toString();
    var i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
