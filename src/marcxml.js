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
import {XMLSerializer, DOMParser, DOMImplementation} from 'xmldom';

const NODE_TYPE = {
	ELEMENT_NODE: 1,
	TEXT_NODE: 3
};

export class Reader extends Readable {
	constructor(stream) {
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
					this.emit('data', await from(raw)); // eslint-disable-line no-await-in-loop
				} catch (e) {
					this.emit('error', e);
				}
			}
		});
	}
}

export function to(record, {omitDeclaration = false} = {}) {
	const serializer = new XMLSerializer();
	const doc = new DOMImplementation().createDocument();
	const xmlRecord = doc.createElementNS('http://www.loc.gov/MARC21/slim', 'record');
	const leader = mkElementValue('leader', record.leader);

	xmlRecord.appendChild(leader);

	record.getControlfields().forEach(field => {
		xmlRecord.appendChild(mkControlfield(field.tag, field.value));
	});

	record.getDatafields().forEach(field => {
		xmlRecord.appendChild(mkDatafield(field));
	});

	if (omitDeclaration) {
		return serializer.serializeToString(xmlRecord);
	}

	return `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(xmlRecord)}`;

	function mkDatafield(field) {
		const datafield = mkElement('datafield');
		datafield.setAttribute('tag', field.tag);
		datafield.setAttribute('ind1', formatIndicator(field.ind1));
		datafield.setAttribute('ind2', formatIndicator(field.ind2));

		field.subfields.forEach(subfield => {
			const sub = mkElementValue('subfield', subfield.value);
			sub.setAttribute('code', subfield.code);

			datafield.appendChild(sub);
		});

		return datafield;
	}

	function formatIndicator(ind) {
		return ind === '_' ? ' ' : ind;
	}

	function mkElementValue(name, value) {
		const el = mkElement(name);
		const t = doc.createTextNode(value);
		el.appendChild(t);
		return el;
	}

	function mkElement(name) {
		return doc.createElement(name);
	}

	function mkControlfield(tag, value) {
		const cf = mkElement('controlfield');
		cf.setAttribute('tag', tag);
		const t = doc.createTextNode(value);
		cf.appendChild(t);
		return cf;
	}
}

export async function from(xmlString, validationOptions = {}) {
	MarcRecord.setValidationOptions(validationOptions);

	const doc = await parse();
	const record = new MarcRecord();
	const recordNode = doc.getElementsByTagName('record')[0];
	const childNodes = recordNode === undefined ? [] : Array.prototype.slice.call(recordNode.childNodes);

	childNodes.filter(isValidNodeType).forEach(node => {
		switch (node.tagName) {
			case 'leader':
				handleLeaderNode(node);
				break;
			case 'controlfield':
				handleControlfieldNode(node);
				break;
			case 'datafield':
				handleDatafieldNode(node);
				break;
			default:
				throw new Error('Unable to parse node: ' + node.tagName);
		}

		function handleLeaderNode(node) {
			if (node.childNodes[0] !== undefined && node.childNodes[0].nodeType === NODE_TYPE.TEXT_NODE) {
				record.leader = node.childNodes[0].data;
				return;
			}

			record.leader = '';
		}

		function handleControlfieldNode(node) {
			const tag = node.getAttribute('tag');
			if (node.childNodes[0] !== undefined && node.childNodes[0].nodeType === NODE_TYPE.TEXT_NODE) {
				const value = node.childNodes[0].data;
				record.appendField({tag, value});
			} else {
				throw new Error('Unable to parse controlfield: ' + tag);
			}
		}

		function handleDatafieldNode(node) {
			const tag = node.getAttribute('tag');
			const ind1 = node.getAttribute('ind1');
			const ind2 = node.getAttribute('ind2');

			const subfields = Array.prototype.slice.call(node.childNodes).filter(isValidNodeType).map(subfieldNode => {
				const code = subfieldNode.getAttribute('code');
				const text = getChildTextNodeContents(subfieldNode).join('');

				return {
					code: code,
					value: text
				};
			});

			record.appendField({
				tag: tag,
				ind1: ind1,
				ind2: ind2,
				subfields: subfields
			});
		}

		function getChildTextNodeContents(node) {
			const childNodes = Array.prototype.slice.call(node.childNodes);
			const textNodes = childNodes.filter(node => {
				return node.nodeType === NODE_TYPE.TEXT_NODE;
			});
			return textNodes.map(node => {
				return node.data;
			});
		}
	});

	/* Validates the record */
	return new MarcRecord(record);

	function isValidNodeType(node) {
		return node.nodeType === NODE_TYPE.ELEMENT_NODE;
	}

	async function parse() {
		return new Promise((resolve, reject) => {
			const parser = new DOMParser({
				errorHandler: {
					error: e => reject(new Error(e)),
					fatalError: e => reject(new Error(e))
				}
			});

			const doc = parser.parseFromString(xmlString);
			resolve(doc);
		});
	}
}
