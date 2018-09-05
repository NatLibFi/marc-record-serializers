# Convert records to and from different MARC formats [![NPM Version](https://img.shields.io/npm/v/@natlibfi/marc-record-serializers.svg)](https://npmjs.org/package/@natlibfi/marc-record-serializers) [![Build Status](https://travis-ci.org/NatLibFi/marc-record-serializers.svg)](https://travis-ci.org/NatLibFi/marc-record-serializers) [![Test Coverage](https://codeclimate.com/github/NatLibFi/marc-record-serializers/badges/coverage.svg)](https://codeclimate.com/github/NatLibFi/marc-record-serializers/coverage)

Convert records to and from different MARC formats. Deserializes MARC to [@natlibfi/marc-record](https://github.com/natlibfi/marc-record-js).

This a fork of the original [marc-record-serializers](https://github.com/petuomin/marc-record-serializers). The new implementation uses ES6 syntax.

## Usage
```js
import fs from 'fs';
import {MARCXML} from '@natlibfi/marc-record-serializers';
const reader = new MARCXML.Reader(fs.createReadStream('marc.xml'));

reader.on('data', record => console.log(record));
```

## License and copyright

Copyright (c) 2014-2017 **Pasi Tuominen <pasi.tuominen@gmail.com>**

Copyright (c) 2018 **University Of Helsinki (The National Library Of Finland)**

This project's source code is licensed under the terms of **MIT License** or any later version.
