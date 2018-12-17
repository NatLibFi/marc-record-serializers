/* eslint-disable valid-jsdoc */

import {Readable} from 'stream';
import {MarcRecord} from '@natlibfi/marc-record';
import {XMLSerializer, DOMParser, DOMImplementation} from 'xmldom';

const NODE_TYPE = {
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

		stream.on('data', data => {
			this.charbuffer += data.toString();

			while (1) { // eslint-disable-line no-constant-condition
				let pos = this.charbuffer.indexOf('<oai_marc');

				if (pos === -1) {
					return;
				}

				this.charbuffer = this.charbuffer.substr(pos);
				pos = this.charbuffer.indexOf('</oai_marc>');
				if (pos === -1) {
					return;
				}

				const raw = this.charbuffer.substr(0, pos + 11);
				this.charbuffer = this.charbuffer.substr(pos + 12);

				try {
					this.emit('data', from(raw));
				} catch (e) {
					this.emit('error', e);
				}
			}
		});
	}
}

export function to(record) {
	const serializer = new XMLSerializer();
	const doc = new DOMImplementation().createDocument();
	const xmlRecord = mkElement('oai_marc');
	const leader = mkControlfield('LDR', record.leader);

	xmlRecord.appendChild(leader);

	record.getControlfields().forEach(field => {
		xmlRecord.appendChild(mkControlfield(field.tag, field.value));
	});

	record.getDatafields().forEach(field => {
		xmlRecord.appendChild(mkDatafield(field));
	});

	function mkDatafield(field) {
		const datafield = mkElement('varfield');
		datafield.setAttribute('id', field.tag);
		datafield.setAttribute('i1', formatIndicator(field.ind1));
		datafield.setAttribute('i2', formatIndicator(field.ind2));

		field.subfields.forEach(subfield => {
			const sub = mkElementValue('subfield', subfield.value);
			sub.setAttribute('label', subfield.code);
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
		const cf = mkElement('fixfield');
		cf.setAttribute('id', tag);
		const t = doc.createTextNode(value);
		cf.appendChild(t);
		return cf;
	}

	return `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(xmlRecord)}`;
}

export function from(xmlString) {
	const parser = new DOMParser();
	const record = new MarcRecord();

	const doc = parser.parseFromString(xmlString);
	const recordNode = doc.getElementsByTagName('oai_marc')[0];
	const childNodes = recordNode === undefined ? [] : Array.prototype.slice.call(recordNode.childNodes);

	childNodes.filter(notTextNode).forEach(node => {
		switch (node.tagName) {
			case 'fixfield':
				handleControlfieldNode(node);
				break;
			case 'varfield':
				handleDatafieldNode(node);
				break;
			default:
				throw new Error('Unable to parse node: ' + node.tagName);
		}

		function handleControlfieldNode(node) {
			const tag = node.getAttribute('id');

			if (node.childNodes[0] !== undefined && node.childNodes[0].nodeType === NODE_TYPE.TEXT_NODE) {
				const value = node.childNodes[0].data;

				if (tag === 'LDR') {
					record.leader = value;
				} else {
					record.appendField({tag, value});
				}
			} else {
				throw new Error('Unable to parse controlfield: ' + tag);
			}
		}

		function handleDatafieldNode(node) {
			const tag = node.getAttribute('id');
			const ind1 = node.getAttribute('i1');
			const ind2 = node.getAttribute('i2');

			const subfields = Array.prototype.slice.call(node.childNodes).filter(notTextNode).map(subfieldNode => {
				const code = subfieldNode.getAttribute('label');
				const value = getChildTextNodeContents(subfieldNode).join('');

				return {
					code,
					value
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

	function notTextNode(node) {
		return node.nodeType !== NODE_TYPE.TEXT_NODE;
	}
}
