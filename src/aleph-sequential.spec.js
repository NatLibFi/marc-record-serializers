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


import fs from 'fs';
import path from 'path';
import {expect} from 'chai';
import {MarcRecord} from '@natlibfi/marc-record';
import * as Converter from './aleph-sequential';
import createDebugLogger from 'debug';

const debug = createDebugLogger('@natlibfi/marc-record-serializers:aleph-sequential:test');
// NOT USED const debugData = debug.extend('data');

MarcRecord.setValidationOptions({subfieldValues: false});

describe('aleph-sequential', () => {
  const fixturesPath = path.resolve(__dirname, '..', 'test-fixtures', 'aleph-sequential');
  const fixtureCount = fs.readdirSync(fixturesPath).filter(f => (/^from/u).test(f)).length;
  const fixtureCountSplitFields = fs.readdirSync(fixturesPath).filter(f => (/^splitfields-from/u).test(f)).length;

  describe('#reader', () => {
    it('Should emit an error because the file does not exist', () => new Promise((resolve, reject) => {
      const reader = Converter.reader(fs.createReadStream('foo'));
      reader.on('data', reject);
      reader.on('end', reject);
      reader.on('error', err => {
        try {
          expect(err.code).to.equal('ENOENT');
          resolve();
        } catch (exp) {
          reject(exp);
        }
      });
    }));

    it('Should emit an error because of invalid data', () => new Promise((resolve, reject) => {
      const filePath = path.resolve(fixturesPath, 'erroneous');
      const reader = Converter.reader(fs.createReadStream(filePath));

      reader.on('data', () => {
        reject(new Error('Emitted a data-event'));
      });
      reader.on('end', () => {
        reject(new Error('Emitted an end-event'));
      });

      reader.on('error', err => {
        try {
          expect(err.message).to.match(/^Could not parse/u);
          resolve();
        } catch (exp) {
          reject(exp);
        }
      });
    }));
  });

  describe('#from', () => {
    Array.from(Array(fixtureCount)).forEach((e, i) => {
      const index = i + 1;

      it(`Should convert file from${index} to file to${index}`, () => new Promise((resolve, reject) => {
        const records = [];
        const fromPath = path.resolve(fixturesPath, `from${index}`);
        const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, `to${index}`), 'utf8');
        const reader = Converter.reader(fs.createReadStream(fromPath));

        reader.on('error', reject);
        reader.on('data', record => records.push(record)); // eslint-disable-line functional/immutable-data
        reader.on('end', () => {
          try {
            expect(records).to.have.length(1);
            const [firstRecord] = records;
            expect(firstRecord.toString()).to.equal(expectedRecord);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      }));
    });
  });

  describe('#from no f001', () => {
    it('Should convert file noF001 and correct f001 value to match file yesF001', () => new Promise((resolve, reject) => {
      const records = [];
      const fromPath = path.resolve(fixturesPath, 'noF001');
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'yesF001'), 'utf8');
      const reader = Converter.reader(fs.createReadStream(fromPath), undefined, true);

      reader.on('error', reject);
      reader.on('data', record => records.push(record)); // eslint-disable-line functional/immutable-data
      reader.on('end', () => {
        try {
          expect(records).to.have.length(1);
          const [firstRecord] = records;
          expect(firstRecord.toString()).to.equal(expectedRecord);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }));
  });

  describe('#to', () => {
    Array.from(Array(fixtureCount)).forEach((e, i) => {
      const index = i + 1;

      it(`Should convert file to${index} to file from${index}`, () => {
        const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, `from${index}`), 'utf8');
        const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, `to${index}`), 'utf8');
        const record = MarcRecord.fromString(sourceRecord);

        expect(Converter.to(record)).to.equal(expectedRecord);
      });
    });
  });

  describe('#to with useCrForContinuingResources', () => {
    it('Should convert file to7 to file useCRfrom7, use CR for FMT for continuing resources', () => {
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'useCRfrom7'), 'utf8');
      const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, 'to7'), 'utf8');
      const record = MarcRecord.fromString(sourceRecord);

      expect(Converter.to(record, {useCrForContinuingResources: false})).to.equal(expectedRecord);
    });
  });

  describe('#from splitfields', () => {
    Array.from(Array(fixtureCountSplitFields)).forEach((e, i) => {
      const index = i + 1;

      it(`Should convert file splitfields-from${index} to file splitfields-to${index}`, () => new Promise((resolve, reject) => {
        const records = [];
        const fromPath = path.resolve(fixturesPath, `splitfields-from${index}`);
        const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, `splitfields-to${index}`), 'utf8');
        const reader = Converter.reader(fs.createReadStream(fromPath));

        reader.on('error', reject);
        reader.on('data', record => records.push(record)); // eslint-disable-line functional/immutable-data
        reader.on('end', () => {
          try {
            expect(records).to.have.length(1);
            const [resultRecord] = records;
            expect(resultRecord.toString()).to.equal(expectedRecord);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      }));
    });
  });

  describe('#to splitfields', () => {
    Array.from(Array(fixtureCountSplitFields)).forEach((e, i) => {
      // Skip those test cases that do not work as a roundtrip
      const skipIndexes = [1];
      const index = i + 1;

      if (skipIndexes.includes(index)) {
        debug(`Skipping splitfields-to${index}`);
        return;
      }

      it(`Should convert file splitfields-to${index} to file splitfields-from${index}`, () => {
        const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, `splitfields-from${index}`), 'utf8');
        const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, `splitfields-to${index}`), 'utf8');
        const record = MarcRecord.fromString(sourceRecord);
        const result = Converter.to(record);
        expect(result).to.equal(expectedRecord);
      });
    });

  });

  describe('#from load-test', () => {
    it('Should convert file load-test (100 records). Check time manually!', () => new Promise((resolve, reject) => {
      const records = [];
      const errors = [];
      const fromPath = path.resolve(fixturesPath, 'load-test');
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'load-test-exp1'), 'utf8');
      const reader = Converter.reader(fs.createReadStream(fromPath), undefined, true);
      // eslint-disable-next-line functional/no-let
      let counter = 0;

      // eslint-disable-next-line functional/immutable-data
      reader.on('error', error => errors.push(error));
      reader.on('data', record => {
        records.push(record); // eslint-disable-line functional/immutable-data
        debug('...');
        counter += 1;
      });
      reader.on('end', () => {
        try {
          debug(`Counter: ${counter}`);
          debug(`Errors: ${errors}`);
          expect(records).to.have.length(100);
          const [firstRecord] = records;
          expect(firstRecord.toString()).to.equal(expectedRecord);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }));
  });

  // Test for failing converting records that have controlCharacters in field/subfield values
  describe('#to - newlines in field values', () => {
    it('should throw if record has control characters in field/subfield values', () => {
      const inputRecordJSON = fs.readFileSync(path.resolve(fixturesPath, 'recordWithNewline'), 'utf8');
      const record = new MarcRecord(JSON.parse(inputRecordJSON));
      try {
        Converter.to(record);
      } catch (err) {
        debug(err);
        expect(err.message).to.match(/^Record is invalid:/u);
        //`Record is invalid: instance.fields[4] is not any of [subschema 0],[subschema 1]`;
        return;
      }
      throw new Error('Should throw');
    });

  });

  // Test for failing converting records that are too long (> 49999 bytes) for Aleph
  describe('#to - too long record', () => {
    it('should throw if record is too long for use in Aleph', () => {
      const inputRecordJSON = fs.readFileSync(path.resolve(fixturesPath, 'tooLongRecord'), 'utf8');
      const record = new MarcRecord(JSON.parse(inputRecordJSON));
      try {
        Converter.to(record);
      } catch (err) {
        debug(err);
        expect(err.message).to.match(/^Record is invalid: Record is too long to be converted to Aleph Sequential./u);
        return;
      }
      throw new Error('Should throw');
    });

  });

  // Tests for different types of empty subfields
  describe('#to - empty subfield value', () => {
    it(`should not throw even if there's a subfield with empty value`, () => {
      const inputRecordJSON = fs.readFileSync(path.resolve(fixturesPath, 'emptySubfield'), 'utf8');
      debug(inputRecordJSON);
      // eslint-disable-next-line no-console
      console.log(inputRecordJSON);
      const record = new MarcRecord(JSON.parse(inputRecordJSON));
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(record));
      const alephSeq = Converter.to(record);
      // eslint-disable-next-line no-console
      console.log(alephSeq);
    });
  });
  describe('#to - empty subfield', () => {
    it(`should not throw even if there's a subfield with a space as value`, () => {
      const inputRecordJSON = fs.readFileSync(path.resolve(fixturesPath, 'justSpaceSubfield'), 'utf8');
      debug(inputRecordJSON);
      // eslint-disable-next-line no-console
      console.log(inputRecordJSON);
      const record = new MarcRecord(JSON.parse(inputRecordJSON));
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(record));
      const alephSeq = Converter.to(record);
      // eslint-disable-next-line no-console
      console.log(alephSeq);
    });
  });
  describe('#to - empty subfield', () => {
    it(`should not throw even if there's a subfield no value`, () => {
      const inputRecordJSON = fs.readFileSync(path.resolve(fixturesPath, 'valuelessSubfield'), 'utf8');
      debug(inputRecordJSON);
      // eslint-disable-next-line no-console
      console.log(inputRecordJSON);
      const record = new MarcRecord(JSON.parse(inputRecordJSON));
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(record));
      const alephSeq = Converter.to(record);
      // eslint-disable-next-line no-console
      console.log(alephSeq);
    });
  });


});
