#!/usr/bin/env node
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
import ora from 'ora';
import yargs from 'yargs';
import * as Text from './text';
import * as Json from './json';
import * as AlephSequential from './aleph-sequential';
import * as ISO2709 from './iso2709';
import * as MARCXML from './marcxml';
import * as OAI_MARCXML from './oai-marcxml';
import {MarcRecord} from '@natlibfi/marc-record';

run();

async function run() {
  const FORMAT_USAGE = `Supported formats:
	text
	json
	alephseq
	marcxml
	oai-marcxml
	iso2709`;

  try {
    const args = yargs
      .scriptName('marc-record-serializers')
      .command('$0 <inputFormat> <outputFormat> <file>', '', yargs => {
        yargs
          .positional('inputFormat', {type: 'string', describe: 'Input format'})
          .positional('outputFormat', {type: 'string', describe: 'Output format'})
          .positional('file', {type: 'string', describe: 'File to read'})
          .epilog(FORMAT_USAGE);
      })
      .option('v', {alias: 'validate', default: true, type: 'boolean', describe: 'Validate MARC record structure'})
      .option('d', {alias: 'outputDirectory', type: 'string', describe: 'Write records to individual files in DIRECTORY'})
      .parse();

    const {serialize, outputPrefix, outputSuffix, outputSeparator, fileSuffix, recordCallback} = getService(args.outputFormat);
    const {Reader} = getService(args.inputFormat);
    const reader = new Reader(fs.createReadStream(args.file));
    const spinner = ora('Converting records.\n').start();

    if (!args.validate) {
      MarcRecord.setValidationOptions({fields: false, subfields: false, subfieldValues: false});
    }

    await new Promise((resolve, reject) => {
      let count = 0;

      if (!args.outputDirectory && outputPrefix) {
        process.stdout.write(outputPrefix);
      }

      reader.on('error', err => {
        if ('validationResults' in err) {
          const message = `Record is invalid: ${JSON.stringify(err.validationResults.errors, undefined, 2)}`;
          reject(new Error(message));
        } else {
          reject(err);
        }
      });

      reader.on('end', () => {
        spinner.succeed();

        if (args.outputDirectory) {
          console.log(`Wrote ${count} records to ${args.outputDirectory}`);
        } else if (outputSuffix) {
          process.stdout.write(outputSuffix);
        }

        resolve();
      });

      reader.on('data', record => {
        if (args.outputDirectory) {
          const filename = `${String(count).padStart(5, '0')}.${fileSuffix}`;

          if (!fs.existsSync(args.outputDirectory)) {
            fs.mkdirSync(args.outputDirectory);
          }

          fs.writeFileSync(path.join(args.outputDirectory, filename), serialize(record));
        } else {
          const str = serialize(record);

          if (outputSeparator && count > 0) {
            process.stdout.write(outputSeparator);
          }

          process.stdout.write(recordCallback(str));
        }

        count++;
      });
    });

    process.exit();
  } catch (err) {
    if (process.env.NODE_ENV === 'debug') {
      console.error(err);
      process.exit(-1);
    }

    console.error(`ERROR: ${err.message}`);
    process.exit(-1);
  }

  function getService(type) {
    switch (type) {
    case 'text':
      return {
        Reader: Text.Reader,
        serialize: Text.to,
        fileSuffix: 'txt',
        recordCallback: ensureLineBreak
      };
    case 'json':
      return {
        Reader: Json.Reader,
        serialize: Json.to,
        outputPrefix: '[',
        outputSuffix: ']',
        outputSeparator: ',',
        fileSuffix: 'json',
        recordCallback: defaultRecordCallback
      };
    case 'alephseq':
      return {
        Reader: AlephSequential.Reader,
        serialize: AlephSequential.to,
        fileSuffix: 'seq',
        recordCallback: ensureLineBreak
      };
    case 'marcxml':
      return {
        Reader: MARCXML.Reader,
        serialize: MARCXML.to,
        outputPrefix: '<?xml version="1.0" encoding="UTF-8"?><records>',
        outputSuffix: '</records>',
        fileSuffix: 'xml',
        recordCallback: removeXmlDeclaration
      };
    case 'oai-marcxml':
      return {
        Reader: OAI_MARCXML.Reader,
        serialize: OAI_MARCXML.to,
        outputPrefix: '<?xml version="1.0" encoding="UTF-8"?><records>',
        outputSuffix: '</records>',
        fileSuffix: 'xml',
        recordCallback: removeXmlDeclaration
      };
    case 'iso2709':
      return {
        Reader: ISO2709.Reader,
        serialize: ISO2709.to,
        fileSuffix: 'marc',
        recordCallback: defaultRecordCallback
      };
    default:
      throw new Error(`Unsupported format ${type}`);
    }

    function defaultRecordCallback(s) {
      return s;
    }

    function ensureLineBreak(s) {
      return s.endsWith('\n') ? s : `${s}\n`;
    }

    function removeXmlDeclaration(s) {
      return s.replace(/^<\?xml version="1\.0" encoding="UTF-8"\?>/, '');
    }
  }
}
