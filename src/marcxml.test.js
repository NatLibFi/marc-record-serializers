import fs from 'fs';
import path from 'path';
import {describe, it} from 'node:test';
import assert from 'node:assert';
import {MarcRecord} from '@natlibfi/marc-record';
import * as Converter from './marcxml.js';

describe('marcxml', () => {
  const fixturesPath = path.resolve(import.meta.dirname, '..', 'test-fixtures', 'marcxml');
  const fixtureCount = fs.readdirSync(fixturesPath).filter(f => (/^from[0-9]+/u).test(f)).length;
  const fixtureCount2Records = fs.readdirSync(fixturesPath).filter(f => (/^2RecordsFrom[0-9]+/u).test(f)).length;

  describe('#reader', () => {
    it('Should emit an error because the file does not exist', () => new Promise((resolve, reject) => {
      // ValidationOptions:subfieldValues: false because test data has empty subfields
      const reader = Converter.reader(fs.createReadStream('foo'), {subfieldValues: false});
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

    it('Should emit an error because of invalid data', () => new Promise((resolve, reject) => {
      const filePath = path.resolve(fixturesPath, 'erroneous');
      const reader = Converter.reader(fs.createReadStream(filePath), {subfieldValues: false});

      reader.on('data', () => {
        reject(new Error('Emitted a data-event'));
      });
      reader.on('end', () => {
        reject(new Error('Emitted an end-event'));
      });

      reader.on('error', err => {
        try {
          assert.match(err.message, /^Invalid tagname /u);
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
        const reader = Converter.reader(fs.createReadStream(fromPath), {subfieldValues: false});

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

  describe('#from2records', () => {
    Array.from(Array(fixtureCount2Records)).forEach((e, i) => {
      const index = i + 1;
      it(`Should convert file 2RecordsFrom${index} to file 2RecordsTo${index}`, () => new Promise((resolve, reject) => {
        const records = [];
        const fromPath = path.resolve(fixturesPath, `2RecordsFrom${index}`);
        const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, `2RecordsTo${index}`), 'utf8');
        const reader = Converter.reader(fs.createReadStream(fromPath), {subfieldValues: false});

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
    });
  });

  const fixtureCountNamespace = fs.readdirSync(fixturesPath).filter(f => (/^from-namespace-xml[0-9]+/u).test(f)).length;
  describe('#namespace-xml', () => {
    Array.from(Array(fixtureCountNamespace)).forEach((e, i) => {
      const index = i + 1;
      it(`Should convert file from-namepace-xml${index} to file to-namespace-xml${index}`, () => new Promise((resolve, reject) => {
        const records = [];
        const fromPath = path.resolve(fixturesPath, `from-namespace-xml${index}`);
        const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, `to-namespace-xml${index}`), 'utf8');
        const reader = Converter.reader(fs.createReadStream(fromPath), {subfieldValues: false}, 'marc');

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
  });

  describe('#to', () => {
    it('Should serialize the record without XML declaration', () => {
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to-no-xml-decl'), 'utf8');
      const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, 'from-no-xml-decl'), 'utf8');
      const record = MarcRecord.fromString(sourceRecord);

      assert.deepEqual(Converter.to(record, {omitDeclaration: true}), expectedRecord);
    });

    it('Should indent the XML', () => {
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to-indent'), 'utf8');
      const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, 'from-indent'), 'utf8');
      const record = MarcRecord.fromString(sourceRecord);

      assert.deepEqual(Converter.to(record, {indent: true}), expectedRecord);
    });

    it('Should convert from XML with custom validation', async () => {
      const expectedRecord = fs.readFileSync(path.resolve(fixturesPath, 'to-custom-validation'), 'utf8');
      const sourceRecord = fs.readFileSync(path.resolve(fixturesPath, 'from-custom-validation'), 'utf8');
      const record = MarcRecord.fromString(sourceRecord, {fields: false, subfields: false, subfieldValues: false});

      // Console.log(Converter.to(record, {indent:true}));
      assert.deepEqual(await Converter.to(record), expectedRecord);
    });

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
