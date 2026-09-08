import {MarcRecord} from '@natlibfi/marc-record';
import {EventEmitter} from 'events';

import {streamArray} from 'stream-json/streamers/stream-array.js';
import {parser} from 'stream-json';
import chain from 'stream-chain';
//import createDebugLogger from 'debug';

//const debug = createDebugLogger('@natlibfi/marc-record-serializers:json');
//const debugData = debug.extend('data');

export function reader(stream, validationOptions = {}) {
  const emitter = new class extends EventEmitter { }();

  start();
  return emitter;

  function start() {
    const pipeline = chain([
      stream,
      parser(),
      streamArray()
    ]);

    pipeline.on('data', data => {
      try {
        emitter.emit('data', new MarcRecord(data.value, validationOptions));
      } catch (err) {
        emitter.emit('error', err);
      }
    });

    pipeline.on('end', () => {
      emitter.emit('end');
    });

    pipeline.on('error', error => {
      emitter.emit('error', error);
    });
  }
}
export function to(record) {
  return JSON.stringify(record.toObject(), undefined, 2);
}

export function from(str, validationOptions = {}) {
  return new MarcRecord(JSON.parse(str), validationOptions);
}
