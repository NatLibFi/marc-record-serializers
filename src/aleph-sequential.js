/* eslint-disable max-lines */
/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Copyright 2014-2017 Pasi Tuominen
* Copyright 2018-2023 University Of Helsinki (The National Library Of Finland)
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
import {Buffer} from 'buffer';
// Node polyfill
import {EventEmitter} from 'events';
import createDebugLogger from 'debug';

const FIXED_FIELD_TAGS = ['FMT', '001', '002', '003', '004', '005', '006', '007', '008', '009'];

// We'll want aleph-sequential.js to error, if record breaks Aleph constraints for
// * record length (45000 bytes) - handled by countAndCheckAlephDataLength()
// * field amount - no limits
// DEVELOP: * subfield amount - 5000 (in total or per field?)
// * field length - handled by splitting fields
// * newlines in subfield values
// * newlines in controlField values are errored by updated marc-record-js

// https://knowledge.exlibrisgroup.com/Aleph/Knowledge_Articles/Maximum_record_length%2C_maximum_number_of_subfields%2C_maximum_field_length
// Record length:    ALEPH limits a DOC record (BIB, HLD, ADM, authority, course reading, or ILL) to 45,000 characters text. This can be seen in the alephm/source/copy definition of the Z00:
// 02 Z00-DATA PICTURE X(45000).
// Note that characters with diacritics take up two bytes each and that Cyrillic, Hebrew, Arabic, Greek, and CJK characters are all double-byte in ALEPH's unicode implementation. Since ALEPH uses utf-8; English a-z are stored as single-byte characters.)
// Field length: ALEPH limits a DOC field to 2000 characters; you cannot enter more than 2000 characters in the Cataloging interface.
// Number of fields:  Limited only by how many can fit in the 45,000 character-limit for the record.
// Number of subfields: 5,000.

// DEVELOP: alephSequential uses $$ as subfield separator - string $$ in subfieldValue will be wrongly interpreted
//          subfield separator - we'd like to error and/or warn and/or escape these cases somehow

const debug = createDebugLogger('@natlibfi/marc-record-serializers:aleph-sequential');
const debugData = debug.extend('data');
const debugDev = debug.extend('dev');

export function reader(stream, validationOptions = {}, genF001fromSysNo = false) {

  const emitter = new class extends EventEmitter { }();
  start();
  return emitter;

  function start() {

    let charbuffer = ''; // eslint-disable-line functional/no-let
    const linebuffer = []; // eslint-disable-line functional/no-let
    let count = 0; // eslint-disable-line functional/no-let
    let brokenCount = 0; // eslint-disable-line functional/no-let
    let currentId; // eslint-disable-line functional/no-let


    // eslint-disable-next-line max-statements
    stream.on('data', data => {
      charbuffer += data.toString();

      // eslint-disable-next-line functional/no-loop-statements
      while (1) { // eslint-disable-line no-constant-condition
        const pos = charbuffer.indexOf('\n');
        if (pos === -1) {
          break;
        }

        const raw = charbuffer.substring(0, pos);
        charbuffer = charbuffer.substring(pos + 1);
        // eslint-disable-next-line functional/immutable-data
        linebuffer.push(raw);
      }

      if (linebuffer.length > 0) {
        // eslint-disable-next-line functional/no-conditional-statements
        if (currentId === undefined) {
          currentId = getIdFromLine(linebuffer[0]);
        }


        let i = 0; // eslint-disable-line functional/no-let

        // eslint-disable-next-line functional/no-loop-statements
        while (i < linebuffer.length) {
          // eslint-disable-next-line functional/no-conditional-statements
          if (linebuffer[i].length < 9) {
            debug(`Broken line (${i}): ${linebuffer[i]}`);
            //break;
          }

          const lineId = getIdFromLine(linebuffer[i]);

          // eslint-disable-next-line functional/no-conditional-statements
          if (currentId !== lineId) {
            // eslint-disable-next-line functional/immutable-data
            const record = linebuffer.splice(0, i);
            debug(`Convert lines (${record.length}) to record`);
            try {
              emitter.emit('data', securef001(record));
              count += 1;
            } catch (excp) {
              //const errorMessage = `${excp}\n${record}`;
              emitter.emit('error', excp);
              brokenCount += 1;
              //break;
            }

            currentId = lineId;
            i = 0;
          }

          i += 1;
        }
      }
    });

    stream.on('end', () => {
      // eslint-disable-next-line functional/no-conditional-statements
      if (linebuffer.length > 0) {
        debug(`Convert lines (${linebuffer.length}) to record`);
        try {
          emitter.emit('data', securef001(linebuffer));
          count += 1;
        } catch (excp) {
          emitter.emit('error', excp);
          brokenCount += 1;
          return;
        }
      }
      debug(`Emitted ${count} records. Errored ${brokenCount} records.`);
      emitter.emit('end');
    });

    stream.on('error', error => {
      emitter.emit('error', error);
    });

    function securef001(lineArray) {
      const currentId = lineArray[0].slice(0, 9);
      const marcRecord = from(lineArray.join('\n'), validationOptions);
      const [f001] = marcRecord.get('001');
      if (f001 === undefined && genF001fromSysNo) {
        marcRecord.insertField({
          tag: '001',
          value: currentId
        });
        return marcRecord;
      }

      return marcRecord;
    }

    function getIdFromLine(line) {
      return line.split(' ')[0];
    }
  }
}

/**
* Not a perfect implementation of Aleph sequential conversion...
* The conversion specification is available but it's' lacking: https://knowledge.exlibrisgroup.com/@api/deki/files/38711/Z00_and_Z00H.pdf?revision=1
* The specification doesn't mention that the text is cut by 1000 charactes boundary and periods are considered as boundary markers
* This implementation attempts to mimic the conversion done by marc_to_aleph.sh script and should at least produce a format which is accepted by Aleph
* Also, javascript strings are UTF-16 so conversion to bytes is necessary to cut the text at correct offsets
*/
export function to(record, useCrForContinuingResource = false) {

  const MAX_FIELD_LENGTH = 2000;
  const SPLIT_MAX_FIELD_LENGTH = 1000;

  // We'll need to check that record has no ASCII control characters (most critically newlines)
  // in field/subfield values
  debugDev(JSON.stringify(record));
  validateNoControlCharacters(record);

  const f001 = record.get(/^001/u);
  const [firstF001] = f001;
  // Aleph doesn't accept new records if their id is all zeroes...
  // DEVELOP: Aleph might have problems with records having id 999999999

  const id = f001.length > 0 ? formatRecordId(firstF001.value) : formatRecordId('1');

  // Delete FMT - we'll create a new one anyways
  const fFMTs = record.get('FMT');
  record.removeFields(fFMTs);

  const staticFields = [
    {
      tag: 'FMT',
      value: recordFormat(record, useCrForContinuingResource)
    },
    {
      tag: 'LDR',
      value: record.leader
    }
  ];

  const alephSequential = staticFields.concat(record.fields).reduce((acc, field) => {
    // Controlfield
    if ('value' in field) {
      const formattedField = `${id} ${field.tag}   L ${formatControlfield(field.value)}`;
      return `${acc + formattedField}\n`;
    }

    // Datafield
    return acc + formatDatafield(field);

    // Aleph sequential needs whitespace in control fields to be formatted as carets
    function formatControlfield(value) {
      return value.replace(/\s/gu, '^');
    }
  }, '');

  //debugDev('FOO');
  countAndCheckAlephDataLength(alephSequential);
  return alephSequential;

  function validateNoControlCharacters(record) {
    const tempValidationOptions = {noControlCharacters: true};
    const combinedTempValidationOptions = {...record._validationOptions, ...tempValidationOptions};
    const validatedRecord = new MarcRecord(record, combinedTempValidationOptions);
    if (validatedRecord) {
      return true;
    }
    return false;
  }

  // Aleph cannot handle records that are longer than 45000 bytes in dataLength
  // DEVELOP: Should we have this check as optional?
  function countAndCheckAlephDataLength(alephSequential) {

    const MAX_DATA_LENGTH = 44999;
    // for test: const MAX_DATA_LENGTH = 2999;

    // We need to reduce the length here due to differences between AlephSequential
    // and Aleph database data (Aleph database data has 9 less chars per line/field
    // than alephSequential)

    // Aleph sequential: 19 chars (18 as prefix + newline as suffix) + field content
    // 000123456 XXXII L FIELDCONTENT\n
    // Aleph database data: 10 chars (pefix) + field content
    // NNNNXXXIILFIELDCONTENT

    const fieldCount = (alephSequential.match(/\n/gu) || '').length + 1;
    debugDev(`fieldCount: ${fieldCount}`);
    const seqDataLength = Buffer.byteLength(alephSequential, 'utf8');
    debugDev(`seqDataLength: ${seqDataLength}`);
    const extraChars = fieldCount * 9;
    const alephDataLength = seqDataLength - extraChars;
    debugDev(`alephDataLength: ${alephDataLength}`);

    // For use with record-load-api / manage-18 we'd probably want to subtract also
    // character count for CAT-field that loading record tries to create?
    // 000000004 CAT   L $$aKVPXX1003X$$bXX$$c20090820$$lFIN01$$h0949
    // CAT-field length: 63, converted to alephData: 54 characters
    const CAT_FIELD_LENGTH = 54;

    if (alephDataLength + CAT_FIELD_LENGTH > MAX_DATA_LENGTH) {
      throw new Error(`Record is invalid: Record is too long to be converted to Aleph Sequential. Data length: ${alephDataLength}`);
    }
    return;
  }

  function formatRecordId(id) {
    return id.padStart(9, '0');
  }

  function formatDatafield(field) {
    let subfieldLines; // eslint-disable-line functional/no-let
    const ind1 = field.ind1 && field.ind1.length > 0 ? field.ind1 : ' ';
    const ind2 = field.ind2 && field.ind2.length > 0 ? field.ind2 : ' ';
    const header = `${id} ${field.tag}${ind1}${ind2} L `;

    const formattedSubfields = field.subfields.map(subfield => {
      let content = ''; // eslint-disable-line functional/no-let

      // eslint-disable-next-line functional/no-conditional-statements
      if (subfield.code.length > 0 || subfield.value.length > 0) {
        content = subfield.value === undefined ? `$$${subfield.code}` : `$$${subfield.code}${subfield.value}`;
      }

      return Buffer.from(content);
    });

    const dataLength = formattedSubfields.reduce((acc, value) => acc + value.length, 0);

    if (dataLength > MAX_FIELD_LENGTH) {
      subfieldLines = formattedSubfields.reduce(reduceToLines, {
        lines: []
      });

      return decode(subfieldLines).reduce((acc, line) => `${acc + header + line}\n`, '');
    }

    return `${header + decode(formattedSubfields).join('')}\n`;

    function decode(subfields) {
      return subfields.map(value => Buffer.from(value));
    }

    /**
    * 1. Append subfields until MAX_FIELD_LENGTH is exceeded
    * 2. cut at the last subfield
    * 3. Append prefix to the next subfield and check if it exceeds SPLIT_MAX_FIELD_LENGTH
    *   - If it is, cut at separators or at boundary. Create a new line for each segment
    * 4. Repeat step 3 for the rest of the subfields
    **/
    function reduceToLines(result, subfield, index, arr) {
      let code; // eslint-disable-line functional/no-let
      let sliceOffset; // eslint-disable-line functional/no-let
      let slicedSegment; // eslint-disable-line functional/no-let
      const tempLength = result.temp ? result.temp.length : 0;

      if (tempLength + subfield.length <= MAX_FIELD_LENGTH) {
        // eslint-disable-next-line functional/no-conditional-statements
        if (tempLength) {
          // eslint-disable-next-line functional/immutable-data
          result.temp = concatByteArrays(result.temp, subfield);
          // eslint-disable-next-line functional/no-conditional-statements
        } else {
          // eslint-disable-next-line functional/immutable-data
          result.temp = subfield;
        }
      } else {
        // eslint-disable-next-line functional/no-conditional-statements
        if (tempLength) {
          // eslint-disable-next-line functional/immutable-data
          result.lines.push(result.temp);
          // eslint-disable-next-line functional/immutable-data
          delete result.temp;
        }

        code = Buffer.from(subfield.slice(2, 3));
        iterate(subfield, index === 0);
      }

      // Flush
      // eslint-disable-next-line functional/no-conditional-statements
      if (index === arr.length - 1) {
        // eslint-disable-next-line no-param-reassign
        result = result.lines.concat(result.temp);
      }

      return result;

      function concatByteArrays(a, b, ...args) {
        const length = [a, b].concat(args).reduce((acc, value) => acc + value.length, 0);
        const arr = new Uint8Array(length);

        [a, b].concat(args).reduce((acc, value) => {
          arr.set(value, acc);
          // eslint-disable-next-line no-param-reassign
          acc += value.length;
          return acc;
        }, 0);

        return arr;
      }

      function iterate(segment, firstCall) {
        const HYPHEN = 45;
        const SPACE = 32;
        const CARET = 94;
        const DOLLAR = 36;
        const PERIOD = 46;

        // eslint-disable-next-line no-param-reassign
        segment = firstCall ? segment : addPrefix(segment); // eslint-disable-line functional/no-let

        // eslint-disable-next-line functional/no-conditional-statements
        if (segment.length <= SPLIT_MAX_FIELD_LENGTH) {
          // eslint-disable-next-line functional/immutable-data
          result.temp = segment;
          // eslint-disable-next-line functional/no-conditional-statements
        } else {
          sliceOffset = getSliceOffset(segment);
          slicedSegment = sliceSegment(segment, sliceOffset);

          // eslint-disable-next-line functional/immutable-data
          result.lines.push(slicedSegment);
          iterate(segment.slice(sliceOffset));
        }

        function addPrefix(arr) {
          let prefix; // eslint-disable-line functional/no-let

          // eslint-disable-next-line functional/no-conditional-statements
          if (arr.slice(0, 2).every(value => value === DOLLAR)) {
            prefix = '$$9^';
            // eslint-disable-next-line functional/no-conditional-statements
          } else {
            prefix = `$$9^^$$${code}`;
          }

          return concatByteArrays(Buffer.from(prefix), arr);
        }

        function getSliceOffset(arr) {
          const offset = findSeparatorOffset(arr) || findPeriodOffset(arr) || findSpaceOffset(arr) || SPLIT_MAX_FIELD_LENGTH;

          return offset;

          function findSeparatorOffset(arr) {

            let offset = find(); // eslint-disable-line functional/no-let

            if (offset !== undefined) {
              // Append the number of chars in separator
              offset += 3;

              if (offset <= SPLIT_MAX_FIELD_LENGTH) {
                return offset;
              }

              return findSeparatorOffset(arr.slice(0, offset - 3));
            }

            function find() {
              let index; // eslint-disable-line functional/no-let
              let foundCount = 0; // eslint-disable-line functional/no-let

              // eslint-disable-next-line functional/no-loop-statements, functional/no-let, no-plusplus
              for (let i = arr.length - 1; i--; i >= 0) {
                // eslint-disable-next-line functional/no-conditional-statements
                if (foundCount === 0 && arr[i] === SPACE) {
                  foundCount += 1;
                  // eslint-disable-next-line functional/no-conditional-statements
                } else if (foundCount > 0 && arr[i] === HYPHEN) {
                  foundCount += 1;
                  // eslint-disable-next-line functional/no-conditional-statements
                } else {
                  foundCount = 0;
                }

                if (foundCount === 3) {
                  index = i;
                  break;
                }
              }

              return index;
            }
          }

          function findPeriodOffset(arr) {
            let offset = find(); // eslint-disable-line functional/no-let

            if (offset !== undefined) {
              // Append the number of chars in separator
              offset += 2;
              if (offset <= SPLIT_MAX_FIELD_LENGTH) {
                return offset;
              }

              return findPeriodOffset(arr.slice(0, offset - 2));
            }

            function find() {
              let index; // eslint-disable-line functional/no-let
              let foundCount = 0; // eslint-disable-line functional/no-let

              // eslint-disable-next-line functional/no-loop-statements, functional/no-let, no-plusplus
              for (let i = arr.length - 1; i--; i >= 0) {
                // eslint-disable-next-line functional/no-conditional-statements
                if (foundCount === 0 && arr[i] === SPACE) {
                  foundCount += 1;
                  // eslint-disable-next-line functional/no-conditional-statements
                } else if (foundCount > 0 && arr[i] === PERIOD) {
                  foundCount += 1;
                  // eslint-disable-next-line functional/no-conditional-statements
                } else {
                  foundCount = 0;
                }

                if (foundCount === 2) {
                  index = i;
                  break;
                }
              }

              return index;
            }
          }

          function findSpaceOffset(arr) {
            let offset = find(); // eslint-disable-line functional/no-let

            if (offset !== undefined) {
              // Append the number of chars in separator
              offset += 1;
              if (offset <= SPLIT_MAX_FIELD_LENGTH) {
                return offset;
              }

              return findSpaceOffset(arr.slice(0, offset - 1));
            }

            function find() {
              let index; // eslint-disable-line functional/no-let
              const foundCount = 0; // eslint-disable-line functional/no-let

              // eslint-disable-next-line functional/no-loop-statements, functional/no-let, no-plusplus
              for (let i = arr.length - 1; i--; i >= 0) {
                if (foundCount === 0 && arr[i] === SPACE) {
                  return i;
                }
              }

              return index;
            }
          }
        }

        function sliceSegment(arr, offset) {
          const sliced = segment.slice(0, offset);

          // eslint-disable-next-line functional/no-conditional-statements
          if (sliced.slice(-1)[0] === SPACE) {
            // eslint-disable-next-line functional/immutable-data
            sliced[sliced.length - 1] = CARET;
          }

          return sliced;
        }
      }
    }
  }

  /**
  * This function was implemented by tvirolai (https://github.com/tvirolai)
  **/
  /**
  * Determine the record format for the FMT field.
  * Uses FMT SE (instead of CR) for continuing resource, because Aleph does that
  */
  // eslint-disable-next-line max-statements
  function recordFormat(record, useCrForContinuingResource) {
    const {leader} = record;
    const l6 = leader.slice(6, 7);
    const l7 = leader.slice(7, 8);


    // Add guesswork holdings record FMT HO
    // We do not currently know the correct FMT for holdings records
    if (['u', 'v', 'x', 'y'].includes(l6)) {
      return 'HO';
    }

    // Add authority record FMT AU
    if (l6 === 'z') {
      return 'AU';
    }

    if (l6 === 'm') {
      return 'CF';
    }

    if (['a', 't'].includes(l6) && ['b', 'i', 's'].includes(l7)) {
      if (useCrForContinuingResource) {
        return 'CR';
      }

      return 'SE';
    }

    if (['e', 'f'].includes(l6)) {
      return 'MP';
    }

    if (['c', 'd', 'i', 'j'].includes(l6)) {
      return 'MU';
    }

    if (l6 === 'p') {
      return 'MX';
    }

    if (['g', 'k', 'o', 'r'].includes(l6)) {
      return 'VM';
    }

    return 'BK';
  }
}

// eslint-disable-next-line max-statements
export function from(data, validationOptions = {}) {
  let i = 0; // eslint-disable-line functional/no-let
  const lines = data.split('\n').filter(l => l.length > 0);

  // eslint-disable-next-line functional/no-loop-statements
  while (i < lines.length) {
    const nextLine = lines[i + 1];
    const currentLine = lines[i];
    debugData(`Handling inputline: ${currentLine}`);

    if (nextLine !== undefined && isContinueFieldLine(nextLine, currentLine)) {
      // eslint-disable-next-line functional/no-conditional-statements
      if (lines[i].slice(-1) === '^') {
        // eslint-disable-next-line functional/immutable-data
        lines[i] = lines[i].substring(0, lines[i].length - 1);
      }

      // eslint-disable-next-line functional/immutable-data
      lines[i] += parseContinueLineData(nextLine);
      debug('Adding next line to current line');
      debugData(`${lines[i]}`);
      // eslint-disable-next-line functional/immutable-data
      lines.splice(i + 1, 1);
      // eslint-disable-next-line no-continue
      continue;
    }

    i += 1;
  }

  const record = new MarcRecord();
  // eslint-disable-next-line functional/immutable-data
  record.fields = [];

  lines.forEach(line => {
    debugData(`Parsing line: ${line}`);
    const field = parseFieldFromLine(line);
    debugData(`Found field: ${JSON.stringify(field)}`);

    // Drop Aleph specific FMT fields.
    if (field.tag === 'FMT') {
      return;
    }

    // eslint-disable-next-line functional/no-conditional-statements
    if (field.tag === 'LDR') {
      // DEVELOP: we should check here that leader is empty?
      // eslint-disable-next-line functional/immutable-data
      record.leader = field.value;
      // eslint-disable-next-line functional/no-conditional-statements
    } else {
      // eslint-disable-next-line functional/immutable-data
      record.fields.push(field);
    }
  });

  /* Creates and validates the record */
  return new MarcRecord(record, validationOptions);

  function parseContinueLineData(lineStr) {
    const field = parseFieldFromLine(lineStr);
    const [firstSubfield] = field.subfields;

    if (firstSubfield.value === '^') { // Same subfield continues ("123456789 12345 L $$1^"):
      return lineStr.substring(22);
    }

    if (firstSubfield.value === '^^') { // New subfield starts ("123456789 12345 L $$1^^$$6"):
      // return ` ${lineStr.substr(26, lineStr.length - 1)}`; // This did not omit the last char!
      return ` ${lineStr.substring(26)}`;
    }

    throw new Error('Could not parse Aleph Sequential subfield 9-continued line.');
  }

  function isContinueFieldLine(lineStr, prevLineStr) {
    const field = parseFieldFromLine(lineStr);

    if (isControlfield(field)) {
      return false;
    }

    const [firstSubfield] = field.subfields;

    if (firstSubfield === undefined) {
      return false;
    }

    if (!(firstSubfield.code === '9' && (firstSubfield.value === '^' || firstSubfield.value === '^^'))) {
      return false;
    }

    debug('Line is part of a split field');
    debugData(`${lineStr}`);

    const prevField = parseFieldFromLine(prevLineStr);

    if (field.tag !== prevField.tag || field.ind1 !== prevField.ind1 || field.ind2 !== prevField.ind2) {
      debug(`Field tags and indicators ( ${field.tag} ${field.ind1}${field.ind2} vs ${prevField.tag} ${prevField.ind1}${prevField.ind2}) do not match, split fields cannot be joined`);
      return false;
    }

    return true;
  }

  function isControlfield(field) {
    if (field.subfields === undefined) {
      return true;
    }
  }

  function isFixFieldTag(tag) {
    return FIXED_FIELD_TAGS.indexOf(tag) !== -1;
  }

  function parseFieldFromLine(lineStr) {
    const tag = lineStr.substring(10, 13);

    if (tag === undefined || tag.length !== 3) {
      throw new Error(`Could not parse tag from line: ${lineStr}`);
    }

    if (isFixFieldTag(tag) || tag === 'LDR') {
      const data = formatControlField(lineStr.substring(18));
      return {tag, value: data};
    }

    // Varfield
    const ind1 = lineStr.substring(13, 14);
    const ind2 = lineStr.substring(14, 15);

    const subfieldData = lineStr.substring(18);

    if (subfieldData === '') {
      throw new Error(`Could not parse subfields from line: ${lineStr}`);
    }

    const subfields = subfieldData.split('$$')
      .filter(sf => sf.length !== 0)
      .map(subfield => {
        const code = subfield.substring(0, 1);
        // do we lose empty subfields here?
        const value = subfield.substring(1);
        if (value.length > 0) {
          return {code, value};
        }

        return {code};
      });

    return {
      tag,
      ind1,
      ind2,
      subfields
    };

    // Aleph sequential uses whitespace in control fields formatted as carets
    function formatControlField(data) {
      return data.replace(/\^/gu, ' ');
    }
  }
}
