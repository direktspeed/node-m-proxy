# proxy-packer | a [Root](https://rootprojects.org) project

"The M-PROXY Protocol" for node.js

A strategy for packing and unpacking multiplexed streams.
<small>Where you have distinct clients on one side trying to reach distinct servers on the other.</small>

```
Browser <--\                   /--> Device
Browser <---- M-PROXY Service ----> Device
Browser <--/                   \--> Device
```

<small>Many clients may connect to a single device. A single client may connect to many devices.</small>

It's the kind of thing you'd use to build a poor man's VPN, or port-forward router.

# The M-PROXY Protocol

This is similar to "The PROXY Protocol" (a la HAProxy), but desgined for multiplexed tls, http, tcp, and udp
tunneled over arbitrary streams (such as WebSockets).

It also has a backchannel for communicating with the proxy itself.

Each message has a header with a socket identifier (family, addr, port), and may have additional information.

```
<version><headerlen><family>,<address>,<port>,<datalen>,<service>,<port>,<name>
```

```
<254><45>IPv4,127.0.1.1,4321,199,https,443,example.com
```

```
version                  (8 bits) 254 is version 1

header length            (8 bits) the remaining length of the header before data begins

                                  These values are used to identify a specific client among many
socket family            (string) the IPv4 or IPv6 connection from a client
socket address           (string) the x.x.x.x remote address of the client
socket port              (string) the 1-65536 source port of the remote client

data length              (string) the number of bytes in the wrapped packet, in case the network re-chunks the packet

                                  These optional values can be very useful at the start of a new connection
service name             (string) Either a standard service name (port + protocol), such as 'https'
                                  as listed in /etc/services, otherwise 'tls', 'tcp', or 'udp' for generics
                                  Also used for messages with the proxy (i.e. authentication)
                                    * 'control' for proxy<->server messages, including authentication, health, etc
                                    * 'connection' for a specific client
                                    * 'error' for a specific client
                                    * 'pause' to pause upload to a specific client (not the whole tunnel)
                                    * 'resume' to resume upload to a specific client (not the whole tunnel)
service port             (string) The listening port, such as 443. Useful for non-standard or dynamic services.
host or server name      (string) Useful for services that can be routed by name, such as http, https, smtp, and dns.
```

## Tunneled TCP SNI Packet

You should see that the result is simply all of the original packet with a leading header.

Note that `16 03 01 00` starts at the 29th byte (at index 28 or 0x1C) instead of at index 0:

```
         0  1  2  3  4  5  6  7  8  9  A  B  C  D  D  F
0000000 fe 1a 49 50 76 34 2c 31 32 37 2e 30 2e 31 2e 31 <-- 0xfe = v1, 0x1a = 26 more bytes for header
0000010 2c 34 34 33 2c 31 39 39 2c 66 6f 6f
                                            16 03 01 00 <-- first 4 bytes of tcp packet
0000020 c2 01 00 00 be 03 03 57 e3 76 50 66 03 df 99 76
0000030 24 c8 31 e6 e8 08 34 6b b4 7b bb 2c f3 17 aa 5c
0000040 ec 09 da da 83 5a b2 00 00 56 00 ff c0 24 c0 23
0000050 c0 0a c0 09 c0 08 c0 28 c0 27 c0 14 c0 13 c0 12
0000060 c0 26 c0 25 c0 05 c0 04 c0 03 c0 2a c0 29 c0 0f
0000070 c0 0e c0 0d 00 6b 00 67 00 39 00 33 00 16 00 3d
0000080 00 3c 00 35 00 2f 00 0a c0 07 c0 11 c0 02 c0 0c
0000090 00 05 00 04 00 af 00 ae 00 8d 00 8c 00 8a 00 8b
00000a0 01 00 00 3f 00 00 00 19 00 17 00 00 14 70 6f 6b
00000b0 65 6d 61 70 2e 68 65 6c 6c 61 62 69 74 2e 63 6f
00000c0 6d 00 0a 00 08 00 06 00 17 00 18 00 19 00 0b 00
00000d0 02 01 00 00 0d 00 0c 00 0a 05 01 04 01 02 01 04
00000e0 03 02 03
00000e3
```

The v1 header uses strings for address and service descriptor information,
but future versions may be binary.

# API

```js
var Packer = require('proxy-packer');
```

## Unpacker / Parser State Machine

The unpacker creates a state machine.

Each data chunk going in must be in sequence (tcp guarantees this),
composing a full message with header and data (unless data length is 0).

The state machine progresses through these states:

-   version
-   headerLength
-   header
-   data

At the end of the data event (which may or may not contain a buffer of data)
one of the appropriate handlers will be called.

-   control
-   connection
-   message
-   pause
-   resume
-   end
-   error

```js
unpacker = Packer.create(handlers); // Create a state machine for unpacking

unpacker.fns.addData(chunk); // process a chunk of data

handlers.oncontrol = function(tun) {}; // for communicating with the proxy
// tun.data is an array
//     '[ -1, "[Error] bad hello" ]'
//     '[ 0, "[Error] out-of-band error message" ]'
//     '[ 1, "hello", 254, [ "add_token", "delete_token" ] ]'
//     '[ 1, "add_token" ]'
//     '[ 1, "delete_token" ]'

handlers.onconnection = function(tun) {}; // a client has established a connection

handlers.onmessage = function(tun) {}; // a client has sent a message
// tun = { family, address, port, data
//       , service, serviceport, name };

handlers.onpause = function(tun) {}; // proxy requests to pause upload to a client
// tun = { family, address, port };

handlers.onresume = function(tun) {}; // proxy requests to resume upload to a client
// tun = { family, address, port };

handlers.onend = function(tun) {}; // proxy requests to close a client's socket
// tun = { family, address, port };

handlers.onerror = function(err) {}; // proxy is relaying a client's error
// err = { message, family, address, port };
```

<!--
TODO

handlers.onconnect = function (tun) { }                   // a new client has connected

-->

## Packer & Extras

Packs header metadata about connection into a buffer (potentially with original data), ready to send.

```js
var headerAndBody = Packer.pack(tun, data); // Add M-PROXY header to data
// tun = { family, address, port
//       , service, serviceport, name }

var headerBuf = Packer.packHeader(tun, data); // Same as above, but creates a buffer for header only
// (data can be converted to a buffer or sent as-is)

var addr = Packer.socketToAddr(socket); // Probe raw, raw socket for address info

var id = Packer.addrToId(address); // Turn M-PROXY address info into a deterministic id

var id = Packer.socketToId(socket); // Turn raw, raw socket info into a deterministic id
```

## API Helpers

```js
var socket = Packer.Stream.wrapSocket(socketOrStream); // workaround for https://github.com/nodejs/node/issues/8854
// which was just closed recently, but probably still needs
// something more like this (below) to work as intended
// https://github.com/findhit/proxywrap/blob/master/lib/proxywrap.js
```

```js
var myTransform = Packer.Transform.create({
	address: {
		family: '...',
		address: '...',
		port: '...'
	},
	// hint at the service to be used
	service: 'https'
});
```

# Testing an implementation

If you want to write a compatible packer, just make sure that for any given input
you get the same output as the packer does.

```bash
node test/pack.js input.json output.bin
hexdump output.bin
```

Where `input.json` looks something like this:

`input.json`:

```
{ "version": 1
, "address": {
    "family": "IPv4"
  , "address": "127.0.1.1"
  , "port": 4321
  , "service": "foo"
  , "serviceport": 443
  , "name": 'example.com'
  }
, "filepath": "./sni.tcp.bin"
}
```

## Raw TCP SNI Packet

and `sni.tcp.bin` is any captured tcp packet, such as this one with a tls hello:

`sni.tcp.bin`:

```
         0  1  2  3  4  5  6  7  8  9  A  B  C  D  D  F
0000000 16 03 01 00 c2 01 00 00 be 03 03 57 e3 76 50 66
0000010 03 df 99 76 24 c8 31 e6 e8 08 34 6b b4 7b bb 2c
0000020 f3 17 aa 5c ec 09 da da 83 5a b2 00 00 56 00 ff
0000030 c0 24 c0 23 c0 0a c0 09 c0 08 c0 28 c0 27 c0 14
0000040 c0 13 c0 12 c0 26 c0 25 c0 05 c0 04 c0 03 c0 2a
0000050 c0 29 c0 0f c0 0e c0 0d 00 6b 00 67 00 39 00 33
0000060 00 16 00 3d 00 3c 00 35 00 2f 00 0a c0 07 c0 11
0000070 c0 02 c0 0c 00 05 00 04 00 af 00 ae 00 8d 00 8c
0000080 00 8a 00 8b 01 00 00 3f 00 00 00 19 00 17 00 00
0000090 14 70 6f 6b 65 6d 61 70 2e 68 65 6c 6c 61 62 69
00000a0 74 2e 63 6f 6d 00 0a 00 08 00 06 00 17 00 18 00
00000b0 19 00 0b 00 02 01 00 00 0d 00 0c 00 0a 05 01 04
00000c0 01 02 01 04 03 02 03
00000c7
```

## Tunneled TCP SNI Packet

You should see that the result is simply all of the original packet with a leading header.

Note that `16 03 01 00` starts at the 29th byte (at index 28 or 0x1C) instead of at index 0:

```
         0  1  2  3  4  5  6  7  8  9  A  B  C  D  D  F
0000000 fe 1a 49 50 76 34 2c 31 32 37 2e 30 2e 31 2e 31 <-- 0xfe = v1, 0x1a = 26 more bytes for header
0000010 2c 34 34 33 2c 31 39 39 2c 66 6f 6f
                                            16 03 01 00 <-- first 4 bytes of tcp packet
0000020 c2 01 00 00 be 03 03 57 e3 76 50 66 03 df 99 76
0000030 24 c8 31 e6 e8 08 34 6b b4 7b bb 2c f3 17 aa 5c
0000040 ec 09 da da 83 5a b2 00 00 56 00 ff c0 24 c0 23
0000050 c0 0a c0 09 c0 08 c0 28 c0 27 c0 14 c0 13 c0 12
0000060 c0 26 c0 25 c0 05 c0 04 c0 03 c0 2a c0 29 c0 0f
0000070 c0 0e c0 0d 00 6b 00 67 00 39 00 33 00 16 00 3d
0000080 00 3c 00 35 00 2f 00 0a c0 07 c0 11 c0 02 c0 0c
0000090 00 05 00 04 00 af 00 ae 00 8d 00 8c 00 8a 00 8b
00000a0 01 00 00 3f 00 00 00 19 00 17 00 00 14 70 6f 6b
00000b0 65 6d 61 70 2e 68 65 6c 6c 61 62 69 74 2e 63 6f
00000c0 6d 00 0a 00 08 00 06 00 17 00 18 00 19 00 0b 00
00000d0 02 01 00 00 0d 00 0c 00 0a 05 01 04 01 02 01 04
00000e0 03 02 03
00000e3
```
