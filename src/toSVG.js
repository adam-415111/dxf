import { pd } from 'pretty-data'

import BoundingBox from './BoundingBox'
import denormalise from './denormalise'
import entityToPolyline from './entityToPolyline'
import colors from './util/colors'
import logger from './util/logger'

const TextToSVG = require('text-to-svg');
const textToSVG = TextToSVG.loadSync();

const ALL_BLACK = true // Paint all lines black
const USE_STROKE_PERCENT = true
const STROKE_WIDTH_PERCENT = 0.3 // Stroke width relative to viewport
const STROKE_WIDTH_ABS = 10 // Stroke width absolute value

const TEXT_FILL = 'red'
const TEXT_STROKE = 'black'

const polylineToPath = (rgb, polyline) => {
  const color24bit = rgb[2] | (rgb[1] << 8) | (rgb[0] << 16)
  let prepad = color24bit.toString(16)
  for (let i = 0, il = 6 - prepad.length; i < il; ++i) {
    prepad = '0' + prepad
  }
  let hex = '#' + prepad

  if(ALL_BLACK) {
    hex = '#000000'
  }
  // SVG is white by default, so make white lines black
  else if (hex === '#ffffff') {
    hex = '#000000'
  }

  const d = polyline.reduce(function (acc, point, i) {
    acc += (i === 0) ? 'M' : 'L'
    acc += point[0] + ',' + point[1]
    return acc
  }, '')
  return USE_STROKE_PERCENT ? '<path fill="none" stroke="' + hex + '" stroke-width="' + STROKE_WIDTH_PERCENT + '%" d="' + d + '"/>'
    : '<path fill="none" stroke="' + hex + '" stroke-width="' + STROKE_WIDTH_ABS + '" d="' + d + '"/>'
}

function applyTransforms(entity) {
  let x = entity.x;
  let y = entity.y;
  entity.transforms.forEach(transform => {
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
  })
  return {x: x - entity.refRectangleWidth / 4, y: y - entity.nominalTextHeight}
}

/**
 * Convert the interpolate polylines to SVG
 */
export default (parsed) => {
  const entities = denormalise(parsed)
  const polylines = entities.map(e => {
    return entityToPolyline(e)
  })

  const bbox = new BoundingBox()
  polylines.forEach(polyline => {
    polyline.forEach(point => {
      bbox.expandByPoint(point[0], point[1])
    })
  })

  const paths = []
  polylines.forEach((polyline, i) => {
    const entity = entities[i]
    const layerTable = parsed.tables.layers[entity.layer]
    if (!layerTable) {
      throw new Error('no layer table for layer:' + entity.layer)
    }

    // TODO: not sure if this prioritization is good (entity color first, layer color as fallback)
    let colorNumber = ('colorNumber' in entity) ? entity.colorNumber : layerTable.colorNumber
    let rgb = colors[colorNumber]
    if (rgb === undefined) {
      logger.warn('Color index', colorNumber, 'invalid, defaulting to black')
      rgb = [0, 0, 0]
    }

    const p2 = polyline.map(function (p) {
      return [p[0], -p[1]]
    })
    paths.push(polylineToPath(rgb, p2))
  })

  entities.map(e => {
    if (e.type === 'MTEXT' && e.string) {
      let point;
      if (e.transforms.length >= 1) {
        point = applyTransforms(e);
      } else {
        point = {x: e.x - e.refRectangleWidth / 4, y: e.y - e.nominalTextHeight}
      }
      const attributes = { fill: TEXT_FILL, stroke: TEXT_STROKE }
      const options = {x: point.x, y: -point.y, fontSize: e.nominalTextHeight, attributes: attributes}
      paths.push(textToSVG.getPath(e.string, options))
    }
   })
   
  let svgString = '<?xml version="1.0"?>'
  svgString += '<svg xmlns="http://www.w3.org/2000/svg"'
  svgString += ' xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1"'
  svgString += ' preserveAspectRatio="xMinYMin meet"'
  svgString += ' viewBox="' +
    (bbox.minX) + ' ' +
    (-bbox.maxY) + ' ' +
    (bbox.width) + ' ' +
    (bbox.height) + '"'
  svgString += ' width="100%" height="100%">' + paths.join('') + '</svg>'
  return pd.xml(svgString)
}
