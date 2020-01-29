const parser = require('./parser.js');
const mustache = require('mustache');

var traverse = (o, fn) => {
  for (const i in o) {
    fn.apply(this,[i,o[i]]);  
    if (o[i] !== null && typeof(o[i])=="object") {
      traverse(o[i], fn);
    }
  }
}

String.prototype.insert = function(idx, val) {
  return this.substring(0, idx) + val + this.substring(idx);
};

String.prototype.remove = function(start, end){
  return this.substring(0, start) + this.substring(end);
};


exports.embedParameter = (sparql, parameterMap) => {
  sparql = mustache.render(sparql, parameterMap);
  var parsedQuery = new parser.parse(sparql);
  replacements = [];
  traverse(parsedQuery, (key, value) => {
    if(value && value.token == 'var' && value.prefix == '$' && parameterMap[value.value]) {
      replacements.push({start: value.location.start.offset,
                        end: value.location.end.offset - 1,
                        after: parameterMap[value.value]});
    }
  });
  var embeddedSparql = sparql;
  for(let i = replacements.length - 1; i >= 0; --i) {
    embeddedSparql = embeddedSparql.remove(replacements[i].start, replacements[i].end);
    embeddedSparql = embeddedSparql.insert(replacements[i].start, replacements[i].after);
  }
  return embeddedSparql;
};
