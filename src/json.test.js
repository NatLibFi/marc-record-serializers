import fs from 'fs';
import path from 'path';
import {describe, it} from 'node:test';
import assert from 'node:assert';
import {MarcRecord} from '@natlibfi/marc-record';
import * as Converter from './json.js';

describe('json', () => {
  const fixturesPath = path.resolve(import.meta.dirname, '..', 'test-fixtures', 'json');
  const fixtureCount = fs.readdirSync(fixturesPath).filter(f => (/^from[0-9]+/u).test(f)).length;

  describe('#reader', () => {
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
          assert.match(err.message, /^Parser cannot parse input:/u);
          resolve();
        } catch (exp) {
          reject(exp);
        }
      });
    }));
  });

  describe('#from', () => {
    it('Should convert a single record from a file', () => {
      const fromPath = path.resolve(fixturesPath, 'from_single');
      const toPath = path.resolve(fixturesPath, 'to1');

      const str = fs.readFileSync(fromPath, 'utf8');
      const expectedRecord = fs.readFileSync(toPath, 'utf8');

      assert.deepEqual(Converter.from(str).toString(), expectedRecord);
    });

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

    it('Should work with default validators', () => {
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'out-custom-validators'), 'utf8');
      const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, 'in-custom-validators'), 'utf8');
      const record = Converter.from(sourceRecord);
      assert.deepEqual(JSON.stringify(record), expectedRecord);
    });
  });

  describe('#to', () => {
    Array.from(Array(fixtureCount)).forEach((e, i) => {
      const index = i + 1;

      it(`Should convert file to${index} to file from${index}`, () => new Promise((resolve, reject) => {
        const records = [];
        const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, `to${index}`), 'utf8');
        const record = MarcRecord.fromString(sourceRecord);

        const fromPath = path.resolve(fixturesPath, `from${index}`);
        const reader = Converter.reader(fs.createReadStream(fromPath));

        reader.on('error', reject);
        reader.on('data', record => records.push(record));
        reader.on('end', () => {
          try {
            const [firstRecord] = records;
            const stringified = JSON.stringify(firstRecord.toObject(), undefined, 2);
            assert.deepEqual(Converter.to(record), stringified);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      }));
    });
  });
});
