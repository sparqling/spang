sparqljs = require('sparqljs');
parser = require('./parser.js');
formatter = require('./formatter.js');

exports.reformat = (sparql, options = {}) => {
  var parsedQuery = new parser.parse(sparql);
  return formatter.format(parsedQuery);
};
