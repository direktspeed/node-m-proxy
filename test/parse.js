'use strict';

var sni = require('sni');
var hello = require('fs').readFileSync(__dirname + '/sni.hello.bin');
var version = 1;
var address = {
  family: 'IPv4'
, address: '127.0.1.1'
, port: 4321
, service: 'foo-https'
, serviceport: 443
, name: 'foo-pokemap.hellabit.com'
};
var header = address.family + ',' + address.address + ',' + address.port + ',' + hello.byteLength
  + ',' + (address.service || '') + ',' + (address.serviceport || '') + ',' + (address.name || '')
  ;
var buf = Buffer.concat([
  Buffer.from([ 255 - version, header.length ])
, Buffer.from(header)
, hello
]);
var services = { 'ssh': 22, 'http': 4080, 'https': 8443 };
var clients = {};
var count = 0;
var packer = require('../');
var machine = packer.create({
  onmessage: function (tun) {
    var id = tun.family + ',' + tun.address + ',' + tun.port;
    var service = 'https';
    var port = services[service];
    var servername = sni(tun.data);

    console.log('');
    console.log('[onMessage]');
    if (!tun.data.equals(hello)) {
      throw new Error("'data' packet is not equal to original 'hello' packet");
    }
    console.log('all', tun.data.byteLength, 'bytes are equal');
    console.log('src:', tun.family, tun.address + ':' + tun.port + ':' + tun.serviceport);
    console.log('dst:', 'IPv4 127.0.0.1:' + port);

    if (!clients[id]) {
      clients[id] = true;
      if (!servername) {
        throw new Error("no servername found for '" + id + "'");
      }
      console.log("servername: '" + servername + "'", tun.name);
    }

    count += 1;
  }
, onerror: function () {
    throw new Error("Did not expect onerror");
  }
, onend: function () {
    throw new Error("Did not expect onend");
  }
});
var packed = packer.pack(address, hello);

if (!packed.equals(buf)) {
  console.error(buf.toString('hex') === packed.toString('hex'));
  console.error(packed.toString('hex'), packed.byteLength);
  console.error(buf.toString('hex'), buf.byteLength);
  throw new Error("packer did not pack as expected");
}


console.log('');

// full message in one go
// 223 = 2 + 22 + 199
console.log('[WHOLE BUFFER]', 2, header.length, hello.length, buf.byteLength);
clients = {};
machine.fns.addChunk(buf);
console.log('');


// messages one byte at a time
console.log('[BYTE-BY-BYTE BUFFER]', 1);
clients = {};
buf.forEach(function (byte) {
  machine.fns.addChunk(Buffer.from([ byte ]));
});
console.log('');


// split messages in overlapping thirds
// 0-2      (2)
// 2-24     (22)
// 24-223   (199)
// 223-225  (2)
// 225-247  (22)
// 247-446  (199)
buf = Buffer.concat([ buf, buf ]);
console.log('[OVERLAPPING BUFFERS]', buf.length);
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
console.log('');

process.on('exit', function () {
  if (count !== 4) {
    throw new Error("should have delivered 4 messages, not", count);
  }
  console.log('TESTS PASS');
  console.log('');
});
