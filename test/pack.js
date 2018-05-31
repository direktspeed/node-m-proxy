;(function () {
'use strict';

var fs = require('fs');
var infile = process.argv[2];
var outfile = process.argv[3];
var sni = require('sni');

if (!infile || !outfile) {
  console.error("Usage:");
  console.error("node test/pack.js test/input.json test/output.bin");
  process.exit(1);
  return;
}

var path = require('path');
var json = JSON.parse(fs.readFileSync(infile, 'utf8'));
var data = require('fs').readFileSync(path.resolve(path.dirname(infile), json.filepath), null);
var Packer = require('../index.js');

var servername = sni(data);
var m = data.toString().match(/(?:^|[\r\n])Host: ([^\r\n]+)[\r\n]*/im);
var hostname = (m && m[1].toLowerCase() || '').split(':')[0];

/*
function pack() {
  var version = json.version;
  var address = json.address;
  var header = address.family + ',' + address.address + ',' + address.port + ',' + data.byteLength
    + ',' + (address.service || '') + ',' + (address.serviceport || '') + ',' + (servername || hostname || '')
    ;
  var buf = Buffer.concat([
    Buffer.from([ 255 - version, header.length ])
  , Buffer.from(header)
  , data
  ]);
}
*/

json.address.name = servername || hostname;
var buf = Packer.pack(json.address, data);
fs.writeFileSync(outfile, buf, null);
console.log("wrote " + buf.byteLength + " bytes to '" + outfile + "' ('hexdump " + outfile + "' to inspect)");

}());
