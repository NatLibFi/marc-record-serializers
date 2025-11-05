import {MarcRecord} from '@natlibfi/marc-record';
import {EventEmitter} from 'events';
import createDebugLogger from 'debug';

const debug = createDebugLogger('@natlibfi/marc-record-serializers:text');
const debugData = debug.extend('data');

export function reader(stream, validationOptions = {}) {

  const emitter = new class extends EventEmitter { }();
  start();
  return emitter;

  function start() {

    MarcRecord.setValidationOptions(validationOptions);
    let buffer = '';

    stream.on('data', data => {
      debug(`streamEvent: data`);
      buffer += data;
      flush();
    });

    stream.on('end', () => {
      debug(`streamEvent: end`);
      // 1st param undefined -> remove previous results from regexp object
      flush(undefined, true);
      emitter.emit('end');
    });

    stream.on('error', error => {
      debug(`streamEvent: error`);
      emitter.emit('error', error);
    });

    function flush(re = /(?<code>LDR)/gu, force = false) {
      if (buffer.length < 1) {
        debug(`Empty buffer. Done.`);
        return;
      }
      debug(`**** FLUSH f:${force}***`);
      debug(`Searching ${re} from buffer, force: ${force}`);
      debugData(`Buffer:\n${buffer}`);
      const result = re.exec(buffer);
      if (result) {
        debug(`Result found: ${result[0]}, Result index: ${result.index}`);
        if (result.index > 0 || force) {
          const str = buffer.slice(0, result.index || undefined).replace(/\n+$/u, '');
          debugData(`String to convert to record:\n${str}`);
          emitter.emit('data', MarcRecord.fromString(str));
          buffer = buffer.slice(result.index === 0 ? buffer.length : result.index);
          // debugData(`Remaining buffer: ${buffer}`);
          return flush(undefined);
        }
        debug(`Search next result for the same regexp (Result.index <1 (${result.index}) and not force ${force})`);
        return flush(re);
      }
      debug(`No result!`);
    }
  }
}

export function to(record) {
  return record.toString();
}

export function from(str, validationOptions = {}) {
  return MarcRecord.fromString(str, validationOptions);
}
