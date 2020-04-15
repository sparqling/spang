const util = require('./util.js');
const parser = require('./parser.js');


constructName = (iriref) => {
  if(!iriref.prefix)
    return iriref.suffix;
  return `${iriref.prefix}:${iriref.suffix}`;
};

retrieveVariables = (tree) => {
  const result = {};
  util.traverse(tree, (key, value) => {
    if(value && value.token == 'var'){
      result[value.value] = value;
    }
  });
  return result;
};

renamedVariable = (orig, existingVars) => {
  var renamed = orig;
  var count = 1;
  while(existingVars[renamed]) {
    renamed = `${orig}_${count}`;
    ++count;
  }
  return renamed;
};

constructExpandedBody = (template, args, definition, existingVars) => {
  let body = template.substring(definition.body.location.start.offset, definition.body.location.end.offset);
  const bodyOffset = definition.body.location.start.offset;

  let renamedLocals = {};
  let paramMap = {};
  definition.header.args.forEach((arg, i) => { paramMap[arg.value.value] = i; });
  let replacements = [];
  util.traverse(definition.body, (key, value) => {
    if(value && value.token == 'var') {
      // replace parameters with arguments
      let paramIndex = paramMap[value.value];
      if(paramIndex != undefined) {
        var arg = args[paramIndex].value
        replacements.push({start: value.location.start.offset - bodyOffset,
                           end: value.location.start.offset + value.value.length + 1 - bodyOffset,
                           after: arg.prefix + arg.value });      
      }
      else if(existingVars[value.value]){
        // replace conflicting local variables
        let renamed = renamedLocals[value.value];
        if(!renamed)
          renamed = renamedVariable(value.value, existingVars);
        replacements.push({start: value.location.start.offset - bodyOffset,
                           end: value.location.start.offset + value.value.length + 1 - bodyOffset,
                           after: value.prefix + renamed });
      }
    }
  });
  body = replaceByList(body, replacements).trim();
  return body;
};

replaceByList = (original, replacements) => {
  var replaced = original;
  for(let i = replacements.length - 1; i >= 0; --i) {
    replaced = replaced.remove(replacements[i].start, replacements[i].end);
    replaced = replaced.insert(replacements[i].start, replacements[i].after);
  }
  return replaced;
}
                      
module.exports = (template) => {
  let parsedQuery = new parser.parse(template);
  const functionMap = {};
  let replacements = [];
  let globalVariables = retrieveVariables(parsedQuery.body);
  
  parsedQuery.functions.forEach(f => {
    functionMap[constructName(f.header.iriref)] = f;
    replacements.push({start: f.location.start.offset,
                       end:   f.location.end.offset,
                       after: "" });
  });

  util.traverse(parsedQuery.body, (key, value) => {
    if(value && value.token == 'expression' && value.expressionType == 'functioncall'){
      const definition = functionMap[constructName(value.iriref)];
      if(definition){
        expandedBody = constructExpandedBody(template, value.args, definition, globalVariables);
        replacements.push({start: value.location.start.offset,
                           end: value.location.end.offset,
                           after: expandedBody });
      }
    }
  });
  let expandedTemplate = replaceByList(template, replacements);
  return expandedTemplate;
};
