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
import {XMLSerializer, DOMParser, DOMImplementation} from '@xmldom/xmldom';
import {EventEmitter} from 'events';

import createDebugLogger from 'debug';

const debug = createDebugLogger('@natlibfi/marc-record-serializers:oai-marcxml');
const debugData = debug.extend('data');

const NODE_TYPE = {
  TEXT_NODE: 3
};

export function reader(stream, validationOptions = {}) {
  const emitter = new class extends EventEmitter { }();
  MarcRecord.setValidationOptions(validationOptions);

  start();
  return emitter;

  function start() {

    let charbuffer = ''; // eslint-disable-line functional/no-let

    stream.on('end', () => {
      emitter.emit('end');
    });

    stream.on('error', error => {
      emitter.emit('error', error);
    });

    stream.on('data', data => {
      charbuffer += data.toString();

      debugData(charbuffer);
      // eslint-disable-next-line functional/no-loop-statements
      while (1) { // eslint-disable-line no-constant-condition

        let pos = charbuffer.indexOf('<oai_marc'); // eslint-disable-line functional/no-let

        if (pos === -1) {
          return;
        }

        charbuffer = charbuffer.substr(pos);
        pos = charbuffer.indexOf('</oai_marc>');
        if (pos === -1) {
          return;
        }

        const raw = charbuffer.substr(0, pos + 11);
        charbuffer = charbuffer.substr(pos + 11);

        try {
          debug('Emitting record');
          emitter.emit('data', from(raw, validationOptions));
        } catch (e) {
          debug(`Emit record errored ${e}`);
          emitter.emit('error', e);
        }
      }
    });
  }
}

export function to(record, {omitDeclaration = false} = {}) {
  const serializer = new XMLSerializer();
  const doc = new DOMImplementation().createDocument();
  const xmlRecord = mkElement('oai_marc');
  const leader = mkControlfield('LDR', record.leader);

  xmlRecord.appendChild(leader);

  record.getControlfields().forEach(field => {
    xmlRecord.appendChild(mkControlfield(field.tag, field.value));
  });

  record.getDatafields().forEach(field => {
    xmlRecord.appendChild(mkDatafield(field));
  });

  function mkDatafield(field) {
    const datafield = mkElement('varfield');
    datafield.setAttribute('id', field.tag);
    datafield.setAttribute('i1', formatIndicator(field.ind1));
    datafield.setAttribute('i2', formatIndicator(field.ind2));

    field.subfields.forEach(subfield => {
      const sub = mkElementValue('subfield', subfield.value);
      sub.setAttribute('label', subfield.code);
      datafield.appendChild(sub);
    });

    return datafield;
  }

  function formatIndicator(ind) {
    return ind === '_' ? ' ' : ind;
  }

  function mkElementValue(name, value) {
    const el = mkElement(name);
    const t = doc.createTextNode(value);
    el.appendChild(t);
    return el;
  }

  function mkElement(name) {
    return doc.createElement(name);
  }

  function mkControlfield(tag, value) {
    const cf = mkElement('fixfield');
    cf.setAttribute('id', tag);
    const t = doc.createTextNode(value);
    cf.appendChild(t);
    return cf;
  }

  if (omitDeclaration) {
    return serializer.serializeToString(xmlRecord);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(xmlRecord)}`;
}

export function from(xmlString, validationOptions = {}) {
  const parser = new DOMParser();
  const record = new MarcRecord();

  debug(`Parsing from xmlstring`);
  const doc = parser.parseFromString(xmlString, 'text/xml');
  // This cannot be simply destructured or everything errors
  // eslint-disable-next-line prefer-destructuring
  const recordNode = doc.getElementsByTagName('oai_marc')[0];
  const childNodes = recordNode === undefined ? [] : Array.prototype.slice.call(recordNode.childNodes);
  childNodes.filter(notTextNode).forEach(node => {
    switch (node.tagName) {
    // eslint-disable-next-line functional/no-conditional-statements
    case 'fixfield':
      handleControlfieldNode(node);
      break;
    // eslint-disable-next-line functional/no-conditional-statements
    case 'varfield':
      handleDatafieldNode(node);
      break;
    default:
      throw new Error(`Unable to parse node: ${node.tagName}`);
    }

    function handleControlfieldNode(node) {
      const tag = node.getAttribute('id');

      if (node.childNodes[0] !== undefined && node.childNodes[0].nodeType === NODE_TYPE.TEXT_NODE) {
        const value = node.childNodes[0].data;

        // eslint-disable-next-line functional/no-conditional-statements
        if (tag === 'LDR') {
          record.leader = value; // eslint-disable-line functional/immutable-data
        // eslint-disable-next-line functional/no-conditional-statements
        } else {
          record.appendField({tag, value}); // eslint-disable-line functional/immutable-data
        }
      } else {
        throw new Error(`Unable to parse controlfield: ${tag}`);
      }
    }

    function handleDatafieldNode(node) {
      const tag = node.getAttribute('id');
      const ind1 = node.getAttribute('i1');
      const ind2 = node.getAttribute('i2');

      const subfields = Array.prototype.slice.call(node.childNodes).filter(notTextNode).map(subfieldNode => {
        const code = subfieldNode.getAttribute('label');
        const value = getChildTextNodeContents(subfieldNode).join('');

        return {
          code,
          value
        };
      });

      record.appendField({
        tag,
        ind1,
        ind2,
        subfields
      });
    }

    function getChildTextNodeContents(node) {
      const childNodes = Array.prototype.slice.call(node.childNodes);
      const textNodes = childNodes.filter(node => node.nodeType === NODE_TYPE.TEXT_NODE);
      return textNodes.map(node => node.data);
    }
  });

  /* Validates the record */
  return new MarcRecord(record, validationOptions);

  function notTextNode(node) {
    return node.nodeType !== NODE_TYPE.TEXT_NODE;
  }
}
