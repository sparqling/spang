const util = require('./util.js');

const constructName = (iriref) => {
  if (!iriref.prefix) {
    return iriref.suffix;
  }
  return `${iriref.prefix}:${iriref.suffix}`;
};

const retrieveVariables = (tree) => {
  const result = {};
  util.traverse(tree, (key, value) => {
    if (value && value.Name) {
      result[value.varName] = value;
    }
  });
  return result;
};

const renamedVariable = (orig, existingVars) => {
  let renamed = orig;
  let count = 1;

  while (existingVars[renamed]) {
    renamed = `${orig}_${count}`;
    ++count;
  }

  return renamed;
};

const constructExpandedBody = (template, args, definition, existingVars) => {
  let body = template.substring(definition.body.location.start.offset, definition.body.location.end.offset);
  const bodyOffset = definition.body.location.start.offset;

  let renamedLocals = {};
  let paramMap = {};
  definition.header.args.forEach((arg, i) => {
    paramMap[arg.value.varName] = i;
  });
  let replacements = [];
  util.traverse(definition.body, (key, value) => {
    if (value && value.varName) {
      let replacement = {
        start: value.location.start.offset - bodyOffset,
        end: value.location.start.offset + value.varName.length + 1 - bodyOffset
      };
      // replace parameters with arguments
      let paramIndex = paramMap[value.varName];
      if (paramIndex != undefined) {
        let arg = args[paramIndex];
        if (arg.expressionType == 'atomic') {
          arg = arg.value;
        } else if (arg.expressionType == 'irireforfunction') {
          arg = arg.iriref;
        }
        if (arg.varName) {
          replacement['after'] = (arg.varType||'?') + arg.varName;
        } else if (arg.token == 'uri') {
          replacement['after'] = constructName(arg);
        } else if (arg.iri) {
          replacement['after'] = arg.iri;
        } else if (arg.token == 'literal') {
          replacement['after'] = util.literalToString(arg);
        } else {
          throw new Error('Arguments of user-defined functions must be variables, literals or IRI, passed: ' + arg.token + arg.expressionType);
        }
        replacements.push(replacement);
      } else if (existingVars[value.varName]) {
        // replace conflicting local variables
        let renamed = renamedLocals[value.varName];
        if (!renamed) {
          renamed = renamedVariable(value.varName, existingVars);
        }
        replacement['after'] = (value.varType||'?') + renamed;
        replacements.push(replacement);
      }
    }
  });
  body = replaceByList(body, replacements).trim();
  return body;
};

const replaceByList = (original, replacements) => {
  let replaced = original;
  for (let i = replacements.length - 1; i >= 0; --i) {
    replaced = replaced.remove(replacements[i].start, replacements[i].end);
    replaced = replaced.insert(replacements[i].start, replacements[i].after);
  }
  return replaced;
};

const deleteFunctionDefinition = (template) => {
  const parsedQuery = util.parse(template);
  let replacements = [];
  parsedQuery.functions.forEach((f) => {
    replacements.push({
      start: f.location.start.offset,
      end: f.location.end.offset,
      after: ''
    });
  });
  return replaceByList(template, replacements);
};

const expandOnce = (template) => {
  const parsedQuery = util.parse(template);
  const functionMap = {};
  let replacements = [];
  let globalVariables = retrieveVariables(parsedQuery.body);

  parsedQuery.functions.forEach((f) => {
    functionMap[constructName(f.header.iriref)] = f;
  });

  util.traverse(parsedQuery.body, (key, value) => {
    if (value?.token === 'functioncall') {
      const definition = functionMap[constructName(value.iriref)];
      if (definition) {
        expandedBody = constructExpandedBody(template, value.args, definition, globalVariables);
        replacements.push({
          start: value.location.start.offset,
          end: value.location.end.offset,
          after: expandedBody
        });
      }
    }
  });
  let expandedTemplate = replaceByList(template, replacements);
  return [expandedTemplate, replacements.length > 0];
};

module.exports = (template) => {
  let [expandedTemplate, expanded] = expandOnce(template);
  while (expanded) {
    [expandedTemplate, expanded] = expandOnce(expandedTemplate);
  }
  return deleteFunctionDefinition(expandedTemplate);
};
