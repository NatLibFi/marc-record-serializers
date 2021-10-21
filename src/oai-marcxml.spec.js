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
import * as Converter from './oai-marcxml';

//import createDebugLogger from 'debug';

//const debug = createDebugLogger('@natlibfi/marc-record-serializers:oai-marcxml:test');
//const debugData = debug.extend('data');

describe('oai-marcxml', () => {
  const fixturesPath = path.resolve(__dirname, '..', 'test-fixtures', 'oai-marcxml');
  const fixtureCount = fs.readdirSync(fixturesPath).filter(f => (/^from[0-9]+/u).test(f)).length;

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

    it('Should emit an error because of invalid data (Extraneous element)', () => new Promise((resolve, reject) => {
      const filePath = path.resolve(fixturesPath, 'erroneous1');
      const reader = Converter.reader(fs.createReadStream(filePath));

      reader.on('data', () => {
        reject(new Error('Emitted a data-event'));
      });
      reader.on('end', () => {
        reject(new Error('Emitted an end-event'));
      });

      reader.on('error', err => {
        try {
          expect(err.message).to.match(/^Unable to parse node:/u);
          resolve();
        } catch (exp) {
          reject(exp);
        }
      });
    }));

    it('Should emit an error because of invalid data (Invalid control field)', () => new Promise((resolve, reject) => {
      const filePath = path.resolve(fixturesPath, 'erroneous2');
      const reader = Converter.reader(fs.createReadStream(filePath));

      reader.on('data', () => {
        reject(new Error('Emitted a data-event'));
      });
      reader.on('end', () => {
        reject(new Error('Emitted an end-event'));
      });

      reader.on('error', err => {
        try {
          expect(err.message).to.match(/^Unable to parse controlfield:/u);
          resolve();
        } catch (exp) {
          reject(exp);
        }
      });
    }));
  });

  describe('#from', () => {
    it('Should serialize the record without XML declaration', () => {
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to-no-xml-decl'), 'utf8');
      const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, 'from-no-xml-decl'), 'utf8');
      const record = MarcRecord.fromString(sourceRecord);

      expect(Converter.to(record, {omitDeclaration: true})).to.equal(expectedRecord);
    });

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

    it('Should convert file 2RecordsFrom to file 2RecordsTo', () => new Promise((resolve, reject) => {
      const records = [];
      const fromPath = path.resolve(fixturesPath, '2RecordsFrom');
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, '2RecordsTo'), 'utf8');
      const reader = Converter.reader(fs.createReadStream(fromPath));

      reader.on('error', reject);
      reader.on('data', record => records.push(record)); // eslint-disable-line functional/immutable-data
      reader.on('end', () => {
        try {
          expect(records).to.have.length(2);
          const [firstRecord, secondRecord] = records;
          expect(`${firstRecord.toString()}\n${secondRecord.toString()}`).to.equal(expectedRecord);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }));

    it('Should work with default validators', async () => {
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'out-custom-validators'), 'utf8');
      const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, 'in-custom-validators'), 'utf8');
      const record = await Converter.from(sourceRecord);
      expect(JSON.stringify(record)).to.equal(expectedRecord);
    });
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
});
