var lines;
var Comments;

var prevOrigLine;

var currentIndent;
// indentUnit = "    ";
indentUnit = "  ";

exports.format = (spangObject) => {
  Comments = spangObject.comments;
  lines = [];
  currentIndent = '';
  prevOrigLine = 0;

  if (spangObject.header) {
    addLine(spangObject.header);
  }
  addPrologue(spangObject.prologue);
  spangObject.functions.forEach(addFunction);
  addQuery(spangObject.body);
  if (spangObject.inlineData) {
    addInlineData(spangObject.inlineData);
  }
  if (Comments.length > 0) {
    addLine('', -1);
  }

  return lines.join('\n');
};

/// Local functions //////////////////////////////////////////

debugPrint = (object) => {
  console.log(JSON.stringify(object, undefined, 2));
};

increaseIndent = (depth = 1) => {
  currentIndent += indentUnit.repeat(depth);
};

decreaseIndent = (depth = 1) => {
  currentIndent = currentIndent.substr(0, currentIndent.length - indentUnit.length * depth);
};

addLine = (text, origLine = 0, indent = currentIndent) => {
  // add comment
  if (Comments.length > 0 && prevOrigLine != origLine && (origLine == -1 || origLine > Comments[0].line)) {
    if (lines.length == 0) {
      lines.unshift(Comments[0].text);
    } else if(origLine > prevOrigLine + 1) {
      // for line where only comment exists
      lines.push(Comments[0].text);
    } else {
      lines[lines.length - 1] += ' ' + Comments[0].text;
    }
    Comments.shift();
  }

  // add text
  lines.push(indent + text);
  
  if (prevOrigLine < origLine) {
    prevOrigLine = origLine;
  }
}

addPrologue = (prologue) => {
  // TODO: handle base
  prologue.prefixes.forEach((prefix) => {
    addLine(`PREFIX ${prefix.prefix||""}: <${prefix.local}>`, prefix.location.end.line);
  });
  if(prologue.prefixes.length > 0) {
    addLine("", prologue.prefixes[prologue.prefixes.length - 1].location.end.line + 1);
  }
};

addQuery = (query) => {
  switch (query.kind) {
    case 'select':
    addSelect(query);
  }
};

addSelect = (select) => {
  // TODO: handle dataset
  var select_line = 'SELECT ';
  if (select.modifier) {
    select_line += `${select.modifier.toString()} `;
  }
  var projection = select.projection.map((proj) => forProjection(proj)).join(' ');
  select_line += projection;
  var lastLine = !select.projection[0].value ?
      select.projection[0].location.start.line :
      select.projection[0].value.location.start.line;
  addLine(select_line, lastLine);

  addLine('WHERE {', lastLine + 1);
  addGroupGraphPattern(select.pattern, currentIndent);
  addLine('}', select.pattern.location.end.line);

  if (select.order) {
    addLine('ORDER BY ' + getOrderConditions(select.order));
  }
  if(select.limit) {
    addLine(`LIMIT ${select.limit}`, select.location.end.line);
  }
};

getOrderConditions = (conditions) => {
  var orderConditions = [];

  conditions.forEach(condition => {
    var oc = getVar(condition.expression.value);
    if (condition.direction == 'DESC') {
      orderConditions.push(`DESC(${oc})`);
    } else {
      orderConditions.push(oc);
    }
  });

  return orderConditions.join(" ");
};

forProjection = (projection) => {
  switch(projection.kind) {
    case '*':
    return '*';
    case 'var':
    return '?' + projection.value.value;
    case 'aliased':
    // TODO:
    default:
    throw new Error('unknown projection.kind: ' + projection.kind);
  }
};

addGroupGraphPattern = (pattern, indent) => {
  increaseIndent();
  pattern.patterns.forEach(p => addPattern(p, indent));
  pattern.filters.forEach(addFilter);
  decreaseIndent();
};

addFilter = (filter) => {
  if (filter.value.expressionType == "relationalexpression") {
    var expr = filter.value;
    addLine(`FILTER (${getExpression(expr.op1)} ${expr.operator} ${getExpression(expr.op2)})`);
  }
}

addPattern = (pattern, indent) => {
  switch (pattern.token) {
    case 'graphunionpattern':
      addLine('{');
      addGroupGraphPattern(pattern.value[0]);
      addLine('}');
      addLine('UNION');
      addLine('{');
      addGroupGraphPattern(pattern.value[1]);
      addLine('}');
      break;
    case 'basicgraphpattern':
      pattern.triplesContext.forEach(t => addTriple(t, indent));
      break;
    case 'optionalgraphpattern':
      addLine('OPTIONAL {');
      addGroupGraphPattern(pattern.value);
      addLine('}');
      break;
    case 'inlineData':
      addInlineData(pattern);
      break;
    case 'expression':
      if (pattern.expressionType === 'functioncall') {
        var name = getUri(pattern.iriref);
        var args = pattern.args.map(getExpression).join(", ");
        addLine(`${name}(${args})`);
      } else {
        debugPrint(pattern);
      }
      break;
    default:
      debugPrint(pattern);
  }
};

addFunction = (func) => {
  var name = getUri(func.header.iriref);
  var args = func.header.args.map(getExpression).join(", ");
  addLine(`${name}(${args}) {`);
  addGroupGraphPattern(func.body);
  addLine('}');
  addLine('');
};

addTriple = (triple, indent) => {
  addLine(getTripleElem(triple.subject) + ' ' + 
          getTripleElem(triple.predicate) + ' ' + 
          getTripleElem(triple.object) + ' .',
          triple.object.location.end.line, indent);
};

getExpression = (expr) => {
  if (expr.expressionType == "atomic") {
    return(getTripleElem(expr.value));
  } else if (expr.expressionType == "irireforfunction") {
    return(getUri(expr.iriref));
  } else if (expr.expressionType === 'builtincall') {
    return(expr.builtincall + '(' + expr.args.map(getExpression).join(', ') + ')');
  }
}

addInlineData = (inline) => {
  if (inline.token === 'inlineData') {
    var vals = inline.values.map(getTripleElem).join(' ');
    addLine(`VALUES ${getTripleElem(inline.var)} { ${vals} }`);
  } else {
    var vars = inline.variables.map(getVar).join(' ');
    var vals = inline.values.map(getTuple).join(' ')
    addLine(`VALUES (${vars}) { ${vals} }`)
  }
};

getTuple = (tuple) => {
  return '(' + tuple.map(getTripleElem).join(' ') + ')';
};

getTripleElem = (elem) => {
  switch(elem.token) {
    case 'var':
      if (elem.prefix === '?') {
        return '?' + elem.value;
      } else if (elem.prefix === '$') {
        return '$' + elem.value;
      } else {
        return '{{' + elem.value + '}}';
      }
    case 'uri':
      if(elem.prefix && elem.suffix) {
        return elem.prefix + ":" + elem.suffix;
      } else if (elem.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
        return 'a';
      } else {
        return "<" + elem.value + ">";
      }
    case 'literal':
      var txt = '"' + elem.value + '"';
      if (elem.lang) {
        txt += '@' + elem.lang;
      }
      return txt;
    case 'blank':
      return '[]';
    case 'path':
      return elem.value.map(v => getUri(v.value)).join('/');
  }
};

getUri = (uri) => {
  if(uri.prefix && uri.suffix) {
    return uri.prefix + ":" + uri.suffix;
  } else if (uri.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
    return 'a';
  } else {
    return "<" + uri.value + ">";
  }
}

getVar = (variable) => {
  if (variable.prefix === '?') {
    return '?' + variable.value;
  } else if (variable.prefix === '$') {
    return '$' + variable.value;
  } else {
    return '{{' + variable.value + '}}';
  }
}
