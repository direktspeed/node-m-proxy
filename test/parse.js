'use strict';

var sni = require('sni');
var hello = require('fs').readFileSync(__dirname + '/sni.hello.bin');
var version = 1;
function getAddress() {
  return {
    family: 'IPv4'
  , address: '127.0.1.1'
  , port: 4321
  , service: 'foo-https'
  , serviceport: 443
  , name: 'foo-pokemap.hellabit.com'
  };
}
var addr = getAddress();
var connectionHeader = addr.family + ',' + addr.address + ',' + addr.port
  + ',0,connection,'
  + (addr.serviceport || '') + ',' + (addr.name || '') + ',' + (addr.service || '')
  ;
var           header = addr.family + ',' + addr.address + ',' + addr.port
  + ',' + hello.byteLength + ',' + (addr.service || '') + ','
  + (addr.serviceport || '') + ',' + (addr.name || '')
  ;
var        endHeader = addr.family + ',' + addr.address + ',' + addr.port
  + ',0,end,'
  + (addr.serviceport || '') + ',' + (addr.name || '')
  ;
var buf = Buffer.concat([
  Buffer.from([ 255 - version, connectionHeader.length ])
, Buffer.from(connectionHeader)
, Buffer.from([ 255 - version, header.length ])
, Buffer.from(header)
, hello
, Buffer.from([ 255 - version, endHeader.length ])
, Buffer.from(endHeader)
]);
var services = { 'ssh': 22, 'http': 4080, 'https': 8443 };
var clients = {};
var count = 0;
var packer = require('../');
var machine = packer.create({
  onconnection: function (tun) {
    console.info('');
    if (!tun.service || 'connection' === tun.service) {
      throw new Error("missing service: " + JSON.stringify(tun));
    }
    console.info('[onConnection]');
    count += 1;
  }
, onmessage: function (tun) {
    //console.log('onmessage', tun);
    var id = tun.family + ',' + tun.address + ',' + tun.port;
    var service = 'https';
    var port = services[service];
    var servername = sni(tun.data);

    console.info('[onMessage]', service, port, servername, tun.data.byteLength);
    if (!tun.data.equals(hello)) {
      throw new Error("'data' packet is not equal to original 'hello' packet");
    }
    //console.log('all', tun.data.byteLength, 'bytes are equal');
    //console.log('src:', tun.family, tun.address + ':' + tun.port + ':' + tun.serviceport);
    //console.log('dst:', 'IPv4 127.0.0.1:' + port);

    if (!clients[id]) {
      clients[id] = true;
      if (!servername) {
        throw new Error("no servername found for '" + id + "'");
      }
      //console.log("servername: '" + servername + "'", tun.name);
    }

    count += 1;
  }
, onerror: function () {
    throw new Error("Did not expect onerror");
  }
, onend: function () {
    console.info('[onEnd]');
    count += 1;
  }
});

var packts, packed;

packts = [];
packts.push(packer.packHeader(getAddress(), null, 'connection'));
//packts.push(packer.pack(address, hello));
packts.push(packer.packHeader(getAddress(), hello));
packts.push(hello);
packts.push(packer.packHeader(getAddress(), null, 'end'));
packed = Buffer.concat(packts);

if (!packed.equals(buf)) {
  console.error("");
  console.error(buf.toString('hex') === packed.toString('hex'));
  console.error("");
  console.error("auto-packed:");
  console.error(packed.toString('hex'), packed.byteLength);
  console.error("");
  console.error("hand-packed:");
  console.error(buf.toString('hex'), buf.byteLength);
  console.error("");
  throw new Error("packer (new) did not pack as expected");
}

packts = [];
packts.push(packer.pack(getAddress(), null, 'connection'));
packts.push(packer.pack(getAddress(), hello));
//packts.push(packer.packHeader(getAddress(), hello));
//packts.push(hello);
packts.push(packer.pack(getAddress(), null, 'end'));
packed = Buffer.concat(packts);

// XXX TODO REMOVE
//
// Nasty fix for short-term backwards-compat
//
// In the old way of doing things we always have at least one byte
// of data (due to a parser bug which has now been fixed) and so
// there are two strings padded with a space which gives the
// data a length of 1 rather than 0
//
// Here all four of those instances are replaced, but it requires
// maching a few things on either side.
//
// Only 6 bytes are changed - two 1 => 0, four ' ' => ''
var hex = packed.toString('hex')
  //.replace(/2c313939/, '2c30')
  .replace(/32312c312c636f/, '32312c302c636f')
  .replace(/3332312c312c656e64/, '3332312c302c656e64')
  .replace(/7320/, '73')
  .replace(/20$/, '')
  ;
if (hex !== buf.toString('hex')) {
  console.error("");
  console.error(buf.toString('hex') === hex);
  console.error("");
  console.error("auto-packed:");
  console.error(hex, packed.byteLength);
  console.error("");
  console.error("hand-packed:");
  console.error(buf.toString('hex'), buf.byteLength);
  console.error("");
  throw new Error("packer (old) did not pack as expected");
}


console.info('');

// full message in one go
// 223 = 2 + 22 + 199
console.info('[WHOLE BUFFER]', 2, header.length, hello.length, buf.byteLength);
clients = {};
machine.fns.addChunk(buf);
console.info('');


// messages one byte at a time
console.info('[BYTE-BY-BYTE BUFFER]', 1);
clients = {};
buf.forEach(function (byte) {
  machine.fns.addChunk(Buffer.from([ byte ]));
});
console.info('');


// split messages in overlapping thirds
// 0-2      (2)
// 2-24     (22)
// 24-223   (199)
// 223-225  (2)
// 225-247  (22)
// 247-446  (199)
buf = Buffer.concat([ buf, buf ]);
console.info('[OVERLAPPING BUFFERS]', buf.length);
clients = {};
[ buf.slice(0, 7)                 // version + header
, buf.slice(7, 14)                // header
, buf.slice(14, 21)               // header
, buf.slice(21, 28)               // header + body
, buf.slice(28, 217)              // body
, buf.slice(217, 224)             // body + version
, buf.slice(224, 238)             // version + header
, buf.slice(238, buf.byteLength)  // header + body
].forEach(function (buf) {
  machine.fns.addChunk(Buffer.from(buf));
});
console.info('');

process.on('exit', function () {
  if (count !== 12) {
    throw new Error("should have delivered 12 messages, not " + count);
  }
  console.info('TESTS PASS');
  console.info('');
});
