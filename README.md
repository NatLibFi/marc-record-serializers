# Convert records to and from different MARC formats [![NPM Version](https://img.shields.io/npm/v/@natlibfi/marc-record-serializers.svg)](https://npmjs.org/package/@natlibfi/marc-record-serializers) [![Build Status](https://travis-ci.org/NatLibFi/marc-record-serializers.svg)](https://travis-ci.org/NatLibFi/marc-record-serializers) [![Test Coverage](https://codeclimate.com/github/NatLibFi/marc-record-serializers/badges/coverage.svg)](https://codeclimate.com/github/NatLibFi/marc-record-serializers/coverage)

# NOTE: UPGRADING FROM VERSION 6 -> 7
---
`MARCXML.to` is now asynchronous.
----

# NOTE: UPGRADING FROM VERSION 5 -> 6
---
`MARCXML.from` is now asynchronous because the underlying XML module uses callbacks for errors.
---
Convert records to and from different MARC formats. Deserializes MARC to [@natlibfi/marc-record](https://github.com/natlibfi/marc-record-js).

This a fork of the original [marc-record-serializers](https://github.com/petuomin/marc-record-serializers). The new implementation uses ES6 syntax.

## Usage
### Module
```js
import fs from 'fs';
import {MARCXML} from '@natlibfi/marc-record-serializers';
const reader = new MARCXML.Reader(fs.createReadStream('marc.xml'));

reader.on('data', record => console.log(record));
```
### Serializers
#### MARCXML
- **from**: The seconds argument is a validation options object (See [@natlibfi/marc-record](https://www.npmjs.com/package/@natlibfi/marc-record))
- **to**: An object can be passed in as the second argument. It supports the following properties:
  - **omitDeclaration**: Whether to omit XML declaration. Defaults to *false*.
  - **indent**: Whether to indent te XML. Defaults to *false*.

### Aleph Sequential
- **to**: If second argument useCrForContinuingResources is true, uses 'CR' in FMT field for continuing resources, otherwise uses Aleph standard 'SE'. Defaults to *false*.

### CLI
```sh
npx @natlibfi/marc-record-serializers
```

## License and copyright

Copyright (c) 2014-2017 **Pasi Tuominen <pasi.tuominen@gmail.com>**

Copyright (c) 2018-2021 **University Of Helsinki (The National Library Of Finland)**

This project's source code is licensed under the terms of **MIT License** or any later version.
