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
import * as Converter from './text';

describe('text', () => {
  const fixturesPath = path.resolve(__dirname, '..', 'test-fixtures', 'text');
  const fixtureCount = fs.readdirSync(fixturesPath).filter(f => (/^from[0-9]+/u).test(f)).length;

  describe('#Reader', () => {
    it('Should emit only an end-event because of invalid data', () => new Promise((resolve, reject) => {
      const filePath = path.resolve(fixturesPath, 'erroneous');
      const reader = new Converter.reader(fs.createReadStream(filePath));

      reader.on('end', () => {
        resolve();
      });
      reader.on('data', () => {
        reject(new Error('Emitted a data-event'));
      });
      reader.on('error', () => {
        reject(new Error('Emitted an error-event'));
      });
    }));
  });

  describe('#from', () => {
    it('Should convert a single record', () => {
      const fromPath = path.resolve(fixturesPath, 'from1');
      const str = fs.readFileSync(fromPath, 'utf8');
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to1'), 'utf8');

      expect(Converter.from(str).toString()).to.equal(expectedRecord);
    });

    Array.from(Array(fixtureCount)).forEach((e, i) => {
      const index = i + 1;

      it(`Should convert file from${index} to file to${index}`, () => new Promise((resolve, reject) => {
        const records = [];
        const fromPath = path.resolve(fixturesPath, `from${index}`);
        const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, `to${index}`), 'utf8');
        const reader = new Converter.reader(fs.createReadStream(fromPath));

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

    it('Should convert multiple records from a file', () => new Promise((resolve, reject) => {
      const records = [];
      const fromPath = path.resolve(fixturesPath, 'from_multiple');
      const firstExpectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to_multiple1'), 'utf8');
      const secondExpectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to_multiple2'), 'utf8');
      const reader = new Converter.reader(fs.createReadStream(fromPath));

      reader.on('error', reject);
      reader.on('data', record => records.push(record)); // eslint-disable-line functional/immutable-data
      reader.on('end', () => {
        try {
          console.log(records);
          expect(records).to.have.length(2);
          const [firstRecord, secondRecord] = records;
          expect(firstRecord.toString()).to.equal(firstExpectedRecord);
          expect(secondRecord.toString()).to.equal(secondExpectedRecord);
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
