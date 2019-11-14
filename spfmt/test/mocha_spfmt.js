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

  it('with comment', () => {
    var src =
`PREFIX foo: <http://bar>
SELECT ?s     
where { ?s a
 foo:Human . # any human                                    
                                                                                                    
   }`;
    assert.equal(reformatter.reformat(src),
`PREFIX foo: <http://bar>

SELECT ?s
WHERE {
    ?s a foo:Human . # any human
}`)
  });
});
