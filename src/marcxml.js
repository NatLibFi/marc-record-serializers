/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Copyright 2014-2017 Pasi Tuominen
* Copyright 2018-2021 University Of Helsinki (The National Library Of Finland)
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
import {Parser, Builder} from 'xml2js';
import {EventEmitter} from 'events';
import createDebugLogger from 'debug';
import {stripPrefix} from 'xml2js/lib/processors';

const debug = createDebugLogger('@natlibfi/marc-record-serializers:marcxml');
const debugData = debug.extend('data');

export function reader (stream, validationOptions = {}, nameSpace = '') {
  const emitter = new class extends EventEmitter { }();
  const nameSpacePrefix = nameSpace === '' ? nameSpace : `${nameSpace}:`;

  MarcRecord.setValidationOptions(validationOptions);

  start();
  return emitter;

  function start() {
    // eslint-disable-next-line functional/no-let
    let charbuffer = '';

    stream.on('end', () => {
      emitter.emit('end');
    });

    stream.on('error', error => {
      emitter.emit('error', error);
    });

    stream.on('data', async data => {
      charbuffer += data.toString();

      // eslint-disable-next-line functional/no-loop-statements
      while (1) { // eslint-disable-line no-constant-condition
        // eslint-disable-next-line functional/no-let
        let pos = charbuffer.indexOf(`<${nameSpacePrefix}record`);

        if (pos === -1) {
          return;
        }

        debug(`Found record start "<${nameSpacePrefix}record" in pos ${pos}`);

        charbuffer = charbuffer.substr(pos);
        pos = charbuffer.indexOf(`</${nameSpacePrefix}record>`);
        /* istanbul ignore if */
        if (pos === -1) {
          return;
        }

        debug(`Found record end "</${nameSpacePrefix}record>" in pos ${pos}`);

        const endTagLength = nameSpacePrefix.length + 9;
        const raw = charbuffer.substr(0, pos + endTagLength);
        charbuffer = charbuffer.substr(pos + endTagLength);

        debugData(`Found record: ${raw}`);

        try {
          debug('Emitting record');
          emitter.emit('data', await from(raw, validationOptions)); // eslint-disable-line no-await-in-loop
        } catch (e) {
          emitter.emit('error', e);
        }
      }
    });
  }
}

export function to(record, {omitDeclaration = false, indent = false} = {}) {
  const obj = {
    record: {
      ...generateFields(),
      $: {
        xmlns: 'http://www.loc.gov/MARC21/slim'
      }
    }
  };

  return toXML(obj);

  function generateFields() {
    return {
      leader: [record.leader],
      controlfield: record.getControlfields().map(({value: _, tag}) => {
        if (_) {
          return {_, $: {tag: [tag]}};
        }

        return {$: {tag: [tag]}};
      }),
      datafield: record.getDatafields().map(transformDataField)
    };

    function transformDataField({tag, ind1, ind2, subfields}) {
      return {
        $: {
          tag: [tag],
          ind1: [ind1],
          ind2: [ind2]
        },
        subfield: transformSubfields()
      };

      function transformSubfields() {
        return subfields.map(({code, value: _}) => {
          if (_) {
            return {_, $: {code: [code]}};
          }

          return {$: {code: [code]}};
        });
      }
    }
  }

  function toXML(obj) {
    try {
      return new Builder(generateOptions()).buildObject(obj);
    } catch (err) {
      throw new Error(`XML conversion failed ${err.message} for object: ${JSON.stringify(obj)}`);
    }

    function generateOptions() {
      return {...generateDeclr(), ...generateRender()};

      function generateDeclr() {
        return omitDeclaration ? {headless: true} : {
          xmldec: {
            version: '1.0',
            encoding: 'UTF-8'
          }
        };
      }

      function generateRender() {
        return indent ? {
          renderOpts: {
            pretty: true,
            indent: '\t'
          }
        } : {renderOpts: {pretty: false}};
      }
    }
  }
}

export async function from(str, validationOptions = {}) {
  const record = new MarcRecord(undefined, validationOptions);
  const obj = await toObject();

  // eslint-disable-next-line functional/immutable-data
  record.leader = obj.record.leader?.[0] || '';

  addControlFields();
  addDataFields();

  return record;

  function addControlFields() {
    const fields = obj.record.controlfield || [];

    fields.forEach(({_: value, $: {tag}}) => record.appendField({tag, value}));
  }

  function addDataFields() {
    const fields = obj.record.datafield || [];

    fields.forEach(({subfield, $: {tag, ind1, ind2}}) => {
      const subfields = parseSubfields();
      record.appendField({tag, ind1, ind2, subfields});

      function parseSubfields() {
        const subfields = subfield || [];
        return subfields.map(({_: value, $: {code}}) => {
          const result = value === undefined ? {code} : {code, value};
          return result;
        });
      }
    });
  }

  function toObject() {
    return new Promise((resolve, reject) => {
      new Parser({tagNameProcessors: [stripPrefix]}).parseString(str, (err, obj) => {
        if (err) {
          debug(err);
          return reject(err);
        }
        debug(obj);
        resolve(obj);
      });
    });
  }
}

/* Function getLogger() {
   return createDebugLogger('@natlibfi/marc-record-serializers/marcxml');
  }
*/
