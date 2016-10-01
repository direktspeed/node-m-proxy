'use strict';

var Packer = module.exports;

Packer.create = function (opts) {
  var machine;

  if (!opts.onMessage && !opts.onmessage) {
    machine = new (require('events').EventEmitter)();
  } else {
    machine = {};
  }

  machine.onMessage = opts.onmessage || opts.onMessage;
  machine.onmessage = opts.onmessage || opts.onMessage;
  machine.onError = opts.onerror || opts.onError;
  machine.onerror = opts.onerror || opts.onError;
  machine.onEnd = opts.onend || opts.onEnd;
  machine.onend = opts.onend || opts.onEnd;

  machine._version = 1;
  machine.state = 0;
  machine.states = { 0: 'version', 1: 'headerLength', 2: 'header', 3: 'data'/*, 4: 'error'*/ };
  machine.states_length = Object.keys(machine.states).length;
  machine.chunkIndex = 0;
  machine.fns = {};

  machine.fns.version = function (chunk) {
    //console.log('');
    //console.log('[version]');
    if ((255 - machine._version) !== chunk[machine.chunkIndex]) {
      console.error("not v" + machine._version + " (or data is corrupt)");
      // no idea how to fix this yet
    }
    machine.chunkIndex += 1;

    return true;
  };


  machine.headerLen = 0;
  machine.fns.headerLength = function (chunk) {
    //console.log('');
    //console.log('[headerLength]');
    machine.headerLen = chunk[machine.chunkIndex];
    machine.chunkIndex += 1;

    return true;
  };


  machine.buf = null;
  machine.bufIndex = 0;
  //var buf = Buffer.alloc(4096);
  machine.fns.header = function (chunk) {
    //console.log('');
    //console.log('[header]');
    var curSize = machine.bufIndex + (chunk.length - machine.chunkIndex);
    var partLen = 0;
    var str = '';
    var part;

    if (curSize < machine.headerLen) {
      // I still don't have the whole header,
      // so just create a large enough buffer,
      // write these bits, and wait for the next chunk.
      if (!machine.buf) {
        machine.buf = Buffer.alloc(machine.headerLen);
      }

      // partLen should be no more than the available size
      partLen = Math.min(machine.headerLen - machine.bufIndex, chunk.length - machine.chunkIndex);
      part = chunk.slice(machine.chunkIndex, machine.chunkIndex + partLen);
      chunk.copy(machine.buf, machine.bufIndex, machine.chunkIndex, machine.chunkIndex + partLen);
      machine.chunkIndex += partLen; // this MUST be chunk.length
      machine.bufIndex += partLen;

      return false;
    }
    else {
      // it's now ready to discover the whole header
      if (machine.buf) {
        str += machine.buf.slice(0, machine.bufIndex).toString();
      }

      partLen = machine.headerLen - str.length;
      part = chunk.slice(machine.chunkIndex, machine.chunkIndex + partLen);
      str += part.toString();

      machine.chunkIndex += partLen;
      machine.buf = null; // back to null
      machine.bufIndex = 0; // back to 0

      machine._headers = str.split(/,/g);

      machine.family = machine._headers[0];
      machine.address = machine._headers[1];
      machine.port = machine._headers[2];
      machine.bodyLen = parseInt(machine._headers[3], 10) || -1;
      machine.service = machine._headers[4];
      //console.log('machine.service', machine.service);

      return true;
    }
  };

  machine.fns.data = function (chunk) {
    //console.log('');
    //console.log('[data]');
    var curSize = machine.bufIndex + (chunk.length - machine.chunkIndex);
    //console.log('curSize:', curSize);
    //console.log('bodyLen:', machine.bodyLen, typeof machine.bodyLen);
    var partLen = 0;
    var msg;
    var data;

    partLen = Math.min(machine.bodyLen - machine.bufIndex, chunk.length - machine.chunkIndex);

    if (curSize < machine.bodyLen) {
      //console.log('curSize < bodyLen');

      // I still don't have the whole header,
      // so just create a large enough buffer,
      // write these bits, and wait for the next chunk.
      if (!machine.buf) {
        machine.buf = Buffer.alloc(machine.bodyLen);
      }

      chunk.copy(machine.buf, machine.bufIndex, machine.chunkIndex, machine.chunkIndex + partLen);
      machine.chunkIndex += partLen; // this MUST be chunk.length
      machine.bufIndex += partLen;

      return false;
    }

    if (machine.bufIndex > 0) {
      // the completing remainder of the body is in the current slice
      chunk.copy(machine.buf, machine.bufIndex, machine.chunkIndex, machine.chunkIndex + partLen);
    }
    else {
      // the whole body is in the current slice
      machine.buf = chunk.slice(machine.chunkIndex, machine.chunkIndex + partLen);
    }
    machine.bufIndex += partLen;

    machine.service = machine.service;
    data = machine.buf.slice(0, machine.bufIndex);
    //console.log('machine.service', machine.service);


    //
    // data, end, error
    //
    if ('end' === machine.service) {
      msg = {};

      msg.family = machine.family;
      msg.address = machine.address;
      msg.port = machine.port;
      msg.service = 'end';
      msg.data = data;

      if (machine.emit) {
        machine.emit('tunnelEnd', msg);
      }
      else {
        (machine.onend||machine.onmessage)(msg);
      }
    }
    else if ('error' === machine.service) {
      try {
        msg = JSON.parse(machine.data.toString());
      } catch(e) {
        msg = new Error('unknown error');
      }

      msg.family = machine.family;
      msg.address = machine.address;
      msg.port = machine.port;
      msg.service = 'error';
      msg.data = data;

      if (machine.emit) {
        machine.emit('tunnelError', msg);
      }
      else {
        (machine.onerror||machine.onmessage)(msg);
      }
    }
    else {
      msg = {};

      msg.family = machine.family;
      msg.address = machine.address;
      msg.port = machine.port;
      msg.service = machine.service;
      msg.data = data;

      if (machine.emit) {
        machine.emit('tunnelData', msg);
      }
      else {
        machine.onmessage(msg);
      }
    }

    machine.chunkIndex += partLen;  // === chunk.length
    machine.buf = null;             // reset to null
    machine.bufIndex = 0;           // reset to 0

    return true;
  };
  machine.fns.addChunk = function (chunk) {
    //console.log('');
    //console.log('[addChunk]');
    machine.chunkIndex = 0;
    while (machine.chunkIndex < chunk.length) {
      //console.log('chunkIndex:', machine.chunkIndex, 'state:', machine.state);

      if (true === machine.fns[machine.states[machine.state]](chunk)) {
        machine.state += 1;
        machine.state %= machine.states_length;
      }
    }
  };

  return machine;

};

Packer.pack = function (address, data, service) {
  data = data || Buffer.alloc(1);
  if (!data.byteLength) {
    data = Buffer.alloc(1);
  }

  if ('error' === service) {
    address.service = 'error';
  }
  else if ('end' === service) {
    address.service = 'end';
  }

  var version = 1;
  var header = Buffer.from([
    /*servername,*/ address.family, address.address, address.port, data.byteLength
  , (address.service || '')
  ].join(','));
  var meta = Buffer.from([ 255 - version, header.length ]);
  var buf = Buffer.alloc(meta.byteLength + header.byteLength + data.byteLength);

  meta.copy(buf, 0, 0, meta.byteLength);
  header.copy(buf, 2, 0, header.byteLength);
  data.copy(buf, 2 + header.byteLength, 0, data.byteLength);

  return buf;
};

Packer.socketToAddr = function (socket) {
  // TODO BUG XXX
  // https://github.com/nodejs/node/issues/8854
  // tlsSocket.remoteAddress = remoteAddress; // causes core dump
  // console.log(tlsSocket.remoteAddress);

  return {
    family:
       socket.remoteFamily
    || socket._remoteFamily
    || socket._handle._parentWrap.remoteFamily
    || socket._handle._parentWrap._handle.owner.stream.remoteFamily
  , address:
       socket.remoteAddress
    || socket._remoteAddress
    || socket._handle._parentWrap.remoteAddress
    || socket._handle._parentWrap._handle.owner.stream.remoteAddress
  , port:
       socket.remotePort
    || socket._remotePort
    || socket._handle._parentWrap.remotePort
    || socket._handle._parentWrap._handle.owner.stream.remotePort
  };
};

Packer.addrToId = function (address) {
  return address.family + ',' + address.address + ',' + address.port;
};

Packer.socketToId = function (socket) {
  return Packer.addrToId(Packer.socketToAddr(socket));
};


/*
 *
 * Tunnel Packer
 *
 */

var Transform = require('stream').Transform;
var util = require('util');

function MyTransform(options) {
  if (!(this instanceof MyTransform)) {
    return new MyTransform(options);
  }
  this.__my_addr = options.address;
  this.__my_service = options.service;
  Transform.call(this, options);
}
util.inherits(MyTransform, Transform);
function transform(me, data, encoding, callback) {
  var address = me.__my_addr;

  address.service = address.service || me.__my_service;
  me.push(Packer.pack(address, data));
  callback();
}
MyTransform.prototype._transform = function (data, encoding, callback) {
  return transform(this, data, encoding, callback);
};

Packer.Stream = {};
var Dup = {
  write: function (chunk, encoding, cb) {
    //console.log('_write', chunk.byteLength);
    this.__my_socket.write(chunk, encoding);
    cb();
  }
, read: function (size) {
    //console.log('_read');
    var x = this.__my_socket.read(size);
    if (x) {
      console.log('_read', size);
      this.push(x);
    }
  }
};
Packer.Stream.create = function (socket) {
  // Workaround for
  // https://github.com/nodejs/node/issues/8854

  // https://www.google.com/#q=get+socket+address+from+file+descriptor
  // TODO try creating a new net.Socket({ handle: socket._handle, fd: socket._handle.fd })
  // from the old one and then adding back the data with
  // sock.push(firstChunk)
  var Duplex = require('stream').Duplex;
  var myDuplex = new Duplex();

  myDuplex.__my_socket = socket;
  myDuplex._write = Dup.write;
  myDuplex._read = Dup.read;
  //console.log('plainSocket.*Address');
  //console.log('remote:', socket.remoteAddress);
  //console.log('local:', socket.localAddress);
  //console.log('address():', socket.address());
  myDuplex.remoteFamily = socket.remoteFamily;
  myDuplex.remoteAddress = socket.remoteAddress;
  myDuplex.remotePort = socket.remotePort;
  myDuplex.localFamily = socket.localFamily;
  myDuplex.localAddress = socket.localAddress;
  myDuplex.localPort = socket.localPort;

  return myDuplex;
};

Packer.Transform = {};
Packer.Transform.create = function (opts) {
  // Note: service refers to the port that the incoming request was from,
  // if known (smtps, smtp, https, http, etc)
  // { address: '127.0.0.1', service: 'https' }
  return new MyTransform(opts);
};
