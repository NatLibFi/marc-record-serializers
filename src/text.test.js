import fs from 'fs';
import path from 'path';
import {describe, it} from 'node:test';
import assert from 'node:assert';
import {MarcRecord} from '@natlibfi/marc-record';
import * as Converter from './text.js';
import createDebugLogger from 'debug';

const debug = createDebugLogger('@natlibfi/marc-record-serializers:text:test');
const debugData = debug.extend('data');

describe('text', () => {
  const fixturesPath = path.resolve(import.meta.dirname, '..', 'test-fixtures', 'text');
  const fixtureCount = fs.readdirSync(fixturesPath).filter(f => (/^from[0-9]+/u).test(f)).length;

  describe('#reader', () => {
    it('Should emit only an end-event because of invalid data', () => new Promise((resolve, reject) => {
      const filePath = path.resolve(fixturesPath, 'erroneous');
      const reader = Converter.reader(fs.createReadStream(filePath));

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

      // expect(Converter.from(str).toString()).to.equal(expectedRecord);
      assert.equal(Converter.from(str).toString(), expectedRecord);
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

    it('Should not convert a record without leader', () => new Promise((resolve, reject) => {
      const records = [];
      const fromPath = path.resolve(fixturesPath, 'no-ldr');
      const reader = Converter.reader(fs.createReadStream(fromPath));

      reader.on('error', reject);
      reader.on('data', record => records.push(record));
      reader.on('end', () => {
        try {
          debugData(records);
          assert.equal(records.length, 0);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }));


    it('Should convert multiple records from a file', () => new Promise((resolve, reject) => {
      const records = [];
      const fromPath = path.resolve(fixturesPath, 'from_multiple');
      const firstExpectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to_multiple1'), 'utf8');
      const secondExpectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to_multiple2'), 'utf8');
      const reader = Converter.reader(fs.createReadStream(fromPath));

      reader.on('error', reject);
      reader.on('data', record => records.push(record));
      reader.on('end', () => {
        try {
          debugData(records);
          assert.equal(records.length, 2);
          const [firstRecord, secondRecord] = records;
          assert.deepEqual(firstRecord.toString(), firstExpectedRecord);
          assert.deepEqual(secondRecord.toString(), secondExpectedRecord);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }));

    it('Should convert multiple records from a file (6 records)', () => new Promise((resolve, reject) => {
      const records = [];
      const fromPath = path.resolve(fixturesPath, 'from_multiple2');
      const firstExpectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to_multiple1'), 'utf8');
      const secondExpectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to_multiple2'), 'utf8');
      const reader = Converter.reader(fs.createReadStream(fromPath));

      reader.on('error', reject);
      reader.on('data', record => records.push(record));
      reader.on('end', () => {
        try {
          debugData(records);
          assert.equal(records.length, 6);
          const [firstRecord, secondRecord] = records;
          assert.deepEqual(firstRecord.toString(), firstExpectedRecord);
          assert.deepEqual(secondRecord.toString(), secondExpectedRecord);
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
      assert.deepEqual(JSON.stringify(record), expectedRecord);
    });
  });

  describe('#to', () => {
    Array.from(Array(fixtureCount)).forEach((e, i) => {
      const index = i + 1;

      it(`Should convert file to${index} to file from${index}`, () => {
        const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, `from${index}`), 'utf8');
        const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, `to${index}`), 'utf8');
        const record = MarcRecord.fromString(sourceRecord);

        assert.deepEqual(Converter.to(record), expectedRecord);
      });
    });
  });
});
