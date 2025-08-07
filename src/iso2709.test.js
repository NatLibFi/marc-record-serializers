import fs from 'fs';
import path from 'path';
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert';
import {MarcRecord} from '@natlibfi/marc-record';
import * as Converter from './iso2709.js';

describe('iso2709', () => {
  const fixturesPath = path.resolve(import.meta.dirname, '..', 'test-fixtures', 'iso2709');
  const fixtureCount = fs.readdirSync(fixturesPath).filter(f => (/^from/u).test(f)).length;

  describe('#reader', () => {
    it('Should emit an error because the file does not exist', () => new Promise((resolve, reject) => {
      const reader = Converter.reader(fs.createReadStream('foo'));
      reader.on('data', reject);
      reader.on('end', reject);
      reader.on('error', err => {
        try {
          assert(err.code, 'ENOENT');
          resolve();
        } catch (exp) {
          reject(exp);
        }
      });
    }));

    it('Should do nothing because of invalid data', () => new Promise((resolve, reject) => {
      const filePath = path.resolve(fixturesPath, 'erroneous');
      const reader = Converter.reader(fs.createReadStream(filePath));

      reader.on('end', resolve);
      reader.on('data', () => {
        reject(new Error('Emitted a data-event'));
      });
      reader.on('error', () => {
        reject(new Error('Emitted an error-event'));
      });
    }));
  });

  describe('#from', () => {
    before(() => MarcRecord.setValidationOptions({subfieldValues: false}));
    after(() => MarcRecord.setValidationOptions({}));
    Array.from(Array(fixtureCount)).forEach((e, i) => {
      const index = i + 1;

      it(`Should convert file from${index} to file to${index}`, () => new Promise((resolve, reject) => {
        const records = [];
        const fromPath = path.resolve(fixturesPath, `from${index}`);
        const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, `to${index}`), 'utf8');
        const reader = Converter.reader(fs.createReadStream(fromPath));

        reader.on('error', reject);
        reader.on('data', record => records.push(record));
        reader.on('end', () => {
          try {
            assert.equal(records.length, 1);
            const [firstRecord] = records;
            assert.deepEqual(firstRecord.toString(), expectedRecord);
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
      assert.deepEqual(JSON.stringify(record), expectedRecord);
    });
  });

  describe('#to', () => {
    Array.from(Array(fixtureCount)).forEach((e, i) => {
      const index = i + 1;

      it(`Should convert file to${index} to file from${index}`, () => {
        const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, `from${index}`), 'utf8');
        const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, `to${index}`), 'utf8');
        const record = MarcRecord.fromString(sourceRecord, {subfieldValues: false});

        assert.deepEqual(Converter.to(record), expectedRecord);
      });
    });
  });
});
