parser = require('./parser.js');
formatter = require('./formatter_comment.js');

exports.reformat = (sparql, options = {}) => {
  var parsedQuery = new parser.parse(sparql);
  return formatter.format(parsedQuery);
};
