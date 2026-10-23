/* =============================================
   TALUDES — Canvas Mouse Interactions
   ============================================= */
(function (global) {
  'use strict';

  var T = global.Taludes = global.Taludes || {};
  var Interactions = T.Interactions = {};

  var _canvas;
  var _onCircleMove = null;
  var _onSliceHover = null;
  var _onSliceLeave = null;
  var _mouseWorldX = 0;
  var _mouseWorldY = 0;
  var _showCoords = false;

  Interactions.init = function (canvasEl, callbacks) {
    _canvas = canvasEl;
    _onCircleMove = callbacks.onCircleMove;
    _onSliceHover = callbacks.onSliceHover;
    _onSliceLeave = callbacks.onSliceLeave;

    _canvas.addEventListener('click', handleClick);
    _canvas.addEventListener('mousemove', handleMouseMove);
    _canvas.addEventListener('mouseleave', handleMouseLeave);
  };

  function getCanvasPos(e) {
    var rect = _canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function handleClick(e) {
    if (!_onCircleMove) return;
    var pos = getCanvasPos(e);
    var world = T.Renderer.canvasToWorld(pos.x, pos.y);
    if (world) {
      _onCircleMove(world.x, world.y);
    }
  }

  function handleMouseMove(e) {
    var pos = getCanvasPos(e);
    var world = T.Renderer.canvasToWorld(pos.x, pos.y);
    if (!world) return;

    _mouseWorldX = world.x;
    _mouseWorldY = world.y;
    _showCoords = true;

    // Hit test slices
    var idx = T.Renderer.hitTestSlice(world.x, world.y);
    if (idx >= 0) {
      T.Renderer.setHoveredSlice(idx);
      if (_onSliceHover) _onSliceHover(idx);
      _canvas.style.cursor = 'pointer';
    } else {
      T.Renderer.setHoveredSlice(-1);
      if (_onSliceLeave) _onSliceLeave();
      _canvas.style.cursor = 'crosshair';
    }

    // Draw coordinates overlay
    T.Renderer.drawMouseCoords(world.x, world.y);
  }

  function handleMouseLeave() {
    _showCoords = false;
    T.Renderer.setHoveredSlice(-1);
    if (_onSliceLeave) _onSliceLeave();
    T.Renderer.requestRender();
  }

  Interactions.getMouseWorld = function () {
    return { x: _mouseWorldX, y: _mouseWorldY, visible: _showCoords };
  };

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
