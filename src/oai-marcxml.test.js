import fs from 'fs';
import path from 'path';
import {describe, it} from 'node:test';
import assert from 'node:assert';
import {MarcRecord} from '@natlibfi/marc-record';
import * as Converter from './oai-marcxml.js';

//import createDebugLogger from 'debug';

//const debug = createDebugLogger('@natlibfi/marc-record-serializers:oai-marcxml:test');
//const debugData = debug.extend('data');

describe('oai-marcxml', () => {
  const fixturesPath = path.resolve(import.meta.dirname, '..', 'test-fixtures', 'oai-marcxml');
  const fixtureCount = fs.readdirSync(fixturesPath).filter(f => (/^from[0-9]+/u).test(f)).length;

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
          assert.match(err.message, /^Unable to parse node:/u);
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
          assert.match(err.message, /^Unable to parse controlfield:/u);
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

      assert.deepEqual(Converter.to(record, {omitDeclaration: true}), expectedRecord);
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

    it('Should convert file 2RecordsFrom to file 2RecordsTo', () => new Promise((resolve, reject) => {
      const records = [];
      const fromPath = path.resolve(fixturesPath, '2RecordsFrom');
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, '2RecordsTo'), 'utf8');
      const reader = Converter.reader(fs.createReadStream(fromPath));

      reader.on('error', reject);
      reader.on('data', record => records.push(record));
      reader.on('end', () => {
        try {
          assert.equal(records.length, 2);
          const [firstRecord, secondRecord] = records;
          assert.deepEqual(`${firstRecord.toString()}\n${secondRecord.toString()}`, expectedRecord);
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
