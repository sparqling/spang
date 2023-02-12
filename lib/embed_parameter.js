const util = require('./util.js');
const mustache = require('mustache');

mustache.escape = (text) => {
  return text;
};

let mustacheErrors = [];
let oldLookup = mustache.Context.prototype.lookup;

mustache.Context.prototype.lookup = function (name) {
  let value = oldLookup.bind(this)(name);

  if (value === undefined) {
    mustacheErrors.push(name);
  }

  return value;
};

let oldRender = mustache.render;

mustache.render = function (template, view, partials, customTags) {
  let result = oldRender.bind(this)(template, view, partials, customTags);
  return result;
};

exports.embedParameter = (sparql, parameterMap, setVars) => {
  sparql = mustache.render(sparql, parameterMap, {}); // replace parameters like {{par}}
  sparql = mustache.render(sparql, parameterMap, {}, ['${', '}']); // replace parameters like ${par}
  if (mustacheErrors.length > 0) {
    console.error(util.makeRed('Unknown parameters found: ' + mustacheErrors.join(', ')));
  }

  const objectTree = util.parse(sparql);
  replacements = [];
  util.traverse(objectTree, (key, value) => {
    if (value?.variable && parameterMap[value.variable]) {
      if (value.varType === '$' || setVars) {
        replacements.push({
          start: value.location.start.offset,
          end: value.location.end.offset,
          after: parameterMap[value.variable] + ' '
        });
      }
    }
    if (value?.iriLocal?.startsWith('$')) {
      const after = parameterMap[value.iriLocal.substring(1)];
      if (after) {
        replacements.push({
          start: value.location.end.offset - value.iriLocal.length,
          end: value.location.end.offset,
          after: after
        });
      }
    }
  });

  let embeddedSparql = sparql;
  for (let i = replacements.length - 1; i >= 0; --i) {
    embeddedSparql = embeddedSparql.remove(replacements[i].start, replacements[i].end);
    embeddedSparql = embeddedSparql.insert(replacements[i].start, replacements[i].after);
  }

  return embeddedSparql;
};
