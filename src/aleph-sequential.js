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
// Node polyfill
import {TextEncoder, TextDecoder} from 'text-encoding';

const FIXED_FIELD_TAGS = ['FMT', '001', '002', '003', '004', '005', '006', '007', '008', '009'];

export class Reader extends Readable {
	constructor(stream, validationOptions = {}, genF001fromSysNo = false) {
		super(stream);
		this.charbuffer = '';
		this.linebuffer = [];
		this.count = 0;

		stream.on('data', data => {
			this.charbuffer += data.toString();

			while (1) { // eslint-disable-line no-constant-condition
				const pos = this.charbuffer.indexOf('\n');
				if (pos === -1) {
					break;
				}

				const raw = this.charbuffer.substr(0, pos);
				this.charbuffer = this.charbuffer.substr(pos + 1);
				this.linebuffer.push(raw);
			}

			if (this.linebuffer.length > 0) {
				if (this.currentId === undefined) {
					this.currentId = getIdFromLine(this.linebuffer[0]);
				}

				let i = 0;
				while (i < this.linebuffer.length) {
					if (this.linebuffer[i].length < 9) {
						break;
					}

					const lineId = getIdFromLine(this.linebuffer[i]);

					if (this.currentId !== lineId) {
						const record = this.linebuffer.splice(0, i);

						this.count++;

						try {
							this.emit('data', securef001(record));
						} catch (excp) {
							this.emit('error', excp);
							break;
						}

						this.currentId = lineId;
						i = 0;
					}

					i++;
				}
			}
		});

		stream.on('end', () => {
			if (this.linebuffer.length > 0) {
				this.count++;
				try {
					this.emit('data', securef001(this.linebuffer));
				} catch (excp) {
					this.emit('error', excp);
					return;
				}
			}

			this.emit('end');
		});

		stream.on('error', error => {
			this.emit('error', error);
		});

		function securef001(lineArray) {
			const currentId = lineArray[0].slice(0, 9);
			const marcRecord = from(lineArray.join('\n'), validationOptions);
			const [f001] = marcRecord.get('001');
			if (f001 === undefined && genF001fromSysNo) {
				marcRecord.insertField({
					tag: '001',
					value: currentId
				});
				return marcRecord;
			}

			return marcRecord;
		}

		function getIdFromLine(line) {
			return line.split(' ')[0];
		}
	}
}

/**
* Not a perfect implementation of Aleph sequential conversion...
* The conversion specification is available but it's' lacking: https://knowledge.exlibrisgroup.com/@api/deki/files/38711/Z00_and_Z00H.pdf?revision=1
* The specification doesn't mention that the text is cut by 1000 charactes boundary and periods are considered as boundary markers
* This implementation attempts to mimic the conversion done by marc_to_aleph.sh script and should at least produce a format which is accepted by Aleph
* Also, javascript strings are UTF-16 so conversion to bytes is necessary to cut the text at correct offsets
*/
export function to(record, useCrForContinuingResource = false) {
	const MAX_FIELD_LENGTH = 2000;
	const SPLIT_MAX_FIELD_LENGTH = 1000;

	const f001 = record.get(/^001/);
	// Aleph doesn't accept new records if their id is all zeroes...
	const id = f001.length > 0 ? formatRecordId(f001.shift().value) : formatRecordId('1');
	const staticFields = [
		{
			tag: 'FMT',
			value: recordFormat(record, useCrForContinuingResource)
		},
		{
			tag: 'LDR',
			value: record.leader
		}
	];

	return staticFields.concat(record.fields).reduce((acc, field) => {
		// Controlfield
		if ('value' in field) {
			const formattedField = id + ' ' + field.tag + '   L ' + formatControlfield(field.value);
			return acc + formattedField + '\n';
		}

		// Datafield
		return acc + formatDatafield(field);

		// Aleph sequential needs whitespace in control fields to be formatted as carets
		function formatControlfield(value) {
			return value.replace(/\s/g, '^');
		}
	}, '');

	function formatRecordId(id) {
		return id.padStart(9, '0');
	}

	function formatDatafield(field) {
		let subfieldLines;
		const encoder = new TextEncoder('utf-8');
		const decoder = new TextDecoder('utf-8');

		const ind1 = field.ind1 && field.ind1.length > 0 ? field.ind1 : ' ';
		const ind2 = field.ind2 && field.ind2.length > 0 ? field.ind2 : ' ';
		const header = id + ' ' + field.tag + ind1 + ind2 + ' L ';

		const formattedSubfields = field.subfields.map(subfield => {
			let content = '';

			if (subfield.code.length > 0 || subfield.value.length > 0) {
				content = subfield.value === undefined ? '$$' + subfield.code : '$$' + subfield.code + subfield.value;
			}

			return encoder.encode(content);
		});

		const dataLength = formattedSubfields.reduce((acc, value) => {
			return acc + value.length;
		}, 0);

		if (dataLength > MAX_FIELD_LENGTH) {
			subfieldLines = formattedSubfields.reduce(reduceToLines, {
				lines: []
			});

			return decode(subfieldLines).reduce((acc, line) => {
				return acc + header + line + '\n';
			}, '');
		}

		return header + decode(formattedSubfields).join('') + '\n';

		function decode(subfields) {
			return subfields.map(value => {
				return decoder.decode(value);
			});
		}

		/**
		* 1. Append subfields until MAX_FIELD_LENGTH is exceeded
		* 2. cut at the last subfield
		* 3. Append prefix to the next subfield and check if it exceeds SPLIT_MAX_FIELD_LENGTH
		*   - If it is, cut at separators or at boundary. Create a new line for each segment
		* 4. Repeat step 3 for the rest of the subfields
		**/
		function reduceToLines(result, subfield, index, arr) {
			let code;
			let sliceOffset;
			let slicedSegment;
			const tempLength = result.temp ? result.temp.length : 0;

			if (tempLength + subfield.length <= MAX_FIELD_LENGTH) {
				if (tempLength) {
					result.temp = concatByteArrays(result.temp, subfield);
				} else {
					result.temp = subfield;
				}
			} else {
				if (tempLength) {
					result.lines.push(result.temp);
					delete result.temp;
				}

				code = decoder.decode(subfield.slice(2, 3));
				iterate(subfield, index === 0);
			}

			// Flush
			if (index === arr.length - 1) {
				result = result.lines.concat(result.temp);
			}

			return result;

			function concatByteArrays(a, b, ...args) {
				const length = [a, b].concat(args).reduce((acc, value) => {
					return acc + value.length;
				}, 0);
				const arr = new Uint8Array(length);

				[a, b].concat(args).reduce((acc, value) => {
					arr.set(value, acc);
					acc += value.length;
					return acc;
				}, 0);

				return arr;
			}

			function iterate(segment, firstCall) {
				const HYPHEN = 45;
				const SPACE = 32;
				const CARET = 94;
				const DOLLAR = 36;
				const PERIOD = 46;

				segment = firstCall ? segment : addPrefix(segment);

				if (segment.length <= SPLIT_MAX_FIELD_LENGTH) {
					result.temp = segment;
				} else {
					sliceOffset = getSliceOffset(segment);
					slicedSegment = sliceSegment(segment, sliceOffset);

					result.lines.push(slicedSegment);
					iterate(segment.slice(sliceOffset));
				}

				function addPrefix(arr) {
					let prefix;

					if (arr.slice(0, 2).every(value => {
						return value === DOLLAR;
					})) {
						prefix = '$$9^';
					} else {
						prefix = '$$9^^$$' + code;
					}

					return concatByteArrays(encoder.encode(prefix), arr);
				}

				function getSliceOffset(arr) {
					let offset = findSeparatorOffset(arr);

					if (!offset) {
						offset = findPeriodOffset(arr);
					}

					return offset ? offset : SPLIT_MAX_FIELD_LENGTH;

					function findSeparatorOffset(arr) {
						let offset = find();

						if (offset !== undefined) {
							// Append the number of chars in separator
							offset += 3;

							if (offset <= SPLIT_MAX_FIELD_LENGTH) {
								return offset;
							}

							return findSeparatorOffset(arr.slice(0, offset - 3));
						}

						function find() {
							let index;
							let foundCount = 0;

							for (let i = arr.length - 1; i--; i >= 0) {
								if (foundCount === 0 && arr[i] === SPACE) {
									foundCount++;
								} else if (foundCount > 0 && arr[i] === HYPHEN) {
									foundCount++;
								} else {
									foundCount = 0;
								}

								if (foundCount === 3) {
									index = i;
									break;
								}
							}

							return index;
						}
					}

					function findPeriodOffset(arr) {
						let offset = find();

						if (offset !== undefined) {
							// Append the number of chars in separator
							offset += 2;
							if (offset <= SPLIT_MAX_FIELD_LENGTH) {
								return offset;
							}

							return findPeriodOffset(arr.slice(0, offset - 2));
						}

						function find() {
							let index;
							let foundCount = 0;

							for (let i = arr.length - 1; i--; i >= 0) {
								if (foundCount === 0 && arr[i] === SPACE) {
									foundCount++;
								} else if (foundCount > 0 && arr[i] === PERIOD) {
									foundCount++;
								} else {
									foundCount = 0;
								}

								if (foundCount === 2) {
									index = i;
									break;
								}
							}

							return index;
						}
					}
				}

				function sliceSegment(arr, offset) {
					const sliced = segment.slice(0, offset);

					if (sliced.slice(-1)[0] === SPACE) {
						sliced[sliced.length - 1] = CARET;
					}

					return sliced;
				}
			}
		}
	}

	/**
	* This function was implemented by tvirolai (https://github.com/tvirolai)
	**/
	/**
	* Determine the record format for the FMT field.
	* Uses FMT SE (instead of CR) for continuing resource, because Aleph does that
	*/
	function recordFormat(record, useCrForContinuingResource) {
		const leader = record.leader;
		const l6 = leader.slice(6, 7);
		const l7 = leader.slice(7, 8);
		if (l6 === 'm') {
			return 'CF';
		}

		if (['a', 't'].includes(l6) && ['b', 'i', 's'].includes(l7)) {
			if (useCrForContinuingResource) {
				return 'CR';
			}

			return 'SE';
		}

		if (['e', 'f'].includes(l6)) {
			return 'MP';
		}

		if (['c', 'd', 'i', 'j'].includes(l6)) {
			return 'MU';
		}

		if (l6 === 'p') {
			return 'MX';
		}

		if (['g', 'k', 'o', 'r'].includes(l6)) {
			return 'VM';
		}

		return 'BK';
	}
}

export function from(data, validationOptions = {}) {
	let i = 0;
	const lines = data.split('\n').filter(l => l.length > 0);

	while (i < lines.length) {
		const nextLine = lines[i + 1];
		if (nextLine !== undefined && isContinueFieldLine(nextLine)) {
			if (lines[i].substr(-1) === '^') {
				lines[i] = lines[i].substr(0, lines[i].length - 1);
			}

			lines[i] += parseContinueLineData(nextLine);
			lines.splice(i + 1, 1);
			continue;
		}

		i++;
	}

	const record = new MarcRecord();
	record.fields = [];

	lines.forEach(line => {
		const field = parseFieldFromLine(line);

		// Drop Aleph specific FMT fields.
		if (field.tag === 'FMT') {
			return;
		}

		if (field.tag === 'LDR') {
			record.leader = field.value;
		} else {
			record.fields.push(field);
		}
	});

	/* Validates the record */
	return new MarcRecord(record, validationOptions);

	function parseContinueLineData(lineStr) {
		const field = parseFieldFromLine(lineStr);
		const firstSubfield = field.subfields[0];

		if (firstSubfield.value === '^') {
			return lineStr.substr(22);
		}

		if (firstSubfield.value === '^^') {
			return ' ' + lineStr.substr(26, lineStr.length - 1);
		}

		throw new Error('Could not parse Aleph Sequential subfield 9-continued line.');
	}

	function isContinueFieldLine(lineStr) {
		const field = parseFieldFromLine(lineStr);

		if (isControlfield(field)) {
			return false;
		}

		const firstSubfield = field.subfields[0];

		if (firstSubfield === undefined) {
			return false;
		}

		return (firstSubfield.code === '9' && (firstSubfield.value === '^' || firstSubfield.value === '^^'));
	}

	function isControlfield(field) {
		if (field.subfields === undefined) {
			return true;
		}
	}

	function isFixFieldTag(tag) {
		return FIXED_FIELD_TAGS.indexOf(tag) !== -1;
	}

	function parseFieldFromLine(lineStr) {
		const tag = lineStr.substr(10, 3);

		if (tag === undefined || tag.length !== 3) {
			throw new Error('Could not parse tag from line: ' + lineStr);
		}

		if (isFixFieldTag(tag) || tag === 'LDR') {
			const data = formatControlField(lineStr.substr(18));
			return {tag: tag, value: data};
		}

		// Varfield
		const ind1 = lineStr.substr(13, 1);
		const ind2 = lineStr.substr(14, 1);

		const subfieldData = lineStr.substr(18);

		const subfields = subfieldData.split('$$')
			.filter(sf => {
				return sf.length !== 0;
			})
			.map(subfield => {
				const code = subfield.substr(0, 1);
				const value = subfield.substr(1);
				return {code: code, value: value};
			});

		return {
			tag: tag,
			ind1: ind1,
			ind2: ind2,
			subfields: subfields
		};

		// Aleph sequential uses whitespace in control fields formatted as carets
		function formatControlField(data) {
			return data.replace(/\^/g, ' ');
		}
	}
}
