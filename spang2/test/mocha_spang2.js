var embed_parameter = require('../src/embed_parameter.js');
var chai = require('chai');
chai.use(require('chai-fs'));
var assert = chai.assert;
var fs = require('fs');
var process = require('process');

describe('embed_parameter.js', () => {
  it('embedParameter', () => {
    var sparql = 'SELECT * WHERE { ?s $p ?o }';
    var parameterMap = { p: 'rdf:type' };
    assert.equal(embed_parameter.embedParameter(sparql, parameterMap), 'SELECT * WHERE { ?s rdf:type ?o }');
  });
});
