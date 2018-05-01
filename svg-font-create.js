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

// var parser = new ArgumentParser({
//   addHelp: true,
//   description: 'Pupil Labs internal tool. Join multiple fonts to single one and create JS configs for processing'
// });
// parser.addArgument([ '-i', '--input_fonts' ], { help: 'Input fonts paths', required: true, nargs : '+' });
// parser.addArgument([ '-o', '--output' ], { help: 'Output font file path', required: true });
// // parser.addArgument([ '-s', '--output_server' ], { help: 'Output server config path' });

// var args = parser.parseArgs();

////////////////////////////////////////////////////////////////////////////////

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

// template for scaled svgs
  var testTemplate = ({
    height,
    width,
    viewbox,
    d
  })  =>
  `<svg height="${height}" width="${width}" viewBox="${viewbox}" xmlns="http://www.w3.org/2000/svg">
  <path d="${d}"/>
</svg>`;

////////////////////////////////////////////////////////////////////////////////

// parse svg to object attributes
function parseSvgImage(data, filename) {

  let parser = new Domparser();
  let doc = parser.parseFromString(data, 'image/svg+xml');
  let svg = doc.getElementsByTagName('svg')[0];
  
  var height = svg.getAttribute('height');
  var width  = svg.getAttribute('width');
  var viewbox = svg.getAttribute('viewBox');
  
  if (!svg.hasAttribute('height')) {
    throw `Missed height attribute in ${filename}`;
  } else if (!svg.hasAttribute('width')) {
    throw `Missed width attribute in ${filename}`;
  }
  
  var path = svg.getElementsByTagName('path');
  
  if (path.length > 1) {
    
    for (let i = 0; i < path.length; i++) {
      let paths = path[i];
      let path_d = paths.getAttribute('d')

      // remove svgs that have bounding box
      if (paths.getAttribute('d').match(/M0.+/g) ) {
        svg.removeChild(paths);
      } 
    }

  } else if (path.length === 0) {
    throw `No path data found ${filename}`;
  }

  
  path = path[0];
  var d = path.getAttribute('d');

  return { 
    height,
    width,
    d,
    viewbox };
}

let fontSrc = './src';
let fontDir = fs.readdirSync(fontSrc);
let output = path.join('./font', fontDir.toString() + '.svg');


// scale svg if it's from other icon sets
function scale_icons(svgname, fontdir) {
  var file_name = path.join('./src', fontdir , svgname);
  var file_read = fs.readFileSync(file_name, 'utf8');
  var svg = parseSvgImage(fs.readFileSync(file_name, 'utf8'), file_name);

  var viewbox = 1000;
  var dimens = '';

  if (svg.height === svg.width){
    dimens = svg.height;
  }

  var icon_size = dimens;
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

  var svg_obj = { 
    width: svg.width,
    height: svg.height,
    viewbox: svg.viewbox,
    d: svg.d
  };

  var svg_resized = testTemplate(svg_obj);
  fs.writeFileSync(`./src/${fontdir}/${svgname}`, svg_resized, 'utf8');
}


function createSvgFont(fontSrc, fontDir, output) {
  var folder = fontDir.toString();
  var cfg = yaml.load(fs.readFileSync(path.resolve('./config.yml'), 'utf8'));
  var config_glyph = cfg.glyphs;
  var arr = [];

  let font = {
    fontname: 'pupil_icons',
    familyname: 'pupil',
    ascent: 850,
    descent: -150
  };

  for (var i = 0; i < config_glyph.length; i++) {
    var _config = config_glyph[i];
    var { codename, code } = _config;    
    var file_name = path.join(fontSrc, folder, codename + '.svg');
    var svg = parseSvgImage(fs.readFileSync(file_name, 'utf8'), file_name);

    var scale = cfg.font.scale;
    var vb = cfg.font.viewbox;
    var x = vb * scale;
    var y = vb - x;
    var z = y / 2;

    var trans_x = z;
    var trans_y = z + cfg.font.descent;

    var transformed = new SvgPath(svg.d)
      .scale(scale)
      .translate(trans_x, trans_y)
      .abs()
      .round()
      .rel()
      .toString();

    var glyphs = {};

    glyphs.width = svg.width;
    glyphs.name = codename;
    glyphs.d = transformed;
    glyphs.unicode = '&#x' + code.toString(16) + ';';

    arr.push(glyphs);
    
    
  }
  
  var svgOut = svgFontTemplate({
                  font,
                  glyphs: arr,
                  metadata: 'Internal font for pupil software',
                  fontHeight : font.ascent - font.descent
                });

    
  // create single font svg
  fs.writeFileSync(output, svgOut, 'utf8');

}

// scale
for (let i = 0; i < fontDir.length; i++) {
  let svg_folder = fontDir[i];
  let fontFolder = path.join(fontSrc, svg_folder);

  let _svg = fs.readdirSync(fontFolder);

  for (let i = 0; i < _svg.length; i++) {
    let svgs = _svg[i];
    let svgfile = path.join(fontFolder, svgs)
    var svg = parseSvgImage(fs.readFileSync(svgfile, 'utf8'), svgfile);

    if (svg.height == 24) {
      scale_icons(svgs, svg_folder)
      createSvgFont(fontSrc, fontDir, output);
    } else {
      createSvgFont(fontSrc, fontDir, output);
    }

  }

}
