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
import StreamArray from 'stream-json/streamers/StreamArray';

export class Reader extends Readable {
	constructor(stream, validationOptions = {}) {
		super(stream);

		const pipeline = stream.pipe(StreamArray.withParser());
		pipeline.on('data', data => {
			try {
				this.emit('data', new MarcRecord(data.value, validationOptions));
			} catch (err) {
				this.emit('error', err);
			}
		});

		pipeline.on('end', () => {
			this.emit('end');
		});

		pipeline.on('error', error => {
			this.emit('error', error);
		});
	}
}

export function to(record) {
	return JSON.stringify(record.toObject(), undefined, 2);
}

export function from(str, validationOptions = {}) {
	return new MarcRecord(JSON.parse(str), validationOptions);
}
