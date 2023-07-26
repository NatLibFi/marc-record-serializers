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

run();

async function run() {
  const VALIDATION_OPTIONS_USAGE = `Validation options:
  111 => {fields: true, subfields: true, subfieldValues: true}
  010 => {fields: false, subfields: true, subfieldValues: false}
  000 => {fields: false, subfields: false, subfieldValues: false}`;
  const FORMAT_USAGE = `Supported formats:
  text, json, alephseq, marcxml, oai-marcxml, iso2709`;

  try {
    const args = yargs
      .scriptName('marc-record-serializers')
      .usage('$0 <inputFormat> <outputFormat> <file>', '', yargs => {
        yargs
          .positional('inputFormat', {type: 'string', describe: 'Input format'})
          .positional('outputFormat', {type: 'string', describe: 'Output format'})
          .positional('file', {describe: 'File to read', type: 'string'});
      })
      .option('v', {alias: 'validate', default: true, type: 'boolean', describe: 'Validate MARC record structure'})
      .option('o', {alias: 'validationOptions', default: '111', type: 'string', describe: 'Boolean numbers declaring validation options'})
      .option('d', {alias: 'outputDirectory', type: 'string', describe: 'Write records to individual files in DIRECTORY'})
      .option('n', {alias: 'marcXmlNameSpace', type: 'string', describe: 'Namespace prefix used for marcxml reader'})
      .epilogue(VALIDATION_OPTIONS_USAGE)
      .epilogue(FORMAT_USAGE)
      .parse();

    const {serialize, outputPrefix, outputSuffix, outputSeparator, fileSuffix, recordCallback} = getService(args.outputFormat);
    const {reader} = getService(args.inputFormat);
    const validationOptions = args.validate ? handleValidationOptions(args.validationOptions) : {fields: false, subfields: false, subfieldValues: false};
    const marcXmlNameSpace = args.marcXmlNameSpace || '';
    const readerFromFile = reader(fs.createReadStream(args.file), validationOptions, marcXmlNameSpace);

    //console.log('Converting records.');
    //console.log(validationOptions);

    await new Promise((resolve, reject) => {
      // eslint-disable-next-line functional/no-let
      let count = 0;

      // eslint-disable-next-line functional/no-conditional-statements
      if (!args.outputDirectory && outputPrefix) {
        process.stdout.write(outputPrefix);
      }

      readerFromFile.on('error', err => {
        // eslint-disable-next-line functional/no-conditional-statements
        if ('validationResults' in err) {
          const message = `Record is invalid: ${JSON.stringify(err.validationResults.errors, undefined, 2)}`;
          reject(new Error(message));
          // eslint-disable-next-line functional/no-conditional-statements
        } else {
          reject(err);
        }
      });

      readerFromFile.on('end', () => {
        //console.log('Done');

        // eslint-disable-next-line functional/no-conditional-statements
        if (args.outputDirectory) {
          console.log(`Wrote ${count} records to ${args.outputDirectory}`);
          // eslint-disable-next-line functional/no-conditional-statements
        } else if (outputSuffix) {
          process.stdout.write(outputSuffix);
        }

        resolve();
      });

      readerFromFile.on('data', record => {
        if (args.outputDirectory) {
          const filename = `${String(count).padStart(5, '0')}.${fileSuffix}`;

          // eslint-disable-next-line functional/no-conditional-statements
          if (!fs.existsSync(args.outputDirectory)) {
            fs.mkdirSync(args.outputDirectory);
          }

          fs.writeFileSync(path.join(args.outputDirectory, filename), serialize(record, validationOptions));
        } else {
          const str = serialize(record, validationOptions);

          // eslint-disable-next-line functional/no-conditional-statements
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
    // eslint-disable-next-line functional/no-conditional-statements
    if (process.env.NODE_ENV === 'debug') {
      console.error(err);
      process.exit(-1);
    }

    console.error(`ERROR: ${err.message}`);
    process.exit(-1);
  }

  function getService(type) {
    if (type === 'text') {
      return {
        reader: Text.reader,
        serialize: Text.to,
        fileSuffix: 'txt',
        recordCallback: ensureLineBreak
      };
    }
    if (type === 'json') {
      return {
        reader: Json.reader,
        serialize: Json.to,
        outputPrefix: '[',
        outputSuffix: ']',
        outputSeparator: ',',
        fileSuffix: 'json',
        recordCallback: defaultRecordCallback
      };
    }
    if (type === 'alephseq') {
      return {
        reader: AlephSequential.reader,
        serialize: AlephSequential.to,
        fileSuffix: 'seq',
        recordCallback: ensureLineBreak
      };
    }
    if (type === 'marcxml') {
      return {
        reader: MARCXML.reader,
        serialize: MARCXML.to,
        outputPrefix: '<?xml version="1.0" encoding="UTF-8"?><records>',
        outputSuffix: '</records>',
        fileSuffix: 'xml',
        recordCallback: removeXmlDeclaration
      };
    }
    if (type === 'oai-marcxml') {
      return {
        reader: OAI_MARCXML.reader,
        serialize: OAI_MARCXML.to,
        outputPrefix: '<?xml version="1.0" encoding="UTF-8"?><records>',
        outputSuffix: '</records>',
        fileSuffix: 'xml',
        recordCallback: removeXmlDeclaration
      };
    }
    if (type === 'iso2709') {
      return {
        reader: ISO2709.reader,
        serialize: ISO2709.to,
        fileSuffix: 'marc',
        recordCallback: defaultRecordCallback
      };
    }
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

  function handleValidationOptions(value) {
    if (value.length === 3) {
      const [fields, subfields, subfieldValues] = value;
      return {
        fields: fields === '1',
        subfields: subfields === '1',
        subfieldValues: subfieldValues === '1'
      };
    }
    throw new Error('Invalid validation options value!');
  }
}
