#!/usr/bin/env node

'use strict';

var fs        = require('fs');
var path      = require('path');
var _         = require('lodash');
var yaml      = require('js-yaml');
var Domparser      = require('xmldom').DOMParser;
var ArgumentParser = require('argparse').ArgumentParser;
var SvgPath   = require('svgpath');

////////////////////////////////////////////////////////////////////////////////

var parser = new ArgumentParser({
  addHelp: true,
  description: 'Pupil Labs internal tool. Join multiple fonts to single one and create JS configs for processing'
});
parser.addArgument([ '-i', '--input_fonts' ], { help: 'Input fonts paths', required: true, nargs : '+' });
parser.addArgument([ '-o', '--output' ], { help: 'Output font file path', required: true });
// parser.addArgument([ '-s', '--output_server' ], { help: 'Output server config path' });

var args = parser.parseArgs();

////////////////////////////////////////////////////////////////////////////////

// template for scaled svgs
var svgTemplate = _.template(
  '<svg height="<%= svg.height %>" width="<%= svg.width %>" viewBox="<%= svg.viewbox %>" xmlns="http://www.w3.org/2000/svg">\n' +
  '<path d="<%= svg.d %>"/>\n' +
  '</svg>'
);

// font template
var svgFontTemplate = _.template(
    '<?xml version="1.0" standalone="no"?>\n' +
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
    '<svg xmlns="http://www.w3.org/2000/svg">\n' +
    '<metadata><%= metadata %></metadata>\n' +
    '<defs>\n' +
    '<font id="<%= font.fontname %>" horiz-adv-x="<%= fontHeight %>" >\n' +

    '<font-face' +
      ' font-family="font.familyname"' +
      ' font-weight="400"' +
      ' font-stretch="normal"' +
      ' units-per-em="<%= fontHeight %>"' +
      ' ascent="<%= font.ascent %>"' +
      ' descent="<%= font.descent %>"' +
    ' />\n' +

    '<missing-glyph horiz-adv-x="<%= fontHeight %>" />\n' +

    '<% _.forEach(glyphs, function(glyph) { %>' +
      '<glyph' +
        ' glyph-name="<%= glyph.name %>"' +
        ' unicode="<%= glyph.unicode %>"' +
        ' d="<%= glyph.d %>"' +
        ' horiz-adv-x="<%= glyph.width %>"' +
      ' />\n' +
    '<% }); %>' +

    '</font>\n' +
    '</defs>\n' +
    '</svg>'
  );

////////////////////////////////////////////////////////////////////////////////


// parse svg to object attributes
function parseSvgImage(data, filename) {

  var parser = new Domparser();
  var doc = parser.parseFromString(data, 'image/svg+xml');
  var svg = doc.getElementsByTagName('svg')[0];

  if (!svg.hasAttribute('height')) {
    throw `Missed height attribute in ${filename}`;
  }
  if (!svg.hasAttribute('width')) {
    throw `Missed width attribute in ${filename}`;
  }

  var height = svg.getAttribute('height');
  var width  = svg.getAttribute('width');
  var viewbox = svg.getAttribute('viewBox');

  // Silly strip 'px' at the end, if exists
  height = parseFloat(height);
  width  = parseFloat(width);

  var path = svg.getElementsByTagName('path');

  if (path.length > 1) {
    for (let i = 0; i < path.length; i++) {
      const paths = path[i];
      // remove svgs that have bounding box
      if ( paths.getAttribute('d').match(/M0.+/g) ) {
        svg.removeChild(paths);
      }
      console.log(`Multiple paths removed: ${filename}`);
   }
  }
  if (path.length === 0) {
    throw `No path data found ${filename}`;
  }

  path = path[0];

  var d = path.getAttribute('d');

  // var transform = '';

  // if (path.hasAttribute('transform')) {
  //   transform = path.getAttribute('transform');
  // }

  return { height, width, d, viewbox };
}

// scale svg if it's from other icon sets
function scale_icons() {
  var file_name = path.join('./svgs', '' + '.svg');
  var file_read = fs.readFileSync(file_name, 'utf8');
  var svg = parseSvgImage(fs.readFileSync(file_name, 'utf8'), file_name);

  var viewbox = 1000;
  var icon_size = svg.height;
  var scale = viewbox / icon_size;

  var trans = viewbox / 2;

  var transformed = new SvgPath(svg.d)
                          .scale(scale)
                          .abs().round(1).rel()
                          .toString();

  svg.d = transformed;
  svg.height = viewbox;
  svg.width = viewbox;
  svg.viewbox = `0 0 ${viewbox} ${viewbox}`;

  var svg_resized = svgTemplate({svg});

  fs.writeFileSync('./svgs/test.svg', svg_resized, 'utf8');
}




// server config, to build svg fonts
// contains uid hash + svg paths, to generate font quickly
// var configServer = {
//   icons : {},
//   fonts : {},
//   metas : {}
// };

////////////////////////////////////////////////////////////////////////////////


// Clean up script and remove config file
// try to use vanilla js

// Scan sources
// we don't need to loop - but could keep it in if we ever want to add more than one font

var data = {}; // or wherever you get it from)

function svg2ttf(argument) {
  for (var i = Things.length - 1; i >= 0; i--) {
      Things[i]
    }  


    for (var key in defaultData){
       data[key] = data[key] || defaultData[key];
    }
} 


_.forEach(args.input_fonts, function (fontDir) {
  // Iterate each font
  var cfg = yaml.load(fs.readFileSync(path.resolve('./config.yml'), 'utf8'));

  // push font info to server config
  configServer.fonts[cfg.font.fontname] = _.clone(cfg.font, true);
  configServer.metas[cfg.font.fontname] = _.clone(cfg.meta, true);

  // iterate glyphs
  _.forEach(cfg.glyphs, function (glyph) {

    // Cleanup fields list
    var glyph_data = _.pick(glyph, ['codename', 'code']);

    // Add more data for server config
    glyph_data.fontname = cfg.font.fontname;

    glyph_data.svg = {};

    // load svg file & translate coordinates
    var file_name = path.join('./svgs', glyph_data.codename + '.svg');
    var svg = parseSvgImage(fs.readFileSync(file_name, 'utf8'), file_name);

    // FIXME: Apply transform from svg file. Now we understand
    // pure paths only.
    var scale = cfg.font.scale
    var vb = 1000
    var x = vb * scale
    var y = vb - x
    var z = y / 2

    var trans_x = z
    var trans_y = z + cfg.font.descent

    glyph_data.svg.width = +(svg.width).toFixed(1);
    // !!key algo for transformation!!
    glyph_data.svg.d = new SvgPath(svg.d)
                            .scale(scale)
                            .translate(trans_x, trans_y)
                            .abs().round(1).rel()
                            .toString();

    configServer.icons[glyph.fullname] = _.clone(glyph_data, true);
  });
});

// Write out configs
// fs.writeFileSync(args.output_server, 'module.exports = ' + JSON.stringify(configServer, null, 2), 'utf8');

// Prepare SVG structures & write font file
var font = {
  fontname: 'pupil_icons',
  familyname: 'pupil',
  ascent: 850,
  descent: -150
};

var glyphs = [];

_.forEach(configServer.icons, function (glyph) {

  glyphs.push({
    height : glyph.svg.height,
    width : glyph.svg.width,
    d     : new SvgPath(glyph.svg.d)
                  .scale(1, -1)
                  .translate(0, font.ascent + font.descent)
                  .abs().round(0).rel()
                  .toString(),
    name   : glyph.codename,
    unicode : '&#x' + glyph.code.toString(16) + ';'
  });
});


var svgOut = svgFontTemplate({
  font,
  glyphs,
  metadata: 'internal font for pupil software',
  fontHeight : font.ascent - font.descent
});

fs.writeFileSync(args.output, svgOut, 'utf8');