import fs from 'fs';
import path from 'path';
import {expect} from 'chai';
import {MarcRecord} from '@natlibfi/marc-record';
import * as Converter from './aleph-sequential';
import createDebugLogger from 'debug';

const debug = createDebugLogger('@natlibfi/marc-record-serializers:aleph-sequential:test');
const debugData = debug.extend('data');

MarcRecord.setValidationOptions({subfieldValues: false});

const fixturesPath = path.resolve(__dirname, '..', 'test-fixtures', 'aleph-sequential');
const fixtureCountMultiples = fs.readdirSync(fixturesPath).filter(f => (/^multiples_from/u).test(f)).length;

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
        expect(err.message).to.match(/^Could not parse/u);
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

      reader.on('error', error => errors.push(error)); // eslint-disable-line functional/immutable-data
      reader.on('data', record => records.push(record)); // eslint-disable-line functional/immutable-data
      reader.on('end', () => {
        try {
          debugData(records[0]);
          debugData(records[1]);
          expect(records).to.have.length(2);
          const [firstRecord, secondRecord] = records;
          const recordsString1 = firstRecord.toString();
          const recordsString2 = secondRecord.toString();
          expect(`${recordsString1}\n${recordsString2}`).to.equal(expectedRecordsString);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    }));
  });
});
