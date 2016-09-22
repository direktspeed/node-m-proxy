'use strict';

module.exports.create = function (opts) {

  var machine = { onMessage: opts.onMessage };
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

    machine.onMessage({
      family: machine.family
    , address: machine.address
    , port: machine.port
    , data: machine.buf.slice(0, machine.bufIndex)
    });

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

module.exports.pack = function (address, data) {
  var version = 1;
  var header = /*servername + ',' +*/address.family + ',' + address.address + ',' + address.port + ',' + data.byteLength;
  var meta = [ 255 - version, header.length ];
  var buf = Buffer.alloc(meta.length + header.length + data.byteLength);

  buf.write(meta[0], 0);
  buf.write(meta[1], 1);
  buf.write(header, 2);
  buf.write(data, 2 + header.length);

  return buf;
};
