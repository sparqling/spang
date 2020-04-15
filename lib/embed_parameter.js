const util = require('./util.js');
const parser = require('./parser.js');
const mustache = require('mustache');

exports.embedParameter = (sparql, parameterMap) => {
  sparql = mustache.render(sparql, parameterMap);
  var parsedQuery = new parser.parse(sparql);
  replacements = [];
  util.traverse(parsedQuery, (key, value) => {
    if(value && value.token == 'var' 
       // && value.prefix == '$' // only $var is replaced by parameter
       && parameterMap[value.value]) {
      replacements.push({start: value.location.start.offset,
                        end: value.location.end.offset - 1,
                        after: parameterMap[value.value]});
    } else if(value && value.token == 'uri' && value.suffix && value.suffix.startsWith('$')) {
      const after = parameterMap[value.suffix.substring(1)];
      if(after) {
        replacements.push({start: value.location.end.offset - value.suffix.length,
                           end: value.location.end.offset,
                           after: after
                          });
      }
    }
  });
  var embeddedSparql = sparql;
  for(let i = replacements.length - 1; i >= 0; --i) {
    embeddedSparql = embeddedSparql.remove(replacements[i].start, replacements[i].end);
    embeddedSparql = embeddedSparql.insert(replacements[i].start, replacements[i].after);
  }
  return embeddedSparql;
};
