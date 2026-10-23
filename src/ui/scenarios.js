/* =============================================
   TALUDES — Scenario Selector
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes = global.Taludes || {};
  var Scenarios = T.Scenarios = {};

  var _container;
  var _contextPanel;
  var _onSelect = null;
  var _contextTimeout = null;

  Scenarios.init = function (onSelect) {
    _onSelect = onSelect;
    _container = document.getElementById('scenarios-list');
    _contextPanel = document.getElementById('scenario-context');
    if (!_container) return;

    var keys = Object.keys(T.SCENARIOS);
    var html = '';
    for (var i = 0; i < keys.length; i++) {
      var sc = T.SCENARIOS[keys[i]];
      html += '<button class="scenario-card" data-key="' + keys[i] + '" title="' + sc.subtitle + '">' +
        '<span class="scenario-name">' + sc.name + '</span>' +
        '<span class="scenario-sub">' + sc.subtitle.substring(0, 50) + '</span>' +
        '</button>';
    }
    _container.innerHTML = html;

    // Click handlers
    var cards = _container.querySelectorAll('.scenario-card');
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        var key = this.dataset.key;
        var scenario = T.SCENARIOS[key];
        if (scenario && _onSelect) {
          _onSelect(scenario);
          showContext(scenario);
          // Highlight selected
          cards.forEach(function (c) { c.classList.remove('selected'); });
          this.classList.add('selected');
        }
      });
    });
  };

  function showContext(scenario) {
    if (!_contextPanel) return;
    _contextPanel.innerHTML =
      '<div class="context-content">' +
        '<strong>' + scenario.name + '</strong>' +
        '<p>' + scenario.lesson + '</p>' +
        '<p class="context-question"><em>' + scenario.question + '</em></p>' +
        '<button class="context-close" onclick="Taludes.Scenarios.hideContext()">&times;</button>' +
      '</div>';
    _contextPanel.style.display = 'block';
    _contextPanel.classList.add('show');

    // Auto-hide after 15s
    clearTimeout(_contextTimeout);
    _contextTimeout = setTimeout(function () {
      Scenarios.hideContext();
    }, 15000);
  }

  Scenarios.hideContext = function () {
    if (_contextPanel) {
      _contextPanel.classList.remove('show');
      setTimeout(function () {
        _contextPanel.style.display = 'none';
      }, 300);
    }
    clearTimeout(_contextTimeout);
  };

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
