;(function () {
'use strict';

var fs = require('fs');
var infile = process.argv[2];
var outfile = process.argv[3];

if (!infile || !outfile) {
  console.error("Usage:");
  console.error("node test-pack.js input.json output.bin");
  process.exit(1);
  return;
}

var json = JSON.parse(fs.readFileSync(infile, 'utf8'));
var data = require('fs').readFileSync(json.filepath, null);
var Packer = require('./index.js');

/*
function pack() {
  var version = json.version;
  var address = json.address;
  var header = address.family + ',' + address.address + ',' + address.port + ',' + data.byteLength
    + ',' + (address.service || '')
    ;
  var buf = Buffer.concat([
    Buffer.from([ 255 - version, header.length ])
  , Buffer.from(header)
  , data
  ]);
}
*/

var buf = Packer.pack(json.address, data);
fs.writeFileSync(outfile, buf, null);
console.log("wrote " + buf.byteLength + " bytes to '" + outfile + "' ('hexdump " + outfile + "' to inspect)");

}());
