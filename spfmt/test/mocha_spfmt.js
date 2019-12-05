var reformatter = require('../reformatter.js');
var chai = require('chai');
chai.use(require('chai-fs'));
var assert = chai.assert;
var fs = require('fs');
var process = require('process');

describe('spfmt', () => {
  it('simple case', () => {
    var src = 'SELECT * WHERE { ?s ?p ?o . }';
    assert.equal(reformatter.reformat(src),
`SELECT *
WHERE {
    ?s ?p ?o .
}
`)
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
}
`)
  });

  describe('for examples', () => {
    examples = fs.readdirSync('./examples');
    answers = fs.readdirSync('./answers');
    examples.forEach(example => {
      if(answers.includes(example)) {
        it(example, () => {
          var src = fs.readFileSync(`./examples/${example}`).toString();
          var expected = fs.readFileSync(`./answers/${example}`).toString();
          assert.equal(reformatter.reformat(src), expected);
        });
      }
    });
  });
});
