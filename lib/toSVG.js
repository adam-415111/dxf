'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _prettyData = require('pretty-data');

var _BoundingBox = require('./BoundingBox');

var _BoundingBox2 = _interopRequireDefault(_BoundingBox);

var _denormalise = require('./denormalise');

var _denormalise2 = _interopRequireDefault(_denormalise);

var _entityToPolyline = require('./entityToPolyline');

var _entityToPolyline2 = _interopRequireDefault(_entityToPolyline);

var _colors = require('./util/colors');

var _colors2 = _interopRequireDefault(_colors);

var _logger = require('./util/logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var TextToSVG = require('text-to-svg');
var textToSVG = TextToSVG.loadSync();

var ALL_BLACK = true; // Paint all lines black
var USE_STROKE_PERCENT = true;
var STROKE_WIDTH_PERCENT = 0.3; // Stroke width relative to viewport
var STROKE_WIDTH_ABS = 10; // Stroke width absolute value

var TEXT_FILL = 'red';
var TEXT_STROKE = 'black';

var polylineToPath = function polylineToPath(rgb, polyline) {
  var color24bit = rgb[2] | rgb[1] << 8 | rgb[0] << 16;
  var prepad = color24bit.toString(16);
  for (var i = 0, il = 6 - prepad.length; i < il; ++i) {
    prepad = '0' + prepad;
  }
  var hex = '#' + prepad;

  if (ALL_BLACK) {
    hex = '#000000';
  }
  // SVG is white by default, so make white lines black
  else if (hex === '#ffffff') {
      hex = '#000000';
    }

  var d = polyline.reduce(function (acc, point, i) {
    acc += i === 0 ? 'M' : 'L';
    acc += point[0] + ',' + point[1];
    return acc;
  }, '');
  return USE_STROKE_PERCENT ? '<path fill="none" stroke="' + hex + '" stroke-width="' + STROKE_WIDTH_PERCENT + '%" d="' + d + '"/>' : '<path fill="none" stroke="' + hex + '" stroke-width="' + STROKE_WIDTH_ABS + '" d="' + d + '"/>';
};

function applyTransforms(entity) {
  var x = entity.x;
  var y = entity.y;
  entity.transforms.forEach(function (transform) {
    /*   if (transform.xScale) {
         x = x * transform.xScale
       }
       if (transform.yScale) {
         y = y * transform.yScale
       }
       */

    if (transform.x) {
      x = x + transform.x;
    }
    if (transform.y) {
      y = y + transform.y;
    }
  });
  return { x: x - entity.refRectangleWidth / 4, y: y - entity.nominalTextHeight };
}

/**
 * Convert the interpolate polylines to SVG
 */

exports.default = function (parsed) {
  var entities = (0, _denormalise2.default)(parsed);
  var polylines = entities.map(function (e) {
    return (0, _entityToPolyline2.default)(e);
  });

  var bbox = new _BoundingBox2.default();
  polylines.forEach(function (polyline) {
    polyline.forEach(function (point) {
      bbox.expandByPoint(point[0], point[1]);
    });
  });

  var paths = [];
  polylines.forEach(function (polyline, i) {
    var entity = entities[i];
    var layerTable = parsed.tables.layers[entity.layer];
    if (!layerTable) {
      throw new Error('no layer table for layer:' + entity.layer);
    }

    // TODO: not sure if this prioritization is good (entity color first, layer color as fallback)
    var colorNumber = 'colorNumber' in entity ? entity.colorNumber : layerTable.colorNumber;
    var rgb = _colors2.default[colorNumber];
    if (rgb === undefined) {
      _logger2.default.warn('Color index', colorNumber, 'invalid, defaulting to black');
      rgb = [0, 0, 0];
    }

    var p2 = polyline.map(function (p) {
      return [p[0], -p[1]];
    });
    paths.push(polylineToPath(rgb, p2));
  });

  entities.map(function (e) {
    if (e.type === 'MTEXT' && e.string) {
      var point = void 0;
      if (e.transforms.length >= 1) {
        point = applyTransforms(e);
      } else {
        point = { x: e.x - e.refRectangleWidth / 4, y: e.y - e.nominalTextHeight };
      }
      var attributes = { fill: TEXT_FILL, stroke: TEXT_STROKE };
      var options = { x: point.x, y: -point.y, fontSize: e.nominalTextHeight, attributes: attributes };
      paths.push(textToSVG.getPath(e.string, options));
    }
  });

  var svgString = '<?xml version="1.0"?>';
  svgString += '<svg xmlns="http://www.w3.org/2000/svg"';
  svgString += ' xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"';
  svgString += ' preserveAspectRatio="xMinYMin meet"';
  svgString += ' viewBox="' + bbox.minX + ' ' + -bbox.maxY + ' ' + bbox.width + ' ' + bbox.height + '"';
  svgString += ' width="100%" height="100%">' + paths.join('') + '</svg>';
  return _prettyData.pd.xml(svgString);
};