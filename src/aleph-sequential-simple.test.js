import fs from 'fs';
import path from 'path';
import {describe, it} from 'node:test';
import assert from 'node:assert';
import {MarcRecord} from '@natlibfi/marc-record';
import * as Converter from './aleph-sequential.js';
import createDebugLogger from 'debug';

const debug = createDebugLogger('@natlibfi/marc-record-serializers:aleph-sequential:test');
const debugData = debug.extend('data');

MarcRecord.setValidationOptions({subfieldValues: false});

const fixturesPath = path.resolve(import.meta.dirname, '..', 'test-fixtures', 'aleph-sequential');
const fixtureCountMultiples = fs.readdirSync(fixturesPath).filter(f => (/^multiples_from/u).test(f)).length;

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

  it('Should read', () => new Promise((resolve, reject) => {
    const filePath = path.resolve(fixturesPath, 'from1');
    const reader = Converter.reader(fs.createReadStream(filePath));

    reader.on('data', () => {
      resolve();
    });
    reader.on('end', () => {
      //reject(new Error('Emitted an end-event'));
    });

    reader.on('error', () => {
      reject(new Error('Emitted an error-event'));
    });
  }));

  it('Should emit an error because of invalid data', () => new Promise((resolve, reject) => {
    const filePath = path.resolve(fixturesPath, 'erroneous');
    const reader = Converter.reader(fs.createReadStream(filePath));

    reader.on('data', () => {
      reject(new Error('Emitted a data-event'));
    });
    reader.on('end', () => {
      //reject(new Error('Emitted an end-event'));
    });

    reader.on('error', err => {
      try {
        assert.match(err.message, /^Could not parse/u);
        resolve();
      } catch (exp) {
        reject(exp);
      }
    });
  }));
});

describe('#multiples_from', () => {
  debug(`Tests for from multiples`);
  Array.from(Array(fixtureCountMultiples)).forEach((e, i) => {
    const index = i + 1;
    it(`Should convert file multiple_from${index} to file multiples_to${index}`, () => new Promise((resolve, reject) => {
      const records = [];
      const errors = [];
      const fromPath = path.resolve(fixturesPath, `multiples_from${index}`);
      const expectedRecordsString = fs.readFileSync(path.resolve(fixturesPath, `multiples_to${index}`), 'utf8');
      const reader = Converter.reader(fs.createReadStream(fromPath));

      reader.on('error', error => errors.push(error));
      reader.on('data', record => records.push(record));
      reader.on('end', () => {
        try {
          debugData(records[0]);
          debugData(records[1]);
          assert.equal(records.length, 2);
          const [firstRecord, secondRecord] = records;
          const recordsString1 = firstRecord.toString();
          const recordsString2 = secondRecord.toString();
          assert.deepEqual(`${recordsString1}\n${recordsString2}`, expectedRecordsString);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }));
  });
});
