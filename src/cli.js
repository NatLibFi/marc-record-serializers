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

/* eslint-disable no-process-exit */
/* eslint-disable no-process-env */
/* eslint-disable no-console */

import fs from 'fs';
import path from 'path';
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
    const {reader} = getService(args.inputFormat);
    const readerFromFile = reader(fs.createReadStream(args.file));

    //console.log('Converting records.');

    // eslint-disable-next-line functional/no-conditional-statement
    if (!args.validate) {
      MarcRecord.setValidationOptions({fields: false, subfields: false, subfieldValues: false});
    }

    await new Promise((resolve, reject) => {
      // eslint-disable-next-line functional/no-let
      let count = 0;

      // eslint-disable-next-line functional/no-conditional-statement
      if (!args.outputDirectory && outputPrefix) {
        process.stdout.write(outputPrefix);
      }

      readerFromFile.on('error', err => {
        // eslint-disable-next-line functional/no-conditional-statement
        if ('validationResults' in err) {
          const message = `Record is invalid: ${JSON.stringify(err.validationResults.errors, undefined, 2)}`;
          reject(new Error(message));
        // eslint-disable-next-line functional/no-conditional-statement
        } else {
          reject(err);
        }
      });

      readerFromFile.on('end', () => {
        //console.log('Done');

        // eslint-disable-next-line functional/no-conditional-statement
        if (args.outputDirectory) {
          console.log(`Wrote ${count} records to ${args.outputDirectory}`);
        // eslint-disable-next-line functional/no-conditional-statement
        } else if (outputSuffix) {
          process.stdout.write(outputSuffix);
        }

        resolve();
      });

      readerFromFile.on('data', record => {
        if (args.outputDirectory) {
          const filename = `${String(count).padStart(5, '0')}.${fileSuffix}`;

          // eslint-disable-next-line functional/no-conditional-statement
          if (!fs.existsSync(args.outputDirectory)) {
            fs.mkdirSync(args.outputDirectory);
          }

          fs.writeFileSync(path.join(args.outputDirectory, filename), serialize(record));
        } else {
          const str = serialize(record);

          // eslint-disable-next-line functional/no-conditional-statement
          if (outputSeparator && count > 0) {
            process.stdout.write(outputSeparator);
          }

          process.stdout.write(recordCallback(str));
        }

        count += 1;
      });
    });

    process.exit();
  } catch (err) {
    // eslint-disable-next-line functional/no-conditional-statement
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
        reader: Text.reader,
        serialize: Text.to,
        fileSuffix: 'txt',
        recordCallback: ensureLineBreak
      };
    case 'json':
      return {
        reader: Json.reader,
        serialize: Json.to,
        outputPrefix: '[',
        outputSuffix: ']',
        outputSeparator: ',',
        fileSuffix: 'json',
        recordCallback: defaultRecordCallback
      };
    case 'alephseq':
      return {
        reader: AlephSequential.reader,
        serialize: AlephSequential.to,
        fileSuffix: 'seq',
        recordCallback: ensureLineBreak
      };
    case 'marcxml':
      return {
        reader: MARCXML.reader,
        serialize: MARCXML.to,
        outputPrefix: '<?xml version="1.0" encoding="UTF-8"?><records>',
        outputSuffix: '</records>',
        fileSuffix: 'xml',
        recordCallback: removeXmlDeclaration
      };
    case 'oai-marcxml':
      return {
        reader: OAI_MARCXML.reader,
        serialize: OAI_MARCXML.to,
        outputPrefix: '<?xml version="1.0" encoding="UTF-8"?><records>',
        outputSuffix: '</records>',
        fileSuffix: 'xml',
        recordCallback: removeXmlDeclaration
      };
    case 'iso2709':
      return {
        reader: ISO2709.reader,
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
      return s.replace(/^<\?xml version="1\.0" encoding="UTF-8"\?>/u, '');
    }
  }
}
