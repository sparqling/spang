sparqljs = require('sparqljs');

exports.reformat = (sparql, options = {}) => {
  var parsedQuery = new sparqljs.Parser().parse(sparql);
  var generator = new sparqljs.Generator(options);
  return generator.stringify(parsedQuery);
};
