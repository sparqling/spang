var reformatter = require('../reformatter.js');
var chai = require('chai');
chai.use(require('chai-fs'));
var assert = chai.assert;

describe('spfmt', () => {
  it('simple case', () => {
    var src = 'SELECT * WHERE { ?s ?p ?o . }';
    assert.equal(reformatter.reformat(src),
`SELECT *
WHERE {
    ?s ?p ?o .
}`)
  });
});
