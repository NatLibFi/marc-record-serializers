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

import {Readable} from 'stream';
import {MarcRecord} from '@natlibfi/marc-record';

export class Reader extends Readable {
	constructor(stream, validationOptions = {}) {
		MarcRecord.setValidationOptions(validationOptions);
		super(stream);
		this.buffer = [];

		const self = this;

		stream.on('data', data => {
			this.buffer += data;
			flush();
		});

		stream.on('end', () => {
			flush(undefined, true);
			this.emit('end');
		});

		stream.on('error', error => {
			/* istanbul ignore next: Only occurs on I/O errors */
			this.emit('error', error);
		});

		function flush(re = /(LDR)/g, force = false) {
			const result = re.exec(self.buffer);
			if (result) {
				if (result.index > 0 || force) {
					const str = self.buffer.slice(0, result.index || undefined).replace(/\n+$/, '');

					self.emit('data', MarcRecord.fromString(str));
					self.buffer = self.buffer.slice(result.index);

					flush();
				} else {
					flush(re);
				}
			}
		}
	}
}

export function to(record) {
	return record.toString();
}

export function from(str, validationOptions = {}) {
	MarcRecord.setValidationOptions(validationOptions);
	return MarcRecord.fromString(str);
}
