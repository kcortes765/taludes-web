/* =============================================
   TALUDES — Reactive State
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes = global.Taludes || {};

  T.State = {
    _data: {},
    _listeners: [],
    _batchDepth: 0,
    _pendingNotify: false,

    init: function (defaults) {
      this._data = Object.assign({}, defaults);
    },

    get: function (key) {
      return key ? this._data[key] : Object.assign({}, this._data);
    },

    set: function (key, value) {
      if (typeof key === 'object') {
        var changed = false;
        for (var k in key) {
          if (key.hasOwnProperty(k) && this._data[k] !== key[k]) {
            this._data[k] = key[k];
            changed = true;
          }
        }
        if (changed) this._notify();
      } else if (this._data[key] !== value) {
        this._data[key] = value;
        this._notify();
      }
    },

    batch: function (fn) {
      this._batchDepth++;
      fn();
      this._batchDepth--;
      if (this._batchDepth === 0 && this._pendingNotify) {
        this._pendingNotify = false;
        this._doNotify();
      }
    },

    subscribe: function (fn) {
      this._listeners.push(fn);
      return function () {
        var idx = this._listeners.indexOf(fn);
        if (idx >= 0) this._listeners.splice(idx, 1);
      }.bind(this);
    },

    _notify: function () {
      if (this._batchDepth > 0) {
        this._pendingNotify = true;
        return;
      }
      this._doNotify();
    },

    _doNotify: function () {
      var data = this._data;
      for (var i = 0; i < this._listeners.length; i++) {
        this._listeners[i](data);
      }
    }
  };

  // Debounce utility
  T.debounce = function (fn, delay) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  };

  T.throttle = function (fn, delay) {
    var last = 0;
    return function () {
      var now = Date.now();
      if (now - last >= delay) {
        last = now;
        fn.apply(this, arguments);
      }
    };
  };

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
