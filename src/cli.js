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
import * as AlephSequential from './aleph-sequential';
import * as ISO2709 from './iso2709';
import * as MARCXML from './marcxml';

run();

async function run() {
	try {
		if (process.argv.length < 5) {
			console.log(`USAGE: <SOURCE> <TARGET> <FILE>

Parameters:
  SOURCE    Source format
  TARGET    Target format
  FILE      File to read

Supported formats:
  alephseq
  marcxml
  iso2709
      `);
			process.exit(-1);
		}

		const [sourceType, targetType, file] = process.argv.slice(2);
		const serialize = getSerializer(targetType);
		const Reader = getReader(sourceType);
		const reader = new Reader(fs.createReadStream(file));

		await new Promise((resolve, reject) => {
			reader.on('error', reject);
			reader.on('end', resolve);
			reader.on('data', record => {
				process.stdout.write(serialize(record));
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
			case 'alephseq':
				return AlephSequential;
			case 'marcxml':
				return MARCXML;
			case 'iso2709':
				return ISO2709;
			default:
		}
	}
}
