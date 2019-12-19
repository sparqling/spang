var reformatter = require('../src/reformatter.js');
var chai = require('chai');
chai.use(require('chai-fs'));
var assert = chai.assert;
var fs = require('fs');
var process = require('process');

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
