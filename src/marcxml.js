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
import {Parser, Builder} from 'xml2js';

export class Reader extends Readable {
	constructor(stream, validationOptions = {}) {
		super(stream);
		this.charbuffer = '';

		stream.on('end', () => {
			this.emit('end');
		});

		stream.on('error', error => {
			this.emit('error', error);
		});

		stream.on('data', async data => {
			this.charbuffer += data.toString();

			while (1) { // eslint-disable-line no-constant-condition
				let pos = this.charbuffer.indexOf('<record');

				if (pos === -1) {
					return;
				}

				this.charbuffer = this.charbuffer.substr(pos);
				pos = this.charbuffer.indexOf('</record>');
				if (pos === -1) {
					return;
				}

				const raw = this.charbuffer.substr(0, pos + 9);
				this.charbuffer = this.charbuffer.substr(pos + 10);

				try {
					this.emit('data', await from(raw, validationOptions)); // eslint-disable-line no-await-in-loop
				} catch (e) {
					this.emit('error', e);
				}
			}
		});
	}
}

export function to(record, {omitDeclaration = false, indent = false} = {}) {
	const obj = {
		record: {
			...generateFields(),
			$: {
				xmlns: 'http://www.loc.gov/MARC21/slim'
			}
		}
	};

	return toXML(obj);

	function generateFields() {
		return {
			leader: [record.leader],
			controlfield: record.getControlfields().map(({value: _, tag}) => {
				if (_) {
					return {_, $: {tag: [tag]}};
				}

				return {$: {tag: [tag]}};
			}),
			datafield: record.getDatafields().map(transformDataField)
		};

		function transformDataField({tag, ind1, ind2, subfields}) {
			return {
				$: {
					tag: [tag],
					ind1: [ind1],
					ind2: [ind2]
				},
				subfield: transformSubfields()
			};

			function transformSubfields() {
				return subfields.map(({code, value: _}) => {
					if (_) {
						return {_, $: {code: [code]}};
					}

					return {$: {code: [code]}};
				});
			}
		}
	}

	function toXML() {
		try {
			return new Builder(generateOptions()).buildObject(obj);
		} catch (err) {
			/* istanbul ignore next: Too generic to test */
			throw new Error(`XML conversion failed ${err.message} for object: ${JSON.stringify(obj)}`);
		}

		function generateOptions() {
			return {...generateDeclr(), ...generateRender()};

			function generateDeclr() {
				return omitDeclaration ? {headless: true} : {
					xmldec: {
						version: '1.0',
						encoding: 'UTF-8'
					}
				};
			}

			function generateRender() {
				return indent ? {
					renderOpts: {
						pretty: true,
						indent: '\t'
					}
				} : {
					renderOpts: {
						pretty: false
					}
				};
			}
		}
	}
}

export async function from(str, validationOptions = {}) {
	const record = new MarcRecord(undefined, validationOptions);
	const obj = await toObject();

	record.leader = obj.record.leader?.[0] || '';

	addControlFields();
	addDataFields();

	return record;

	function addControlFields() {
		const fields = obj.record.controlfield || [];

		fields.forEach(({_: value, $: {tag}}) => {
			record.appendField({tag, value});
		});
	}

	function addDataFields() {
		const fields = obj.record.datafield || [];

		fields.forEach(({subfield, $: {tag, ind1, ind2}}) => {
			const subfields = parseSubfields();
			record.appendField({tag, ind1, ind2, subfields});

			function parseSubfields() {
				const subfields = subfield || [];
				return subfields.map(({_: value, $: {code}}) => ({code, value}));
			}
		});
	}

	function toObject() {
		return new Promise((resolve, reject) => {
			new Parser().parseString(str, (err, obj) => {
				if (err) {
					/* istanbul ignore next: Generic error */ return reject(err);
				}

				resolve(obj);
			});
		});
	}
}

/* Function getLogger() {
	return createDebugLogger('@natlibfi/marc-record-serializers/marcxml');
} */
