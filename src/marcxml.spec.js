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
import * as Converter from './marcxml';

describe('marcxml', () => {
  const fixturesPath = path.resolve(__dirname, '..', 'test-fixtures', 'marcxml');
  const fixtureCount = fs.readdirSync(fixturesPath).filter(f => (/^from[0-9]+/).test(f)).length;
  const fixtureCount2Records = fs.readdirSync(fixturesPath).filter(f => (/^2RecordsFrom[0-9]+/).test(f)).length;

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
          expect(err.message).to.match(/^Invalid tagname /);
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

    it('Should work with default validators', async () => {
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'out-custom-validators'), 'utf8');
      const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, 'in-custom-validators'), 'utf8');
      const record = await Converter.from(sourceRecord);
      expect(JSON.stringify(record)).to.equal(expectedRecord);
    });
  });

  describe('#from2records', () => {
    Array.from(Array(fixtureCount2Records)).forEach((e, i) => {
      const index = i + 1;
      it(`Should convert file 2RecordsFrom${index} to file 2RecordsTo${index}`, () => new Promise((resolve, reject) => {
        const records = [];
        const fromPath = path.resolve(fixturesPath, `2RecordsFrom${index}`);
        const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, `2RecordsTo${index}`), 'utf8');
        const reader = new Converter.Reader(fs.createReadStream(fromPath));

        reader.on('error', reject);
        reader.on('data', record => records.push(record));
        reader.on('end', () => {
          try {
            expect(records).to.have.length(2);
            expect(`${records.shift().toString()}\n${records.shift().toString()}`).to.equal(expectedRecord);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      }));
    });
  });

  describe('#to', () => {
    it('Should serialize the record without XML declaration', () => {
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to-no-xml-decl'), 'utf8');
      const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, 'from-no-xml-decl'), 'utf8');
      const record = MarcRecord.fromString(sourceRecord);

      expect(Converter.to(record, {omitDeclaration: true})).to.equal(expectedRecord);
    });

    it('Should indent the XML', () => {
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to-indent'), 'utf8');
      const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, 'from-indent'), 'utf8');
      const record = MarcRecord.fromString(sourceRecord);

      expect(Converter.to(record, {indent: true})).to.equal(expectedRecord);
    });

    it('Should convert from XML with custom validation', async () => {
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to-custom-validation'), 'utf8');
      const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, 'from-custom-validation'), 'utf8');
      const record = MarcRecord.fromString(sourceRecord, {fields: false, subfields: false, subfieldValues: false});

      // Console.log(Converter.to(record, {indent:true}));
      expect(Converter.to(record)).to.equal(expectedRecord);
    });

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
});
