const embed_parameter = require('../lib/embed_parameter.js');
const chai = require('chai');
const path = require('path');
chai.use(require('chai-fs'));
const execSync = require('child_process').execSync;
const assert = chai.assert;
const fs = require('fs');
const process = require('process');

describe('embed_parameter.js', () => {
  it('embedParameter', () => {
    const sparql = 'SELECT * WHERE { ?s $p ?o }';
    const parameterMap = { p: 'rdf:type' };
    assert.equal(embed_parameter.embedParameter(sparql, parameterMap), 'SELECT * WHERE { ?s rdf:type ?o }');
  });
});

describe('shell scripts', () => {
  results = fs.readdirSync('./test');
  resultNames = results.map(r => path.basename(r, '.txt'));
  tests = fs.readdirSync('./test');
  tests.forEach(test => {
    const basename = path.basename(test, '.sh');
    if(test.endsWith('.sh') && resultNames.includes(basename)) {
      it(test, () => {
        const actual = execSync(`./test/${test}`).toString();
        const expected = fs.readFileSync(`./test/${basename}.txt`).toString();
        assert.equal(actual, expected);
      });
    }
  });
});
