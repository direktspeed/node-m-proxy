# tunnel-packer

A strategy for packing and unpacking tunneled network messages (or any stream) in node.js

Examples

```
var Packer = require('tunnel-packer');

Packer.create({
  onmessage: function (msg) {
    // msg = { family, address, port, service, data };
  }
, onend: function (msg) {
    // msg = { family, address, port };
  }
, onerror: function (err) {
    // err = { message, family, address, port };
  }
});

var chunk = Packer.pack(address, data, service);
var addr = Packer.socketToAddr(socket);
var id = Packer.addrToId(address);
var id = Packer.socketToId(socket);

var myDuplex = Packer.Stream.create(socketOrStream);

var myTransform = Packer.Transform.create({
  address: {
    family: '...'
  , address: '...'
  , port: '...'
  }
  // hint at the service to be used
, service: 'https'
});
```
