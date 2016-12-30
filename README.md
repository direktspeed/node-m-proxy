<!-- AD_TPL_BEGIN -->

About Daplie: We're taking back the Internet!
--------------

Down with Google, Apple, and Facebook!

We're re-decentralizing the web and making it read-write again - one home cloud system at a time.

Tired of serving the Empire? Come join the Rebel Alliance:

<a href="mailto:jobs@daplie.com">jobs@daplie.com</a> | [Invest in Daplie on Wefunder](https://daplie.com/invest/) | [Pre-order Cloud](https://daplie.com/preorder/), The World's First Home Server for Everyone

<!-- AD_TPL_END -->

# tunnel-packer

A strategy for packing and unpacking tunneled network messages (or any stream) in node.js

Examples

```js
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
