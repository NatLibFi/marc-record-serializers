#!/usr/bin/env node
/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Copyright 2014-2017 Pasi Tuominen
* Copyright 2018 University Of Helsinki (The National Library Of Finland)
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

'use strict';

import fs from 'fs';
import path from 'path';
import ora from 'ora';
import * as Text from './text';
import * as Json from './json';
import * as AlephSequential from './aleph-sequential';
import * as ISO2709 from './iso2709';
import * as MARCXML from './marcxml';
import * as OAI_MARCXML from './oai-marcxml';

run();

async function run() {
	try {
		const [outputDirectory, sourceType, targetType, file] = parseArgs(process.argv.slice(2));

		if (!(sourceType || targetType || file)) {
			printUsage();
			process.exit(-1);
		}

		const serialize = getSerializer(targetType);
		const Reader = getReader(sourceType);
		const reader = new Reader(fs.createReadStream(file));
		const spinner = ora('Converting records').start();

		await new Promise((resolve, reject) => {
			let count = 0;

			reader.on('error', reject);

			reader.on('end', () => {
				spinner.succeed();

				if (outputDirectory) {
					console.log(`Wrote ${count} records to ${outputDirectory}`);
				}

				resolve();
			});

			reader.on('data', record => {
				if (outputDirectory) {
					const filename = `${String(++count).padStart(5, '0')}.${getFileSuffix(targetType)}`;

					if (!fs.existsSync(outputDirectory)) {
						fs.mkdirSync(outputDirectory);
					}

					fs.writeFileSync(path.join(outputDirectory, filename), serialize(record));
				} else {
					process.stdout.write(serialize(record));
				}
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

	function parseArgs(args) {
		if (args[0] === '-d') {
			if (args.length === 5) {
				return args.slice(1);
			}
		} else if (args.length === 3) {
			return [undefined].concat(args);
		}

		return [];
	}

	function getSerializer(type) {
		const obj = getObject(type);

		if (obj) {
			return obj.to;
		}

		throw new Error(`No such serializer: ${type}`);
	}

	function getReader(type) {
		const obj = getObject(type);

		if (obj) {
			return obj.Reader;
		}

		throw new Error(`No such parser: ${type}`);
	}

	function getObject(type) {
		switch (type) {
			case 'text':
				return Text;
			case 'json':
				return Json;
			case 'alephseq':
				return AlephSequential;
			case 'marcxml':
				return MARCXML;
			case 'oai-marcxml':
				return OAI_MARCXML;
			case 'iso2709':
				return ISO2709;
			default:
		}
	}

	function getFileSuffix(type) {
		switch (type) {
			case 'text':
				return 'txt';
			case 'marcxml':
			case 'oai-marcxml':
				return 'xml';
			case 'iso2709':
				return 'marc';
			default:
				return type;
		}
	}

	function printUsage() {
		console.log(`USAGE: [-d DIRECTORY] <INPUT_FORMAT> <OUTPUT_FORMAT> <FILE>

  Options:
	-d DIRECTORY   Write records to individual files in DIRECTORY

  Parameters:
    INPUT_FORMAT   Input format
    OUTPUT_FORMAT  Output format
    FILE           File to read

  Supported formats:
    text
    json
    alephseq
    marcxml
    oai-marcxml
    iso2709
			`);
	}
}
