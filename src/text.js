/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Copyright 2014-2017 Pasi Tuominen
* Copyright 2018-2020 University Of Helsinki (The National Library Of Finland)
*
* Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
*
* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*
* @licend  The above is the entire license notice
* for the JavaScript code in this file.
*
*/

import {MarcRecord} from '@natlibfi/marc-record';
import {EventEmitter} from 'events';
import createDebugLogger from 'debug';

const debug = createDebugLogger('@natlibfi/marc-record-serializers:text');
const debugData = debug.extend('data');

export function reader(stream, validationOptions = {}) {
  const emitter = new class extends EventEmitter { }();
  var buffer = ''; // eslint-disable-line

  MarcRecord.setValidationOptions(validationOptions);

  start();

  return emitter;

  function start() {
    stream.on('data', data => {
      debug(`streamEvent: data`);
      buffer += data; // eslint-disable-line functional/immutable-data
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
      /* istanbul ignore next: Only occurs on I/O errors */
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
