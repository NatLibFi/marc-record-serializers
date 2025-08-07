import {EventEmitter} from 'events';
import {MarcRecord} from '@natlibfi/marc-record';
//import createDebugLogger from 'debug';

//const debug = createDebugLogger('@natlibfi/marc-record-serializers:iso2709');
//const debugData = debug.extend('data');

export function reader(stream, validationOptions = {}) {

  const emitter = new class extends EventEmitter { }();

  start();
  return emitter;

  function start() {
    var charbuffer = '';

    stream.on('end', () => {
      emitter.emit('end');
    });

    stream.on('error', error => {
      emitter.emit('error', error);
    });

    stream.on('data', data => {
      charbuffer += data;

      while (1) {
        const pos = charbuffer.indexOf('\x1D');

        if (pos === -1) {
          break;
        }

        const raw = charbuffer.substr(0, pos);
        charbuffer = charbuffer.substr(pos + 1);

        try {
          emitter.emit('data', from(raw, validationOptions));
        } catch (excp) {
          emitter.emit('error', excp);
        }
      }
    });
  }
}

export function from(dataStr, validationOptions = {}) {
  const leader = dataStr.substring(0, 24);
  const record = {
    leader,
    fields: []
  };

  // Parse directory section
  const directory = parseDirectory(dataStr);
  const directoryEntries = parseDirectoryEntries(directory);

  // Locate start of data fields (first occurrence of '\x1E')
  const dataStartPos = dataStr.search('\x1E') + 1;
  const dataFieldStr = dataStr.substring(dataStartPos);

  // Loop through directory entries to read data fields
  let i = 0;

  for (i = 0; i < directoryEntries.length; i++) {
    const tag = dirFieldTag(directoryEntries[i]);

    // NOTE: fieldLength is the number of UTF-8 bytes in a string
    const fieldLength = trimNumericField(dirFieldLength(directoryEntries[i]));

    const startCharPos = trimNumericField(dirStartingCharacterPosition(directoryEntries[i]));

    // Append control fields for tags 00X
    // Note: this cannot handle controlFields that have other tags
    //       Alephs FMT will cause problems! (Of course, non-numeric fields are not standard MARC21 anyways)
    if (tag.substring(0, 2) === '00') {
      const fieldElementStr = dataFieldStr.substring(startCharPos, parseInt(startCharPos, 10) + parseInt(fieldLength, 10) - 1);

      record.fields.push({
        tag,
        value: fieldElementStr
      });
    } else {
      let dataElementStr = utf8Substr(dataFieldStr, parseInt(startCharPos, 10), parseInt(fieldLength, 10));

      if (dataElementStr[2] !== '\x1F') {
        dataElementStr = dataFieldStr[startCharPos - 1] + dataElementStr;
      }

      // Parse indicators and convert '\x1F' characters to spaces
      // for valid XML output
      let ind1 = dataElementStr.charAt(0);

      if (ind1 === '\x1F') {
        ind1 = ' ';
      }

      let ind2 = dataElementStr.charAt(1);

      if (ind2 === '\x1F') {
        ind2 = ' ';
      }

      // Create a <datafield> element
      const datafield = {
        tag,
        ind1,
        ind2,
        subfields: []
      };

      // Parse all subfields
      dataElementStr = dataElementStr.substring(2);
      // Bypass indicators
      let j = 0;
      let currElementStr = '';

      for (j = 0; j < dataElementStr.length; j++) {
        // '\x1F' begins a new subfield, '\x1E' ends all fields
        if (dataElementStr.charAt(j) === '\x1F' || dataElementStr.charAt(j) === '\x1E' || j === dataElementStr.length - 1) {
          if (currElementStr !== '') { // eslint-disable-line max-depth

            if (j === dataElementStr.length - 1) { // eslint-disable-line max-depth
              currElementStr += dataElementStr.charAt(j);
            }

            // Parse code attribute
            const code = currElementStr.charAt(0);
            currElementStr = currElementStr.substring(1);

            // Remove trailing control characters
            if (currElementStr.charAt(currElementStr.length - 1) === '\x1F' || currElementStr.charAt(currElementStr.length - 1) === '\x1E') { // eslint-disable-line max-depth
              currElementStr = currElementStr.substring(0, currElementStr.length - 1);
            }

            // Create a <subfield> element
            datafield.subfields.push({code, value: currElementStr});
            currElementStr = '';
          }

        } else {
          currElementStr += dataElementStr.charAt(j);
        }
      }

      record.fields.push(datafield);
    }
  }

  return new MarcRecord(record, validationOptions);

  // Returns the entire directory starting at position 24.
  // Control character '\x1E' marks the end of directory.
  function parseDirectory(dataStr) {
    let currChar = '';
    let directory = '';
    let pos = 24;

    while (currChar !== '\x1E') {
      currChar = dataStr.charAt(pos);

      if (currChar !== 'x1E') {
        directory += currChar;
      }

      pos += 1;

      if (pos > dataStr.length) {
        throw new Error('Invalid record');
      }
    }

    return directory;
  }

  // Returns an array of 12-character directory entries.
  function parseDirectoryEntries(directoryStr) {
    const directoryEntries = [];
    let pos = 0;
    let count = 0;

    while (directoryStr.length - pos >= 12) {
      directoryEntries[count] = directoryStr.substring(pos, pos + 12);
      pos += 12;
      count += 1;
    }

    return directoryEntries;
  }

  // Removes leading zeros from a numeric data field.
  function trimNumericField(input) {
    let string = input;
    while (string.length > 1 && string.charAt(0) === '0') {
      string = string.substring(1);
    }

    return string;
  }

  // Functions return a specified field in a single 12-character
  // directory entry.
  function dirFieldTag(directoryEntry) {
    return directoryEntry.substring(0, 3);
  }

  function dirFieldLength(directoryEntry) {
    return directoryEntry.substring(3, 7);
  }

  function dirStartingCharacterPosition(directoryEntry) {
    return directoryEntry.substring(7, 12);
  }
}

export function to(record) {

  //let tag;
  //let ind1;
  //let ind2;

  let {leader} = record;
  let marcStr = '';
  let directoryStr = '';
  let dataFieldStr = '';
  let charPos = 0;

  record.getControlfields().forEach(field => {
    directoryStr += field.tag;

    if (field.value === undefined || field.value === '') {
      // Special case: control field contents empty
      directoryStr += addLeadingZeros(1, 4);
      directoryStr += addLeadingZeros(charPos, 5);
      charPos += 1;
      dataFieldStr += '\x1E';

    } else {
      directoryStr += addLeadingZeros(field.value.length + 1, 4);
      // Add character position
      directoryStr += addLeadingZeros(charPos, 5);
      // Advance character position counter
      charPos += lengthInUtf8Bytes(field.value) + 1;

      dataFieldStr += `${field.value}\x1E`;
    }
  });

  record.getDatafields().forEach(field => {
    const {tag, ind1, ind2} = field;

    // Add tag to directory
    directoryStr += tag;

    // Add indicators
    dataFieldStr += `${ind1 + ind2}\x1F`;

    let currDataField = '';

    field.subfields.forEach((subfield, i) => {
      let subFieldStr = subfield.value || '';
      const {code} = subfield;
      subFieldStr = code + subFieldStr;

      // Add terminator for subfield or data field

      if (i === field.subfields.length - 1) {
        subFieldStr += '\x1E';

      } else {
        subFieldStr += '\x1F';
      }

      currDataField += subFieldStr;
    });

    dataFieldStr += currDataField;

    // Add length of field containing indicators and a terminator
    // (3 characters total)

    // directoryStr += addLeadingZeros(lengthInUtf8Bytes(currDataField) + 3, 4);
    // directoryStr += addLeadingZeros(currDataField.length + 3, 4);
    directoryStr += addLeadingZeros(stringToByteArray(currDataField).length + 3, 4);

    // Add character position
    directoryStr += addLeadingZeros(charPos, 5);
    // Advance character position counter
    charPos += lengthInUtf8Bytes(currDataField) + 3;
  });

  // Recalculate and write new string length into leader
  const newStrLength = stringToByteArray(`${leader + directoryStr}\x1E${dataFieldStr}\x1D`).length;
  leader = addLeadingZeros(newStrLength, 5) + leader.substring(5);

  // Recalculate base address position
  const newBaseAddrPos = 24 + directoryStr.length + 1;
  leader = leader.substring(0, 12) + addLeadingZeros(newBaseAddrPos, 5) + leader.substring(17);

  marcStr += `${leader + directoryStr}\x1E${dataFieldStr}\x1D`;

  return marcStr;

  // Adds leading zeros to the specified numeric field.
  function addLeadingZeros(numField, length) {

    let newNumField = numField;
    while (newNumField.toString().length < length) {
      newNumField = `0${newNumField.toString()}`;
    }

    return newNumField;
  }

  // Returns the length of the input string in UTF8 bytes.
  function lengthInUtf8Bytes(str) {
    const m = encodeURIComponent(str).match(/%[89ABab]/gu);
    return str.length + (m ? m.length : 0);
  }
}

// Returns a UTF-8 substring.
function utf8Substr(str, startInBytes, lengthInBytes) {
  const strBytes = stringToByteArray(str);
  const subStrBytes = [];
  let count = 0;

  for (let i = startInBytes; count < lengthInBytes; i++) {
    subStrBytes.push(strBytes[i]);
    count += 1;
  }

  return byteArrayToString(subStrBytes);

  // Converts the byte array to a UTF-8 string.
  // From http://stackoverflow.com/questions/1240408/reading-bytes-from-a-javascript-string?lq=1
  function byteArrayToString(byteArray) {
    let str = '';
    for (let i = 0; i < byteArray.length; i++) {
      str += byteArray[i] <= 0x7F ? byteArray[i] === 0x25 ? '%25' // %
        : String.fromCharCode(byteArray[i]) : `%${byteArray[i].toString(16).toUpperCase()}`;
    }

    return decodeURIComponent(str);
  }
}

// Converts the input UTF-8 string to a byte array.
// From http://stackoverflow.com/questions/1240408/reading-bytes-from-a-javascript-string?lq=1
function stringToByteArray(str) {
  const byteArray = [];

  for (let i = 0; i < str.length; i++) {

    if (str.charCodeAt(i) <= 0x7F) {
      byteArray.push(str.charCodeAt(i));

    } else {
      const h = encodeURIComponent(str.charAt(i)).substr(1).split('%');
      for (let j = 0; j < h.length; j++) {
        byteArray.push(parseInt(h[j], 16));
      }
    }
  }

  return byteArray;
}
