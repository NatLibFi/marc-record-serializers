import {MarcRecord} from '@natlibfi/marc-record';
import {Parser, Builder} from 'xml2js';
import {EventEmitter} from 'events';
import createDebugLogger from 'debug';
import {stripPrefix} from 'xml2js/lib/processors.js';

const debug = createDebugLogger('@natlibfi/marc-record-serializers:marcxml');
const debugData = debug.extend('data');

export function reader(stream, validationOptions = {}, nameSpace = '') {
  const emitter = new class extends EventEmitter { }();
  const nameSpacePrefix = nameSpace === '' ? nameSpace : `${nameSpace}:`;

  MarcRecord.setValidationOptions(validationOptions);

  start();
  return emitter;

  function start() {
    let charbuffer = '';

    stream.on('end', () => {
      emitter.emit('end');
    });

    stream.on('error', error => {
      emitter.emit('error', error);
    });

    stream.on('data', async data => {
      charbuffer += data.toString();

      while (1) {
        let pos = charbuffer.indexOf(`<${nameSpacePrefix}record`);

        if (pos === -1) {
          return;
        }

        debug(`Found record start "<${nameSpacePrefix}record" in pos ${pos}`);

        charbuffer = charbuffer.substr(pos);
        pos = charbuffer.indexOf(`</${nameSpacePrefix}record>`);
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
          emitter.emit('data', await from(raw, validationOptions));
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
