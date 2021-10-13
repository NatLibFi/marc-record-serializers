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
  const fixtureCount = fs.readdirSync(fixturesPath).filter(f => (/^from/).test(f)).length;
  const fixtureCountSplitFields = fs.readdirSync(fixturesPath).filter(f => (/^splitfields-from/).test(f)).length;

  describe('#Reader', () => {
    it('Should emit an error because the file does not exist', () => new Promise((resolve, reject) => {
      const reader = new Converter.Reader(fs.createReadStream('foo'));
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
      const reader = new Converter.Reader(fs.createReadStream(filePath));

      reader.on('data', () => {
        reject(new Error('Emitted a data-event'));
      });
      reader.on('end', () => {
        reject(new Error('Emitted an end-event'));
      });

      reader.on('error', err => {
        try {
          expect(err.message).to.match(/^Could not parse/);
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
        const reader = new Converter.Reader(fs.createReadStream(fromPath));

        reader.on('error', reject);
        reader.on('data', record => records.push(record));
        reader.on('end', () => {
          try {
            expect(records).to.have.length(1);
            expect(records.shift().toString()).to.equal(expectedRecord);
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
      const reader = new Converter.Reader(fs.createReadStream(fromPath), undefined, true);

      reader.on('error', reject);
      reader.on('data', record => records.push(record));
      reader.on('end', () => {
        try {
          expect(records).to.have.length(1);
          expect(records.shift().toString()).to.equal(expectedRecord);
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
        const reader = new Converter.Reader(fs.createReadStream(fromPath));

        reader.on('error', reject);
        reader.on('data', record => records.push(record));
        reader.on('end', () => {
          try {
            expect(records).to.have.length(1);
            const resultRecord = records.shift();
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
});
